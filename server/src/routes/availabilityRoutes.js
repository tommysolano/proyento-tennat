import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { AvailabilityException } from '../models/AvailabilityException.js';
import { AvailabilityRule } from '../models/AvailabilityRule.js';
import { findScopedCalendar } from '../modules/calendar/calendarScope.js';
import { assertTimeZone } from '../modules/calendar/calendarTime.js';
import { recordActivity } from '../utils/activity.js';
import { cleanString } from '../utils/validation.js';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN'));
router.use(requirePermission('availability:manage'));
router.use(requireModule('calendar'));

router.patch('/availability-rules/:id', async (req, res, next) => {
  try {
    const rule = await AvailabilityRule.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!rule) return res.status(404).json({ message: 'Regla no encontrada' });
    const calendar = await findScopedCalendar(req.user, rule.calendarId);
    if (!calendar) return res.status(404).json({ message: 'Calendario no encontrado' });
    for (const field of ['dayOfWeek', 'enabled']) {
      if (field in req.body) rule[field] = req.body[field];
    }
    for (const field of ['startTime', 'endTime']) {
      if (field in req.body) rule[field] = cleanString(req.body[field]);
    }
    if ('timezone' in req.body) rule.timezone = assertTimeZone(req.body.timezone);
    if ('metadata' in req.body) rule.metadata = req.body.metadata || {};
    await rule.save();
    await recordActivity({
      user: req.user,
      type: 'availability_rule_updated',
      summary: `Regla de disponibilidad actualizada en ${calendar.name}`,
      metadata: { calendarId: calendar._id, availabilityRuleId: rule._id }
    });
    res.json(await rule.populate('userId', 'name email role'));
  } catch (error) {
    next(error);
  }
});

router.delete('/availability-rules/:id', async (req, res, next) => {
  try {
    const rule = await AvailabilityRule.findOneAndDelete({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!rule) return res.status(404).json({ message: 'Regla no encontrada' });
    await recordActivity({
      user: req.user,
      type: 'availability_rule_deleted',
      summary: 'Regla de disponibilidad eliminada',
      metadata: { calendarId: rule.calendarId, availabilityRuleId: rule._id }
    });
    res.json({ message: 'Regla eliminada' });
  } catch (error) {
    next(error);
  }
});

router.patch('/availability-exceptions/:id', async (req, res, next) => {
  try {
    const exception = await AvailabilityException.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!exception) return res.status(404).json({ message: 'Excepcion no encontrada' });
    for (const field of ['date', 'type', 'startTime', 'endTime', 'reason']) {
      if (field in req.body) exception[field] = cleanString(req.body[field]);
    }
    if ('metadata' in req.body) exception.metadata = req.body.metadata || {};
    await exception.save();
    await recordActivity({
      user: req.user,
      type: 'availability_exception_updated',
      summary: 'Excepcion de disponibilidad actualizada',
      metadata: {
        calendarId: exception.calendarId,
        availabilityExceptionId: exception._id
      }
    });
    res.json(await exception.populate('userId', 'name email role'));
  } catch (error) {
    next(error);
  }
});

router.delete('/availability-exceptions/:id', async (req, res, next) => {
  try {
    const exception = await AvailabilityException.findOneAndDelete({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!exception) return res.status(404).json({ message: 'Excepcion no encontrada' });
    await recordActivity({
      user: req.user,
      type: 'availability_exception_deleted',
      summary: 'Excepcion de disponibilidad eliminada',
      metadata: {
        calendarId: exception.calendarId,
        availabilityExceptionId: exception._id
      }
    });
    res.json({ message: 'Excepcion eliminada' });
  } catch (error) {
    next(error);
  }
});

export default router;
