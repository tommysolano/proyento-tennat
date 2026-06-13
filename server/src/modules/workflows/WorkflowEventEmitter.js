import { logger } from '../../utils/logger.js';

const ACTIVITY_EVENTS = {
  contact_created: ['contact.created', 'contacts', 'contact', 'contactId'],
  contact_created_from_inbound: ['contact.created', 'contacts', 'contact', 'contactId'],
  contact_updated: ['contact.updated', 'contacts', 'contact', 'contactId'],
  status_change: ['contact.status_changed', 'contacts', 'contact', 'contactId'],
  contact_assigned: ['contact.assigned', 'contacts', 'contact', 'contactId'],
  opportunity_created: ['opportunity.created', 'opportunities', 'opportunity', 'opportunityId'],
  opportunity_stage_changed: ['opportunity.stage_changed', 'opportunities', 'opportunity', 'opportunityId'],
  opportunity_won: ['opportunity.won', 'opportunities', 'opportunity', 'opportunityId'],
  opportunity_lost: ['opportunity.lost', 'opportunities', 'opportunity', 'opportunityId'],
  task_created: ['task.created', 'tasks', 'task', 'taskId'],
  task_completed: ['task.completed', 'tasks', 'task', 'taskId'],
  conversation_created: ['conversation.created', 'conversations', 'conversation', 'conversationId'],
  conversation_assigned: ['conversation.assigned', 'conversations', 'conversation', 'conversationId'],
  conversation_closed: ['conversation.closed', 'conversations', 'conversation', 'conversationId'],
  message_inbound_received: ['message.inbound_received', 'conversations', 'message', 'messageId'],
  message_outbound_failed: ['message.outbound_failed', 'conversations', 'message', 'messageId'],
  appointment_created: ['appointment.created', 'calendar', 'appointment', 'appointmentId'],
  appointment_confirmed: ['appointment.confirmed', 'calendar', 'appointment', 'appointmentId'],
  appointment_cancelled: ['appointment.cancelled', 'calendar', 'appointment', 'appointmentId'],
  appointment_reminder_sent: ['appointment.upcoming', 'calendar', 'appointment', 'appointmentId'],
  appointment_completed: ['appointment.completed', 'calendar', 'appointment', 'appointmentId'],
  appointment_no_show: ['appointment.no_show', 'calendar', 'appointment', 'appointmentId'],
  appointment_rescheduled: ['appointment.rescheduled', 'calendar', 'appointment', 'appointmentId'],
  company_invoice_created: ['invoice.created', 'billing', 'invoice', 'invoiceId'],
  company_payment_recorded: ['payment.succeeded', 'billing', 'payment', 'paymentId'],
  review_request_created: ['review_request.created', 'reviews', 'review_request', 'reviewRequestId'],
  review_received: ['review.submitted', 'reviews', 'review', 'reviewId'],
  review_approved: ['review.approved', 'reviews', 'review', 'reviewId'],
  review_published: ['review.published', 'reviews', 'review', 'reviewId'],
  testimonial_published: ['testimonial.published', 'testimonials', 'testimonial', 'testimonialId'],
  survey_response_received: ['survey.submitted', 'surveys', 'survey_response', 'surveyResponseId'],
  coupon_issued: ['coupon.issued', 'coupons', 'coupon_redemption', 'couponRedemptionId'],
  coupon_redeemed: ['coupon.redeemed', 'coupons', 'coupon_redemption', 'couponRedemptionId'],
  referral_created: ['referral.created', 'referrals', 'referral', 'referralId'],
  referral_converted: ['referral.converted', 'referrals', 'referral', 'referralId']
};

export class WorkflowEventEmitter {
  static async emit(event) {
    const { WorkflowService } = await import('./WorkflowService.js');
    return WorkflowService.emitEvent(event);
  }

  static async emitFromActivity(activity) {
    if (!activity?.companyId) return [];
    const metadata = activity.metadata?.toObject?.() || activity.metadata || {};
    const definitions = [];
    const mapped = ACTIVITY_EVENTS[activity.type];
    if (mapped) definitions.push(mapped);
    if (activity.type === 'appointment_reminder_sent') {
      definitions.push([
        'appointment.reminder_sent',
        'calendar',
        'appointment',
        'appointmentId'
      ]);
    }
    if (
      activity.type === 'company_payment_recorded' &&
      metadata.status &&
      metadata.status !== 'succeeded'
    ) {
      definitions.length = 0;
      if (metadata.status === 'failed') {
        definitions.push(['payment.failed', 'billing', 'payment', 'paymentId']);
      }
    }

    if (activity.type === 'contact_tags_updated') {
      const before = new Set((metadata.from || []).map(String));
      const after = new Set((metadata.to || []).map(String));
      for (const tagId of after) {
        if (!before.has(tagId)) {
          definitions.push(['contact.tag_added', 'contacts', 'contact', 'contactId', { tagId }]);
        }
      }
      for (const tagId of before) {
        if (!after.has(tagId)) {
          definitions.push(['contact.tag_removed', 'contacts', 'contact', 'contactId', { tagId }]);
        }
      }
    }

    if (activity.type === 'company_payment_recorded' && metadata.invoiceBecamePaid) {
      const { Invoice } = await import('../../models/Invoice.js');
      const invoice = await Invoice.findById(metadata.invoiceId).select('status').lean();
      if (invoice?.status === 'paid') {
        definitions.push(['invoice.paid', 'billing', 'invoice', 'invoiceId']);
      }
    }

    const results = [];
    for (let index = 0; index < definitions.length; index += 1) {
      const [eventType, sourceModule, entityType, idField, extraPayload = {}] =
        definitions[index];
      results.push(
        await this.emit({
          companyId: activity.companyId,
          distributorId: activity.distributorId,
          eventType,
          sourceModule,
          entityType,
          entityId: metadata[idField] || null,
          actorUserId: activity.userId,
          payload: { ...metadata, ...extraPayload },
          idempotencyKey: `activity:${activity._id}:${eventType}:${index}`,
          metadata: {
            activityId: activity._id,
            sourceWorkflowId: metadata.sourceWorkflowId || null,
            sourceWorkflowRunId: metadata.sourceWorkflowRunId || null,
            chainDepth: Number(metadata.chainDepth || 0)
          }
        })
      );
    }
    return results;
  }

  static async safelyEmit(event) {
    try {
      return await this.emit(event);
    } catch (error) {
      logger.error('workflow.event_emit_failed', error, {
        companyId: event.companyId,
        eventType: event.eventType,
        entityId: event.entityId
      });
      return null;
    }
  }
}
