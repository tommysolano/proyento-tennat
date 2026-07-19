import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOpportunities, getPipelines, moveOpportunityStage } from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass, localDate, money } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';

export function PipelineKanbanPage() {
  const [pipelines, setPipelines] = useState([]);
  const [pipelineId, setPipelineId] = useState('');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pipelineData = await getPipelines();
      const selected = pipelineId || pipelineData[0]?._id || '';
      setPipelines(pipelineData); setPipelineId(selected);
      setItems(selected ? await getOpportunities({ pipelineId: selected, status: 'open' }) : []);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [pipelineId]);
  useEffect(() => { load(); }, [load]);

  async function move(id, stageId) {
    try { await moveOpportunityStage(id, stageId); setNotice('Oportunidad movida.'); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  const pipeline = pipelines.find((item) => item._id === pipelineId);
  return (
    <PageShell width="full" eyebrow="CRM" title="Pipeline Kanban" description="Vista por etapas con movimiento mediante selector, sin dependencias de drag and drop.">
      <CrmNotice notice={notice} error={error} />
      <select className={`${inputClass} max-w-sm`} value={pipelineId} onChange={(event) => setPipelineId(event.target.value)}>{pipelines.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
      {loading ? <CrmLoading /> : (
        <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-4">
          {pipeline?.stages.map((stage) => {
            const stageItems = items.filter((item) => item.stageId?._id === stage._id);
            return <section key={stage._id} className="w-80 shrink-0 rounded-xl bg-slate-100 p-3">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-slate-800">{stage.name}</h2><Badge>{stageItems.length}</Badge></div>
              <div className="space-y-3">{stageItems.map((item) => <Card key={item._id} className="p-4">
                <Link to={`/crm/opportunities/${item._id}`} className="font-semibold text-cyan-800 hover:underline">{item.title}</Link>
                <p className="mt-1 text-sm text-slate-500">{item.contactId?.name}</p>
                <p className="mt-3 text-lg font-semibold">{money(item.value, item.currency)}</p>
                <p className="mt-1 text-xs text-slate-500">{item.assignedTo?.name || 'Sin responsable'} · {localDate(item.expectedCloseDate)}</p>
                <select className={`${inputClass} mt-3`} value={stage._id} onChange={(event) => move(item._id, event.target.value)}>{pipeline.stages.map((target) => <option key={target._id} value={target._id}>Mover a {target.name}</option>)}</select>
              </Card>)}</div>
            </section>;
          })}
        </div>
      )}
    </PageShell>
  );
}
