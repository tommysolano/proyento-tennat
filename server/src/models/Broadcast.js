import mongoose from 'mongoose';

export const BROADCAST_STATUSES = [
  'draft',
  'running',
  'completed',
  'cancelled',
  'failed'
];

/**
 * Difusion (broadcast) de una plantilla de WhatsApp aprobada a una audiencia
 * definida por lista explicita de contactos y/o una etiqueta. Cada destinatario
 * se envia por un job independiente (goteo por throttlePerMinute) reutilizando el
 * pipeline de ConversationService (consentimiento, ventana 24h, uso). Solo Cloud
 * API: fuera de la ventana de 24h solo una plantilla puede iniciar conversacion.
 */
const broadcastSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    name: { type: String, required: true, trim: true },
    channel: { type: String, enum: ['whatsapp_cloud'], default: 'whatsapp_cloud' },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageTemplate', required: true },
    // Valores por defecto de las variables de la plantilla (por nombre o indice).
    variables: { type: mongoose.Schema.Types.Mixed, default: {} },
    audience: {
      contactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
      tagId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tag', default: null }
    },
    // Ritmo de envio: destinatarios por minuto (goteo). Evita rafagas que tumben
    // el numero o reboten contra el rate limit de Meta.
    throttlePerMinute: { type: Number, default: 60, min: 1, max: 600 },
    status: { type: String, enum: BROADCAST_STATUSES, default: 'draft', index: true },
    stats: {
      total: { type: Number, default: 0 },
      processed: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 }
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    error: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

broadcastSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const Broadcast = mongoose.model('Broadcast', broadcastSchema);
