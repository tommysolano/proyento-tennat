import mongoose from 'mongoose';

const channelConfigSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    channel: {
      type: String,
      enum: ['whatsapp_cloud_api', 'facebook', 'messenger'],
      required: true
    },
    displayName: {
      type: String,
      required: true
    },
    credentials: {
      appId: {
        type: String,
        default: ''
      },
      phoneNumberId: {
        type: String,
        default: ''
      },
      pageId: {
        type: String,
        default: ''
      },
      tokenPreview: {
        type: String,
        default: ''
      }
    },
    status: {
      type: String,
      enum: ['draft', 'connected', 'disabled'],
      default: 'draft'
    }
  },
  { timestamps: true }
);

export const ChannelConfig = mongoose.model('ChannelConfig', channelConfigSchema);
