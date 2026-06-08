import { Archive, Check, Clipboard, Pause, Plus, TicketCheck, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  activateCoupon,
  activateReferralProgram,
  archiveCoupon,
  archiveReferralProgram,
  convertReferral,
  createCoupon,
  createReferral,
  createReferralProgram,
  disableCoupon,
  getContacts,
  getCouponRedemptions,
  getCoupons,
  getReferralPrograms,
  getReferrals,
  issueCoupon,
  pauseReferralProgram,
  redeemCoupon,
  rewardReferral
} from '../../api.js';
import { Badge } from '../../components/Badge.jsx';
import { Button } from '../../components/Button.jsx';
import { Card, CardHeader } from '../../components/Card.jsx';
import { CrmLoading, CrmNotice, inputClass, localDate } from '../../components/CrmCommon.jsx';
import { PageShell } from '../../components/PageShell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

function tone(status) {
  return {
    active: 'active',
    redeemed: 'active',
    converted: 'active',
    rewarded: 'active',
    issued: 'pending',
    invited: 'pending',
    submitted: 'pending',
    draft: 'pending',
    paused: 'inactive',
    disabled: 'disabled',
    archived: 'disabled'
  }[status] || 'inactive';
}

function publicBase() {
  return String(import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin).replace(/\/$/, '');
}

