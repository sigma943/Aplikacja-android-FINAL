'use client';
import {useState,useSyncExternalStore} from 'react';
import {getTransportDiagnostics,subscribeTransportDiagnostics,type DiagnosticKind} from '@/lib/transport-diagnostics';
import {diagnoseBuiltinProviders} from '@/lib/pks-client';
const empty:ReturnType<typeof getTransportDiagnostics>=[];
const names={pks:'PKS Rzeszów',mpk_rzeszow:'MPK Rzeszów',marcel:'Marcel'};
const kinds:Record<DiagnosticKind,string>={vehicles:'Pojazdy',departures:'Odjazdy',geometry:'Trasy',catalog:'Rozkłady i przystanki'};
export function TransportDiagnosticsPanel(){
  const rows=useSyncExternalStore(subscribeTransportDiagnostics,getTransportDiagnostics,()=>empty);
  const [busy,setBusy]=useState(false);
  const probe=async()=>{setBusy(true);try{await diagnoseBuiltinProviders();}finally{setBusy(false);}};
  return <section data-transport-diagnostics className="rounded-3xl border border-white/10 bg-[#0b1019] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-white">Diagnostyka przewoźników</h2><p className="mt-1 text-xs text-slate-400">Odczyty z tego urządzenia. Test sprawdza wbudowane źródła pojazdów; pozostałe wyniki pochodzą z używania aplikacji.</p></div>
      <button disabled={busy} onClick={()=>void probe()} className="ui-accent-soft rounded-xl border px-4 py-2 text-xs font-bold disabled:opacity-50">{busy?'Sprawdzanie…':'Sprawdź źródła'}</button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">{(['pks','mpk_rzeszow','marcel'] as const).map(provider=><div key={provider} className="rounded-2xl border border-white/10 p-3"><h3 className="text-sm font-bold text-white">{names[provider]}</h3>
      {!rows.some(row=>row.provider===provider)&&<p className="mt-2 text-xs text-slate-400">Jeszcze nie sprawdzono.</p>}
      {rows.filter(row=>row.provider===provider).map(row=><div key={row.kind+':'+(row.source||'operation')} className="mt-3 text-xs text-slate-400"><p className={row.error?'text-amber-300':'text-slate-200'}>{kinds[row.kind]} · {row.error?'Błąd ostatniego odczytu':`${row.latencyMs} ms`}</p>
        {row.source&&<p className="mt-1 break-all text-[10px]">{row.source}</p>}
        {row.kind==='vehicles'&&row.count!==undefined&&<p>Pojazdy w odpowiedzi: {row.count}</p>}
        {!row.error&&row.kind==='vehicles'&&row.count===0&&<p className="text-amber-300">Źródło odpowiedziało poprawnie, ale nie udostępniło pojazdów. Nie jest to potwierdzenie blokady dostępu.</p>}
        {row.kind==='vehicles'&&!row.source&&<p>Najnowszy GPS w chwili testu: {row.dataAgeSec===undefined?'brak znacznika':`${row.dataAgeSec} s temu`}</p>}
        {row.lastSuccess&&<p>Ostatni sukces: {new Date(row.lastSuccess).toLocaleTimeString('pl-PL',{timeZone:'Europe/Warsaw'})}</p>}
        {row.lastError&&<p>Ostatni błąd: {new Date(row.lastError).toLocaleTimeString('pl-PL',{timeZone:'Europe/Warsaw'})}</p>}
        {(row.error||row.lastErrorMessage)&&<p className="mt-1 break-words text-amber-300">{row.error||`Poprzedni błąd (odczyt już działa): ${row.lastErrorMessage}`}</p>}
      </div>)}
    </div>)}</div>
  </section>;
}
