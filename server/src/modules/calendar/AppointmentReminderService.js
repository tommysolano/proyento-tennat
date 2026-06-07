import { ActivityLog } from '../../models/ActivityLog.js';
import { Appointment } from '../../models/Appointment.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { RealtimeService } from '../realtime/RealtimeService.js';

export class AppointmentReminderService {
  static async process(job) {
    const appointment = await Appointment.findById(job.payload.appointmentId);
    if (!appointment) {
      throw Object.assign(new Error('Cita no encontrada'), { retryable: false });
    }
    if (
      !['scheduled', 'confirmed'].includes(appointment.status) ||
      String(appointment.reminderJobId || '') !== String(job._id) ||
      appointment.reminderSentAt
    ) {
      return;
    }
    await NotificationService.create({
      companyId: appointment.companyId,
      distributorId: appointment.distributorId,
      userId: appointment.assignedTo,
      type: 'appointment_upcoming',
      title: 'Cita proxima',
      body: `${appointment.title} - ${appointment.startAt.toISOString()}`,
      relatedType: 'appointment',
      relatedId: appointment._id
    });
    appointment.reminderSentAt = new Date();
    await appointment.save();
    const activity = await ActivityLog.create({
      companyId: appointment.companyId,
      distributorId: appointment.distributorId,
      userId: appointment.createdBy,
      type: 'appointment_reminder_sent',
      summary: `Recordatorio enviado: ${appointment.title}`,
      metadata: { appointmentId: appointment._id, jobId: job._id }
    });
    const { WorkflowEventEmitter } = await import(
      '../workflows/WorkflowEventEmitter.js'
    );
    await WorkflowEventEmitter.emitFromActivity(activity).catch(() => {});
    RealtimeService.publish('appointment.reminder', {
      companyId: appointment.companyId,
      assignedTo: appointment.assignedTo,
      data: { appointmentId: appointment._id }
    });
  }
}