export function CouponsPage() {
  const { user } = useAuth();
  const [coupons, setCoupons] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const canManage = user.role === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [couponData, redemptionData, contactData] = await Promise.all([
        getCoupons(),
        getCouponRedemptions(),
        getContacts({ limit: 500 })
      ]);
      setCoupons(couponData); setRedemptions(redemptionData); setContacts(contactData);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError('');
    try {
      await createCoupon({
        code: data.get('code'),
        name: data.get('name'),
        description: data.get('description'),
        discountType: data.get('discountType'),
        discountValue: Number(data.get('discountValue')),
        currency: data.get('currency'),
        maxRedemptions: Number(data.get('maxRedemptions')),
        perContactLimit: Number(data.get('perContactLimit'))
      });
      form.reset(); setNotice('Cupon creado.'); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function mutate(action, message) {
    setBusy(true); setError('');
    try { await action(); setNotice(message); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  function contactPrompt(label) {
    const options = contacts.map((contact) => `${contact._id} | ${contact.name}`).join('\n');
    return window.prompt(`${label}\nPega el ID del contacto:\n${options.slice(0, 1500)}`) || '';
  }

  return (
    <PageShell eyebrow="Fidelizacion" title="Cupones" description="Emision y redencion manual, sin checkout ni pagos.">
      <CrmNotice notice={notice} error={error} />
      {canManage ? <Card>
        <CardHeader title="Nuevo cupon" />
        <form onSubmit={create} className="grid gap-3 p-5 md:grid-cols-4">
          <input required name="code" className={inputClass} placeholder="CODIGO" />
          <input required name="name" className={inputClass} placeholder="Nombre" />
          <select name="discountType" className={inputClass}>{['percentage', 'fixed_amount', 'custom'].map((value) => <option key={value}>{value}</option>)}</select>
          <input name="discountValue" type="number" min="0" step="0.01" defaultValue="0" className={inputClass} />
          <input name="currency" defaultValue="USD" className={inputClass} />
          <input name="maxRedemptions" type="number" min="0" defaultValue="0" className={inputClass} placeholder="Max redenciones (0 ilimitado)" />
          <input name="perContactLimit" type="number" min="1" defaultValue="1" className={inputClass} />
          <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />Crear</Button>
          <textarea name="description" className={`${inputClass} md:col-span-4`} placeholder="Descripcion" />
        </form>
      </Card> : null}
      {loading ? <CrmLoading /> : <div className="grid gap-4">
        {coupons.map((coupon) => (
          <Card key={coupon._id} className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div><div className="flex items-center gap-2"><h2 className="font-semibold">{coupon.code} - {coupon.name}</h2><Badge tone={tone(coupon.status)}>{coupon.status}</Badge></div><p className="mt-1 text-sm text-slate-500">{coupon.discountType}: {coupon.discountValue} {coupon.currency} - {coupon.usageCount} redenciones</p></div>
              <div className="flex flex-wrap gap-2">
                {canManage && coupon.status !== 'active' && coupon.status !== 'archived' ? <Button disabled={busy} onClick={() => mutate(() => activateCoupon(coupon._id), 'Cupon activado.')}>Activar</Button> : null}
                {coupon.status === 'active' ? <Button variant="secondary" disabled={busy} onClick={() => {
                  const contactId = contactPrompt('Emitir cupon');
                  if (contactId) mutate(() => issueCoupon(coupon._id, contactId), 'Cupon emitido.');
                }}><TicketCheck className="h-4 w-4" />Emitir</Button> : null}
                {coupon.status === 'active' ? <Button variant="secondary" disabled={busy} onClick={() => {
                  const contactId = contactPrompt('Redimir cupon');
                  if (contactId) mutate(() => redeemCoupon(coupon._id, contactId), 'Cupon redimido.');
                }}><Check className="h-4 w-4" />Redimir</Button> : null}
                {canManage && coupon.status === 'active' ? <Button variant="secondary" disabled={busy} onClick={() => mutate(() => disableCoupon(coupon._id), 'Cupon desactivado.')}>Desactivar</Button> : null}
                {canManage && coupon.status !== 'archived' ? <Button variant="danger" disabled={busy} onClick={() => mutate(() => archiveCoupon(coupon._id), 'Cupon archivado.')}><Archive className="h-4 w-4" /></Button> : null}
              </div>
            </div>
          </Card>
        ))}
      </div>}
      <Card>
        <CardHeader title="Emisiones y redenciones" description={`${redemptions.length} registros`} />
        <div className="max-h-[500px] space-y-2 overflow-y-auto p-5">
          {redemptions.map((item) => <div key={item._id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3"><div><p className="font-medium">{item.code} - {item.contactId?.name}</p><p className="text-xs text-slate-500">{localDate(item.createdAt)}</p></div><Badge tone={tone(item.status)}>{item.status}</Badge></div>)}
        </div>
      </Card>
    </PageShell>
  );
}

export function ReferralsPage() {
  const { user } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const canManage = user.role === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [programData, referralData, contactData] = await Promise.all([
        getReferralPrograms(),
        getReferrals(),
        getContacts({ limit: 500 })
      ]);
      setPrograms(programData); setReferrals(referralData); setContacts(contactData);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createProgram(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError('');
    try {
      await createReferralProgram({
        name: data.get('name'),
        slug: data.get('slug'),
        rewardDescription: data.get('rewardDescription'),
        referrerReward: data.get('referrerReward'),
        refereeReward: data.get('refereeReward')
      });
      form.reset(); setNotice('Programa creado.'); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function createReferralRecord(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError('');
    try {
      await createReferral({
        referralProgramId: data.get('referralProgramId'),
        referrerContactId: data.get('referrerContactId'),
        referredContactId: data.get('referredContactId') || null
      });
      form.reset(); setNotice('Referido creado.'); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function mutate(action, message) {
    setBusy(true); setError('');
    try { await action(); setNotice(message); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return (
    <PageShell eyebrow="Fidelizacion" title="Referidos" description="Programas, conversion y recompensa manual.">
      <CrmNotice notice={notice} error={error} />
      {canManage ? <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Nuevo programa" />
          <form onSubmit={createProgram} className="grid gap-3 p-5 md:grid-cols-2">
            <input required name="name" className={inputClass} placeholder="Nombre" />
            <input required name="slug" className={inputClass} placeholder="slug-global" />
            <input name="referrerReward" className={inputClass} placeholder="Recompensa referente" />
            <input name="refereeReward" className={inputClass} placeholder="Recompensa referido" />
            <textarea name="rewardDescription" className={`${inputClass} md:col-span-2`} placeholder="Descripcion" />
            <Button type="submit" disabled={busy}><Plus className="h-4 w-4" />Crear programa</Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Crear referido" />
          <form onSubmit={createReferralRecord} className="grid gap-3 p-5">
            <select required name="referralProgramId" className={inputClass}><option value="">Programa</option>{programs.filter((item) => ['active', 'draft'].includes(item.status)).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
            <select required name="referrerContactId" className={inputClass}><option value="">Contacto referente</option>{contacts.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
            <select name="referredContactId" className={inputClass}><option value="">Referido aun sin contacto</option>{contacts.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
            <Button type="submit" disabled={busy}><UsersRound className="h-4 w-4" />Crear referido</Button>
          </form>
        </Card>
      </div> : null}
      {loading ? <CrmLoading /> : <>
        <Card>
          <CardHeader title="Programas" />
          <div className="space-y-3 p-5">{programs.map((program) => <div key={program._id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><span className="font-semibold">{program.name}</span><Badge tone={tone(program.status)}>{program.status}</Badge></div><p className="mt-1 text-sm text-slate-500">{program.rewardDescription}</p></div>{canManage ? <div className="flex gap-2">{program.status !== 'active' && program.status !== 'archived' ? <Button disabled={busy} onClick={() => mutate(() => activateReferralProgram(program._id), 'Programa activado.')}>Activar</Button> : null}{program.status === 'active' ? <Button variant="secondary" disabled={busy} onClick={() => mutate(() => pauseReferralProgram(program._id), 'Programa pausado.')}><Pause className="h-4 w-4" /></Button> : null}{program.status !== 'archived' ? <Button variant="danger" disabled={busy} onClick={() => mutate(() => archiveReferralProgram(program._id), 'Programa archivado.')}><Archive className="h-4 w-4" /></Button> : null}</div> : null}</div>)}</div>
        </Card>
        <Card>
          <CardHeader title="Referidos" description={`${referrals.length} registros`} />
          <div className="space-y-3 p-5">{referrals.map((referral) => {
            const program = referral.referralProgramId;
            const url = `${publicBase()}/ref/${program?.slug}/${referral.code}`;
            return <div key={referral._id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2"><span className="font-semibold">{referral.referrerContactId?.name} - {referral.code}</span><Badge tone={tone(referral.status)}>{referral.status}</Badge></div><p className="mt-1 text-sm text-slate-500">{program?.name} - referido: {referral.referredContactId?.name || 'pendiente'}</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => navigator.clipboard.writeText(url)}><Clipboard className="h-4 w-4" />Link</Button>{canManage && ['invited', 'submitted'].includes(referral.status) ? <Button disabled={busy} onClick={() => mutate(() => convertReferral(referral._id), 'Referido convertido.')}><Check className="h-4 w-4" />Convertir</Button> : null}{canManage && ['converted', 'rewarded'].includes(referral.status) ? <Button variant="secondary" disabled={busy} onClick={() => mutate(() => rewardReferral(referral._id, 'paid_manually'), 'Recompensa marcada manualmente.')}>Recompensar</Button> : null}</div></div>;
          })}</div>
        </Card>
      </>}
    </PageShell>
  );
}
