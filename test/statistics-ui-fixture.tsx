'use client';
import {useEffect,useState} from 'react';
import {StatisticsView} from '@/app/admin/components/StatisticsView';
import {Sidebar} from '@/app/admin/components/Sidebar';
const devices=[
  {id:'one',installationId:'same',firstLogin:'2026-10-06T10:00:00Z',lastSeenAt:'2026-10-06T11:00:00Z',deviceInfo:'Android',verified:true},
  {id:'alias',installationId:'same',firstLogin:'2026-10-06T10:00:00Z',lastSeenAt:'2026-10-06T12:00:00Z',deviceInfo:'Android',verified:true},
  {id:'two',firstLogin:'2026-10-06T09:00:00Z',lastSeenAt:'2026-10-06T11:00:00Z',deviceInfo:'iPhone'},
  {id:'three',firstLogin:'2026-09-27T09:00:00Z',lastSeenAt:'2026-10-06T11:00:00Z',deviceInfo:'Windows',status:'banned'},
];
export default function Page(){
  const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);
  const [dark,setDark]=useState(true),[open,setOpen]=useState(false),[view,setView]=useState('devices');
  return <div data-statistics-fixture-ready={ready} className="flex h-screen flex-col" style={{background:dark?'#080d14':'#f1f5f9'}}>
    <button onClick={()=>setDark(!dark)} style={{color:dark?'white':'black',padding:8}}>Zmień motyw testowy</button>
    <div className="flex min-h-0 flex-1">
      <Sidebar isOpen={open} onClose={()=>setOpen(false)} user={{name:'Administrator',role:'Administrator',initials:'AD'}} activeView={view} onViewChange={value=>{setView(value);setOpen(false);}} allowedNavIds={['devices','statistics']} accentColor="#00A3A2"/>
      {view==='statistics'?<StatisticsView devices={devices} onMenuClick={()=>setOpen(true)} isDarkTheme={dark}/>:<button onClick={()=>setOpen(true)} className="p-4 text-teal-500">Otwórz menu testowe</button>}
    </div>
  </div>;
}
