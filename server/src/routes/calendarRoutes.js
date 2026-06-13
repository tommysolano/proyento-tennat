import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import {
  requireAnyPermission,
  requirePermission
} from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { AvailabilityException } from '../models/AvailabilityException.js';
import { AvailabilityRule } from '../models/AvailabilityRule.js';
import { Calendar } from '../models/Calendar.js';
import { CalendarService } from '../modules/calendar/CalendarService.js';
import {
  calendarScope,
  findScopedCalendar,
  populateCalendar
} from '../modules/calendar/calendarScope.js';
import { assertTimeZone } from '../modules/calendar/calendarTime.js';
import { recordActivity } from '../utils/activity.js';
import { cleanString } from '../utils/validation.js';
import { isValidObjectId } from '../utils/validation.js';
import { validateCrmAssignee } from '../utils/crmScope.js';
import { teamMemberIds } from '../utils/crmScope.js';

const router = Router();
const adminOnly = [roleMiddleware('ADMIN'), requirePermission('calendars:manage')];
const availabilityAdminOnly = [
  roleMiddleware('ADMIN'),
  requirePermission('availability:manage')
];
const availabilityRead = requireAnyPermission(
  'availability:manage',
  'availability:read_team',
  'calendars:read_assigned'
);

function rulePayload(body, calendar) {
  return {
    dayOfWeek: Number(body.dayOfWeek),
    startTime: cleanString(body.startTime),
    endTime: cleanString(body.endTime),
    timezone: assertTimeZone(body.timezone || calendar.timezone),
    enabled: body.enabled !== false,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
  };
}

function exceptionPayload(body) {
  return {
    date: cleanString(body.date),
    type: body.type || 'unavailable',
    startTime: cleanString(body.startTime),
    endTime: cleanString(body.endTime),
    reason: cleanString(body.reason),
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
  };
}

async function assertCalendarMember(calendar, userId) {
  if (!userId) return null;
  const ids = [
    calendar.ownerUserId?._id || calendar.ownerUserId,
    ...(calendar.teamUserIds || []).map((item) => item?._id || item)
  ].map(String);
  if (!ids.includes(String(userId))) {
    throw Object.assign(new Error('userId no pertenece al calendario'), { status: 400 });
  }
  return userId;
}

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(
  requireAnyPermission(
    'calendars:manage',
    'calendars:read_team',
    'calendars:read_assigned'
  )
);
router.use(requireModule('calendar'));
router.param('id', (req, res, next, id) => {
  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'calendarId invalido' });
  }
  next();
});

router.get('/configuration-profiles', requirePermission('calendars:manage'), (req, res) => {
  res.json(CalendarService.profiles());
});

router.get('/', async (req, res, next) => {
  try {
    const filter = await calendarScope(req.user);
    if (req.query.status) filter.status = req.query.status;
    else filter.status = { $ne: 'archived' };
    if (req.query.type) filter.type = req.query.type;
    res.json(await populateCalendar(Calendar.find(filter).sort({ name: 1 })));
  } catch (error) {
    next(error);
  }
});

