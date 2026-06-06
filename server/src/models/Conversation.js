import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      required: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    channel: {
      type: String,
      enum: ['whatsapp', 'facebook', 'messenger', 'phone', 'email'],
      default: 'whatsapp'
    },
    status: {
      type: String,
      enum: ['open', 'pending', 'resolved', 'archived'],
      default: 'open'
    },
    lastMessage: {
      type: String,
      default: ''
    },
    unreadCount: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
