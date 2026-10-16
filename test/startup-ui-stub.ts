// Browser-only Firebase adapter: old rules reject the first transaction, then
// allow exact owner restoration. The startup deadline fires before that success.
export const db={};export const functions={};export const auth={currentUser:null as any,authStateReady:async()=>{}};
const records=new Map<string,any>();const listeners=new Set<()=>void>();let initialized=false;
const user={uid:'restored-owner-uid'};
const ownerPermissions={monitor:true,shield:true,users:true,group:true,logs:true,ban:true,canChangeRoles:true,disableMap:false,disableStops:false,globalSettings:true,globalSettingsEdit:true};
export const doc=(_:any,...path:string[])=>path.join('/');
export const serverTimestamp=()=> 'server-time';export const deleteField=()=>undefined;
const snapshot=(ref:string)=>({docs:[],exists:()=>records.has(ref),data:()=>structuredClone(records.get(ref))});
export async function getDoc(ref:string){
 if(ref.startsWith('installations/')&&!initialized){initialized=true;await new Promise(resolve=>setTimeout(resolve,1800));records.set(ref,{installationId:ref.split('/')[1],role:'owner',permissions:ownerPermissions,verified:true,status:'active',firstLogin:'2026-01-01',lastUid:'previous-owner-uid'});records.set('devices/previous-owner-uid',{installationId:ref.split('/')[1],role:'owner'});}
 return snapshot(ref);
}
let profileWrites=0;
export async function setDoc(ref:string,data:any,options?:any){if(ref.startsWith('installations/'))profileWrites++;records.set(ref,options?.merge?{...records.get(ref),...data}:data);listeners.forEach(fn=>fn());}
export async function updateDoc(ref:string,data:any){if(typeof window!=='undefined'&&Object.prototype.hasOwnProperty.call(data,'lastSeenAt'))(window as any).__startupHeartbeatWrites=((window as any).__startupHeartbeatWrites||0)+1;if(!records.has(ref))throw Object.assign(Error('Missing device'),{code:'not-found'});await setDoc(ref,data,{merge:true});}
export async function deleteDoc(ref:string){records.delete(ref);listeners.forEach(fn=>fn());}
export async function runTransaction(){throw Object.assign(Error('Old rules'),{code:'permission-denied'});}
export function onSnapshot(ref:string,callback:any){const send=()=>{if(ref.startsWith('devices/')&&records.has(ref)&&typeof window!=='undefined'&&!(window as any).__startupDeviceReadyAt)(window as any).__startupDeviceReadyAt=performance.now();callback(snapshot(ref));};listeners.add(send);setTimeout(send,0);return()=>{listeners.delete(send);};}
export function onAuthStateChanged(_:any,callback:any){auth.currentUser=user;setTimeout(()=>callback(user),0);return()=>{};}
export const signInAnonymously=async()=>({user});
export function httpsCallable<T=any,R=any>(..._:any[]){return async(_:T)=>({data:{} as R});}

if(typeof window!=='undefined')(window as any).__startupTest={
  loginPolicy:async(enabled:boolean,role='user',verified=false,approved:boolean|undefined=false)=>{
    await setDoc('admin_settings/security',{loginEnabled:enabled});
    const current={...records.get('devices/restored-owner-uid'),role,verified,permissions:role==='user'?{}:ownerPermissions};
    if(approved===undefined)delete current.loginApproved;else current.loginApproved=approved;
    await setDoc('devices/restored-owner-uid',current);
  },
  revoke:async()=>setDoc('devices/restored-owner-uid',{role:'user',permissions:{}},{merge:true}),
  grants:async()=>setDoc('devices/restored-owner-uid',{role:'admin',permissions:{monitor:true,canBan:false}},{merge:true}),
  heartbeat:async()=>updateDoc('devices/restored-owner-uid',{lastSeenAt:'heartbeat'}),
  deleteDevice:()=>{records.delete('devices/restored-owner-uid');for(const key of records.keys())if(key.startsWith('installations/'))records.delete(key);listeners.forEach(fn=>fn());},
  profile:()=>[...records].find(([key])=>key.startsWith('installations/'))?.[1],
  writes:()=>profileWrites,
};

export const collection=(_:any,name:string)=>'collection/'+name;
export const query=(ref:any,..._:any[])=>ref;
export const limit=(n:number)=>n;
export const orderBy=(..._:any[])=>null;
export const getDocs=async()=>({docs:[]});
export const addDoc=async()=>({id:'test'});
export const writeBatch=()=>({set(){},update(){},delete(){},commit:async()=>{}});
export type WriteBatch=ReturnType<typeof writeBatch>;
