import { Subscription } from '../models/Subscription.js';
import { UsageRecord } from '../models/UsageRecord.js';
import { logger } from './logger.js';
import { OperationalAlertService } from '../modules/ops/OperationalAlertService.js';

const METRIC_LIMITS = {
  whatsapp_messages: ['whatsappMessages', 'messages'],
  media_storage_mb: ['mediaStorageMb', 'storageMb'],
  media_files: ['mediaFiles'],
  conversations: ['conversations'],
  contacts: ['contacts'],
  calendars: ['calendars'],
  appointments: ['appointments'],
  booking_links: ['bookingLinks'],
  workflows: ['workflows'],
  workflow_runs: ['workflowRunsPerMonth'],
  workflow_actions: ['workflowActionsPerMonth']
};

export function usagePeriod(date = new Date()) {
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const periodEnd = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  );
  return { periodStart, periodEnd };
}

async function companySubscription(companyId) {
  return Subscription.findOne({
    companyId,
    status: { $in: ['trial', 'active', 'past_due'] }
  })
    .sort({ createdAt: -1 })
    .populate('planId');
}

function configuredLimit(plan, metric) {
  for (const field of METRIC_LIMITS[metric] || [metric]) {
    const value = plan?.limits?.[field];
    if (value !== undefined && value !== null) return Number(value);
  }
  return null;
}

export async function getUsage({ companyId, metric, date = new Date() }) {
  const { periodStart, periodEnd } = usagePeriod(date);
  const result = await UsageRecord.aggregate([
    {
      $match: {
        scopeType: 'company',
        scopeId: companyId,
        metric,
        periodStart: { $gte: periodStart, $lt: periodEnd }
      }
    },
    { $group: { _id: null, quantity: { $sum: '$quantity' } } }
  ]);
  return {
    quantity: Number(result[0]?.quantity || 0),
    periodStart,
    periodEnd
  };
}

export async function checkUsageLimit({
  companyId,
  distributorId = null,
  metric,
  quantity = 1
}) {
  if (!companyId) {
    throw Object.assign(new Error('companyId es requerido para validar consumo'), {
      status: 400
    });
  }
  const subscription = await companySubscription(companyId);
  if (!subscription) {
    if (process.env.NODE_ENV === 'production') {
      throw Object.assign(
        new Error('La empresa no tiene una suscripcion comercial activa'),
        {
          status: 403,
          code: 'USAGE_SUBSCRIPTION_REQUIRED',
          retryable: false
        }
      );
    }
    logger.warn('usage.subscription_missing', { companyId, distributorId, metric });
    return { allowed: true, warning: 'missing_subscription', usage: 0, limit: null };
  }
  const limit = configuredLimit(subscription.planId, metric);
  // Existing plans use zero for unmetered message limits.
  if (!Number.isFinite(limit) || limit <= 0) {
    return { allowed: true, warning: 'unlimited_or_not_configured', usage: 0, limit };
  }
  const usage = await getUsage({ companyId, metric });
  if (usage.quantity + Number(quantity || 0) > limit) {
    await OperationalAlertService.create({
      companyId,
      distributorId,
      severity: 'warning',
      type: 'usage_limit_reached',
      title: `Limite alcanzado: ${metric}`,
      message: `Consumo ${usage.quantity} de ${limit}`,
      relatedType: 'company',
      relatedId: companyId,
      metadata: { metric, usage: usage.quantity, limit }
    }).catch(() => {});
    throw Object.assign(
      new Error(
        `Limite de ${metric} alcanzado (${usage.quantity}/${limit})`
      ),
      {
        status: 403,
        code: 'USAGE_LIMIT_REACHED',
        retryable: false,
        usage: usage.quantity,
        limit,
        metric
      }
    );
  }
  return {
    allowed: true,
    usage: usage.quantity,
    limit,
    remaining: limit - usage.quantity
  };
}

export async function trackUsage({
  companyId,
  distributorId = null,
  metric,
  quantity = 1,
  metadata = {}
}) {
  if (!companyId || !Number.isFinite(Number(quantity)) || Number(quantity) < 0) {
    throw new Error('companyId y quantity valida son requeridos para registrar consumo');
  }
  const { periodStart, periodEnd } = usagePeriod();
  return UsageRecord.findOneAndUpdate(
    {
      scopeType: 'company',
      scopeId: companyId,
      metric,
      periodStart,
      'metadata.meter': 'phase6'
    },
    {
      $inc: { quantity: Number(quantity) },
      $set: {
        periodEnd,
        'metadata.meter': 'phase6',
        'metadata.distributorId': distributorId || null,
        'metadata.lastEvent': metadata
      }
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );
}

export async function usageSnapshot(companyId) {
  const metrics = [
    'whatsapp_messages',
    'media_storage_mb',
    'media_files',
    'conversations',
    'calendars',
    'appointments',
    'booking_links',
    'workflows',
    'workflow_runs',
    'workflow_actions'
  ];
  const subscription = await companySubscription(companyId);
  const rows = await Promise.all(
    metrics.map(async (metric) => {
      const usage = await getUsage({ companyId, metric });
      return {
        metric,
        usage: usage.quantity,
        limit: configuredLimit(subscription?.planId, metric)
      };
    })
  );
  return {
    subscriptionConfigured: Boolean(subscription),
    subscriptionStatus: subscription?.status || null,
    planId: subscription?.planId?._id || null,
    metrics: rows
  };
}
