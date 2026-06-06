import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Company } from '../models/Company.js';
import { cleanString } from '../utils/validation.js';

const router = Router();
const COMPANY_STATUSES = ['active', 'inactive', 'trial'];

function companyScope(user) {
  if (user.role === 'DISTRIBUTOR') return { distributorId: user.distributorId };
  return { _id: user.companyId };
}

function companyPayload(body, partial = false) {
  const data = {};

  if (!partial || 'name' in body) {
    const name = cleanString(body.name);
    if (!name) throw Object.assign(new Error('name es requerido'), { status: 400 });
    data.name = name;
  }

  if ('taxId' in body) {
    if (typeof body.taxId !== 'string') {
      throw Object.assign(new Error('taxId debe ser un string'), { status: 400 });
    }
    data.taxId = cleanString(body.taxId);
  }

  if ('industry' in body) {
    if (typeof body.industry !== 'string') {
      throw Object.assign(new Error('industry debe ser un string'), { status: 400 });
    }
    data.industry = cleanString(body.industry) || 'Servicios';
  }

  if ('status' in body) {
    if (!COMPANY_STATUSES.includes(body.status)) {
      throw Object.assign(new Error('status de empresa invalido'), { status: 400 });
    }
    data.status = body.status;
  }

  return data;
}

function populateCompany(query) {
  return query
    .populate('distributorId', 'name')
    .populate('adminId', 'name email status');
}

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const companies = await populateCompany(
      Company.find(companyScope(req.user)).sort({ createdAt: -1 }).limit(100)
    );
    res.json(companies);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const company = await populateCompany(
      Company.findOne({ _id: req.params.id, ...companyScope(req.user) })
    );
    if (!company) return res.status(404).json({ message: 'Empresa no encontrada' });
    res.json(company);
  } catch (error) {
    next(error);
  }
});

router.post('/', roleMiddleware('DISTRIBUTOR'), async (req, res, next) => {
  try {
    if (!req.user.distributorId) {
      return res.status(403).json({ message: 'El distribuidor autenticado no tiene distributorId' });
    }

    const company = await Company.create({
      ...companyPayload(req.body),
      distributorId: req.user.distributorId
    });
    await company.populate([
      { path: 'distributorId', select: 'name' },
      { path: 'adminId', select: 'name email status' }
    ]);
    res.status(201).json(company);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', roleMiddleware('DISTRIBUTOR'), async (req, res, next) => {
  try {
    const company = await Company.findOneAndUpdate(
      { _id: req.params.id, distributorId: req.user.distributorId },
      companyPayload(req.body, true),
      { new: true, runValidators: true }
    );
    if (!company) return res.status(404).json({ message: 'Empresa no encontrada' });
    await company.populate([
      { path: 'distributorId', select: 'name' },
      { path: 'adminId', select: 'name email status' }
    ]);
    res.json(company);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', roleMiddleware('DISTRIBUTOR'), async (req, res, next) => {
  try {
    const company = await Company.findOneAndDelete({
      _id: req.params.id,
      distributorId: req.user.distributorId
    });
    if (!company) return res.status(404).json({ message: 'Empresa no encontrada' });
    res.json({ message: 'Empresa eliminada' });
  } catch (error) {
    next(error);
  }
});

export default router;
