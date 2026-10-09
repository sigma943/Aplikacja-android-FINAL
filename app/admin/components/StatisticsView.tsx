'use client';
import {useMemo,useState,useSyncExternalStore} from 'react';
import {saveStatisticsCsv} from '@/lib/admin/statistics-export';
import {Activity,BarChart3,CheckCircle2,Clock3,Download,Menu,Server,Smartphone,UserPlus,Users,ShieldCheck,AlertTriangle} from 'lucide-react';
import {getApiStatistics,getServerApiStatistics,subscribeApiStatistics} from '@/lib/api-statistics';
import {apiStatistics,deviceStatistics,type StatisticsDevice,type StatisticsRange} from '@/lib/admin/statistics';

const number=(value:number)=>value.toLocaleString('pl-PL');
const dateLabel=(date:string,long=false)=>new Date(date+'T12:00:00Z').toLocaleDateString('pl-PL',{timeZone:'Europe/Warsaw',day:'numeric',month:long?'long':'short'});
const providerNames={pks:'PKS Rzeszów',mpk_rzeszow:'MPK Rzeszów',marcel:'Marcel'};
const providerColors={pks:'#14b8a6',mpk_rzeszow:'#fb923c',marcel:'#84cc16'};
const ranges:[StatisticsRange,string][]=[[1,'Dzisiaj'],[7,'7 dni'],[30,'30 dni'],[90,'90 dni']];
type Point={date:string;value:number|null;errors?:number|null};

