import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAuditLog,
  getDistributors,
  getModules,
  getPlatformInvoices,
  getPlatformPayments,
  getPlatformPlans,
  getPlatformSubscriptions,
  getSuperAdminOverview
} from '../../api.js';

/** Cada subruta de plataforma declara solo los datasets que pinta. */
const DATASETS = {
  overview: { load: getSuperAdminOverview, initial: null },
  distributors: { load: getDistributors, initial: [] },
  plans: { load: getPlatformPlans, initial: [] },
  subscriptions: { load: getPlatformSubscriptions, initial: [] },
  invoices: { load: getPlatformInvoices, initial: [] },
  payments: { load: getPlatformPayments, initial: [] },
  modules: { load: getModules, initial: { registry: [], entitlements: [] } },
  audit: { load: getAuditLog, initial: [] }
};

function initialData(keys) {
  return Object.fromEntries(keys.map((key) => [key, DATASETS[key].initial]));
}

export function useSuperAdminWorkspace(include = []) {
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

  const reload = useCallback(
    async (showLoader = true) => {
      if (showLoader) setLoading(true);
      setError('');
      try {
        const entries = await Promise.all(
          keys.map(async (key) => [key, await DATASETS[key].load()])
        );
        setData(Object.fromEntries(entries));
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

  const mutate = useCallback(
    async (key, action, successMessage) => {
      setBusy(key);
      setNotice('');
      setError('');
      try {
        await action();
        await reload(false);
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

  const distributorNames = useMemo(
    () => new Map((data.distributors || []).map((item) => [item._id, item.name])),
    [data.distributors]
  );

  return {
    ...data,
    distributorNames,
    loading,
    busy,
    notice,
    error,
    setNotice,
    setError,
    reload,
    mutate
  };
}
