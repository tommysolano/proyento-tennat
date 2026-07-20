import { Appointment } from '../../models/Appointment.js';
import { Contact, CONTACT_LIFECYCLE_STAGES, CONTACT_STATUSES, CRM_PRIORITIES } from '../../models/Contact.js';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';
import { Note } from '../../models/Note.js';
import { Opportunity } from '../../models/Opportunity.js';
import { PipelineStage } from '../../models/PipelineStage.js';
import { Tag } from '../../models/Tag.js';
import { tagScopeFilter } from '../../utils/crmOrganization.js';
import { Task } from '../../models/Task.js';
import { User } from '../../models/User.js';
import { NotificationService } from '../notifications/NotificationService.js';
import { OperationalAlertService } from '../ops/OperationalAlertService.js';
import { JobService } from '../jobs/JobService.js';
import { recordActivity } from '../../utils/activity.js';
import { getSafePath } from './workflowValidation.js';
import { ConversationService } from '../conversations/ConversationService.js';
import { MessageTemplate } from '../../models/MessageTemplate.js';
import { buildOutboundTemplate } from '../communications/TemplateSyncService.js';
import { resolveWorkflowConversation } from './workflowMessaging.js';
import { EmailProvider } from '../communications/EmailProvider.js';

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400, retryable: false });
}

function interpolate(value, context) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const resolved = getSafePath(context, path.trim());
    return resolved === undefined || resolved === null ? '' : String(resolved);
  });
}

function resolvedConfig(config, context) {
  return Object.fromEntries(
    Object.entries(config || {}).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? value.map((item) => interpolate(item, context))
        : interpolate(value, context)
    ])
  );
}

function entityId(context, type, explicit) {
  if (explicit) return explicit;
  if (context.event.entityType === type) return context.event.entityId;
  const field = `${type}Id`;
  return context.payload[field] || context.entity?.[field] || null;
}

async function tenantUser(companyId, userId) {
  const user = await User.findOne({
    _id: userId,
    companyId,
    role: { $in: ['ADMIN', 'SUPERVISOR', 'CALLCENTER'] },
    status: 'active'
  });
  if (!user) throw badRequest('El responsable no pertenece a la empresa');
  return user;
}

/**
 * Ejecuta un envio saliente (ConversationService.createOutboundMessage) desde un
 * workflow y normaliza sus fallos:
 *  - Bloqueo por politica (opt-out/consentimiento/supresion/ventana 24h): NO es un
 *    error del workflow — se devuelve { skipped, reason } y el flujo continua.
 *  - Error de configuracion/permiso (4xx): se re-lanza como NO reintentable para
 *    que no se repita 5 veces (retrying no lo arregla).
 *  - Error transitorio (5xx/desconocido): se re-lanza tal cual (reintentable).
 */
async function sendOutbound(run) {
  try {
    const message = await run();
    return { message };
  } catch (error) {
    if (error?.policy || error?.code === 'CONSENT_REQUIRED' || /opt|consent|supres|ventana|window|dnd/i.test(String(error?.code || ''))) {
      return { skipped: true, reason: error.code || error.reasonCode || 'blocked' };
    }
    const status = Number(error?.status || 0);
    if (status >= 400 && status < 500) error.retryable = false;
    throw error;
  }
}

async function logAction(actor, context, type, summary, metadata = {}) {
  return recordActivity({
    user: actor,
    companyId: context.companyId,
    distributorId: context.distributorId,
    type,
    summary,
    metadata: {
      ...metadata,
      sourceWorkflowId: context.workflowId,
      sourceWorkflowRunId: context.runId,
      chainDepth: context.chainDepth + 1
    }
  });
}

