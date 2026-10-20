import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import FontPicker from '../components/FontPicker';
import {BanModal} from '../app/admin/components/BanModal';
import {BansView} from '../app/admin/components/BansView';
import {DeviceTable} from '../app/admin/components/DeviceTable';
import {useDialogFocus} from '../lib/use-dialog-focus';
import PersonalizationTools from '../components/PersonalizationTools';
import {BottomNavigation} from '../components/ApplicationChrome';
import {normalizeInterfaceAppearance,applyInterfaceAppearance,INTERFACE_APPEARANCE_KEY} from '../lib/interface-appearance';
function NavigationFixture(){
 const [value,setValue]=useState(()=>normalizeInterfaceAppearance(JSON.parse(localStorage.getItem(INTERFACE_APPEARANCE_KEY)||'{}')));
 const [admin,setAdmin]=useState(true);
 useEffect(()=>applyInterfaceAppearance(document.documentElement,value,true,'#00a3a2',false),[value]);
 const save=(next:typeof value)=>{localStorage.setItem(INTERFACE_APPEARANCE_KEY,JSON.stringify(next));setValue(next);};
 const noAction=()=>{};
 return <><button data-hide-admin onClick={()=>setAdmin(!admin)}>Admin</button><PersonalizationTools value={value} onChange={save} canOpenAdminEmbed={admin} theme="dark" accent="#00a3a2" glass={false} glow={false} glowStrength={0}/>
 <div className="pks-navigation" data-test-navigation><BottomNavigation order={value.navOrder} activeTab="map" className="" themeColor="#00a3a2" canOpenAdminEmbed={admin} onMap={noAction} onStops={noAction} onOptions={noAction} onJourneys={noAction}/></div>
 <BottomNavigation preview order={value.navOrder} activeTab="map" className="" themeColor="#00a3a2" canOpenAdminEmbed={admin} onMap={noAction} onStops={noAction} onOptions={noAction}/></>;
}
const device:any={id:'other',name:'Testowy telefon',os:'Android',deviceId:'other',firstLogin:'20.10.2026',role:'Użytkownik',rawRole:'user',status:'Aktywny',iconType:'mobile'};
const banned={...device,status:'Zablokowany',banDetails:{reason:'Zapisany powód',expiresAt:new Date(Date.now()+5*86400000).toISOString(),gifUrl:'',silent:true}};
function InputOnly(){const [open,setOpen]=useState(false),ref=useRef<HTMLDivElement>(null);useDialogFocus(ref,open,()=>setOpen(false));return <><button data-only-toggle onClick={()=>setOpen(true)}>Okno z polem</button>{open&&<div ref={ref} role="dialog"><input aria-label="Pole testowe"/></div>}</>;}
function Fixture(){
 const [tab,setTab]=useState('font'),[modal,setModal]=useState(''),[font,setFont]=useState('system');
 return <div className="pks-theme-root" data-ui-theme="dark-oled"><div className="pks-panel-scope p-4" data-panel-theme="dark" data-glass="off">
 <nav className="flex gap-2">{['font','ban','bans','devices','only','navigation'].map(t=><button key={t} data-tab={t} onClick={()=>{setTab(t);if(t==='ban')setModal('new');}}>{t}</button>)}</nav>
 {tab==='navigation'&&<NavigationFixture/>}
 {tab==='font'&&<FontPicker value={{fontFamily:font,customFontUrl:''}} onChange={setFont}/>}
 {tab==='only'&&<InputOnly/>}
 {tab==='bans'&&<BansView bans={[{id:'other',deviceName:device.name,deviceId:'other',location:'—',status:'AKTYWNY',expireIn:'5 dni',reason:'Zapisany powód',bannedBy:'Admin',date:'20.10.2026'}]} stats={{activeBans:1,expireToday:0,everWithBanDetails:1}} onUnblock={()=>{}} onEdit={()=>setModal('edit')} onMenuClick={()=>{}}/>}
 {tab==='devices'&&<DeviceTable devices={[device]} currentDeviceRole="owner" currentUserId="self" onRenameDevice={async()=>{}} onOpenBanModal={()=>setModal('new')} onOpenRolesModal={()=>{}} onNavigateToBanScreen={()=>{}} onMenuClick={()=>{}}/>}
 {modal&&<BanModal key={modal} device={modal==='edit'?banned:device} onClose={()=>setModal('')} onConfirm={async(_,reason,expiryDate,gifUrl,silent)=>{(window as any).__savedBan={reason,expiryDate,gifUrl,silent};return true;}}/>}
 </div></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
