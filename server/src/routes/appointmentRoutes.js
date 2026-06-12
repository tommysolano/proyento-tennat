import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Appointment } from '../models/Appointment.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { Company } from '../models/Company.js';
import { CalendarService } from '../modules/calendar/CalendarService.js';
import { conversationScope } from '../modules/conversations/conversationScope.js';
import {
  assertRelatedResource,
  assignedResourceScope,
  validateCrmAssignee
} from '../utils/crmScope.js';
import { cleanString, isValidObjectId } from '../utils/validation.js';
import {
  addDaysToDateKey,
  dateKeyInZone,
  zonedDateTimeToUtc
} from '../modules/calendar/calendarTime.js';

const router = Router();

function dateValue(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error(`${field} debe ser fecha valida`), { status: 400 });
  }
  return date;
}

async function appointmentFilter(user, query = {}) {
  const filter = await assignedResourceScope(user);
  for (const field of ['calendarId', 'contactId', 'opportunityId', 'assignedTo']) {
    if (query[field] && !isValidObjectId(query[field])) {
      throw Object.assign(new Error(`${field} invalido`), { status: 400 });
    }
  }
  for (const field of [
    'calendarId',
    'contactId',
    'opportunityId',
    'status',
    'source'
  ]) {
    if (query[field]) filter[field] = query[field];
  }
  if (query.assignedTo) {
    const requested = String(query.assignedTo);
    const current = filter.assignedTo;
    const allowed =
      !current ||
      current.toString?.() === requested ||
      current.$in?.some((id) => String(id) === requested);
    filter.assignedTo = allowed ? requested : { $in: [] };
  }
  if (query.from || query.to) {
    filter.startAt = {};
    if (query.from) filter.startAt.$gte = dateValue(query.from, 'from');
    if (query.to) filter.startAt.$lte = dateValue(query.to, 'to');
  }
  if (query.search) {
    filter.title = new RegExp(
      cleanString(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    );
  }
  return filter;
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(
  requireAnyPermission(
    'appointments:manage',
    'appointments:manage_team',
    'appointments:manage_assigned',
    'appointments:read_team',
    'appointments:update_team',
    'appointments:read_assigned',
    'appointments:update_assigned'
  )
);
router.use(requireModule('calendar'));
router.param('id', (req, res, next, id) => {
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'id de cita invalido' });
  }
  next();
});