export class WorkflowActionExecutor {
  static async execute(action, context) {
    const config = resolvedConfig(action.config, context);
    const companyId = context.companyId;
    const actor = context.actor;

    switch (action.type) {
      case 'contact.update_status': {
        if (!CONTACT_STATUSES.includes(config.status)) throw badRequest('status de contacto invalido');
        const contact = await Contact.findOne({ _id: entityId(context, 'contact', config.contactId), companyId, archivedAt: null });
        if (!contact) throw badRequest('Contacto no encontrado en la empresa');
        const from = contact.status;
        contact.status = config.status;
        contact.updatedBy = actor._id;
        await contact.save();
        await logAction(actor, context, 'status_change', `Estado de ${contact.name}: ${from} -> ${contact.status}`, { contactId: contact._id, from, to: contact.status });
        return { contactId: contact._id, status: contact.status };
      }
      case 'contact.update_lifecycle_stage':
      case 'contact.update_priority': {
        const field = action.type.includes('lifecycle') ? 'lifecycleStage' : 'priority';
        const value = config[field];
        const allowed = field === 'lifecycleStage' ? CONTACT_LIFECYCLE_STAGES : CRM_PRIORITIES;
        if (!allowed.includes(value)) throw badRequest(`${field} invalido`);
        const contact = await Contact.findOne({ _id: entityId(context, 'contact', config.contactId), companyId, archivedAt: null });
        if (!contact) throw badRequest('Contacto no encontrado en la empresa');
        contact[field] = value;
        contact.updatedBy = actor._id;
        await contact.save();
        await logAction(actor, context, 'contact_updated', `Contacto actualizado por workflow: ${contact.name}`, { contactId: contact._id, fields: [field] });
        return { contactId: contact._id, [field]: value };
      }
      case 'contact.assign_user': {
        const [contact, user] = await Promise.all([
          Contact.findOne({ _id: entityId(context, 'contact', config.contactId), companyId, archivedAt: null }),
          tenantUser(companyId, config.userId)
        ]);
        if (!contact) throw badRequest('Contacto no encontrado en la empresa');
        const from = contact.assignedTo;
        contact.assignedTo = user._id;
        contact.updatedBy = actor._id;
        await contact.save();
        await logAction(actor, context, 'contact_assigned', `Contacto reasignado: ${contact.name}`, { contactId: contact._id, from, to: user._id });
        return { contactId: contact._id, assignedTo: user._id };
      }
      case 'contact.add_tag':
      case 'contact.remove_tag': {
        const [contact, tag] = await Promise.all([
          Contact.findOne({ _id: entityId(context, 'contact', config.contactId), companyId, archivedAt: null }),
          Tag.findOne({
            _id: config.tagId,
            companyId,
            status: 'active',
            ...tagScopeFilter('contact')
          })
        ]);
        if (!contact || !tag) throw badRequest('Contacto o tag no encontrado en la empresa');
        const from = contact.tags.map(String);
        if (action.type.endsWith('add_tag') && !from.includes(String(tag._id))) contact.tags.push(tag._id);
        if (action.type.endsWith('remove_tag')) contact.tags = contact.tags.filter((id) => String(id) !== String(tag._id));
        await contact.save();
        await logAction(actor, context, 'contact_tags_updated', `Tags actualizados: ${contact.name}`, { contactId: contact._id, from, to: contact.tags });
        return { contactId: contact._id, tagId: tag._id };
      }
      case 'contact.add_note':
      case 'opportunity.add_note': {
        const relatedType = action.type.startsWith('contact') ? 'contact' : 'opportunity';
        const relatedId = entityId(context, relatedType, config[`${relatedType}Id`]);
        const Model = relatedType === 'contact' ? Contact : Opportunity;
        const related = await Model.findOne({ _id: relatedId, companyId });
        if (!related) throw badRequest(`${relatedType} no encontrado en la empresa`);
        const note = await Note.create({
          companyId,
          distributorId: context.distributorId,
          relatedType,
          relatedId,
          text: config.text,
          createdBy: actor._id,
          visibility: config.visibility === 'internal' ? 'internal' : 'team',
          metadata: { sourceWorkflowId: context.workflowId, sourceWorkflowRunId: context.runId }
        });
        await logAction(actor, context, 'crm_note_created', `Nota creada por workflow en ${relatedType}`, { noteId: note._id, relatedType, relatedId, [`${relatedType}Id`]: relatedId });
        return { noteId: note._id, relatedType, relatedId };
      }
      case 'opportunity.move_stage': {
        const opportunity = await Opportunity.findOne({ _id: entityId(context, 'opportunity', config.opportunityId), companyId });
        const stage = await PipelineStage.findOne({ _id: config.stageId, companyId, status: 'active' });
        if (!opportunity || !stage || String(stage.pipelineId) !== String(opportunity.pipelineId)) throw badRequest('Oportunidad o etapa invalida');
        const from = opportunity.stageId;
        opportunity.stageId = stage._id;
        opportunity.probability = stage.probability;
        opportunity.updatedBy = actor._id;
        await opportunity.save();
        await logAction(actor, context, 'opportunity_stage_changed', `Oportunidad movida: ${opportunity.title}`, { opportunityId: opportunity._id, contactId: opportunity.contactId, from, to: stage._id });
        return { opportunityId: opportunity._id, stageId: stage._id };
      }
      case 'opportunity.mark_won':
      case 'opportunity.mark_lost': {
        const opportunity = await Opportunity.findOne({ _id: entityId(context, 'opportunity', config.opportunityId), companyId });
        if (!opportunity) throw badRequest('Oportunidad no encontrada en la empresa');
        const won = action.type.endsWith('mark_won');
        opportunity.status = won ? 'won' : 'lost';
        opportunity.wonAt = won ? new Date() : null;
        opportunity.lostAt = won ? null : new Date();
        opportunity.lostReason = won ? '' : config.lostReason || 'Workflow';
        opportunity.updatedBy = actor._id;
        await opportunity.save();
        await logAction(actor, context, won ? 'opportunity_won' : 'opportunity_lost', `Oportunidad ${won ? 'ganada' : 'perdida'}: ${opportunity.title}`, { opportunityId: opportunity._id, contactId: opportunity.contactId, value: opportunity.value });
        return { opportunityId: opportunity._id, status: opportunity.status };
      }
      case 'opportunity.assign_user': {
        const [opportunity, user] = await Promise.all([
          Opportunity.findOne({ _id: entityId(context, 'opportunity', config.opportunityId), companyId }),
          tenantUser(companyId, config.userId)
        ]);
        if (!opportunity) throw badRequest('Oportunidad no encontrada en la empresa');
        opportunity.assignedTo = user._id;
        opportunity.updatedBy = actor._id;
        await opportunity.save();
        await logAction(actor, context, 'opportunity_updated', `Oportunidad asignada por workflow: ${opportunity.title}`, { opportunityId: opportunity._id, contactId: opportunity.contactId, fields: ['assignedTo'] });
        return { opportunityId: opportunity._id, assignedTo: user._id };
      }
      case 'task.create': {
        const relatedType = config.relatedType || (['contact', 'opportunity'].includes(context.event.entityType) ? context.event.entityType : 'company');
        const relatedId = relatedType === 'company'
          ? companyId
          : entityId(context, relatedType, config.relatedId);
        const user = await tenantUser(companyId, config.userId || context.entity?.assignedTo || actor._id);
        const task = await Task.create({
          companyId,
          distributorId: context.distributorId,
          title: config.title,
          description: config.description || '',
          relatedType,
          relatedId,
          assignedTo: user._id,
          createdBy: actor._id,
          dueAt: config.dueAt ? new Date(config.dueAt) : null,
          priority: CRM_PRIORITIES.includes(config.priority) ? config.priority : 'medium',
          metadata: { sourceWorkflowId: context.workflowId, sourceWorkflowRunId: context.runId }
        });
        await logAction(actor, context, 'task_created', `Tarea creada: ${task.title}`, { taskId: task._id, relatedType, relatedId, assignedTo: user._id, [`${relatedType}Id`]: relatedId });
        return { taskId: task._id };
      }
      case 'task.complete': {
        const task = await Task.findOne({ _id: entityId(context, 'task', config.taskId), companyId, archivedAt: null });
        if (!task) throw badRequest('Tarea no encontrada en la empresa');
        task.status = 'completed';
        task.completedAt = new Date();
        await task.save();
        await logAction(actor, context, 'task_completed', `Tarea completada: ${task.title}`, { taskId: task._id, relatedType: task.relatedType, relatedId: task.relatedId });
        return { taskId: task._id, status: task.status };
      }
      case 'conversation.assign_user': {
        const [conversation, user] = await Promise.all([
          Conversation.findOne({ _id: entityId(context, 'conversation', config.conversationId), companyId, archivedAt: null }),
          tenantUser(companyId, config.userId)
        ]);
        if (!conversation) throw badRequest('Conversacion no encontrada en la empresa');
        const from = conversation.assignedTo;
        conversation.assignedTo = user._id;
        conversation.updatedBy = actor._id;
        await conversation.save();
        await logAction(actor, context, 'conversation_assigned', 'Conversacion reasignada por workflow', { conversationId: conversation._id, contactId: conversation.contactId, from, to: user._id });
        return { conversationId: conversation._id, assignedTo: user._id };
      }
      case 'conversation.close': {
        const conversation = await Conversation.findOne({ _id: entityId(context, 'conversation', config.conversationId), companyId, archivedAt: null });
        if (!conversation) throw badRequest('Conversacion no encontrada en la empresa');
        const from = conversation.status;
        conversation.status = 'closed';
        conversation.closedAt = new Date();
        conversation.closedBy = actor._id;
        conversation.updatedBy = actor._id;
        await conversation.save();
        await logAction(actor, context, 'conversation_closed', 'Conversacion cerrada por workflow', { conversationId: conversation._id, contactId: conversation.contactId, from, to: 'closed' });
        return { conversationId: conversation._id, status: 'closed' };
      }
      case 'conversation.add_internal_note': {
        const conversation = await Conversation.findOne({ _id: entityId(context, 'conversation', config.conversationId), companyId, archivedAt: null });
        if (!conversation) throw badRequest('Conversacion no encontrada en la empresa');
        const message = await Message.create({
          companyId,
          distributorId: context.distributorId,
          conversationId: conversation._id,
          contactId: conversation.contactId,
          channel: conversation.channel,
          direction: 'internal',
          type: 'system',
          text: config.text,
          status: 'sent',
          provider: 'internal',
          sentBy: actor._id,
          metadata: { sourceWorkflowId: context.workflowId, sourceWorkflowRunId: context.runId }
        });
        await logAction(actor, context, 'conversation_internal_note_created', 'Nota interna creada por workflow', { conversationId: conversation._id, contactId: conversation.contactId, messageId: message._id });
        return { conversationId: conversation._id, messageId: message._id };
      }
      case 'appointment.create_internal_reminder': {
        const appointment = await Appointment.findOne({ _id: entityId(context, 'appointment', config.appointmentId), companyId });
        if (!appointment || !['scheduled', 'confirmed'].includes(appointment.status)) throw badRequest('Cita no disponible para recordatorio');
        const runAt = new Date(appointment.startAt.getTime() - Number(config.minutesBefore) * 60000);
        const job = await JobService.enqueue({
          type: 'appointment.reminder',
          payload: { appointmentId: appointment._id },
          runAt: runAt > new Date() ? runAt : new Date(),
          companyId,
          distributorId: context.distributorId,
          metadata: { appointmentId: appointment._id, sourceWorkflowRunId: context.runId }
        });
        appointment.reminderJobId = job._id;
        appointment.reminderAt = runAt;
        appointment.reminderSentAt = null;
        await appointment.save();
        return { appointmentId: appointment._id, jobId: job._id, runAt };
      }
      case 'notification.create': {
        const recipient = await tenantUser(companyId, config.userId || context.entity?.assignedTo || actor._id);
        const notification = await NotificationService.create({
          companyId,
          distributorId: context.distributorId,
          userId: recipient._id,
          type: 'workflow_notification',
          title: config.title,
          body: config.body || '',
          relatedType: context.event.entityType,
          relatedId: context.event.entityId,
          metadata: { sourceWorkflowId: context.workflowId, sourceWorkflowRunId: context.runId }
        });
        return { notificationId: notification?._id, userId: recipient._id };
      }
      case 'alert.create': {
        const alert = await OperationalAlertService.create({
          companyId,
          distributorId: context.distributorId,
          severity: ['info', 'warning', 'critical'].includes(config.severity) ? config.severity : 'warning',
          type: 'workflow_action',
          title: config.title,
          message: config.message,
          relatedType: context.event.entityType,
          relatedId: context.event.entityId,
          metadata: { sourceWorkflowId: context.workflowId, sourceWorkflowRunId: context.runId },
          deduplicate: config.deduplicate !== false
        });
        return { alertId: alert?._id };
      }
      case 'activity_log.create': {
        const activity = await logAction(actor, context, 'workflow_activity_created', config.summary, {
          entityType: context.event.entityType,
          entityId: context.event.entityId,
          details: config.details || ''
        });
        return { activityId: activity?._id };
      }
      case 'email.send': {
        const to = String(config.to || context.entity?.email || context.payload?.email || '').trim();
        if (!to) throw badRequest('email.send requiere config.to o un email en la entidad del evento');
        const result = await EmailProvider.send({
          to,
          subject: config.subject || '',
          html: config.body || config.html || '',
          text: config.text || ''
        });
        if (result.skipped) {
          await logAction(actor, context, 'workflow_email_skipped', `Email no enviado (${result.reason})`, { to, reason: result.reason });
          return { to, skipped: true, reason: result.reason };
        }
        if (result.success === false) {
          throw Object.assign(new Error(result.error || 'No se pudo enviar el email'), { retryable: true });
        }
        await logAction(actor, context, 'workflow_email_sent', `Email enviado a ${to}`, { to, providerId: result.id });
        return { to, providerId: result.id };
      }
      case 'whatsapp.send': {
        const text = String(config.text || '').trim();
        const hasMedia = Boolean(config.mediaStorageKey);
        if (!text && !hasMedia) throw badRequest('whatsapp.send requiere text o mediaStorageKey');
        const { conversation } = await resolveWorkflowConversation(context, {
          contactId: config.contactId
        });
        const result = await sendOutbound(() =>
          ConversationService.createOutboundMessage({
            user: actor,
            conversation,
            text,
            type: hasMedia ? (config.mediaType || 'image') : 'text',
            media: hasMedia
              ? {
                  storageKey: config.mediaStorageKey,
                  caption: config.caption || '',
                  mimeType: config.mimeType || ''
                }
              : {},
            category: config.category || 'commercial'
          })
        );
        if (result.skipped) {
          await logAction(actor, context, 'workflow_whatsapp_skipped', `WhatsApp no enviado (${result.reason})`, {
            conversationId: conversation._id,
            contactId: conversation.contactId,
            reason: result.reason
          });
          return { conversationId: conversation._id, skipped: true, reason: result.reason };
        }
        await logAction(actor, context, 'workflow_whatsapp_sent', 'WhatsApp enviado por workflow', {
          conversationId: conversation._id,
          contactId: conversation.contactId,
          messageId: result.message._id
        });
        return { conversationId: conversation._id, messageId: result.message._id, status: result.message.status };
      }
      case 'whatsapp.send_template': {
        const template = await MessageTemplate.findOne({
          _id: config.templateId,
          companyId,
          channel: 'whatsapp_cloud'
        });
        if (!template) throw badRequest('Plantilla de WhatsApp no encontrada en la empresa');
        if (template.status !== 'approved') {
          throw badRequest(`La plantilla "${template.name}" no esta aprobada por Meta (estado: ${template.status})`);
        }
        // Interpola valores {{event.…}}/{{entity.…}} dentro de las variables.
        const variables = Object.fromEntries(
          Object.entries(config.variables || {}).map(([key, value]) => [
            key,
            interpolate(value, context)
          ])
        );
        const providerTemplate = buildOutboundTemplate(template, variables);
        const { conversation } = await resolveWorkflowConversation(context, {
          contactId: config.contactId,
          preferCloud: true
        });
        const result = await sendOutbound(() =>
          ConversationService.createOutboundMessage({
            user: actor,
            conversation,
            text: template.content,
            type: 'text',
            template: providerTemplate,
            templateId: template._id,
            category: template.messageCategory === 'reply' ? 'commercial' : (template.messageCategory || 'commercial')
          })
        );
        if (result.skipped) {
          await logAction(actor, context, 'workflow_whatsapp_skipped', `Plantilla no enviada (${result.reason})`, {
            conversationId: conversation._id,
            contactId: conversation.contactId,
            templateId: template._id,
            reason: result.reason
          });
          return { conversationId: conversation._id, template: template.name, skipped: true, reason: result.reason };
        }
        await logAction(actor, context, 'workflow_whatsapp_template_sent', `Plantilla "${template.name}" enviada por workflow`, {
          conversationId: conversation._id,
          contactId: conversation.contactId,
          messageId: result.message._id,
          templateId: template._id
        });
        return {
          conversationId: conversation._id,
          messageId: result.message._id,
          template: template.name,
          status: result.message.status
        };
      }
      default:
        throw badRequest(`Accion no implementada: ${action.type}`);
    }
  }
}
