import mongoose from 'mongoose';

export const TEMPLATE_CHANNELS = ['internal', 'whatsapp_cloud', 'email', 'sms'];
export const TEMPLATE_TYPES = [
  'quick_reply',
  'whatsapp_template',
  'email_template',
  'sms_template'
];
// Estados: se mantienen los legados y se agregan los del ciclo de vida de Meta.
// Legado: active/inactive/pending_provider_approval. Ciclo Meta: draft, pending,
// approved, rejected, disabled. `pending_provider_approval` se muestra como
// `pending` (ver STATUS_ALIASES) pero se conserva para no romper documentos.
export const TEMPLATE_STATUSES = [
  'draft',
  'active',
  'inactive',
  'pending_provider_approval',
  'pending',
  'approved',
  'rejected',
  'disabled'
];
export const TEMPLATE_MESSAGE_CATEGORIES = [
  'commercial',
  'transactional',
  'operational',
  'reply'
];
// Categoria alineada a Meta. Es el valor que se envia al registrar la plantilla.
export const TEMPLATE_META_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
export const TEMPLATE_HEADER_TYPES = ['none', 'text', 'image', 'document', 'video'];
export const TEMPLATE_BUTTON_TYPES = ['quick_reply', 'url', 'phone'];

// Mapeo suave de la clasificacion interna (messageCategory) a la categoria de
// Meta. Se usa como default de metaCategory y se documenta en WHATSAPP.md.
export const META_CATEGORY_FROM_MESSAGE_CATEGORY = {
  commercial: 'MARKETING',
  reply: 'MARKETING',
  transactional: 'UTILITY',
  operational: 'UTILITY'
};

// Normalizacion de estados legados para presentacion/logica del ciclo Meta.
export const STATUS_ALIASES = {
  pending_provider_approval: 'pending'
};

export function normalizeTemplateStatus(status) {
  return STATUS_ALIASES[status] || status;
}

export function metaCategoryFromMessageCategory(messageCategory) {
  return META_CATEGORY_FROM_MESSAGE_CATEGORY[messageCategory] || 'UTILITY';
}

const templateButtonSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TEMPLATE_BUTTON_TYPES, required: true },
    text: { type: String, trim: true, required: true, maxlength: 25 },
    url: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const variableSampleSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, required: true },
    example: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const messageTemplateSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    name: { type: String, required: true, trim: true },
    channel: { type: String, enum: TEMPLATE_CHANNELS, required: true },
    type: { type: String, enum: TEMPLATE_TYPES, default: 'quick_reply' },
    language: { type: String, default: 'es', trim: true },
    category: { type: String, default: 'utility', trim: true },
    // Categoria de Meta (MARKETING/UTILITY/AUTHENTICATION). Default derivado de
    // messageCategory para documentos existentes que no la traian.
    metaCategory: {
      type: String,
      enum: TEMPLATE_META_CATEGORIES,
      default() {
        return metaCategoryFromMessageCategory(this.messageCategory);
      }
    },
    messageCategory: {
      type: String,
      enum: TEMPLATE_MESSAGE_CATEGORIES,
      default() {
        return this.type === 'quick_reply' ? 'reply' : 'commercial';
      }
    },
    content: { type: String, required: true, trim: true },
    // Cabecera (solo whatsapp_cloud). 'none' = sin cabecera.
    headerType: { type: String, enum: TEMPLATE_HEADER_TYPES, default: 'none' },
    headerText: { type: String, trim: true, default: '' },
    headerMediaUrl: { type: String, trim: true, default: '' },
    footer: { type: String, trim: true, default: '' },
    buttons: { type: [templateButtonSchema], default: [] },
    // Nombres de variables del cuerpo ({{1}}, {{2}}...) y sus ejemplos. Meta
    // EXIGE ejemplos al registrar; variableSamples los guarda por variable.
    variables: { type: [String], default: [] },
    variableSamples: { type: [variableSampleSchema], default: [] },
    status: { type: String, enum: TEMPLATE_STATUSES, default: 'draft' },
    providerTemplateId: { type: String, default: '' },
    providerStatus: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    syncedAt: { type: Date, default: null },
    usageCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

// Regla de botones de Meta: maximo 3, y campos coherentes con el tipo.
messageTemplateSchema.path('buttons').validate(function validateButtons(buttons) {
  if (!Array.isArray(buttons)) return false;
  if (buttons.length > 3) return false;
  return buttons.every((button) => {
    if (!button?.type || !String(button.text || '').trim()) return false;
    if (button.type === 'url') return Boolean(String(button.url || '').trim());
    if (button.type === 'phone') return Boolean(String(button.phone || '').trim());
    // quick_reply no lleva url ni phone.
    return true;
  });
}, 'Botones invalidos: maximo 3 y cada uno debe cumplir las reglas de su tipo (url requiere URL, phone requiere numero).');

messageTemplateSchema.index({ companyId: 1, channel: 1, status: 1, name: 1 });

export const MessageTemplate = mongoose.model('MessageTemplate', messageTemplateSchema);
