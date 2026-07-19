import { CheckCheck, MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../../api.js';
import { Button } from '../../components/Button.jsx';
import { Card } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, localDate } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';

export function NotificationsPage() {
  const [data, setData] = useState({ notifications: [], unreadCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await getNotifications());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markOne(notification) {
    if (notification.readAt) return;
    await markNotificationRead(notification._id);
    window.dispatchEvent(new CustomEvent('tenantdesk:notifications-changed'));
    await load();
  }

  async function markAll() {
    await markAllNotificationsRead();
    window.dispatchEvent(new CustomEvent('tenantdesk:notifications-changed'));
    await load();
  }

  return (
    <PageShell
      width="narrow"
      eyebrow="Inbox"
      title="Notificaciones"
      description="Asignaciones, mensajes, notas internas y fallos de envio."
    >
      <CrmNotice error={error} />
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" onClick={markAll} disabled={!data.unreadCount}>
          <CheckCheck className="h-4 w-4" />
          Marcar todas como leidas
        </Button>
      </div>
      {loading ? <CrmLoading /> : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {data.notifications.map((notification) => (
            <button
              key={notification._id}
              type="button"
              onClick={() => markOne(notification)}
              className={`flex w-full gap-3 p-4 text-left hover:bg-slate-50 ${
                notification.readAt ? 'bg-white' : 'bg-cyan-50/60'
              }`}
            >
              <MessageSquare className="mt-1 h-5 w-5 text-cyan-700" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">{notification.title}</span>
                <span className="block text-sm text-slate-600">{notification.body}</span>
                <span className="mt-1 block text-xs text-slate-400">{localDate(notification.createdAt)}</span>
              </span>
              {!notification.readAt ? <span className="mt-2 h-2 w-2 rounded-full bg-cyan-600" /> : null}
            </button>
          ))}
          {!data.notifications.length ? (
            <p className="p-8 text-center text-sm text-slate-500">No hay notificaciones.</p>
          ) : null}
        </Card>
      )}
    </PageShell>
  );
}
