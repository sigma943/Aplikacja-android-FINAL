import {AdminModalPortal} from './AdminModalPortal';
import {useAppBack} from '@/lib/use-app-back';
import { useEffect, useMemo, useRef, useState } from 'react';
import { callInitialize, callSaveEndpoint, callTestEndpoint, callSetActive, callDisable, callRollback, callClearHistory } from '@/lib/maintenance-spark';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  Activity,
  CheckCircle2,
  Clock3,
  Database,
  Filter,
  Globe2,
  History,
  Menu,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  TestTube2,
  Trash2,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { BUILTIN_TRANSPORT_URL, BUILTIN_TRANSPORT_ID } from '@/lib/transport-runtime';
import type { MaintenanceChange, MaintenanceEndpoint, MaintenanceEndpointRole } from '../types';

const DEFAULT_ENDPOINT: MaintenanceEndpoint = {
  id: BUILTIN_TRANSPORT_ID,
  name: 'Źródła przewoźników',
  url: BUILTIN_TRANSPORT_URL,
  role: 'production',
  priority: 1,
  region: 'PL',
  source: 'Firestore',
  fallbackEnabled: true,
  enabled: true,
  active: false,
};

const roleLabels: Record<MaintenanceEndpointRole, string> = {
  production: 'Production',
  backup: 'Backup',
  staging: 'Staging',
  legacy: 'Legacy',
  test: 'Test',
};

const roleOptions: MaintenanceEndpointRole[] = ['production', 'backup', 'staging', 'legacy', 'test'];

const endpointStatus = (endpoint: MaintenanceEndpoint) => {
  if (!endpoint.enabled) return 'Nieaktywny';
  if (endpoint.lastTest?.ok === false) return 'Błąd';
  if (endpoint.active) return 'Aktywny';
  return 'Standby';
};

const statusClass = (label: string) => {
  if (label === 'Aktywny') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300';
  if (label === 'Standby') return 'border-sky-400/30 bg-sky-500/10 text-sky-300';
  if (label === 'Błąd') return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
};

const safeDate = (value?: string) => {
  if (!value) return '-';
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms).toLocaleString('pl-PL') : value;
};

const changeDate = (ms: number) => (ms ? new Date(ms).toLocaleString('pl-PL') : '-');

function normalizeEndpoint(id: string, data: Record<string, unknown>): MaintenanceEndpoint {
  const role = String(data.role || 'production') as MaintenanceEndpointRole;
  return {
    id,
    name: String(data.name || 'Endpoint'),
    url: String(data.url || ''),
    role: roleOptions.includes(role) ? role : 'production',
    priority: Number(data.priority || 1),
    region: String(data.region || 'PL'),
    source: String(data.source || 'Firestore'),
    fallbackEnabled: Boolean(data.fallbackEnabled),
    enabled: data.enabled !== false,
    active: data.active === true,
    lastTest: data.lastTest && typeof data.lastTest === 'object'
      ? data.lastTest as MaintenanceEndpoint['lastTest']
      : undefined,
  };
}

function emptyDraft(endpoint?: MaintenanceEndpoint): MaintenanceEndpoint {
  return endpoint ? { ...endpoint } : {
    ...DEFAULT_ENDPOINT,
    id: '',
    name: 'Nowy endpoint',
    url: '',
    active: false,
    priority: 5,
    role: 'backup',
  };
}

