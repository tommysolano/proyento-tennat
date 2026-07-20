import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { ChannelConfig } from '../../models/ChannelConfig.js';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';
import { WhatsAppSession } from '../../models/WhatsAppSession.js';
import { logger } from '../../utils/logger.js';
import { sanitize } from '../../utils/sanitize.js';
import { getStorageProvider } from '../storage/index.js';
import {
  extensionForMime,
  mediaMaxBytes,
  validateMedia
} from '../storage/mediaValidation.js';
import { RealtimeService } from '../realtime/RealtimeService.js';
import { ConversationService } from './ConversationService.js';
import { checkUsageLimit, trackUsage } from '../../utils/usage.js';
import {
  createMongoAuthState,
  deleteMongoAuthState
} from './WhatsAppQrAuthStore.js';
import { WhatsAppInboundService } from './WhatsAppInboundService.js';
import {
  normalizeQrInboundMessage,
  phoneFromJid
} from './whatsappQrMessage.js';

const PROVIDER_VERSION = '6.7.23';
const TRANSIENT_STATUSES = new Set([
  'initializing',
  'qr_pending',
  'authenticating',
  'reconnecting'
]);
const runtimeId = `${hostname()}:${process.pid}:${randomUUID()}`;

const silentProviderLogger = {
  level: 'silent',
  child() {
    return this;
  },
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {}
};

function numericEnv(name, fallback, minimum = 1) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value >= minimum ? value : fallback;
}

function enabled() {
  return process.env.WHATSAPP_QR_ENABLED === 'true';
}

function safeError(error, fallback = 'Fallo de conexion con WhatsApp QR') {
  const message = String(sanitize(error?.message || fallback))
    .replace(/[A-Za-z0-9+/=]{80,}/g, '[REDACTED]')
    .slice(0, 1000);
  return message || fallback;
}

function socketStatusCode(error) {
  return Number(
    error?.output?.statusCode ||
      error?.data?.statusCode ||
      error?.statusCode ||
      0
  );
}

function jidForPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `${digits}@s.whatsapp.net` : '';
}

/** true si un audio saliente debe enviarse como nota de voz (ptt). */
export function isVoiceNote(media, mimeType) {
  return media?.ptt === true || /ogg|opus/i.test(String(mimeType || ''));
}

async function streamToBuffer(stream, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > maxBytes) {
      stream.destroy?.();
      throw Object.assign(new Error('El archivo supera el limite configurado'), {
        retryable: false,
        code: 'MEDIA_TOO_LARGE'
      });
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}

class SessionManager {
  constructor() {
    this.instances = new Map();
    this.qrCodes = new Map();
    this.qrTimers = new Map();
    this.reconnectTimers = new Map();
    this.manualClosures = new Map();
    // Watchdog de sincronizacion colgada (authenticating que no llega a 'open').
    this.syncWatchdogs = new Map();
    this.syncRetries = new Map();
    // Verificacion de salud periodica de sesiones 'connected' de esta instancia.
    this.healthTimer = null;
    this.libraryPromise = null;
    this.stopping = false;
  }

  // ---- Watchdog de sincronizacion (leccion: se atasca tras reiniciar server) ----

  armSyncWatchdog(sessionId) {
    const key = String(sessionId);
    clearTimeout(this.syncWatchdogs.get(key));
    const minutes = numericEnv('WHATSAPP_QR_SYNC_STUCK_MINUTES', 3);
    const timer = setTimeout(() => {
      this.syncWatchdogs.delete(key);
      this.handleSyncStuck(sessionId).catch((error) =>
        logger.error('whatsapp_qr.sync_watchdog_failed', error, { sessionId })
      );
    }, minutes * 60 * 1000);
    timer.unref?.();
    this.syncWatchdogs.set(key, timer);
    logger.info('whatsapp_qr.sync_watchdog_armed', { sessionId, minutes });
  }

  clearSyncWatchdog(sessionId) {
    const key = String(sessionId);
    clearTimeout(this.syncWatchdogs.get(key));
    this.syncWatchdogs.delete(key);
  }

  /**
   * Si tras escanear (authenticating) no se llega a 'open' a tiempo, reinicia el
   * runtime CONSERVANDO el authState; tras agotar los reintentos, estado error.
   */
  async handleSyncStuck(sessionId) {
    const session = await WhatsAppSession.findById(sessionId);
    if (!session || session.status !== 'authenticating') return;
    const key = String(sessionId);
    const maxRetries = numericEnv('WHATSAPP_QR_SYNC_STUCK_RETRIES', 3);
    const attempt = Number(this.syncRetries.get(key) || 0) + 1;
    if (attempt > maxRetries) {
      this.syncRetries.delete(key);
      logger.warn('whatsapp_qr.sync_stuck_exhausted', {
        sessionId,
        companyId: session.companyId,
        attempts: attempt - 1
      });
      await this.closeRuntime(sessionId, { releaseLease: true });
      await this.updateSession(sessionId, {
        status: 'error',
        lastError: 'La sincronizacion se atasco; genera un nuevo QR.'
      });
      await ChannelConfig.updateOne(
        { _id: session.integrationId },
        { $set: { status: 'error', error: 'La sincronizacion QR se atasco' } }
      ).catch(() => {});
      return;
    }
    this.syncRetries.set(key, attempt);
    logger.warn('whatsapp_qr.sync_stuck_restart', {
      sessionId,
      companyId: session.companyId,
      attempt,
      maxRetries
    });
    await this.connect(sessionId, { forceRestart: true }).catch((error) =>
      logger.error('whatsapp_qr.sync_restart_failed', error, { sessionId })
    );
  }

  // ---- Salud periodica de sesiones 'connected' ----

