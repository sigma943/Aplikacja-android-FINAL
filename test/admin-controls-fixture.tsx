import {Badge} from '../app/admin/components/Badge';
import {BansView} from '../app/admin/components/BansView';
import {MapHeader} from '../components/ApplicationChrome';
import StopList from '../Panel/src/components/StopList';
import {useState} from 'react';
export default function AdminControlsFixture({kind,dark}:{kind:string;dark:boolean}){
 const [query,setQuery]=useState('');
 if(kind==='searchmap')return <MapHeader mapGlassPanel="" mapGlassInput="" themeColor="#00a3a2" transparentUI isDark={dark} isManualRefreshing={false} showAlertDot={false} error={null} isOffline={false} textSub="" filterRoute={query} setFilterRoute={setQuery} handleManualRefresh={()=>{}} closeMapPanelsForSearch={()=>{}}/>;
 if(kind==='searchstops')return <div style={{height:'100vh',width:'100%'}}><StopList stops={[]} isDarkTheme={dark} backEnabled={false} isFullScreen onStopSelect={()=>{}} toggleFavorite={()=>{}}/></div>;
 return <div data-admin-viewport data-panel-theme={dark?'dark':'light'} className="pks-panel-scope w-full overflow-auto">
 {kind==='bans'?<BansView bans={[]} stats={{activeBans:0,expireToday:0,everWithBanDetails:0}} onUnblock={()=>{}} onMenuClick={()=>{}}/>:<article className="admin-device-card pks-personal-card" style={{margin:'35vh 20px 0',padding:20,display:'grid',gap:18}}>{['Właściciel','Administrator','Użytkownik'].map(role=><Badge key={role} role={role}/>)}{['Aktywny','Zablokowany','Wygasły'].map(status=><Badge key={status} status={status}/>)}</article>}
 </div>;
}
