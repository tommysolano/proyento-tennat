import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';

const writeRoles = ['DISTRIBUTOR', 'ADMIN', 'SUPERVISOR'];

function scopeFilterForUser(user, resourceName) {
  if (user.role === 'DISTRIBUTOR') {
    if (['Distributor'].includes(resourceName)) return { _id: user.distributorId };
    if (['Company', 'Plan', 'Subscription'].includes(resourceName)) {
      return { distributorId: user.distributorId };
    }
    return { distributorId: user.distributorId };
  }

  if (resourceName === 'Company') {
    return { _id: user.companyId };
  }

  if (resourceName === 'Plan') {
    return { distributorId: user.distributorId };
  }

  if (resourceName === 'Subscription') {
    return { companyId: user.companyId };
  }

  if (user.role === 'CALLCENTER') {
    if (['Contact', 'Conversation'].includes(resourceName)) {
      return { companyId: user.companyId, assignedTo: user._id };
    }

    return { companyId: user.companyId };
  }

  if (user.companyId) {
    return { companyId: user.companyId };
  }

  return { _id: null };
}

function filterWithId(id, scopeFilter) {
  if (!Object.keys(scopeFilter).length) {
    return { _id: id };
  }

  return { $and: [{ _id: id }, scopeFilter] };
}

function scopedPayload(user, resourceName, payload) {
  const data = { ...payload };

  if (user.distributorId && ['Company', 'Plan', 'Subscription'].includes(resourceName)) {
    data.distributorId = user.distributorId;
  }

  if (
    user.companyId &&
    ['Subscription', 'Contact', 'Conversation', 'ActivityLog', 'ChannelConfig'].includes(resourceName)
  ) {
    data.companyId = user.companyId;
  }

  if (user.role === 'CALLCENTER' && ['Contact', 'Conversation'].includes(resourceName)) {
    data.assignedTo = user._id;
  }

  if (user.role === 'CALLCENTER' && resourceName === 'ActivityLog') {
    data.userId = user._id;
  }

  return data;
}

export function createCrudRouter(Model, options = {}) {
  const router = Router();
  const resourceName = options.resourceName || Model.modelName;
  const populate = options.populate || [];
  const canWrite = options.canWrite || writeRoles;

  router.use(authMiddleware);

  router.get('/', async (req, res, next) => {
    try {
      const filter = scopeFilterForUser(req.user, resourceName);
      const query = Model.find(filter).sort({ createdAt: -1 }).limit(100);
      populate.forEach((field) => query.populate(field));
      const records = await query;
      res.json(records);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const filter = filterWithId(req.params.id, scopeFilterForUser(req.user, resourceName));
      const query = Model.findOne(filter);
      populate.forEach((field) => query.populate(field));
      const record = await query;

      if (!record) {
        return res.status(404).json({ message: 'Registro no encontrado' });
      }

      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  router.post('/', roleMiddleware(...canWrite), async (req, res, next) => {
    try {
      const record = await Model.create(scopedPayload(req.user, resourceName, req.body));
      res.status(201).json(record);
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id', roleMiddleware(...canWrite), async (req, res, next) => {
    try {
      const filter = filterWithId(req.params.id, scopeFilterForUser(req.user, resourceName));
      const record = await Model.findOneAndUpdate(filter, scopedPayload(req.user, resourceName, req.body), {
        new: true,
        runValidators: true
      });

      if (!record) {
        return res.status(404).json({ message: 'Registro no encontrado' });
      }

      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', roleMiddleware(...canWrite), async (req, res, next) => {
    try {
      const filter = filterWithId(req.params.id, scopeFilterForUser(req.user, resourceName));
      const record = await Model.findOneAndDelete(filter);

      if (!record) {
        return res.status(404).json({ message: 'Registro no encontrado' });
      }

      res.json({ message: 'Registro eliminado' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
