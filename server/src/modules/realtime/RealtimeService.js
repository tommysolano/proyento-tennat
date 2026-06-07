import { sanitize } from '../../utils/sanitize.js';

class RealtimeBroker {
  constructor() {
    this.clients = new Map();
  }

  addClient({ id, response, user, allowedAssignedIds = [] }) {
    this.clients.set(id, {
      response,
      userId: String(user._id),
      role: user.role,
      companyId: user.companyId ? String(user.companyId) : '',
      allowedAssignedIds: new Set(allowedAssignedIds.map(String))
    });
  }

  removeClient(id) {
    this.clients.delete(id);
  }

  canReceive(client, event) {
    if (event.userId) return client.userId === String(event.userId);
    if (!event.companyId || client.companyId !== String(event.companyId)) return false;
    if (client.role === 'ADMIN') return true;
    const assignedTo = event.assignedTo ? String(event.assignedTo) : '';
    if (!assignedTo) return false;
    return client.allowedAssignedIds.has(assignedTo);
  }

  publish(type, event = {}) {
    if (process.env.REALTIME_ENABLED === 'false') return;
    const payload = sanitize({
      type,
      timestamp: new Date().toISOString(),
      data: event.data || {}
    });
    const frame = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const [id, client] of this.clients) {
      if (!this.canReceive(client, event)) continue;
      try {
        client.response.write(frame);
      } catch {
        this.removeClient(id);
      }
    }
  }
}

export const RealtimeService = new RealtimeBroker();
