export const WORKFLOW_TRIGGERS = [
  ['contact.created', 'contacts', 'Contacto creado'],
  ['contact.updated', 'contacts', 'Contacto actualizado'],
  ['contact.status_changed', 'contacts', 'Estado de contacto cambiado'],
  ['contact.assigned', 'contacts', 'Contacto asignado'],
  ['contact.tag_added', 'contacts', 'Tag agregado a contacto'],
  ['contact.tag_removed', 'contacts', 'Tag removido de contacto'],
  ['contact.followup_due', 'contacts', 'Seguimiento de contacto vencido', 'planned'],
  ['opportunity.created', 'opportunities', 'Oportunidad creada'],
  ['opportunity.stage_changed', 'opportunities', 'Etapa de oportunidad cambiada'],
  ['opportunity.won', 'opportunities', 'Oportunidad ganada'],
  ['opportunity.lost', 'opportunities', 'Oportunidad perdida'],
  ['opportunity.assigned', 'opportunities', 'Oportunidad asignada', 'planned'],
  ['task.created', 'tasks', 'Tarea creada'],
  ['task.completed', 'tasks', 'Tarea completada'],
  ['task.overdue', 'tasks', 'Tarea vencida', 'planned'],
  ['conversation.created', 'conversations', 'Conversacion creada'],
  ['conversation.assigned', 'conversations', 'Conversacion asignada'],
  ['conversation.closed', 'conversations', 'Conversacion cerrada'],
  ['message.inbound_received', 'conversations', 'Mensaje inbound recibido'],
  ['message.outbound_failed', 'conversations', 'Mensaje outbound fallido'],
  ['appointment.created', 'calendar', 'Cita creada'],
  ['appointment.cancelled', 'calendar', 'Cita cancelada'],
  ['appointment.completed', 'calendar', 'Cita completada'],
  ['appointment.no_show', 'calendar', 'Cita no show'],
  ['appointment.rescheduled', 'calendar', 'Cita reprogramada'],
  ['appointment.reminder_due', 'calendar', 'Recordatorio de cita vencido', 'planned'],
  ['appointment.reminder_sent', 'calendar', 'Recordatorio de cita enviado'],
  ['invoice.created', 'billing', 'Factura creada'],
  ['invoice.paid', 'billing', 'Factura pagada'],
  ['invoice.overdue', 'billing', 'Factura vencida', 'planned'],
  ['payment.succeeded', 'billing', 'Pago exitoso'],
  ['payment.failed', 'billing', 'Pago fallido'],
  ['alert.created', 'ops', 'Alerta creada', 'planned'],
  ['job.dead', 'jobs', 'Job agotado'],
  ['form.created', 'forms', 'Formulario creado'],
  ['form.published', 'forms', 'Formulario publicado'],
  ['form.submitted', 'forms', 'Formulario enviado'],
  ['form.submission_processed', 'forms', 'Submission procesado'],
  ['form.spam_detected', 'forms', 'Spam de formulario detectado'],
  ['form.contact_created', 'forms', 'Contacto creado por formulario'],
  ['form.opportunity_created', 'forms', 'Oportunidad creada por formulario'],
  ['survey.submitted', 'surveys', 'Encuesta enviada'],
  ['landing_page.published', 'landing_pages', 'Landing page publicada'],
  ['landing_page.viewed', 'landing_pages', 'Landing page visitada'],
  ['funnel.published', 'funnels', 'Funnel publicado'],
  ['funnel.step_viewed', 'funnels', 'Step de funnel visitado'],
  ['funnel.conversion', 'funnels', 'Conversion de funnel']
].map(([eventType, sourceModule, label, status = 'active']) => ({
  eventType,
  sourceModule,
  label,
  requiredModules: [sourceModule],
  status
}));

export const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'in',
  'not_in',
  'exists',
  'not_exists',
  'greater_than',
  'greater_or_equal',
  'less_than',
  'less_or_equal',
  'before',
  'after'
];

export const WORKFLOW_ACTIONS = [
  ['contact.update_status', ['status']],
  ['contact.update_lifecycle_stage', ['lifecycleStage']],
  ['contact.update_priority', ['priority']],
  ['contact.assign_user', ['userId']],
  ['contact.add_tag', ['tagId']],
  ['contact.remove_tag', ['tagId']],
  ['contact.add_note', ['text']],
  ['opportunity.move_stage', ['stageId']],
  ['opportunity.mark_won', []],
  ['opportunity.mark_lost', []],
  ['opportunity.assign_user', ['userId']],
  ['opportunity.add_note', ['text']],
  ['task.create', ['title']],
  ['task.complete', []],
  ['conversation.assign_user', ['userId']],
  ['conversation.close', []],
  ['conversation.add_internal_note', ['text']],
  ['appointment.create_internal_reminder', ['minutesBefore']],
  ['notification.create', ['title']],
  ['alert.create', ['title', 'message']],
  ['activity_log.create', ['summary']],
  ['delay.wait_minutes', ['minutes']],
  ['delay.wait_until', ['until']]
].map(([type, requiredConfig]) => ({
  type,
  requiredConfig,
  requiredModules: [
    type.startsWith('appointment.') ? 'calendar' :
      type.startsWith('conversation.') ? 'conversations' :
        type.startsWith('opportunity.') ? 'opportunities' :
          type.startsWith('task.') ? 'tasks' :
            type.startsWith('contact.') ? 'contacts' : 'core'
  ],
  status: 'active'
}));

export const PLANNED_ACTIONS = [
  'email.send',
  'sms.send',
  'whatsapp.send',
  'webhook.call',
  'ai.generate',
  'funnel.enroll',
  'form.send_confirmation_email',
  'funnel.redirect',
  'webhook.external_call'
].map((type) => ({ type, status: 'planned' }));

export const workflowCatalog = {
  triggers: WORKFLOW_TRIGGERS,
  operators: CONDITION_OPERATORS,
  actions: [...WORKFLOW_ACTIONS, ...PLANNED_ACTIONS],
  conditionRoots: ['event', 'entity', 'payload'],
  requiredModules: ['automations', 'workflows']
};