  startHealthMonitor() {
    if (this.healthTimer || !enabled() || this.stopping) return;
    const seconds = numericEnv('WHATSAPP_QR_HEALTH_INTERVAL_SECONDS', 60, 15);
    this.healthTimer = setInterval(() => {
      this.runHealthChecks().catch((error) =>
        logger.error('whatsapp_qr.health_monitor_failed', error)
      );
    }, seconds * 1000);
    this.healthTimer.unref?.();
    logger.info('whatsapp_qr.health_monitor_started', { seconds });
  }

  /** true si el socket subyacente ya no esta abierto (barato, sincrono). */
  socketLooksDead(socket) {
    const ws = socket?.ws;
    if (!socket || !ws) return true;
    // WebSocket.readyState: 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED.
    return ws.readyState === 2 || ws.readyState === 3;
  }

  /**
   * Ping ligero: presencia con timeout. El timeout NO da veredicto (la sesion
   * puede estar ocupada); solo un error explicito o socket cerrado desconecta.
   */
  async pingSocket(socket) {
    const timeoutMs = numericEnv('WHATSAPP_QR_HEALTH_PING_TIMEOUT_MS', 5000, 500);
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
      timer.unref?.();
    });
    try {
      return await Promise.race([
        Promise.resolve(socket.sendPresenceUpdate('available')).then(() => 'ok'),
        timeout
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async runHealthChecks() {
    for (const [key, context] of this.instances) {
      const session = await WhatsAppSession.findById(key).select('status');
      if (!session || session.status !== 'connected') continue;
      if (this.socketLooksDead(context.socket)) {
        await this.onSessionUnhealthy(key, 'socket cerrado');
        continue;
      }
      try {
        await this.pingSocket(context.socket); // 'ok' o 'timeout' => sin accion
      } catch (error) {
        await this.onSessionUnhealthy(key, safeError(error, 'ping fallido'));
      }
    }
  }

  /** Marca la sesion desconectada, limpia runtime, libera lease y publica SSE. */
  async onSessionUnhealthy(sessionId, reason) {
    logger.warn('whatsapp_qr.health_disconnect', { sessionId, reason });
    await this.closeRuntime(sessionId, { releaseLease: true });
    const session = await this.updateSession(sessionId, {
      status: 'disconnected',
      lastError: `Desconexion detectada por verificacion de salud: ${reason}`
    });
    if (session) {
      await ChannelConfig.updateOne(
        { _id: session.integrationId, companyId: session.companyId },
        { $set: { status: 'pending' } }
      ).catch(() => {});
    }
  }

  async library() {
    if (!this.libraryPromise) {
      this.libraryPromise = Promise.all([
        import('@whiskeysockets/baileys'),
        import('qrcode')
      ]).then(([baileys, qrcode]) => ({
        ...baileys,
        qrcode: qrcode.default || qrcode
      }));
    }
    return this.libraryPromise;
  }

  assertEnabled() {
    if (!enabled()) {
      throw Object.assign(
        new Error(
          'WhatsApp QR esta desactivado. Configura WHATSAPP_QR_ENABLED=true tras validar la infraestructura.'
        ),
        { status: 503, code: 'WHATSAPP_QR_DISABLED', retryable: false }
      );
    }
  }

  publish(session, extra = {}) {
    RealtimeService.publish('whatsapp.session_updated', {
      companyId: session.companyId,
      data: {
        sessionId: session._id,
        status: session.status,
        phone: session.phone,
        lastActivityAt: session.lastActivityAt,
        qrExpiresAt: session.qrExpiresAt,
        ...extra
      }
    });
  }

  async updateSession(sessionId, values, extra = {}) {
    const session = await WhatsAppSession.findByIdAndUpdate(
      sessionId,
      { $set: values },
      { new: true }
    );
    if (session) this.publish(session, extra);
    return session;
  }

  async acquireLease(sessionId) {
    const leaseSeconds = numericEnv('WHATSAPP_QR_SESSION_LEASE_SECONDS', 90, 30);
    const now = new Date();
    return WhatsAppSession.findOneAndUpdate(
      {
        _id: sessionId,
        enabled: true,
        $or: [
          { 'runtimeLease.owner': runtimeId },
          { 'runtimeLease.owner': '' },
          { 'runtimeLease.expiresAt': null },
          { 'runtimeLease.expiresAt': { $lte: now } }
        ]
      },
      {
        $set: {
          'runtimeLease.owner': runtimeId,
          'runtimeLease.expiresAt': new Date(now.getTime() + leaseSeconds * 1000)
        }
      },
      { new: true }
    ).select('+authState +encryptedConfig +internalId');
  }

  async renewLease(sessionId) {
    const leaseSeconds = numericEnv('WHATSAPP_QR_SESSION_LEASE_SECONDS', 90, 30);
    const result = await WhatsAppSession.updateOne(
      { _id: sessionId, 'runtimeLease.owner': runtimeId },
      {
        $set: {
          'runtimeLease.expiresAt': new Date(Date.now() + leaseSeconds * 1000)
        }
      }
    );
    return result.modifiedCount > 0;
  }

  async releaseLease(sessionId) {
    await WhatsAppSession.updateOne(
      { _id: sessionId, 'runtimeLease.owner': runtimeId },
      {
        $set: {
          'runtimeLease.owner': '',
          'runtimeLease.expiresAt': null
        }
      }
    ).catch(() => {});
  }

  clearQr(sessionId) {
    const key = String(sessionId);
    clearTimeout(this.qrTimers.get(key));
    this.qrTimers.delete(key);
    this.qrCodes.delete(key);
  }

  async storeQr(session, qr, qrcode) {
    const ttlSeconds = numericEnv('WHATSAPP_QR_QR_TTL_SECONDS', 60, 20);
    const generatedAt = new Date();
    const expiresAt = new Date(generatedAt.getTime() + ttlSeconds * 1000);
    const dataUrl = await qrcode.toDataURL(qr, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320
    });
    const key = String(session._id);
    this.clearQr(key);
    this.qrCodes.set(key, { dataUrl, generatedAt, expiresAt });
    const timer = setTimeout(() => {
      const current = this.qrCodes.get(key);
      if (current?.expiresAt?.getTime() === expiresAt.getTime()) {
        this.qrCodes.delete(key);
        this.qrTimers.delete(key);
        this.updateSession(
          session._id,
          { lastActivityAt: new Date() },
          { qrAvailable: false, qrExpired: true }
        ).catch(() => {});
      }
    }, ttlSeconds * 1000);
    timer.unref?.();
    this.qrTimers.set(key, timer);
    await this.updateSession(session._id, {
      status: 'qr_pending',
      qrGeneratedAt: generatedAt,
      qrExpiresAt: expiresAt,
      lastActivityAt: generatedAt,
      lastError: ''
    }, { qrAvailable: true });
  }

  getQr(sessionId) {
    const item = this.qrCodes.get(String(sessionId));
    if (!item) return null;
    if (item.expiresAt <= new Date()) {
      this.clearQr(sessionId);
      return null;
    }
    return item;
  }

  async connect(sessionId, { forceRestart = false } = {}) {
    this.assertEnabled();
    const key = String(sessionId);
    const existing = this.instances.get(key);
    if (existing && !forceRestart) {
      return WhatsAppSession.findById(sessionId);
    }
    if (existing) await this.closeRuntime(sessionId, { releaseLease: false });

    const session = await this.acquireLease(sessionId);
    if (!session) {
      throw Object.assign(
        new Error('La sesion esta deshabilitada o activa en otra instancia'),
        { status: 409, code: 'WHATSAPP_QR_SESSION_BUSY', retryable: true }
      );
    }
    const maxActive = numericEnv('WHATSAPP_QR_MAX_ACTIVE_SESSIONS', 20);
    if (this.instances.size >= maxActive) {
      await this.releaseLease(sessionId);
      throw Object.assign(new Error('Se alcanzo el limite de sesiones QR activas'), {
        status: 429,
        code: 'WHATSAPP_QR_SESSION_LIMIT',
        retryable: true
      });
    }
    const config = await ChannelConfig.findOne({
      _id: session.integrationId,
      companyId: session.companyId,
      channel: 'whatsapp_qr',
      status: { $ne: 'disabled' }
    });
    if (!config) {
      await this.releaseLease(sessionId);
      throw Object.assign(new Error('La integracion WhatsApp QR no esta disponible'), {
        status: 409,
        retryable: false
      });
    }

    const startingAuthenticated = Boolean(session.getSerializedAuthState());
    await this.updateSession(sessionId, {
      status: startingAuthenticated ? 'authenticating' : 'initializing',
      providerVersion: PROVIDER_VERSION,
      lastError: '',
      lastActivityAt: new Date()
    });
    // Arranca con authState (restore/reconexion): vigila la sincronizacion.
    if (startingAuthenticated) this.armSyncWatchdog(sessionId);

    try {
      const baileys = await this.library();
      const { state, saveCreds } = await createMongoAuthState(sessionId, baileys);
      const socket = baileys.makeWASocket({
        auth: state,
        logger: silentProviderLogger,
        browser: baileys.Browsers.ubuntu('Tennat'),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        getMessage: async (keyValue) => {
          const message = await Message.findOne({
            companyId: session.companyId,
            provider: 'whatsapp_qr',
            channelConfigId: session.integrationId,
            externalMessageId: keyValue.id
          }).select('type text +providerPayload');
          if (message?.type === 'text' && message.text) {
            return { conversation: message.text };
          }
          return message?.providerPayload?.message || undefined;
        }
      });
      const context = {
        socket,
        sessionId: key,
        companyId: String(session.companyId),
        integrationId: String(session.integrationId),
        manualClose: false,
        leaseTimer: null
      };
      this.instances.set(key, context);
      this.startHealthMonitor();
      context.leaseTimer = setInterval(async () => {
        if (!(await this.renewLease(sessionId))) {
          logger.warn('whatsapp_qr.lease_lost', { sessionId, companyId: session.companyId });
          await this.closeRuntime(sessionId, { releaseLease: false });
        }
      }, numericEnv('WHATSAPP_QR_SESSION_LEASE_SECONDS', 90, 30) * 500);
      context.leaseTimer.unref?.();

      socket.ev.on('creds.update', async () => {
        try {
          await saveCreds();
          await this.updateSession(sessionId, { lastActivityAt: new Date() });
        } catch (error) {
          await this.failSession(sessionId, error, 'degraded');
        }
      });
      socket.ev.on('connection.update', (update) => {
        this.handleConnectionUpdate(sessionId, update, baileys, context).catch((error) => {
          logger.error('whatsapp_qr.connection_update_failed', error, {
            sessionId,
            companyId: session.companyId
          });
        });
      });
      socket.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const message of messages || []) {
          this.handleInboundMessage(sessionId, message, baileys, context).catch((error) => {
            logger.error('whatsapp_qr.inbound_failed', error, {
              sessionId,
              companyId: session.companyId,
              messageId: message?.key?.id
            });
          });
        }
      });
      socket.ev.on('messages.update', (updates) => {
        this.handleMessageUpdates(sessionId, updates, baileys, context).catch((error) => {
          logger.error('whatsapp_qr.status_update_failed', error, {
            sessionId,
            companyId: session.companyId
          });
        });
      });
      socket.ev.on('message-receipt.update', (updates) => {
        this.handleMessageReceipts(sessionId, updates, context).catch((error) => {
          logger.error('whatsapp_qr.receipt_update_failed', error, {
            sessionId,
            companyId: session.companyId
          });
        });
      });
      return WhatsAppSession.findById(sessionId);
    } catch (error) {
      await this.releaseLease(sessionId);
      await this.failSession(sessionId, error, 'failed');
      throw Object.assign(new Error(safeError(error)), {
        status: error.status || 503,
        retryable: error.retryable !== false
      });
    }
  }

  async handleConnectionUpdate(sessionId, update, baileys, sourceContext) {
    if (this.instances.get(String(sessionId)) !== sourceContext) return;
    const session = await WhatsAppSession.findById(sessionId);
    if (!session) return;
    if (update.qr) await this.storeQr(session, update.qr, baileys.qrcode);
    if (
      !update.qr &&
      update.connection === 'connecting' &&
      session.status !== 'qr_pending'
    ) {
      const nextStatus = session.authStateConfigured ? 'authenticating' : 'initializing';
      await this.updateSession(sessionId, {
        status: nextStatus,
        lastActivityAt: new Date()
      });
      // Con authState y sincronizando: vigila que no se quede colgado.
      if (nextStatus === 'authenticating') this.armSyncWatchdog(sessionId);
    }
    if (update.connection === 'open') {
      this.clearSyncWatchdog(sessionId);
      this.syncRetries.delete(String(sessionId));
      this.clearQr(sessionId);
      const context = this.instances.get(String(sessionId));
      const phone = phoneFromJid(context?.socket?.user?.id || '');
      await this.updateSession(sessionId, {
        status: 'connected',
        phone,
        connectedAt: new Date(),
        lastActivityAt: new Date(),
        lastError: '',
        reconnectAttempts: 0,
        qrGeneratedAt: null,
        qrExpiresAt: null
      });
      await ChannelConfig.updateOne(
        { _id: session.integrationId, companyId: session.companyId },
        {
          $set: {
            status: 'connected',
            lastConnectedAt: new Date(),
            error: '',
            phoneNumberId: phone,
            // Numero real que reporta WhatsApp al vincular (lo que se muestra).
            connectedPhone: phone
          }
        }
      );
      logger.info('whatsapp_qr.connected', {
        sessionId,
        companyId: session.companyId
      });
    }
    if (update.connection !== 'close') return;

    this.clearQr(sessionId);
    const context = this.instances.get(String(sessionId));
    const statusCode = socketStatusCode(update.lastDisconnect?.error);
    const loggedOut = statusCode === baileys.DisconnectReason.loggedOut;
    const key = String(sessionId);
    const manual =
      Boolean(context?.manualClose) ||
      Number(this.manualClosures.get(key) || 0) > Date.now();
    this.manualClosures.delete(key);
    await this.closeRuntime(sessionId, {
      releaseLease: manual || loggedOut,
      markManual: false
    });
    if (manual) return;
    if (loggedOut) {
      // Cierre DEFINITIVO desde el telefono: el authState guardado ya no sirve.
      // Se borra la autenticacion cifrada para exigir un QR nuevo (si no, la
      // reconexion entraria en bucle con credenciales invalidas).
      await deleteMongoAuthState(sessionId).catch(() => {});
      await this.updateSession(sessionId, {
        status: 'logged_out',
        phone: '',
        connectedAt: null,
        reconnectAttempts: 0,
        lastError: 'WhatsApp cerro la sesion vinculada. Escanea un QR nuevo para volver a conectar.',
        qrGeneratedAt: null,
        qrExpiresAt: null
      });
      await ChannelConfig.updateOne(
        { _id: session.integrationId },
        { $set: { status: 'pending', error: 'La sesion QR fue cerrada desde WhatsApp; vincula de nuevo con un QR.' } }
      );
      return;
    }
    // Sesion abierta en otro dispositivo: no tiene sentido reconectar en bucle.
    const replaced =
      statusCode === baileys.DisconnectReason.connectionReplaced ||
      statusCode === 440;
    if (replaced) {
      await this.updateSession(sessionId, {
        status: 'error',
        lastError: 'La sesion se abrio en otro dispositivo. Reconecta si quieres retomarla aqui.',
        qrGeneratedAt: null,
        qrExpiresAt: null
      });
      await ChannelConfig.updateOne(
        { _id: session.integrationId },
        { $set: { status: 'error', error: 'La sesion se abrio en otro dispositivo' } }
      ).catch(() => {});
      return;
    }
    await this.scheduleReconnect(
      sessionId,
      safeError(update.lastDisconnect?.error, 'Conexion interrumpida')
    );
  }

  async prepareInboundMedia(message, normalized, baileys, socket) {
    const descriptor = normalized.mediaDescriptor;
    if (!descriptor) return {};
    const declaredSize = Number(descriptor.value?.fileLength || 0);
    if (declaredSize > mediaMaxBytes()) {
      return {
        filename: descriptor.filename,
        mimeType: descriptor.mimeType,
        size: declaredSize,
        status: 'failed',
        error: 'El archivo supera el limite configurado'
      };
    }
    try {
      const candidateFilename =
        descriptor.filename ||
        `${message.key.id}${extensionForMime(descriptor.mimeType)}`;
      validateMedia({
        filename: candidateFilename,
        mimeType: descriptor.mimeType,
        size: declaredSize || 1
      });
      const stream = await baileys.downloadMediaMessage(
        message,
        'stream',
        {},
        {
          logger: silentProviderLogger,
          reuploadRequest: socket.updateMediaMessage
        }
      );
      const buffer = await streamToBuffer(stream, mediaMaxBytes());
      const validation = validateMedia({
        filename: candidateFilename,
        mimeType: descriptor.mimeType,
        size: buffer.length
      });
      const storageMb = validation.size / (1024 * 1024);
      await Promise.all([
        checkUsageLimit({
          companyId: normalized.metadata.companyId,
          metric: 'media_storage_mb',
          quantity: storageMb
        }),
        checkUsageLimit({
          companyId: normalized.metadata.companyId,
          metric: 'media_files',
          quantity: 1
        })
      ]);
      const stored = await getStorageProvider().uploadBuffer({
        buffer,
        filename: validation.filename,
        mimeType: validation.mimeType,
        scope: { companyId: normalized.metadata.companyId }
      });
      return {
        filename: stored.filename,
        mimeType: stored.mimeType,
        size: stored.size,
        storageKey: stored.storageKey,
        caption: descriptor.caption,
        status: 'available'
      };
    } catch (error) {
      return {
        filename: descriptor.filename,
        mimeType: descriptor.mimeType,
        size: declaredSize,
        status: 'failed',
        error: safeError(error, 'No se pudo procesar el archivo')
      };
    }
  }

  async handleInboundMessage(sessionId, message, baileys, sourceContext) {
    if (this.instances.get(String(sessionId)) !== sourceContext) return;
    if (!message?.key?.id) return;
    // fromMe: enviado desde el telefono vinculado -> se ingiere como saliente.
    if (message.key.fromMe) {
      await this.handleOutboundEcho(sessionId, message, baileys, sourceContext);
      return;
    }
    const remoteJid = String(message.key.remoteJid || '');
    if (
      !remoteJid ||
      remoteJid === 'status@broadcast' ||
      (
        remoteJid.endsWith('@g.us') &&
        process.env.WHATSAPP_QR_ALLOW_GROUPS !== 'true'
      )
    ) return;
    const session = await WhatsAppSession.findById(sessionId);
    if (!session || !session.enabled) return;
    const config = await ChannelConfig.findOne({
      _id: session.integrationId,
      companyId: session.companyId,
      channel: 'whatsapp_qr',
      status: { $ne: 'disabled' }
    });
    if (!config) return;
    const normalized = normalizeQrInboundMessage(message);
    if (!normalized.phone) return;
    const duplicate = await Message.exists({
      companyId: session.companyId,
      provider: 'whatsapp_qr',
      channelConfigId: config._id,
      externalMessageId: normalized.externalMessageId
    });
    if (duplicate) return;
    normalized.metadata = {
      ...(normalized.metadata || {}),
      companyId: String(session.companyId),
      sessionId: String(session._id)
    };
    normalized.media = await this.prepareInboundMedia(
      message,
      normalized,
      baileys,
      sourceContext.socket
    );
    delete normalized.mediaDescriptor;
    const actorId = await ConversationService.actorForChannelConfig(config);
    let result;
    try {
      result = await WhatsAppInboundService.processNormalized({
        config,
        normalized,
        actorId
      });
    } catch (error) {
      if (normalized.media?.storageKey) {
        await getStorageProvider()
          .deleteObject({ storageKey: normalized.media.storageKey })
          .catch(() => {});
      }
      throw error;
    }
    if (normalized.media?.storageKey && !result.duplicate) {
      const storageMb = Number(normalized.media.size || 0) / (1024 * 1024);
      await Promise.all([
        trackUsage({
          companyId: session.companyId,
          distributorId: session.distributorId,
          metric: 'media_storage_mb',
          quantity: storageMb,
          metadata: { source: 'whatsapp_qr', messageId: result.message?._id }
        }),
        trackUsage({
          companyId: session.companyId,
          distributorId: session.distributorId,
          metric: 'media_files',
          quantity: 1,
          metadata: { source: 'whatsapp_qr', messageId: result.message?._id }
        })
      ]).catch((error) => {
        logger.error('whatsapp_qr.media_usage_tracking_failed', error, {
          sessionId,
          companyId: session.companyId,
          messageId: result.message?._id
        });
      });
    }
    await this.updateSession(sessionId, {
      lastActivityAt: new Date(),
      lastError: ''
    });
  }

  /**
   * Ingiere un mensaje `fromMe` como SALIENTE. Anti-duplicado: los envios de la
   * propia app tambien vuelven como fromMe; recordOutboundEcho deduplica por
   * externalMessageId (el outbound de la app guarda el mismo key.id). Se puede
   * desactivar con WHATSAPP_QR_INGEST_FROM_ME=false.
   */
  async handleOutboundEcho(sessionId, message, baileys, sourceContext) {
    if (process.env.WHATSAPP_QR_INGEST_FROM_ME === 'false') return;
    if (this.instances.get(String(sessionId)) !== sourceContext) return;
    const remoteJid = String(message.key.remoteJid || '');
    if (
      !remoteJid ||
      remoteJid === 'status@broadcast' ||
      (remoteJid.endsWith('@g.us') && process.env.WHATSAPP_QR_ALLOW_GROUPS !== 'true')
    ) return;
    const session = await WhatsAppSession.findById(sessionId);
    if (!session || !session.enabled) return;
    const config = await ChannelConfig.findOne({
      _id: session.integrationId,
      companyId: session.companyId,
      channel: 'whatsapp_qr',
      status: { $ne: 'disabled' }
    });
    if (!config) return;
    const normalized = normalizeQrInboundMessage(message);
    if (!normalized.phone) return;
    const duplicate = await Message.exists({
      companyId: session.companyId,
      provider: 'whatsapp_qr',
      channelConfigId: config._id,
      externalMessageId: normalized.externalMessageId
    });
    if (duplicate) {
      logger.debug('whatsapp_qr.from_me_duplicate', {
        sessionId,
        externalMessageId: normalized.externalMessageId
      });
      return;
    }
    normalized.metadata = {
      ...(normalized.metadata || {}),
      companyId: String(session.companyId),
      sessionId: String(session._id),
      origin: 'phone'
    };
    normalized.media = await this.prepareInboundMedia(
      message,
      normalized,
      baileys,
      sourceContext.socket
    );
    delete normalized.mediaDescriptor;
    const actorId = await ConversationService.actorForChannelConfig(config);
    const result = await WhatsAppInboundService.processOutboundEcho({
      config,
      normalized,
      actorId
    });
    if (!result.duplicate) {
      logger.info('whatsapp_qr.from_me_ingested', {
        sessionId,
        companyId: session.companyId,
        messageId: result.message?._id
      });
    }
    await this.updateSession(sessionId, { lastActivityAt: new Date() });
  }

  async handleMessageUpdates(sessionId, updates, baileys, sourceContext) {
    if (this.instances.get(String(sessionId)) !== sourceContext) return;
    const session = await WhatsAppSession.findById(sessionId);
    if (!session) return;
    const statuses = {
      [baileys.WAMessageStatus.DELIVERY_ACK]: 'delivered',
      [baileys.WAMessageStatus.READ]: 'read'
    };
    for (const item of updates || []) {
      const status = statuses[item.update?.status];
      if (!status || !item.key?.id) continue;
      await this.applyOutboundStatus(session, item.key.id, status, new Date());
    }
  }

  async handleMessageReceipts(sessionId, updates, sourceContext) {
    if (this.instances.get(String(sessionId)) !== sourceContext) return;
    const session = await WhatsAppSession.findById(sessionId);
    if (!session) return;
    for (const item of updates || []) {
      const readAt = Number(item.receipt?.readTimestamp || 0);
      const deliveredAt = Number(item.receipt?.receiptTimestamp || 0);
      const status = readAt ? 'read' : deliveredAt ? 'delivered' : '';
      if (!status || !item.key?.id) continue;
      const timestamp = new Date((readAt || deliveredAt) * 1000);
      await this.applyOutboundStatus(session, item.key.id, status, timestamp);
    }
  }

  async applyOutboundStatus(
    session,
    externalMessageId,
    status,
    timestamp,
    retryIfMissing = true
  ) {
    const message = await Message.findOne({
      companyId: session.companyId,
      provider: 'whatsapp_qr',
      channelConfigId: session.integrationId,
      externalMessageId
    });
    if (!message) {
      if (retryIfMissing) {
        const retry = setTimeout(() => {
          this.applyOutboundStatus(
            session,
            externalMessageId,
            status,
            timestamp,
            false
          ).catch(() => {});
        }, 1000);
        retry.unref?.();
      }
      return;
    }
    if (['failed', 'read'].includes(message.status)) return;
    if (status === 'delivered' && message.status === 'sent') {
      message.status = 'delivered';
      message.deliveredAt ||= timestamp;
    }
    if (status === 'read') {
      message.status = 'read';
      message.deliveredAt ||= timestamp;
      message.readAt ||= timestamp;
    }
    await message.save();
    const conversation = await Conversation.findById(message.conversationId)
      .select('assignedTo');
    RealtimeService.publish('message.status_updated', {
      companyId: message.companyId,
      assignedTo: conversation?.assignedTo || null,
      data: {
        conversationId: message.conversationId,
        message: message.toJSON()
      }
    });
  }

  async scheduleReconnect(sessionId, reason) {
    const session = await WhatsAppSession.findById(sessionId);
    if (!session || !session.enabled || this.stopping) return;
    const maxAttempts = numericEnv('WHATSAPP_QR_MAX_RECONNECT_ATTEMPTS', 5);
    const attempt = Number(session.reconnectAttempts || 0) + 1;
    if (attempt > maxAttempts) {
      await this.updateSession(sessionId, {
        status: 'failed',
        reconnectAttempts: attempt - 1,
        lastError: reason
      });
      await this.releaseLease(sessionId);
      return;
    }
    const baseMs = numericEnv('WHATSAPP_QR_RECONNECT_BASE_MS', 2000, 250);
    const maxMs = numericEnv('WHATSAPP_QR_RECONNECT_MAX_MS', 60000, 1000);
    const delay = Math.min(maxMs, baseMs * (2 ** (attempt - 1)));
    await this.updateSession(sessionId, {
      status: 'reconnecting',
      reconnectAttempts: attempt,
      lastError: reason,
      metadata: {
        ...(session.metadata || {}),
        reconnectsTotal: Number(session.metadata?.reconnectsTotal || 0) + 1
      }
    });
    clearTimeout(this.reconnectTimers.get(String(sessionId)));
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(String(sessionId));
      this.connect(sessionId, { forceRestart: true }).catch((error) => {
        this.scheduleReconnect(sessionId, safeError(error)).catch(() => {});
      });
    }, delay);
    timer.unref?.();
    this.reconnectTimers.set(String(sessionId), timer);
  }

  async failSession(sessionId, error, status = 'failed') {
    return this.updateSession(sessionId, {
      status,
      lastError: safeError(error),
      lastActivityAt: new Date()
    });
  }

  async closeRuntime(sessionId, { releaseLease = true, markManual = true } = {}) {
    const key = String(sessionId);
    const context = this.instances.get(key);
    if (context) {
      context.manualClose = markManual;
      if (markManual) {
        this.manualClosures.set(key, Date.now() + 5000);
        const cleanup = setTimeout(() => this.manualClosures.delete(key), 6000);
        cleanup.unref?.();
      }
      clearInterval(context.leaseTimer);
      try {
        context.socket.end(new Error('Sesion cerrada por Tennat'));
      } catch {
        // The socket may already be closed.
      }
      this.instances.delete(key);
    }
    clearTimeout(this.reconnectTimers.get(key));
    this.reconnectTimers.delete(key);
    this.clearSyncWatchdog(sessionId);
    this.clearQr(sessionId);
    if (releaseLease) await this.releaseLease(sessionId);
  }

  async disconnect(sessionId, actorId) {
    await this.closeRuntime(sessionId);
    const session = await this.updateSession(sessionId, {
      status: 'disconnected',
      disconnectedBy: actorId || null,
      lastActivityAt: new Date(),
      qrGeneratedAt: null,
      qrExpiresAt: null
    });
    if (session) {
      await ChannelConfig.updateOne(
        { _id: session.integrationId, companyId: session.companyId },
        { $set: { status: 'pending', error: '' } }
      );
    }
    return session;
  }

  async logout(sessionId, actorId) {
    const context = this.instances.get(String(sessionId));
    if (context) {
      context.manualClose = true;
      await context.socket.logout().catch(() => {});
    }
    await this.closeRuntime(sessionId);
    await deleteMongoAuthState(sessionId);
    const session = await this.updateSession(sessionId, {
      status: 'logged_out',
      phone: '',
      connectedAt: null,
      disconnectedBy: actorId || null,
      authDeletedBy: actorId || null,
      reconnectAttempts: 0,
      lastActivityAt: new Date(),
      lastError: '',
      qrGeneratedAt: null,
      qrExpiresAt: null
    });
    if (session) {
      await ChannelConfig.updateOne(
        { _id: session.integrationId, companyId: session.companyId },
        {
          $set: {
            status: 'pending',
            error: '',
            phoneNumberId: ''
          }
        }
      );
    }
    return session;
  }

  async regenerateQr(sessionId) {
    const session = await WhatsAppSession.findById(sessionId).select('+authState');
    if (!session) throw Object.assign(new Error('Sesion no encontrada'), { status: 404 });
    let registered = false;
    const serialized = session.getSerializedAuthState();
    if (serialized) {
      const { BufferJSON } = await this.library();
      try {
        registered = Boolean(
          JSON.parse(serialized, BufferJSON.reviver)?.creds?.registered
        );
      } catch {
        registered = true;
      }
    }
    if (session.status === 'connected' || registered) {
      throw Object.assign(
        new Error('La sesion ya tiene autenticacion. Desvinculala para generar un QR nuevo.'),
        { status: 409, code: 'WHATSAPP_QR_ALREADY_AUTHENTICATED' }
      );
    }
    return this.connect(sessionId, { forceRestart: true });
  }

  async setEnabled(sessionId, value, actorId) {
    if (!value) await this.disconnect(sessionId, actorId);
    const session = await WhatsAppSession.findByIdAndUpdate(
      sessionId,
      {
        $set: {
          enabled: Boolean(value),
          ...(value ? {} : { status: 'disconnected', disconnectedBy: actorId || null })
        }
      },
      { new: true }
    );
    if (session) this.publish(session);
    return session;
  }

  async sendMessage({ channelConfig, contact, text, type, media = {} }) {
    const session = await WhatsAppSession.findOne({
      integrationId: channelConfig._id,
      companyId: channelConfig.companyId,
      enabled: true,
      status: 'connected'
    });
    if (!session) {
      return {
        success: false,
        status: 'failed',
        retryable: true,
        code: 'WHATSAPP_QR_NOT_CONNECTED',
        error: 'La sesion WhatsApp QR no esta conectada'
      };
    }
    const context = this.instances.get(String(session._id));
    if (!context?.socket) {
      return {
        success: false,
        status: 'failed',
        retryable: true,
        code: 'WHATSAPP_QR_RUNTIME_UNAVAILABLE',
        error: 'La sesion WhatsApp QR debe reconectarse en esta instancia'
      };
    }
    const jid = jidForPhone(contact?.phone);
    if (!jid) {
      return {
        success: false,
        status: 'failed',
        retryable: false,
        code: 'WHATSAPP_PHONE_REQUIRED',
        error: 'El contacto no tiene un telefono valido'
      };
    }
    let content;
    if (type === 'text') {
      content = { text };
    } else {
      if (!['image', 'audio', 'video', 'document'].includes(type)) {
        return {
          success: false,
          status: 'failed',
          retryable: false,
          code: 'WHATSAPP_QR_TYPE_UNSUPPORTED',
          error: 'El tipo de mensaje no es compatible con WhatsApp QR'
        };
      }
      if (!media.storageKey) {
        return {
          success: false,
          status: 'failed',
          retryable: false,
          code: 'WHATSAPP_QR_MEDIA_NOT_STORED',
          error: 'WhatsApp QR requiere un archivo almacenado de forma segura'
        };
      }
      const storage = getStorageProvider();
      const { stream, metadata } = await storage.createReadStream({
        storageKey: media.storageKey
      });
      validateMedia({
        filename: metadata.filename,
        mimeType: metadata.mimeType,
        size: metadata.size
      });
      const buffer = await streamToBuffer(stream, mediaMaxBytes());
      validateMedia({
        filename: metadata.filename,
        mimeType: metadata.mimeType,
        size: buffer.length
      });
      const mediaValue = { [type]: buffer };
      if (type === 'document') {
        mediaValue.mimetype = metadata.mimeType;
        mediaValue.fileName = metadata.filename;
      }
      if (type === 'audio') {
        mediaValue.mimetype = metadata.mimeType;
        // Nota de voz (ptt) si se pide explicitamente o el audio es opus/ogg.
        if (isVoiceNote(media, metadata.mimeType)) mediaValue.ptt = true;
      }
      if (media.caption && ['image', 'video', 'document'].includes(type)) {
        mediaValue.caption = media.caption;
      }
      content = mediaValue;
    }
    try {
      const result = await context.socket.sendMessage(jid, content);
      await this.updateSession(session._id, {
        lastActivityAt: new Date(),
        lastError: ''
      });
      return {
        success: true,
        status: 'sent',
        externalMessageId: result?.key?.id || '',
        providerPayload: {
          key: {
            id: result?.key?.id || '',
            remoteJid: result?.key?.remoteJid || jid,
            fromMe: true
          }
        }
      };
    } catch (error) {
      await this.failSession(session._id, error, 'degraded');
      return {
        success: false,
        status: 'failed',
        retryable: true,
        code: 'WHATSAPP_QR_SEND_FAILED',
        error: safeError(error, 'WhatsApp QR rechazo el envio')
      };
    }
  }

  async markAsRead({ channelConfigId, remoteJid, externalMessageIds = [] }) {
    const session = await WhatsAppSession.findOne({
      integrationId: channelConfigId,
      status: 'connected',
      enabled: true
    });
    const context = session ? this.instances.get(String(session._id)) : null;
    if (!context?.socket || !remoteJid || !externalMessageIds.length) return false;
    await context.socket.readMessages(
      externalMessageIds.filter(Boolean).map((id) => ({ remoteJid, id, fromMe: false }))
    );
    return true;
  }

  async diagnostics(sessionId) {
    const session = await WhatsAppSession.findById(sessionId);
    if (!session) return null;
    const runtime = this.instances.has(String(sessionId));
    const qr = this.getQr(sessionId);
    return {
      enabled: enabled(),
      provider: 'whatsapp_qr',
      providerVersion: PROVIDER_VERSION,
      runtimeActive: runtime,
      leaseOwnedByThisInstance: runtime,
      qrAvailable: Boolean(qr),
      qrExpiresAt: qr?.expiresAt || session.qrExpiresAt,
      status: session.status,
      connected: session.status === 'connected' && runtime,
      reconnectAttempts: session.reconnectAttempts,
      lastActivityAt: session.lastActivityAt,
      lastError: session.lastError,
      persistentAuthConfigured: session.authStateConfigured,
      limitations: [
        'WhatsApp QR depende del protocolo de WhatsApp Web y no tiene SLA oficial.',
        'Cada sesion debe ejecutarse en una sola instancia; el lease evita propietarios simultaneos.',
        'La autenticacion se cifra en MongoDB; el QR temporal no se persiste.'
      ]
    };
  }

  async restoreSessions() {
    if (!enabled() || process.env.WHATSAPP_QR_AUTO_RESTORE === 'false') return [];
    const limit = numericEnv('WHATSAPP_QR_RESTORE_LIMIT', 10);
    const sessions = await WhatsAppSession.find({
      enabled: true,
      status: {
        $in: ['connected', 'reconnecting', 'degraded', 'authenticating']
      }
    })
      .sort({ lastActivityAt: -1 })
      .limit(limit)
      .select('_id companyId');
    const restored = [];
    for (const session of sessions) {
      try {
        await this.connect(session._id);
        restored.push(session._id);
      } catch (error) {
        logger.error('whatsapp_qr.restore_failed', error, {
          sessionId: session._id,
          companyId: session.companyId
        });
      }
    }
    return restored;
  }

  async metrics(companyId = null) {
    const match = companyId ? { companyId } : {};
    const rows = await WhatsAppSession.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const totals = await WhatsAppSession.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          reconnectsTotal: {
            $sum: { $ifNull: ['$metadata.reconnectsTotal', 0] }
          }
        }
      }
    ]);
    return {
      byStatus: Object.fromEntries(rows.map((item) => [item._id, item.count])),
      connected: rows.find((item) => item._id === 'connected')?.count || 0,
      failed: rows.find((item) => item._id === 'failed')?.count || 0,
      reconnecting: rows.find((item) => item._id === 'reconnecting')?.count || 0,
      reconnectsTotal: totals[0]?.reconnectsTotal || 0,
      runtimeActive: [...this.instances.values()].filter(
        (item) => !companyId || item.companyId === String(companyId)
      ).length
    };
  }

  /**
   * Reconcilia la relacion 1:1 numero(ChannelConfig QR) <-> WhatsAppSession.
   * Idempotente: (1) un ChannelConfig QR sin sesion recibe una sesion vinculada
   * (disconnected); (2) una sesion cuyo ChannelConfig ya no existe se marca como
   * huerfana (no se borra). Se llama al listar para autocurar estados previos.
   */
  async reconcileCompanyQr(companyId, { actorId = null } = {}) {
    if (!companyId) return { created: 0, orphanSessions: 0 };
    let created = 0;

    const configs = await ChannelConfig.find({
      companyId,
      channel: 'whatsapp_qr',
      status: { $ne: 'disabled' }
    }).select('_id displayName distributorId createdBy');
    for (const config of configs) {
      if (await WhatsAppSession.exists({ companyId, integrationId: config._id })) continue;
      const session = new WhatsAppSession({
        companyId,
        distributorId: config.distributorId || null,
        integrationId: config._id,
        name: config.displayName || 'WhatsApp QR',
        status: 'disconnected',
        providerVersion: PROVIDER_VERSION,
        createdBy: config.createdBy || actorId,
        metadata: { provider: 'whatsapp_qr', reconciled: true }
      });
      session.setEncryptedConfig({ allowGroups: process.env.WHATSAPP_QR_ALLOW_GROUPS === 'true' });
      await session.save();
      created += 1;
    }

    let orphanSessions = 0;
    const sessions = await WhatsAppSession.find({ companyId }).select('_id integrationId metadata');
    for (const session of sessions) {
      const hasConfig =
        session.integrationId &&
        (await ChannelConfig.exists({ _id: session.integrationId, companyId }));
      if (hasConfig || session.metadata?.orphan) continue;
      await WhatsAppSession.updateOne(
        { _id: session._id },
        { $set: { 'metadata.orphan': true, lastError: 'Sesion sin numero vinculado (config ausente).' } }
      );
      orphanSessions += 1;
    }

    return { created, orphanSessions };
  }

  async stop() {
    this.stopping = true;
    clearInterval(this.healthTimer);
    this.healthTimer = null;
    const ids = [...this.instances.keys()];
    for (const id of ids) await this.closeRuntime(id);
  }

  isTransientStatus(status) {
    return TRANSIENT_STATUSES.has(status);
  }
}

export const WhatsAppQrSessionManager = new SessionManager();
