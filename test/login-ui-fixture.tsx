'use client';
import {FirebaseProvider,useFirebase} from '@/components/FirebaseProvider';
import {DeviceTable} from '@/app/admin/components/DeviceTable';
function Result(){const {device}=useFirebase();return <div data-login-open>Uruchomiono aplikację: {device?.role}</div>;}
export default function Page(){return <><FirebaseProvider><Result/></FirebaseProvider><div className="pks-theme-root" data-ui-theme="dark-oled"><div className="pks-panel-scope p-4" data-panel-theme="leaf" data-glass="off"><DeviceTable devices={[{id:'android_0123456789abcdef0123456789',name:'Samsung Galaxy A54 5G',deviceInfo:'Android 15',os:'Android 15',deviceId:'android_0123456789abcdef0123456789',iconType:'mobile',role:'Użytkownik',rawRole:'user',status:'Aktywny',verified:false,firstLogin:'12.10.2026 21:30',lastSeen:'teraz',loginBlocked:true} as any]} onOpenBanModal={()=>{}} onOpenRolesModal={()=>{}} onNavigateToBanScreen={()=>{}} onMenuClick={()=>{}}/></div></div></>;}
