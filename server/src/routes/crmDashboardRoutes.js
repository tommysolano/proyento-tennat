import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireModule } from '../middleware/moduleMiddleware.js';
import { requireAnyPermission } from '../middleware/permissionMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { Contact } from '../models/Contact.js';
import { Opportunity } from '../models/Opportunity.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { assignedResourceScope, teamMemberIds } from '../utils/crmScope.js';

const router = Router();
router.use(authMiddleware);
router.use(roleMiddleware('ADMIN', 'SUPERVISOR', 'CALLCENTER'));
router.use(requireAnyPermission('crm:manage', 'crm:read_team', 'contacts:read_assigned'));
router.use(requireModule('crm'));

router.get('/dashboard', async (req, res, next) => {
  try {
    const scope = await assignedResourceScope(req.user);
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const [contacts, opportunities, tasks] = await Promise.all([
      Contact.find({ ...scope, archivedAt: null }).select('status assignedTo nextFollowUpAt').lean(),
      Opportunity.find(scope).select('status value assignedTo nextFollowUpAt').lean(),
      Task.find({ ...scope, archivedAt: null }).select('status assignedTo dueAt').lean()
    ]);
    let activityFilter = { companyId: req.user.companyId };
    if (req.user.role === 'CALLCENTER') activityFilter.userId = req.user._id;
    if (req.user.role === 'SUPERVISOR') activityFilter.userId = { $in: await teamMemberIds(req.user) };
    const recentActivity = await ActivityLog.find(activityFilter)
      .populate('userId', 'name role')
      .sort({ createdAt: -1 })
      .limit(15);
    const agents = req.user.role === 'CALLCENTER'
      ? [req.user]
      : await User.find({
        companyId: req.user.companyId,
        role: 'CALLCENTER',
        ...(req.user.role === 'SUPERVISOR' ? { supervisorId: req.user._id } : {})
      }).select('name email status').lean();
    const countBy = (items, key) => items.reduce((result, item) => {
      result[item[key]] = (result[item[key]] || 0) + 1;
      return result;
    }, {});
    const performance = agents.map((agent) => {
      const id = agent._id.toString();
      const agentContacts = contacts.filter((item) => item.assignedTo?.toString() === id);
      const agentOpportunities = opportunities.filter((item) => item.assignedTo?.toString() === id);
      return {
        agent,
        contacts: agentContacts.length,
        openOpportunities: agentOpportunities.filter((item) => item.status === 'open').length,
        wonOpportunities: agentOpportunities.filter((item) => item.status === 'won').length,
        pendingTasks: tasks.filter((item) => item.assignedTo?.toString() === id && !['completed', 'cancelled'].includes(item.status)).length
      };
    });
    res.json({
      contactsTotal: contacts.length,
      contactsByStatus: countBy(contacts, 'status'),
      opportunitiesOpen: opportunities.filter((item) => item.status === 'open').length,
      opportunitiesWon: opportunities.filter((item) => item.status === 'won').length,
      opportunitiesLost: opportunities.filter((item) => item.status === 'lost').length,
      openValue: opportunities.filter((item) => item.status === 'open').reduce((sum, item) => sum + item.value, 0),
      wonValue: opportunities.filter((item) => item.status === 'won').reduce((sum, item) => sum + item.value, 0),
      pendingTasks: tasks.filter((item) => !['completed', 'cancelled'].includes(item.status)).length,
      overdueFollowUps: contacts.filter((item) => item.nextFollowUpAt && new Date(item.nextFollowUpAt) < now).length +
        opportunities.filter((item) => item.nextFollowUpAt && new Date(item.nextFollowUpAt) < now).length,
      todayFollowUps: contacts.filter((item) => item.nextFollowUpAt >= todayStart && item.nextFollowUpAt < todayEnd).length +
        opportunities.filter((item) => item.nextFollowUpAt >= todayStart && item.nextFollowUpAt < todayEnd).length,
      performance,
      recentActivity
    });
  } catch (error) { next(error); }
});

export default router;
