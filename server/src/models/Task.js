import mongoose from 'mongoose';
import { CRM_PRIORITIES } from './Contact.js';

export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled', 'overdue'];

const taskSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    distributorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Distributor', default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    relatedType: { type: String, enum: ['contact', 'opportunity', 'company'], default: 'contact' },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dueAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    status: { type: String, enum: TASK_STATUSES, default: 'pending' },
    priority: { type: String, enum: CRM_PRIORITIES, default: 'medium' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    archivedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

taskSchema.index({ companyId: 1, assignedTo: 1, status: 1, dueAt: 1 });
taskSchema.index({ companyId: 1, relatedType: 1, relatedId: 1 });

export const Task = mongoose.model('Task', taskSchema);