router.post('/', ...adminOnly, async (req, res, next) => {
  try {
    if (!cleanString(req.body.name)) {
      return res.status(400).json({ message: 'name es requerido' });
    }
    res.status(201).json(
      await CalendarService.createCalendar({
        actor: req.user,
        body: { ...req.body, name: cleanString(req.body.name) }
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post(
  '/:id/apply-profile',
  ...adminOnly,
  requirePermission('calendar_profiles:apply'),
  async (req, res, next) => {
    try {
      const calendar = await Calendar.findOne({
        _id: req.params.id,
        companyId: req.user.companyId,
        status: { $ne: 'archived' }
      });
      if (!calendar) {
        return res.status(404).json({ message: 'Calendario no encontrado' });
      }
      res.json(
        await CalendarService.applyProfile({
          actor: req.user,
          calendar,
          profileKey: cleanString(req.body.profileKey),
          confirmOverwrite: req.body.confirmOverwrite
        })
      );
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:id/availability', availabilityRead, async (req, res, next) => {
  try {
    const calendar = await findScopedCalendar(req.user, req.params.id, {
      status: 'active'
    });
    if (!calendar) return res.status(404).json({ message: 'Calendario no encontrado' });
    let assignedTo = req.query.assignedTo
      ? await validateCrmAssignee(req.user, req.query.assignedTo, { allowNull: false })
      : undefined;
    if (!assignedTo && req.user.role === 'CALLCENTER') assignedTo = req.user._id;
    if (!assignedTo && req.user.role === 'SUPERVISOR') {
      const allowedIds = new Set((await teamMemberIds(req.user)).map(String));
      assignedTo = [
        calendar.ownerUserId?._id || calendar.ownerUserId,
        ...(calendar.teamUserIds || []).map((item) => item?._id || item)
      ].find((id) => allowedIds.has(String(id)));
      if (!assignedTo) {
        return res.status(403).json({
          message: 'El calendario no tiene un responsable dentro de tu equipo'
        });
      }
    }
    const slots = await CalendarService.availability({
      calendar,
      from: req.query.from,
      to: req.query.to,
      durationMinutes: req.query.durationMinutes || req.query.duration,
      assignedTo
    });
    res.json({ calendarId: calendar._id, timezone: calendar.timezone, slots });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/availability-rules', availabilityRead, async (req, res, next) => {
  try {
    const calendar = await findScopedCalendar(req.user, req.params.id);
    if (!calendar) return res.status(404).json({ message: 'Calendario no encontrado' });
    res.json(
      await AvailabilityRule.find({
        companyId: req.user.companyId,
        calendarId: calendar._id
      })
        .populate('userId', 'name email role')
        .sort({ dayOfWeek: 1, startTime: 1 })
    );
  } catch (error) {
    next(error);
  }
});

router.post('/:id/availability-rules', ...availabilityAdminOnly, async (req, res, next) => {
  try {
    const calendar = await findScopedCalendar(req.user, req.params.id);
    if (!calendar) return res.status(404).json({ message: 'Calendario no encontrado' });
    const userId = await assertCalendarMember(calendar, req.body.userId);
    const rule = await AvailabilityRule.create({
      companyId: req.user.companyId,
      distributorId: req.user.distributorId || null,
      calendarId: calendar._id,
      userId,
      ...rulePayload(req.body, calendar)
    });
    await recordActivity({
      user: req.user,
      type: 'availability_rule_created',
      summary: `Regla de disponibilidad creada en ${calendar.name}`,
      metadata: { calendarId: calendar._id, availabilityRuleId: rule._id }
    });
    res.status(201).json(await rule.populate('userId', 'name email role'));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/exceptions', availabilityRead, async (req, res, next) => {
  try {
    const calendar = await findScopedCalendar(req.user, req.params.id);
    if (!calendar) return res.status(404).json({ message: 'Calendario no encontrado' });
    res.json(
      await AvailabilityException.find({
        companyId: req.user.companyId,
        calendarId: calendar._id
      })
        .populate('userId', 'name email role')
        .sort({ date: 1, startTime: 1 })
    );
  } catch (error) {
    next(error);
  }
});

router.post('/:id/exceptions', ...availabilityAdminOnly, async (req, res, next) => {
  try {
    const calendar = await findScopedCalendar(req.user, req.params.id);
    if (!calendar) return res.status(404).json({ message: 'Calendario no encontrado' });
    const userId = await assertCalendarMember(calendar, req.body.userId);
    const exception = await AvailabilityException.create({
      companyId: req.user.companyId,
      distributorId: req.user.distributorId || null,
      calendarId: calendar._id,
      userId,
      ...exceptionPayload(req.body)
    });
    await recordActivity({
      user: req.user,
      type: 'availability_exception_created',
      summary: `Excepcion de disponibilidad creada en ${calendar.name}`,
      metadata: { calendarId: calendar._id, availabilityExceptionId: exception._id }
    });
    res.status(201).json(await exception.populate('userId', 'name email role'));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const calendar = await findScopedCalendar(req.user, req.params.id);
    if (!calendar) return res.status(404).json({ message: 'Calendario no encontrado' });
    res.json(calendar);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', ...adminOnly, async (req, res, next) => {
  try {
    const calendar = await Calendar.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!calendar) return res.status(404).json({ message: 'Calendario no encontrado' });
    res.json(
      await CalendarService.updateCalendar({
        actor: req.user,
        calendar,
        body: req.body
      })
    );
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/archive', ...adminOnly, async (req, res, next) => {
  try {
    const calendar = await Calendar.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!calendar) return res.status(404).json({ message: 'Calendario no encontrado' });
    res.json(
      await CalendarService.updateCalendar({
        actor: req.user,
        calendar,
        body: { status: 'archived' }
      })
    );
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', ...adminOnly, async (req, res, next) => {
  try {
    const calendar = await Calendar.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!calendar) return res.status(404).json({ message: 'Calendario no encontrado' });
    res.json(
      await CalendarService.updateCalendar({
        actor: req.user,
        calendar,
        body: { status: 'archived' }
      })
    );
  } catch (error) {
    next(error);
  }
});

export default router;
