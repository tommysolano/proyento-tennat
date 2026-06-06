import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import { Company } from '../models/Company.js';
import { recordActivity } from '../utils/activity.js';
import { checkPlatformLimit } from '../utils/platformLimits.js';
import { cleanString } from '../utils/validation.js';
import {
  refreshCompanyOnboarding,
  refreshDistributorOnboarding
} from '../utils/onboarding.js';

const router = Router();
const COMPANY_STATUSES = ['active', 'suspended', 'cancelled', 'trial'];

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

router.get('/', roleMiddleware('DISTRIBUTOR', 'ADMIN'), async (req, res, next) => {
  try {
    const companies = await populateCompany(
      Company.find(companyScope(req.user)).sort({ createdAt: -1 }).limit(100)
    );
    res.json(companies);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', roleMiddleware('DISTRIBUTOR', 'ADMIN'), async (req, res, next) => {
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

    await checkPlatformLimit(req.user.distributorId, 'companies');
    const company = await Company.create({
      ...companyPayload(req.body),
      distributorId: req.user.distributorId
    });
    await recordActivity({
      user: req.user,
      type: 'company_created',
      companyId: company._id,
      summary: `Empresa creada: ${company.name}`,
      metadata: { companyId: company._id, taxId: company.taxId }
    });
    await refreshDistributorOnboarding(req.user.distributorId);
    await refreshCompanyOnboarding(company._id);
    await company.populate([
      { path: 'distributorId', select: 'name' },
      { path: 'adminId', select: 'name email status' }
    ]);
    res.status(201).json(company);
  } catch (error) {
    next(error);
  }
});

async function updateCompany(req, res, next) {
  try {
    const company = await Company.findOne({
      _id: req.params.id,
      distributorId: req.user.distributorId
    });
    if (!company) return res.status(404).json({ message: 'Empresa no encontrada' });
    const previousStatus = company.status;
    Object.assign(company, companyPayload(req.body, true));
    await company.save();
    let type = 'company_updated';
    if (company.status === 'suspended' && previousStatus !== 'suspended') {
      type = 'company_suspended';
    } else if (
      ['active', 'trial'].includes(company.status) &&
      ['suspended', 'inactive'].includes(previousStatus)
    ) {
      type = 'company_reactivated';
    }
    await recordActivity({
      user: req.user,
      type,
      companyId: company._id,
      summary: `Empresa actualizada: ${company.name}`,
      metadata: { previousStatus, status: company.status }
    });
    await refreshCompanyOnboarding(company._id);
    await company.populate([
      { path: 'distributorId', select: 'name' },
      { path: 'adminId', select: 'name email status' }
    ]);
    res.json(company);
  } catch (error) {
    next(error);
  }
}

router.patch('/:id', roleMiddleware('DISTRIBUTOR'), updateCompany);
router.put('/:id', roleMiddleware('DISTRIBUTOR'), updateCompany);

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