router.get('/metrics', async (req, res, next) => {
  try {
    const scope = await assignedResourceScope(req.user);
    const now = new Date();
    const company = await Company.findById(req.user.companyId).select('settings.timezone');
    const timezone = company?.settings?.timezone || 'America/Guayaquil';
    const todayKey = dateKeyInZone(now, timezone);
    const dayStart = zonedDateTimeToUtc(todayKey, '00:00', timezone);
    const dayEnd = zonedDateTimeToUtc(addDaysToDateKey(todayKey, 1), '00:00', timezone);
    const [byStatus, byUser, today, upcoming] = await Promise.all([
      Appointment.aggregate([
        { $match: scope },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Appointment.aggregate([
        { $match: scope },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Appointment.countDocuments({
        ...scope,
        startAt: { $gte: dayStart, $lt: dayEnd }
      }),
      Appointment.countDocuments({
        ...scope,
        status: { $in: ['scheduled', 'confirmed'] },
        startAt: { $gte: now }
      })
    ]);
    const metricUsers = await User.find({
      _id: { $in: byUser.map((item) => item._id).filter(Boolean) },
      companyId: req.user.companyId
    }).select('name');
    const names = new Map(metricUsers.map((item) => [String(item._id), item.name]));
    res.json({
      byStatus: Object.fromEntries(byStatus.map((item) => [item._id, item.count])),
      byUser: byUser.map((item) => ({
        userId: item._id,
        name: names.get(String(item._id)) || 'Sin responsable',
        count: item.count
      })),
      today,
      upcoming
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 1000);
    res.json(
      await CalendarService.populateAppointment(
        Appointment.find(await appointmentFilter(req.user, req.query))
          .sort({ startAt: 1 })
          .limit(limit)
      )
    );
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (req.body.contactId) {
      await assertRelatedResource(req.user, 'contact', req.body.contactId);
    }
    if (req.body.opportunityId) {
      await assertRelatedResource(req.user, 'opportunity', req.body.opportunityId);
    }
    let metadata =
      req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};
    if (metadata.conversationId) {
      if (!isValidObjectId(metadata.conversationId)) {
        return res.status(400).json({ message: 'metadata.conversationId invalido' });
      }
      const conversation = await Conversation.findOne({
        _id: metadata.conversationId,
        ...(await conversationScope(req.user)),
        archivedAt: null
      }).select('_id contactId');
      if (
        !conversation ||
        !req.body.contactId ||
        String(conversation.contactId) !== String(req.body.contactId)
      ) {
        return res.status(400).json({
          message: 'La conversacion no pertenece al contacto o al alcance del usuario'
        });
      }
      metadata = { ...metadata, conversationId: conversation._id };
    }
    let assignedTo;
    if (req.user.role === 'CALLCENTER') assignedTo = req.user._id;
    else if (req.body.assignedTo) {
      assignedTo = await validateCrmAssignee(req.user, req.body.assignedTo, {
        allowNull: false
      });
    } else if (req.user.role === 'SUPERVISOR') assignedTo = req.user._id;
    res.status(201).json(
      await CalendarService.createAppointment({
        actor: req.user,
        companyId: req.user.companyId,
        distributorId: req.user.distributorId || null,
        body: { ...req.body, metadata, ...(assignedTo ? { assignedTo } : {}) },
        source: req.body.source || 'manual'
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const appointment = await CalendarService.populateAppointment(
      Appointment.findOne({
        _id: req.params.id,
        ...(await assignedResourceScope(req.user))
      })
    );
    if (!appointment) return res.status(404).json({ message: 'Cita no encontrada' });
    res.json(appointment);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      ...(await assignedResourceScope(req.user))
    });
    if (!appointment) return res.status(404).json({ message: 'Cita no encontrada' });
    if (req.body.contactId) {
      await assertRelatedResource(req.user, 'contact', req.body.contactId);
    }
    if (req.body.opportunityId) {
      await assertRelatedResource(req.user, 'opportunity', req.body.opportunityId);
    }
    if ('status' in req.body) {
      return res.json(
        await CalendarService.updateStatus({
          actor: req.user,
          appointment,
          status: req.body.status,
          reason: req.body.reason
        })
      );
    }
    const assignedTo =
      'assignedTo' in req.body
        ? await validateCrmAssignee(req.user, req.body.assignedTo, {
            allowNull: false
          })
        : undefined;
    res.json(
      await CalendarService.updateAppointment({
        actor: req.user,
        appointment,
        body: { ...req.body, ...(assignedTo ? { assignedTo } : {}) }
      })
    );
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      ...(await assignedResourceScope(req.user))
    });
    if (!appointment) return res.status(404).json({ message: 'Cita no encontrada' });
    res.json(
      await CalendarService.updateStatus({
        actor: req.user,
        appointment,
        status: req.body.status,
        reason: req.body.reason
      })
    );
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/reschedule', async (req, res, next) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      ...(await assignedResourceScope(req.user))
    });
    if (!appointment) return res.status(404).json({ message: 'Cita no encontrada' });
    if (!req.body.startAt) {
      return res.status(400).json({ message: 'startAt es requerido' });
    }
    res.json(
      await CalendarService.reschedule({
        actor: req.user,
        appointment,
        body: req.body
      })
    );
  } catch (error) {
    next(error);
  }
});

function statusAction(status) {
  return async (req, res, next) => {
    try {
      const appointment = await Appointment.findOne({
        _id: req.params.id,
        ...(await assignedResourceScope(req.user))
      });
      if (!appointment) return res.status(404).json({ message: 'Cita no encontrada' });
      res.json(
        await CalendarService.updateStatus({
          actor: req.user,
          appointment,
          status,
          reason: req.body.reason
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

router.patch('/:id/cancel', statusAction('cancelled'));
router.patch('/:id/complete', statusAction('completed'));
router.patch('/:id/no-show', statusAction('no_show'));

router.delete('/:id', async (req, res, next) => {
  try {
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      ...(await assignedResourceScope(req.user))
    });
    if (!appointment) return res.status(404).json({ message: 'Cita no encontrada' });
    res.json(
      await CalendarService.updateStatus({
        actor: req.user,
        appointment,
        status: 'cancelled',
        reason: req.body?.reason || ''
      })
    );
  } catch (error) {
    next(error);
  }
});

export default router;
