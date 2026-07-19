import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getActivityLogs,
  getCompanies,
  getDistributorBillingOverview,
  getDistributorCompanies,
  getDistributorInvoices,
  getDistributorModules,
  getDistributorOnboarding,
  getDistributorPayments,
  getDistributorSettings,
  getMyPlatformInvoices,
  getMyPlatformPayments,
  getMyPlatformSubscription,
  getMyUsage,
  getPlans,
  getSubscriptions,
  getUsers
} from '../../api.js';

/**
 * Catalogo de datasets del distribuidor. Cada ruta declara solo los que usa,
 * asi el desglose en subrutas no multiplica las peticiones.
 *
 * `soft: true` marca fuentes que pueden fallar sin romper la pagina (billing
 * y plataforma dependen de modulos contratados): su error se reporta aparte.
 */
const DATASETS = {
  companies: { load: getCompanies, initial: [] },
  commerceCompanies: { load: getDistributorCompanies, initial: [] },
  plans: { load: getPlans, initial: [] },
  users: { load: getUsers, initial: [] },
  subscriptions: { load: getSubscriptions, initial: [] },
  activities: { load: getActivityLogs, initial: [] },
  modules: {
    load: getDistributorModules,
    initial: { modules: [], authorizedModuleKeys: [] }
  },
  settings: { load: getDistributorSettings, initial: null },
  onboarding: { load: getDistributorOnboarding, initial: null },
  billingOverview: { load: getDistributorBillingOverview, initial: null, soft: true },
  invoices: { load: getDistributorInvoices, initial: [], soft: true },
  payments: { load: getDistributorPayments, initial: [], soft: true },
  platformSubscription: { load: getMyPlatformSubscription, initial: null, soft: true },
  platformInvoices: { load: getMyPlatformInvoices, initial: [], soft: true },
  platformPayments: { load: getMyPlatformPayments, initial: [], soft: true },
  platformUsage: {
    load: getMyUsage,
    initial: { current: {}, records: [] },
    soft: true
  }
};

function initialData(keys) {
  return Object.fromEntries(keys.map((key) => [key, DATASETS[key].initial]));
}

export function useDistributorWorkspace(include = []) {
  // `include` suele llegar como literal, asi que la firma estabiliza las deps.
  const signature = include.join('|');
  const keys = useMemo(
    () => signature.split('|').filter((key) => Boolean(DATASETS[key])),
    [signature]
  );

  const [data, setData] = useState(() => initialData(keys));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [softError, setSoftError] = useState('');

  const reload = useCallback(
    async (showLoader = true) => {
      if (showLoader) setLoading(true);
      setError('');
      try {
        const entries = await Promise.all(
          keys.map(async (key) => {
            const dataset = DATASETS[key];
            try {
              return [key, await dataset.load(), null];
            } catch (requestError) {
              if (!dataset.soft) throw requestError;
              return [key, dataset.initial, requestError.message];
            }
          })
        );

        setData(Object.fromEntries(entries.map(([key, value]) => [key, value])));
        setSoftError(
          [...new Set(entries.map(([, , message]) => message).filter(Boolean))].join(' ')
        );
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [keys]
  );

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * Ejecuta una accion, recarga en silencio y deja el resultado en notice o
   * error. Devuelve true para que el llamador decida si limpia el formulario.
   */
  const mutate = useCallback(
    async (key, action, successMessage, afterSuccess) => {
      setBusy(key);
      setNotice('');
      setError('');
      try {
        await action();
        await reload(false);
        if (afterSuccess) await afterSuccess();
        setNotice(successMessage);
        return true;
      } catch (requestError) {
        setError(requestError.message);
        return false;
      } finally {
        setBusy('');
      }
    },
    [reload]
  );

  return {
    ...data,
    loading,
    busy,
    notice,
    error,
    softError,
    setNotice,
    setError,
    reload,
    mutate
  };
}