function TimeChart({points,color,bars=false,title,dark}:{points:Point[];color:string;bars?:boolean;title:string;dark:boolean}){
  const [selected,setSelected]=useState(points.length-1);
  const index=Math.min(selected,points.length-1),point=points[index];
  const max=Math.max(1,...points.map(p=>p.value||0));
  const left=36,width=590,bottom=168,height=132,step=width/Math.max(1,points.length);
  const x=(i:number)=>left+(i+.5)*step,y=(v:number)=>bottom-v/max*height;
  const path=(field:'value'|'errors')=>{let open=false;return points.map((p,i)=>{const value=p[field];if(value==null){open=false;return '';}const command=open?'L':'M';open=true;return `${command}${x(i)},${y(value)}`;}).join(' ');};
  const ticks=[...new Set([0,Math.floor((points.length-1)/2),points.length-1])];
  const muted=dark?'#94a3b8':'#64748b',grid=dark?'#ffffff12':'#0f172a12';
  if(!points.some(p=>p.value!==null))return <div className="flex h-[234px] flex-col items-center justify-center gap-2 text-center"><BarChart3 size={32} className="opacity-30"/><p className="text-sm font-medium">Jeszcze nie ma pomiarów</p><p className="max-w-xs text-xs opacity-60">Wykres pojawi się po zapytaniach aplikacji do przewoźników.</p></div>;
  return <div>
    <div className="mt-4 flex min-h-8 flex-wrap items-center justify-between gap-2 text-xs" aria-live="polite">
      <span className="opacity-60">{dateLabel(point.date,true)}</span><span className="font-semibold tabular-nums">{point.value===null?'Brak pomiaru':`${number(point.value)} ${bars?'nowych urządzeń':'zapytań'}`}{point.errors!=null&&!bars&&<span className="ml-3 text-rose-400">{number(point.errors)} błędów</span>}</span>
    </div>
    <svg data-statistics-chart={bars?'installations':'requests'} role="img" aria-label={title} viewBox="0 0 640 202" className="mt-2 w-full overflow-visible">
      <title>{title}</title>
      {[0,.5,1].map(f=><g key={f}><line x1={left} x2={left+width} y1={bottom-f*height} y2={bottom-f*height} stroke={grid} strokeDasharray={f?'3 5':undefined}/><text x={left-8} y={bottom-f*height+4} textAnchor="end" fill={muted} fontSize="10">{number(Math.round(max*f))}</text></g>)}
      {bars?points.map((p,i)=>p.value===null?null:<rect key={p.date} x={x(i)-Math.min(step*.62,48)/2} y={y(p.value)} width={Math.min(step*.62,48)} height={Math.max(0,bottom-y(p.value))} rx={Math.min(5,step*.12)} fill={color} opacity={i===index?1:.65}/>):<><path d={path('value')} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/><path d={path('errors')} fill="none" stroke="#fb7185" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/></>}
      {point.value!==null&&<><line x1={x(index)} x2={x(index)} y1={22} y2={bottom} stroke={color} opacity=".25" strokeDasharray="3 4"/>{!bars&&<circle cx={x(index)} cy={y(point.value)} r="4.5" fill={color} stroke={dark?'#101820':'#ffffff'} strokeWidth="2"/>}</>}
      {points.map((p,i)=><rect key={p.date} x={left+i*step} y={20} width={step} height={height+16} fill="transparent" role="button" tabIndex={0} aria-label={`${dateLabel(p.date,true)}: ${p.value===null?'brak pomiarów':number(p.value)}`} onMouseEnter={()=>setSelected(i)} onFocus={()=>setSelected(i)} onClick={()=>setSelected(i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')setSelected(i);if(e.key==='ArrowRight'){e.preventDefault();setSelected(Math.min(points.length-1,index+1));}if(e.key==='ArrowLeft'){e.preventDefault();setSelected(Math.max(0,index-1));}}} className="cursor-pointer focus:stroke-current focus:outline-none"/>)}
      {ticks.map(i=><text key={i} x={x(i)} y="194" textAnchor="middle" fill={muted} fontSize="11">{dateLabel(points[i].date)}</text>)}
    </svg>
    <table className="sr-only"><caption>{title}</caption><thead><tr><th>Dzień</th><th>{bars?'Nowe urządzenia':'Zapytania API'}</th>{!bars&&<th>Błędy</th>}</tr></thead><tbody>{points.map(p=><tr key={p.date}><td>{p.date}</td><td>{p.value??'Brak pomiarów'}</td>{!bars&&<td>{p.errors??'Brak pomiarów'}</td>}</tr>)}</tbody></table>
  </div>;
}

export function StatisticsView({devices,devicesError,devicesReady=true,onMenuClick,accentColor='#00A3A2',isDarkTheme=true}:{devices:StatisticsDevice[];devicesError?:string|null;devicesReady?:boolean;onMenuClick:()=>void;accentColor?:string;isDarkTheme?:boolean}){
  const [exporting,setExporting]=useState(false),[exportError,setExportError]=useState<string|null>(null);
  const [range,setRange]=useState<StatisticsRange>(7);
  const history=useSyncExternalStore(subscribeApiStatistics,getApiStatistics,getServerApiStatistics);
  const now=Date.now();
  const device=useMemo(()=>deviceStatistics(devices,range,now),[devices,range,now]);
  const api=useMemo(()=>apiStatistics(history.days,range,history.startedAt,now),[history,range,now]);
  const loaded=devicesReady&&!devicesError;
  const muted=isDarkTheme?'text-slate-400':'text-slate-500';
  const card=isDarkTheme?'border-white/[0.08] bg-[#111623]':'border-slate-200 bg-white/85';
  const soft=isDarkTheme?'bg-white/[0.035]':'bg-slate-50';
  const period=range===1?'dzisiaj':`w ostatnich ${range} dniach`;
  const exportCsv=async()=>{
    setExporting(true);setExportError(null);
    const rows=[['Dzień','Nowe urządzenia','Zapytania API (to urządzenie)','Błędy API (to urządzenie)'],...device.series.map((point,i)=>[point.date,loaded?String(point.value):'',api.series[i]?.value===null?'':String(api.series[i]?.value??''),api.series[i]?.errors===null?'':String(api.series[i]?.errors??'')])];
    try{await saveStatisticsCsv('\uFEFF'+rows.map(row=>row.join(';')).join('\r\n'),`pks-live-statystyki-${range}-dni.csv`);}
    catch{setExportError('Nie udało się zapisać statystyk. Spróbuj ponownie.');}
    finally{setExporting(false);}
  };
  const tiles=[
    {title:'Nowe urządzenia',value:loaded?number(device.newDevices):'—',icon:UserPlus,detail:loaded?(device.previousNew?`${device.newDevices>=device.previousNew?'+':''}${device.newDevices-device.previousNew} względem poprzedniego okresu`:'Pierwsze uruchomienia aplikacji'):'Oczekiwanie na dane urządzeń',scope:'Wszystkie urządzenia'},
    {title:'Aktywne urządzenia',value:loaded?number(device.active):'—',icon:Users,detail:`Ostatni sygnał ${period}`,scope:'Wszystkie urządzenia'},
    {title:'Zapytania API',value:history.startedAt?number(api.requests):'—',icon:Server,detail:'PKS · MPK · Marcel',scope:'To urządzenie'},
    {title:'Skuteczność API',value:api.successRate===null?'—':api.successRate.toLocaleString('pl-PL',{maximumFractionDigits:1})+'%',icon:CheckCircle2,detail:api.requests?`${number(api.requests-api.errors)} poprawnych odpowiedzi`:'Brak zapytań w tym okresie',scope:'To urządzenie'},
  ];
  return <div data-statistics-view className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain ${isDarkTheme?'text-slate-100':'text-slate-900'}`}>
    <header className="flex shrink-0 flex-col gap-4 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:pt-8">
      <div className="flex items-center gap-4"><button onClick={onMenuClick} aria-label="Otwórz menu statystyk" className="lg:hidden w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all active:scale-95 cursor-pointer"><Menu size={20}/></button><div><h1 className="text-lg font-bold uppercase tracking-wider">Statystyki</h1><p className={`mt-0.5 text-[10px] font-medium uppercase tracking-widest ${muted}`}>Aktywność aplikacji i kondycja API</p></div></div>
      <button onClick={exportCsv} disabled={exporting||(!loaded&&!history.startedAt)} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold disabled:opacity-40 ${isDarkTheme?'border-white/10 hover:bg-white/5':'border-slate-200 hover:bg-slate-50'}`}><Download size={15}/>{exporting?'Zapisywanie…':'Eksport CSV'}</button>
    </header>
    <main className="mx-auto w-full max-w-4xl space-y-5 p-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] sm:p-8 sm:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Przegląd</h2><p className={`mt-1 text-xs ${muted}`}>{new Date(now).toLocaleDateString('pl-PL',{timeZone:'Europe/Warsaw',day:'numeric',month:'long',year:'numeric'})} · czas polski</p></div><div role="group" aria-label="Zakres statystyk" className={`flex gap-1 rounded-2xl border p-1 ${card}`}>{ranges.map(([value,label])=><button key={value} onClick={()=>setRange(value)} aria-pressed={range===value} className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${range===value?'ui-accent-soft ui-accent-text':muted}`} style={range===value?{color:accentColor,backgroundColor:accentColor+'18'}:undefined}>{label}</button>)}</div></div>
      {exportError&&<div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-500">{exportError}</div>}
      {devicesError&&<div role="alert" className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-500">{devicesError} Statystyki API z tego urządzenia są nadal dostępne.</div>}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{tiles.map(tile=><section key={tile.title} className={`min-w-0 rounded-3xl border p-4 sm:p-5 ${card}`}><div className="flex items-center justify-between gap-2"><span className={`text-[10px] ${muted}`}>{tile.scope}</span><tile.icon size={17} style={{color:accentColor}} className="shrink-0 opacity-80"/></div><p className={`mt-4 text-xs font-medium ${muted}`}>{tile.title}</p><p className="mt-1.5 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl" data-statistic={tile.title}>{tile.value}</p><p className={`mt-3 text-[10px] leading-relaxed sm:text-xs ${muted}`}>{tile.detail}</p></section>)}</div>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className={`min-w-0 rounded-3xl border p-4 sm:p-5 ${card}`}><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Pierwsze uruchomienia</h3><p className={`mt-1 text-xs ${muted}`}>Nowe urządzenia każdego dnia</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] ${soft} ${muted}`}>Firebase</span></div>{loaded?<TimeChart key={range} points={device.series} color={accentColor} bars title="Pierwsze uruchomienia aplikacji według dnia" dark={isDarkTheme}/>:<div className={`flex h-[234px] items-center justify-center text-sm ${muted}`}>{devicesError?'Dane urządzeń niedostępne':'Wczytywanie urządzeń…'}</div>}</section>
        <section className={`min-w-0 rounded-3xl border p-4 sm:p-5 ${card}`}><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Ruch do API przewoźników</h3><p className={`mt-1 text-xs ${muted}`}>Rzeczywiste zapytania z tego urządzenia</p></div><Smartphone size={18} className={muted}/></div><TimeChart key={range} points={api.series} color={accentColor} title="Dzienne zapytania i błędy API na tym urządzeniu" dark={isDarkTheme}/><div className={`mt-2 flex flex-wrap gap-4 text-[10px] ${muted}`}><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{backgroundColor:accentColor}}/>Zapytania</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-rose-400"/>Błędy</span></div></section>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`min-w-0 rounded-3xl border p-4 sm:p-5 lg:col-span-2 ${card}`}><div className="flex items-center gap-2"><Activity size={17} style={{color:accentColor}}/><h3 className="text-sm font-semibold">API według przewoźnika</h3></div><p className={`mt-1 text-xs ${muted}`}>Liczba zapytań, błędy i średni czas odpowiedzi · to urządzenie</p><div className="mt-5 space-y-5">{(Object.keys(providerNames) as Array<keyof typeof providerNames>).map(provider=>{const data=api.providers[provider];return <div key={provider}><div className="flex justify-between gap-3 text-xs"><span className="flex items-center gap-2 font-medium"><i className="h-2 w-2 rounded-full" style={{backgroundColor:providerColors[provider]}}/>{providerNames[provider]}</span><span className="tabular-nums">{number(data.requests)} <span className={muted}>zapytań</span></span></div><div role="meter" aria-label={`Udział zapytań ${providerNames[provider]}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={api.requests?Math.round(data.requests/api.requests*100):0} className={`mt-2 h-2 overflow-hidden rounded-full ${isDarkTheme?'bg-white/5':'bg-slate-100'}`}><div className="h-full rounded-full" style={{width:api.requests?`${data.requests/api.requests*100}%`:'0%',backgroundColor:providerColors[provider]}}/></div><div className={`mt-1.5 flex justify-between text-[10px] ${muted}`}><span>{number(data.errors)} błędów</span><span>{data.requests?`${number(Math.round(data.latencyMs/data.requests))} ms`:'Brak pomiarów'}</span></div></div>;})}</div></section>
        <section className={`min-w-0 rounded-3xl border p-4 sm:p-5 ${card}`}><h3 className="text-sm font-semibold">Systemy urządzeń</h3><p className={`mt-1 text-xs ${muted}`}>Wszystkie dostępne rekordy</p><div className="mt-5 space-y-4">{Object.entries(device.platforms).map(([name,count])=><div key={name}><div className="flex items-center justify-between gap-2 text-xs"><span className={muted}>{name}</span><span className="font-semibold tabular-nums">{loaded?number(count):'—'}</span></div><div className={`mt-2 h-1.5 rounded-full ${isDarkTheme?'bg-white/5':'bg-slate-100'}`}><div className="h-full rounded-full opacity-70" style={{backgroundColor:accentColor,width:device.total?`${count/device.total*100}%`:'0%'}}/></div></div>)}</div></section>
      </div>
      <div className={`grid grid-cols-2 gap-3 rounded-3xl border p-4 sm:grid-cols-4 sm:p-5 ${card}`}>{[
        ['Wszystkie urządzenia',loaded?number(device.total):'—',Users],['Zweryfikowane',loaded?number(device.verified):'—',ShieldCheck],['Średni czas API',api.averageMs===null?'—':number(api.averageMs)+' ms',Clock3],['Błędy API',history.startedAt?number(api.errors):'—',AlertTriangle],
      ].map(([label,value,Icon])=>{const Glyph=Icon as typeof Users;return <div key={String(label)} className="min-w-0 py-1"><div className={`flex items-center gap-2 text-[11px] ${muted}`}><Glyph size={14}/>{String(label)}</div><p className="mt-2 text-xl font-semibold tabular-nums">{String(value)}</p></div>;})}</div>
      <aside className={`space-y-2 text-[11px] leading-relaxed ${muted}`}><p>Pierwsze uruchomienie oznacza rejestrację urządzenia, a nie pobranie pliku APK. Dane obejmują aktualne rekordy panelu (maks. 500), po połączeniu tych samych instalacji. Usunięte rekordy nie są uwzględniane.{device.unknownFirst>0&&` Brak daty pierwszego uruchomienia: ${number(device.unknownFirst)}.`}</p><p>Statystyki API są lokalne{history.startedAt?` i zbierane od ${new Date(history.startedAt).toLocaleString('pl-PL',{timeZone:'Europe/Warsaw',dateStyle:'short',timeStyle:'short'})}`:'. Zbieranie zacznie się przy pierwszym zapytaniu'}. Nie sumują ruchu wszystkich telefonów. Pamięć podręczna oraz anulowane i przerwane zapytania nie zwiększają liczników. Historia jest przechowywana przez 90 dni, bez dodatkowych zapytań sieciowych.</p></aside>
    </main>
  </div>;
}
