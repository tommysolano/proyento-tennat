import { OperationalAlert } from '../../models/OperationalAlert.js';
import { sanitize } from '../../utils/sanitize.js';
import { RealtimeService } from '../realtime/RealtimeService.js';

export class OperationalAlertService {
  static async create({
    companyId = null,
    distributorId = null,
    severity = 'warning',
    type,
    title,
    message,
    relatedType = '',
    relatedId = null,
    metadata = {},
    deduplicate = true
  }) {
    if (process.env.ALERTS_ENABLED === 'false') return null;
    const scopeType = companyId ? 'company' : distributorId ? 'distributor' : 'platform';
    const scopeId = companyId || distributorId || null;
    const filter = {
      scopeType,
      scopeId,
      type,
      relatedType,
      relatedId,
      status: 'open'
    };
    const safeMetadata = sanitize(metadata);
    const alert = deduplicate
      ? await OperationalAlert.findOneAndUpdate(
          filter,
          {
            $set: {
              severity,
              title: sanitize(title),
              message: sanitize(message),
              companyId,
              distributorId,
              'metadata.lastDetails': safeMetadata
            },
            $inc: { 'metadata.occurrences': 1 },
            $setOnInsert: { status: 'open' }
          },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        )
      : await OperationalAlert.create({
          ...filter,
          companyId,
          distributorId,
          severity,
          title,
          message,
          metadata: safeMetadata
        });
    if (companyId) {
      RealtimeService.publish('operational_alert.created', {
        companyId,
        data: {
          alertId: alert._id,
          severity: alert.severity,
          type: alert.type,
          title: alert.title
        }
      });
    }
    return alert;
  }
}
