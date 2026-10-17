'use client';
import {useEffect,useState,type CSSProperties} from 'react';
import {themeDecoration} from '@/lib/app-theme';
import {StatisticsView} from '@/app/admin/components/StatisticsView';
import {Sidebar} from '@/app/admin/components/Sidebar';
import {aggregateApiStatisticsReports} from '@/lib/api-statistics-reports';
const apiHistory=aggregateApiStatisticsReports([
  {stream:'a'.repeat(64),installationId:'first-phone',date:'2026-10-06',startedAt:Date.parse('2026-10-06T08:00:00Z'),providers:{pks:{requests:60,errors:2,latencyMs:12000}}},
  {stream:'b'.repeat(64),installationId:'second-phone',date:'2026-10-06',startedAt:Date.parse('2026-10-06T08:00:00Z'),providers:{pks:{requests:20,errors:0,latencyMs:4000},mpk_rzeszow:{requests:15,errors:1,latencyMs:3000},marcel:{requests:5,errors:0,latencyMs:1000}}},
]);
const devices=[
  {id:'one',installationId:'same',firstLogin:'2026-10-06T10:00:00Z',lastSeenAt:'2026-10-06T11:00:00Z',deviceInfo:'Android',verified:true},
  {id:'alias',installationId:'same',firstLogin:'2026-10-06T10:00:00Z',lastSeenAt:'2026-10-06T12:00:00Z',deviceInfo:'Android',verified:true},
  {id:'two',firstLogin:'2026-10-06T09:00:00Z',lastSeenAt:'2026-10-06T11:00:00Z',deviceInfo:'iPhone'},
  {id:'three',firstLogin:'2026-09-27T09:00:00Z',lastSeenAt:'2026-10-06T11:00:00Z',deviceInfo:'Windows',status:'banned'},
];
export default function Page(){
  const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);
  const [dark,setDark]=useState(true),[open,setOpen]=useState(false),[view,setView]=useState('devices');
  const [theme,setTheme]=useState<string|null>(null);
  const mode=theme||(dark?'dark':'light'),isDark=mode.startsWith('dark');
  return <div data-ui-theme={mode} data-statistics-fixture-ready={ready} className="pks-theme-root flex h-screen flex-col" style={{'--theme-decoration':themeDecoration(mode),background:dark?'#080d14':'#f1f5f9'} as CSSProperties}>
    <button onClick={()=>{setTheme(null);setDark(!dark);}} style={{color:dark?'white':'black',padding:8}}>Zmień motyw testowy</button>
    <div>{['dark-forest','light-sky','light-pink','dark-cosmos'].map(mode=><button key={mode} data-statistics-theme={mode} onClick={()=>setTheme(mode)}>{mode}</button>)}</div>
    <div className="pks-panel-scope flex min-h-0 flex-1" data-panel-theme={isDark?'dark':'light'} data-glass="on">
      <Sidebar isOpen={open} onClose={()=>setOpen(false)} user={{name:'Administrator',role:'Administrator',initials:'AD'}} activeView={view} onViewChange={value=>{setView(value);setOpen(false);}} allowedNavIds={['devices','statistics']} accentColor="#00A3A2"/>
      {view==='statistics'?<StatisticsView apiHistory={apiHistory} devices={devices} onMenuClick={()=>setOpen(true)} isDarkTheme={isDark}/>:<button onClick={()=>setOpen(true)} className="p-4 text-teal-500">Otwórz menu testowe</button>}
    </div>
  </div>;
}
