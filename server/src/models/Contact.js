import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true
    },
    source: {
      type: String,
      default: 'Carga manual'
    },
    status: {
      type: String,
      enum: ['pendiente', 'contactado', 'interesado', 'no_interesado'],
      default: 'pendiente'
    },
    lastContactAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

export const Contact = mongoose.model('Contact', contactSchema);
