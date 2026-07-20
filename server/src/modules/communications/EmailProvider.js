import { logger } from '../../utils/logger.js';

/**
 * Proveedor de email agnostico via HTTP (sin dependencias nativas: usa fetch).
 * Soporta Resend y SendGrid segun EMAIL_PROVIDER. Si no esta configurado NO lanza:
 * devuelve { skipped: true, reason } para que un workflow no falle en duro cuando
 * el email aun no se ha activado.
 *
 * Variables de entorno:
 *   EMAIL_PROVIDER = resend | sendgrid | none (default none)
 *   EMAIL_API_KEY  = clave del proveedor
 *   EMAIL_FROM     = remitente verificado (ej. "Tennat <no-reply@tudominio.com>")
 *   EMAIL_REPLY_TO = (opcional) direccion de respuesta
 */
export class EmailProvider {
  static providerName() {
    return String(process.env.EMAIL_PROVIDER || 'none').toLowerCase();
  }

  static isConfigured() {
    const provider = this.providerName();
    return (
      provider !== 'none' &&
      Boolean(process.env.EMAIL_API_KEY) &&
      Boolean(process.env.EMAIL_FROM)
    );
  }

  static async send({ to, subject, html = '', text = '', from = '', replyTo = '' }) {
    const recipient = String(to || '').trim();
    if (!/.+@.+\..+/.test(recipient)) {
      return { skipped: true, reason: 'invalid_recipient' };
    }
    if (!this.isConfigured()) {
      logger.warn('email.not_configured', { to: recipient });
      return { skipped: true, reason: 'email_not_configured' };
    }
    const sender = from || process.env.EMAIL_FROM;
    const reply = replyTo || process.env.EMAIL_REPLY_TO || '';
    const provider = this.providerName();
    try {
      if (provider === 'resend') {
        return await this.sendResend({ to: recipient, subject, html, text, sender, reply });
      }
      if (provider === 'sendgrid') {
        return await this.sendSendgrid({ to: recipient, subject, html, text, sender, reply });
      }
      return { skipped: true, reason: 'email_provider_unsupported' };
    } catch (error) {
      return { success: false, error: `No se pudo enviar el email: ${error.message}` };
    }
  }

  static async sendResend({ to, subject, html, text, sender, reply }) {
    const body = {
      from: sender,
      to: [to],
      subject: subject || '',
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
      ...(reply ? { reply_to: reply } : {})
    };
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, error: data?.message || `Resend respondio HTTP ${response.status}` };
    }
    return { success: true, id: data?.id || '' };
  }

  static async sendSendgrid({ to, subject, html, text, sender, reply }) {
    const content = [];
    if (text) content.push({ type: 'text/plain', value: text });
    if (html) content.push({ type: 'text/html', value: html });
    if (!content.length) content.push({ type: 'text/plain', value: '' });
    const body = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: sender.replace(/^.*<(.+)>$/, '$1').trim() },
      subject: subject || '',
      content,
      ...(reply ? { reply_to: { email: reply } } : {})
    };
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (response.status !== 202 && !response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: data?.errors?.[0]?.message || `SendGrid respondio HTTP ${response.status}` };
    }
    return { success: true, id: response.headers.get('x-message-id') || '' };
  }
}
