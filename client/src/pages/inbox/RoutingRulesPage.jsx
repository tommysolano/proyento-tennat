import { Plus, Power } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  createRoutingRule,
  getRoutingRules,
  getUsers,
  toggleRoutingRule,
  updateRoutingRule
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';

const strategies = ['unassigned', 'contact_owner', 'round_robin'];

function RuleForm({ initial = null, users, onSubmit, busy }) {
  const [strategy, setStrategy] = useState(initial?.strategy || 'unassigned');
  return (
    <form
      key={initial?._id || 'new'}
      className="grid gap-3 p-5 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          name: data.get('name'),
          channel: 'whatsapp_cloud',
          strategy: data.get('strategy'),
          priority: Number(data.get('priority') || 0),
          enabled: data.get('enabled') === 'on',
          targetUserIds: data.getAll('targetUserIds')
        });
      }}
    >
      <input required name="name" defaultValue={initial?.name || ''} className={inputClass} placeholder="Nombre de la regla" />
      <select name="strategy" value={strategy} onChange={(event) => setStrategy(event.target.value)} className={inputClass}>
        {strategies.map((value) => <option key={value}>{value}</option>)}
      </select>
      <input name="priority" type="number" defaultValue={initial?.priority || 0} className={inputClass} placeholder="Prioridad" />
      <label className="flex items-center gap-2 text-sm">
        <input name="enabled" type="checkbox" defaultChecked={initial?.enabled ?? true} />
        Regla activa
      </label>
      {strategy === 'round_robin' ? (
        <label className="md:col-span-2 text-xs font-semibold text-slate-600">
          Agentes
          <select
            multiple
            required
            name="targetUserIds"
            defaultValue={(initial?.targetUserIds || []).map((item) => item._id)}
            className={`${inputClass} min-h-32`}
          >
            {users.filter((item) => ['SUPERVISOR', 'CALLCENTER'].includes(item.role) && item.status === 'active').map((item) => (
              <option key={item._id} value={item._id}>{item.name} - {item.role}</option>
            ))}
          </select>
        </label>
      ) : null}
      <Button type="submit" disabled={busy}>
        <Plus className="h-4 w-4" />
        {initial ? 'Guardar cambios' : 'Crear regla'}
      </Button>
    </form>
  );
}

export function RoutingRulesPage() {
  const [rules, setRules] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const selected = rules.find((item) => item._id === selectedId) || null;

  const load = useCallback(async () => {
    try {
      const [ruleData, userData] = await Promise.all([getRoutingRules(), getUsers()]);
      setRules(ruleData);
      setUsers(userData);
      setSelectedId((current) => current || ruleData[0]?._id || '');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function mutate(action, success) {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setNotice(success);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell eyebrow="Inbox" title="Routing de conversaciones" description="Asignacion por owner, sin asignar o round-robin entre agentes activos.">
      <CrmNotice notice={notice} error={error} />
      {loading ? <CrmLoading /> : (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader title="Reglas" />
            <div className="divide-y divide-slate-100">
              {rules.map((rule) => (
                <button key={rule._id} onClick={() => setSelectedId(rule._id)} className={`w-full p-4 text-left ${selectedId === rule._id ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-2"><strong>{rule.name}</strong><Badge tone={rule.enabled ? 'active' : 'disabled'}>{rule.enabled ? 'active' : 'disabled'}</Badge></div>
                  <p className="mt-1 text-xs text-slate-500">{rule.strategy} - prioridad {rule.priority}</p>
                </button>
              ))}
              {!rules.length ? <p className="p-6 text-sm text-slate-500">No hay reglas configuradas.</p> : null}
            </div>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Nueva regla" />
              <RuleForm users={users} busy={busy} onSubmit={(payload) => mutate(() => createRoutingRule(payload), 'Regla creada.')} />
            </Card>
            {selected ? (
              <Card>
                <CardHeader title={`Editar ${selected.name}`} />
                <RuleForm key={selected._id} initial={selected} users={users} busy={busy} onSubmit={(payload) => mutate(() => updateRoutingRule(selected._id, payload), 'Regla actualizada.')} />
                <div className="border-t border-slate-100 p-5">
                  <Button variant="secondary" disabled={busy} onClick={() => mutate(() => toggleRoutingRule(selected._id), 'Estado actualizado.')}>
                    <Power className="h-4 w-4" />
                    {selected.enabled ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </PageShell>
  );
}
