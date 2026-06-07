import { Notification } from '../../models/Notification.js';
import { sanitize } from '../../utils/sanitize.js';
import { RealtimeService } from '../realtime/RealtimeService.js';

export class NotificationService {
  static async create({
    companyId,
    distributorId = null,
    userId,
    type,
    title,
    body = '',
    relatedType = '',
    relatedId = null,
    metadata = {}
  }) {
    if (!userId) return null;
    const notification = await Notification.create({
      companyId,
      distributorId,
      userId,
      type,
      title,
      body,
      relatedType,
      relatedId,
      metadata: sanitize(metadata)
    });
    RealtimeService.publish('notification.created', {
      userId,
      companyId,
      data: notification.toJSON()
    });
    return notification;
  }
}