export function MaintenanceView({
  onMenuClick,
  canEdit,
}: {
  onMenuClick: () => void;
  canEdit: boolean;
}) {
  const [endpoints, setEndpoints] = useState<MaintenanceEndpoint[]>([]);
  const [changes, setChanges] = useState<MaintenanceChange[]>([]);
  const [settings, setSettings] = useState<{ activeEndpointId?: string; previousEndpointId?: string }>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'enabled' | 'disabled'>('all');
  const [sort, setSort] = useState<'priority' | 'name' | 'latency'>('priority');
  const [selectedId, setSelectedId] = useState<string>('default-transport-api');
  const [draft, setDraft] = useState<MaintenanceEndpoint>(DEFAULT_ENDPOINT);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmHistoryClear,setConfirmHistoryClear]=useState(false);
  useAppBack(showHistory&&confirmHistoryClear,()=>{setConfirmHistoryClear(false);return true;},100);
  useAppBack(showHistory, () => {setShowHistory(false);return true;},95);
  const [ready, setReady] = useState(false);
  const [draftTest, setDraftTest] = useState<MaintenanceEndpoint['lastTest']>();
  const actionInFlight = useRef(false);
  const failureMessage = (err: unknown) => {
    const code = (err as { code?: string })?.code || '';
    if (code === 'permission-denied' || code === 'firestore/permission-denied') return 'Brak dostępu do konserwacji. Opublikuj aktualne reguły Firestore (bez Cloud Functions i planu Blaze) i sprawdź uprawnienie edycji ustawień globalnych.';
    if (code === 'unavailable') return 'Nie udało się połączyć z Firestore. Sprawdź połączenie z internetem.';
    return err instanceof Error ? err.message : String(err);
  };
  useEffect(() => {
    let mounted = true;
    callInitialize({}).then(() => { if (mounted) setReady(true); }).catch(err => { if (mounted) setError(failureMessage(err)); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'maintenance_endpoints'), (snap) => {
      const rows = snap.docs.map((entry) => normalizeEndpoint(entry.id, entry.data() as Record<string, unknown>));
      setEndpoints(rows);
    }, (err) => setError(err.message || String(err)));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'admin_settings', 'maintenance'), (snap) => {
      setSettings(snap.exists() ? snap.data() as { activeEndpointId?: string; previousEndpointId?: string } : {});
    }, err => setError(failureMessage(err)));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'maintenance_changes'), orderBy('createdAt', 'desc'), limit(40));
    const unsub = onSnapshot(q, (snap) => {
      setChanges(snap.docs.map((entry) => {
        const data = entry.data() as any;
        const createdAtMs = data.createdAt?.toDate?.()?.getTime?.() || 0;
        return {
          id: entry.id,
          action: String(data.action || ''),
          endpointId: String(data.endpointId || ''),
          actorId: String(data.actorId || ''),
          summary: String(data.summary || ''),
          createdAtMs,
        };
      }));
    }, err => setError(failureMessage(err)));
    return () => unsub();
  }, []);

  const configuredEndpoints = useMemo(() => endpoints.map(endpoint => ({ ...endpoint, active: endpoint.id === settings.activeEndpointId })), [endpoints, settings.activeEndpointId]);
  const visibleEndpoints = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = configuredEndpoints.filter((endpoint) => {
      const matchesSearch = !q || [endpoint.name, endpoint.url, endpoint.region, endpoint.source, endpoint.role]
        .some((value) => String(value).toLowerCase().includes(q));
      const matchesFilter =
        filter === 'all' ||
        (filter === 'active' && endpoint.active) ||
        (filter === 'enabled' && endpoint.enabled) ||
        (filter === 'disabled' && !endpoint.enabled);
      return matchesSearch && matchesFilter;
    });
    return [...filtered].sort((left, right) => {
      if (sort === 'name') return left.name.localeCompare(right.name, 'pl');
      if (sort === 'latency') return (left.lastTest?.latencyMs ?? 999999) - (right.lastTest?.latencyMs ?? 999999);
      return left.priority - right.priority || left.name.localeCompare(right.name, 'pl');
    });
  }, [configuredEndpoints, filter, search, sort]);

  const selectedEndpoint = selectedId ? configuredEndpoints.find((endpoint) => endpoint.id === selectedId) : undefined;
  const activeEndpoint = configuredEndpoints.find((endpoint) => endpoint.active);
  const successfulTests = endpoints.filter((endpoint) => endpoint.lastTest?.ok).length;
  const lastGlobalTest = endpoints
    .map((endpoint) => endpoint.lastTest?.testedAt || '')
    .filter(Boolean)
    .sort()
    .pop();

  useEffect(() => {
    if (!selectedEndpoint) return;
    setDraft(emptyDraft(selectedEndpoint));
  }, [selectedEndpoint?.id]);

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(failureMessage(err));
    } finally {
      actionInFlight.current = false;
      setBusy(null);
    }
  };

  const selectEndpoint = (endpoint: MaintenanceEndpoint) => {
    setDraftTest(undefined);
    setSelectedId(endpoint.id);
    setDraft(emptyDraft(endpoint));
  };

  const saveDraft = () => runAction('save', async () => {
    const response = await callSaveEndpoint({ endpoint: draft });
    setSelectedId(response.data.endpointId);
    setDraft(current => ({ ...current, id: response.data.endpointId }));
  });
  const testSelected = () => runAction('test', async () => {
    const savedUrl = selectedEndpoint?.url === draft.url;
    const response = await callTestEndpoint(savedUrl ? { endpointId: selectedEndpoint?.id } : { url: draft.url });
    setDraftTest(response.data.result);
  });
  const activateSelected = () => runAction('active', () => callSetActive({ endpointId: selectedEndpoint?.id }));
  const disableSelected = () => runAction('disable', async () => {
    await callDisable({ endpointId: selectedEndpoint?.id });
    setDraft(current => ({ ...current, enabled: false, active: false }));
  });
  const rollback = () => runAction('rollback', () => callRollback({}));
  const displayedTest = draftTest || selectedEndpoint?.lastTest;


  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#040609] p-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] sm:p-8 sm:pb-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onMenuClick} className="lg:hidden flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400">
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight text-white sm:text-2xl">Konserwacja</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">API pojazdów i tras</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {setConfirmHistoryClear(false);setShowHistory(true);}}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#111623] px-4 text-xs font-black uppercase tracking-widest text-slate-300 transition-colors hover:bg-white/5"
          >
            <History size={15} />
            Historia zmian
          </button>
        </header>

        {error && (
          <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100">
            {error}
            {!ready && <button type="button" disabled={Boolean(busy)} onClick={() => runAction('initialize', async () => { await callInitialize({}); setReady(true); })} className="mt-3 block rounded-xl border px-3 py-2 text-xs ui-accent-soft">Połącz ponownie</button>}
          </div>
        )}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard icon={<Globe2 size={22} />} title="Aktywny endpoint" value={(activeEndpoint?.id === BUILTIN_TRANSPORT_ID && activeEndpoint.url === BUILTIN_TRANSPORT_URL ? 'Źródła przewoźników' : activeEndpoint?.url.replace(/^https?:\/\//, '')) || 'Nie wybrano'} hint={activeEndpoint?.enabled ? 'Aktywny' : 'Brak aktywnego endpointu'} tone="cyan" />
          <StatusCard icon={<Database size={22} />} title="Źródło konfiguracji" value={ready ? 'Firestore' : 'Łączenie…'} hint={`${endpoints.length} zapisanych endpointów`} tone="blue" />
          <StatusCard icon={<Activity size={22} />} title="Status infrastruktury" value={!lastGlobalTest ? 'Nie testowano' : endpoints.some((e) => e.lastTest?.ok === false) ? 'Wymaga uwagi' : 'Testy OK'} hint={`${successfulTests}/${endpoints.length} testów OK`} tone="emerald" />
          <StatusCard icon={<Clock3 size={22} />} title="Ostatni test globalny" value={lastGlobalTest ? safeDate(lastGlobalTest) : 'Brak danych'} hint={activeEndpoint?.lastTest?.latencyMs ? `${activeEndpoint.lastTest.latencyMs} ms` : 'uruchom test'} tone="violet" />
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#0b1019] shadow-2xl">
          <div className="grid gap-3 border-b border-white/5 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Szukaj endpointu..."
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-3 text-sm font-semibold text-white outline-none placeholder:text-slate-600 ui-accent-input"
              />
            </div>
            <SelectButton icon={<SlidersHorizontal size={15} />} value={sort} onChange={(value) => setSort(value as typeof sort)} options={[['priority', 'Sortowanie'], ['name', 'Nazwa'], ['latency', 'Opóźnienie']]} />
            <SelectButton icon={<Filter size={15} />} value={filter} onChange={(value) => setFilter(value as typeof filter)} options={[['all', 'Wszystkie'], ['active', 'Aktywne'], ['enabled', 'Włączone'], ['disabled', 'Wyłączone']]} />
            <button
              type="button"
              disabled={!canEdit || !ready || Boolean(busy)}
              onClick={() => {
                setSelectedId('');
                setDraftTest(undefined);
                setDraft(emptyDraft());
              }}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border ui-accent-soft px-4 text-xs font-semibold uppercase tracking-widest transition-colors disabled:opacity-40"
            >
              <Plus size={15} />
              Dodaj
            </button>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-5 py-4">Nazwa endpointu</th>
                  <th className="px-4 py-4">URL</th>
                  <th className="px-4 py-4">Rola</th>
                  <th className="px-4 py-4">Priorytet</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Opóźnienie</th>
                  <th className="px-4 py-4">Region</th>
                  <th className="px-4 py-4">Fallback</th>
                  <th className="px-4 py-4">Ostatni test</th>
                  <th className="px-4 py-4 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visibleEndpoints.map((endpoint) => {
                  const status = endpointStatus(endpoint);
                  return (
                    <tr key={endpoint.id} className={cn('transition-colors hover:bg-white/[0.03]', selectedEndpoint?.id === endpoint.id && 'ui-accent-soft')}>
                      <td className="px-5 py-4">
                        <button type="button" onClick={() => selectEndpoint(endpoint)} className="flex min-w-0 items-center gap-3 text-left">
                          <span className={cn('h-3 w-3 shrink-0 rounded-full', endpoint.active ? 'ui-accent-fill' : endpoint.enabled ? 'bg-slate-500' : 'bg-rose-400')} />
                          <span className="min-w-0">
                            <span className="block truncate font-black text-white">{endpoint.name}</span>
                            {endpoint.active && <span className="text-[10px] font-black uppercase tracking-widest ui-accent-text">Aktywny</span>}
                          </span>
                        </button>
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-4 font-mono text-[11px] text-slate-300">{endpoint.url}</td>
                      <td className="px-4 py-4"><Badge>{roleLabels[endpoint.role]}</Badge></td>
                      <td className="px-4 py-4 font-mono text-slate-300">{endpoint.priority}</td>
                      <td className="px-4 py-4"><Badge className={statusClass(status)}>{status}</Badge></td>
                      <td className="px-4 py-4 font-mono ui-accent-text">{endpoint.lastTest?.latencyMs ? `${endpoint.lastTest.latencyMs} ms` : '-'}</td>
                      <td className="px-4 py-4 text-slate-300">{endpoint.region}</td>
                      <td className="px-4 py-4">{endpoint.fallbackEnabled ? <Badge>Tak</Badge> : <Badge className="border-rose-400/30 bg-rose-500/10 text-rose-300">Nie</Badge>}</td>
                      <td className="px-4 py-4 text-[11px] text-slate-400">{safeDate(endpoint.lastTest?.testedAt)}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <IconButton title="Edytuj" onClick={() => selectEndpoint(endpoint)} icon={<Pencil size={15} />} />
                          <IconButton title="Testuj" onClick={() => runAction(`test-${endpoint.id}`, () => callTestEndpoint({ endpointId: endpoint.id }))} icon={<TestTube2 size={15} />} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-3 md:hidden">
            {visibleEndpoints.map((endpoint) => {
              const status = endpointStatus(endpoint);
              return (
                <button
                  key={endpoint.id}
                  type="button"
                  onClick={() => selectEndpoint(endpoint)}
                  className={cn('w-full rounded-2xl border border-white/10 bg-[#111623] p-4 text-left shadow-lg', selectedEndpoint?.id === endpoint.id && 'ui-accent-border')}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-black text-white">{endpoint.name}</div>
                      <div className="mt-1 truncate font-mono text-[11px] text-slate-400">{endpoint.url}</div>
                    </div>
                    <MoreVertical className="shrink-0 text-slate-500" size={18} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge>{roleLabels[endpoint.role]}</Badge>
                    <Badge className={statusClass(status)}>{status}</Badge>
                    <Badge>{endpoint.region}</Badge>
                    <Badge>{endpoint.lastTest?.latencyMs ? `${endpoint.lastTest.latencyMs} ms` : 'Brak testu'}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 rounded-3xl border ui-accent-border bg-[#07111a] p-4 shadow-2xl xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.8fr)_minmax(260px,0.7fr)]">
          <div className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">Edytuj endpoint</h2>
                <p className="mt-1 text-xs text-slate-500">{draft.id || 'nowy endpoint'}</p>
              </div>
              {draft.active && <Badge className="ui-accent-soft">Aktywny</Badge>}
            </div>
            <EndpointForm draft={{ ...draft, active: selectedEndpoint?.active ?? false }} disabled={!canEdit || !ready || Boolean(busy)} onChange={next => { if (next.url !== draft.url) setDraftTest(undefined); setDraft(next); }} />
          </div>

          <div className="min-w-0 border-t border-white/10 pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
            <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-slate-300">Test połączenia</h3>
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
              <CheckLine label="Połączenie z endpointem" ok={displayedTest?.ok ?? null} />
              <CheckLine label="Adres HTTPS" ok={draft.url.startsWith('https://')} />
              <CheckLine label="Odpowiedź API" ok={displayedTest?.ok ?? null} value={displayedTest?.statusCode ? `HTTP ${displayedTest.statusCode}` : '-'} />
              <CheckLine label="Czas odpowiedzi" ok={displayedTest?.latencyMs == null ? null : displayedTest.latencyMs < 1000} value={displayedTest?.latencyMs != null ? `${displayedTest.latencyMs} ms` : '-'} />
              {displayedTest?.message && <p role="status" className="text-xs text-slate-400">{displayedTest.message}</p>}
              <button
                type="button"
                disabled={!ready || Boolean(busy) || !draft.url}
                onClick={testSelected}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border ui-accent-soft text-xs font-semibold uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                <RefreshCcw size={15} className={busy === 'test' ? 'animate-spin' : ''} />
                Testuj ponownie
              </button>
            </div>
          </div>

          <div className="min-w-0 border-t border-white/10 pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
            <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-slate-300">Zastosuj zmiany</h3>
            <div className="grid gap-3">
              <ActionButton disabled={!canEdit || !ready || Boolean(busy)} onClick={saveDraft} icon={<Save size={15} />} label="Zapisz zmiany" tone="cyan" />
              <ActionButton disabled={!canEdit || !ready || Boolean(busy) || !selectedEndpoint?.id || selectedEndpoint.active} onClick={activateSelected} icon={<CheckCircle2 size={15} />} label="Ustaw jako aktywny" />
              <ActionButton disabled={!canEdit || !ready || Boolean(busy) || !selectedEndpoint?.id || selectedEndpoint.active} onClick={disableSelected} icon={<Power size={15} />} label="Wyłącz endpoint" tone="rose" />
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Szybki rollback</h4>
              <p className="mt-3 break-all font-mono text-xs text-slate-300">{settings.previousEndpointId || 'Brak poprzedniego endpointu'}</p>
              <button
                type="button"
                disabled={!canEdit || !ready || Boolean(busy) || !settings.previousEndpointId}
                onClick={rollback}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 text-xs font-black uppercase tracking-widest text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-40"
              >
                <RotateCcw size={15} />
                Przywróć poprzedni endpoint
              </button>
            </div>
          </div>
        </section>


      </div>

      <AnimatePresence>
        {showHistory && (
          <AdminModalPortal>
          <motion.div role="dialog" aria-modal="true" aria-label="Historia zmian" className="admin-modal-overlay bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 28, opacity: 0 }} className="flex max-h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#111623] shadow-2xl">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 p-5">
                <div>
                  <h2 className="text-lg font-black text-white">Historia zmian</h2>
                  <p className="text-xs text-slate-500">Ostatnie operacje infrastruktury API</p>
                </div>
                <button type="button" onClick={() => setShowHistory(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              {canEdit&&changes.length>0&&<div className="shrink-0 border-b border-white/10 px-4 py-3">
                {confirmHistoryClear ? <div className="space-y-3 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3">
                  <p className="text-sm text-rose-100">Usunąć całą historię konserwacji? Tej operacji nie można cofnąć.</p>
                  <div className="flex flex-wrap gap-2">
                    <button disabled={Boolean(busy)} onClick={()=>setConfirmHistoryClear(false)} className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white">Anuluj</button>
                    <button disabled={Boolean(busy)} onClick={()=>void runAction('clear-history',async()=>{await callClearHistory({});setConfirmHistoryClear(false);})} className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy==='clear-history'?'Usuwanie…':'Potwierdź usunięcie historii'}</button>
                  </div>
                </div> : <button onClick={()=>setConfirmHistoryClear(true)} disabled={Boolean(busy)} className="flex items-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200"><Trash2 size={15}/>Wyczyść historię</button>}
              </div>}
              {error&&<p role="alert" className="shrink-0 px-4 py-2 text-sm text-rose-300">{error}</p>}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-4">
                {changes.length ? changes.map((change) => (
                  <div key={change.id} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 break-all text-sm font-black text-white">{change.summary}</span>
                      <Badge className="max-w-full break-all whitespace-normal">{change.action}</Badge>
                    </div>
                    <div className="mt-2 break-all text-xs text-slate-500">{change.endpointId} · {changeDate(change.createdAtMs)}</div>
                  </div>
                )) : (
                  <div className="py-10 text-center text-sm text-slate-500">Brak historii zmian.</div>
                )}
              </div>
            </motion.div>
          </motion.div>
          </AdminModalPortal>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusCard({ icon, title, value, hint, tone }: { icon: React.ReactNode; title: string; value: string; hint: string; tone: 'cyan' | 'blue' | 'emerald' | 'violet' }) {
  const colors = {
    cyan: 'ui-accent-text bg-cyan-500/10 border-cyan-400/20',
    blue: 'text-blue-300 bg-blue-500/10 border-blue-400/20',
    emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20',
    violet: 'text-violet-300 bg-violet-500/10 border-violet-400/20',
  };
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-[#111623] p-4 shadow-xl">
      <div className="flex items-center gap-4">
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border', colors[tone])}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{title}</div>
          <div className="mt-1 truncate text-sm font-black text-white">{value}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-emerald-400">{hint}</div>
        </div>
      </div>
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex rounded-lg border ui-accent-soft px-2 py-1 text-[10px] font-black uppercase tracking-widest ui-accent-text', className)}>{children}</span>;
}

function IconButton({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return <button type="button" title={title} onClick={onClick} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white">{icon}</button>;
}

function SelectButton({ icon, value, onChange, options }: { icon: React.ReactNode; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="relative flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-[#111623] px-3 text-xs font-black uppercase tracking-widest text-slate-300">
      {icon}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="appearance-none bg-transparent pr-4 outline-none">
        {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
  );
}

function EndpointForm({ draft, disabled, onChange }: { draft: MaintenanceEndpoint; disabled: boolean; onChange: (next: MaintenanceEndpoint) => void }) {
  const update = <K extends keyof MaintenanceEndpoint>(key: K, value: MaintenanceEndpoint[K]) => onChange({ ...draft, [key]: value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nazwa" className="sm:col-span-2">
        <input disabled={disabled} value={draft.name} aria-label="Nazwa endpointu" onChange={(event) => update('name', event.target.value)} className="field-input" />
      </Field>
      <Field label="URL" className="sm:col-span-2">
        <input disabled={disabled} value={draft.url} aria-label="Adres API" onChange={(event) => update('url', event.target.value)} className="field-input" />
      </Field>
      <Field label="Rola">
        <select disabled={disabled} value={draft.role} onChange={(event) => update('role', event.target.value as MaintenanceEndpointRole)} className="field-input">
          {roleOptions.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
        </select>
      </Field>
      <Field label="Priorytet">
        <input disabled={disabled} type="number" min={1} max={99} value={draft.priority} onChange={(event) => update('priority', Number(event.target.value))} className="field-input" />
      </Field>
      <Field label="Region">
        <input disabled={disabled} value={draft.region} onChange={(event) => update('region', event.target.value)} className="field-input" />
      </Field>
      <Field label="Źródło konfiguracji">
        <input readOnly value="Firestore" className="field-input" />
      </Field>
      <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:col-span-2">
        <span className="text-xs font-semibold text-slate-300">Endpoint włączony</span>
        <input disabled={disabled || draft.active} type="checkbox" checked={draft.enabled} onChange={event => update('enabled', event.target.checked)} className="h-5 w-5 accent-[var(--pks-accent)]" />
      </label>
      <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:col-span-2">
        <span>
          <span className="block text-xs font-black uppercase tracking-widest text-slate-300">Fallback</span>
          <span className="text-xs text-slate-500">Użyj danych przewoźnika, jeśli to API nie odpowiada</span>
        </span>
        <input disabled={disabled} type="checkbox" checked={draft.fallbackEnabled} onChange={(event) => update('fallbackEnabled', event.target.checked)} className="h-5 w-5 accent-[var(--pks-accent)]" />
      </label>
      <style jsx>{`
        .field-input {
          height: 44px;
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          padding: 0 12px;
          color: white;
          outline: none;
          font-size: 13px;
          font-weight: 700;
        }
        .field-input:focus { border-color: var(--pks-accent-border); }
        .field-input:disabled { opacity: 0.55; }
      `}</style>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('min-w-0', className)}>
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function CheckLine({ label, ok, value }: { label: string; ok: boolean | null; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-300">
        {ok === null ? <Clock3 size={14} className="shrink-0 text-slate-400" /> : ok ? <CheckCircle2 size={14} className="shrink-0 text-emerald-400" /> : <X size={14} className="shrink-0 text-rose-400" />}
        <span className="truncate">{label}</span>
      </span>
      <span className={cn('shrink-0 font-mono text-[11px] font-black', ok === null ? 'text-slate-400' : ok ? 'text-emerald-400' : 'text-rose-300')}>{value || (ok === null ? 'Nie testowano' : ok ? 'OK' : 'BŁĄD')}</span>
    </div>
  );
}

function ActionButton({ disabled, onClick, icon, label, tone = 'emerald' }: { disabled: boolean; onClick: () => void; icon: React.ReactNode; label: string; tone?: 'cyan' | 'emerald' | 'rose' }) {
  const classes = {
    cyan: 'ui-accent-soft',
    emerald: 'ui-accent-solid',
    rose: 'border-rose-400/25 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20',
  };
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={cn('flex h-12 items-center justify-center gap-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-40', classes[tone])}>
      {icon}
      {label}
    </button>
  );
}
