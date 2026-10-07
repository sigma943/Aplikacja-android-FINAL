// Browser-only Firebase adapter: old rules reject the first transaction, then
// allow exact owner restoration. The startup deadline fires before that success.
export const db={};export const functions={};export const auth={currentUser:null as any,authStateReady:async()=>{}};
const records=new Map<string,any>();const listeners=new Set<()=>void>();let initialized=false;
const user={uid:'restored-owner-uid'};
const ownerPermissions={monitor:true,shield:true,users:true,group:true,logs:true,ban:true,canChangeRoles:true,disableMap:false,disableStops:false,globalSettings:true,globalSettingsEdit:true};
export const doc=(_:any,...path:string[])=>path.join('/');
export const serverTimestamp=()=> 'server-time';export const deleteField=()=>undefined;
const snapshot=(ref:string)=>({exists:()=>records.has(ref),data:()=>structuredClone(records.get(ref))});
export async function getDoc(ref:string){
 if(ref.startsWith('installations/')&&!initialized){initialized=true;await new Promise(resolve=>setTimeout(resolve,1800));records.set(ref,{installationId:ref.split('/')[1],role:'owner',permissions:ownerPermissions,verified:true,status:'active',firstLogin:'2026-01-01',lastUid:'previous-owner-uid'});records.set('devices/previous-owner-uid',{installationId:ref.split('/')[1],role:'owner'});}
 return snapshot(ref);
}
let profileWrites=0;
export async function setDoc(ref:string,data:any,options?:any){if(ref.startsWith('installations/'))profileWrites++;records.set(ref,options?.merge?{...records.get(ref),...data}:data);listeners.forEach(fn=>fn());}
export async function updateDoc(ref:string,data:any){if(!records.has(ref))throw Object.assign(Error('Missing device'),{code:'not-found'});await setDoc(ref,data,{merge:true});}
export async function deleteDoc(ref:string){records.delete(ref);listeners.forEach(fn=>fn());}
export async function runTransaction(){throw Object.assign(Error('Old rules'),{code:'permission-denied'});}
export function onSnapshot(ref:string,callback:any){const send=()=>callback(snapshot(ref));listeners.add(send);setTimeout(send,0);return()=>{listeners.delete(send);};}
export function onAuthStateChanged(_:any,callback:any){auth.currentUser=user;setTimeout(()=>callback(user),0);return()=>{};}
export const signInAnonymously=async()=>({user});
export function httpsCallable<T=any,R=any>(..._:any[]){return async(_:T)=>({data:{} as R});}

if(typeof window!=='undefined')(window as any).__startupTest={
  grants:async()=>setDoc('devices/restored-owner-uid',{role:'admin',permissions:{monitor:true,canBan:false}},{merge:true}),
  heartbeat:async()=>updateDoc('devices/restored-owner-uid',{lastSeenAt:'heartbeat'}),
  profile:()=>[...records].find(([key])=>key.startsWith('installations/'))?.[1],
  writes:()=>profileWrites,
};
