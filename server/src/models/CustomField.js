import mongoose from 'mongoose';

export const CUSTOM_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'multiselect',
  'boolean',
  'phone',
  'email',
  'url'
];

const customFieldSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    entityType: { type: String, enum: ['contact', 'opportunity'], required: true },
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z][a-z0-9_]*$/, 'key solo admite letras, numeros y guion bajo']
    },
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: CUSTOM_FIELD_TYPES, required: true },
    required: { type: Boolean, default: false },
    options: { type: [String], default: [] },
    defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    order: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

customFieldSchema.index({ companyId: 1, entityType: 1, key: 1 }, { unique: true });

export const CustomField = mongoose.model('CustomField', customFieldSchema);
