import {doc,getDoc,setDoc,deleteDoc,runTransaction,serverTimestamp,type Firestore} from 'firebase/firestore';
import {buildDevicePermissions,type DeviceRole} from './admin/rbac';

type Profile=Record<string,any>;
export function restoredDevicePayload(profile:Profile,previous:Profile,installationId:string,deviceInfo:string,autoBan:boolean,banDetails:Profile) {
  const role:DeviceRole=profile.role==='owner'||profile.role==='admin'?profile.role:'user';
  const verified=role!=='user'||profile.verified===true;
  const banned=profile.status==='banned'||(!profile.status&&role==='user'&&!verified&&autoBan);
  const payload:Profile={installationId,identityVersion:3,deviceInfo,role,permissions:profile.permissions&&typeof profile.permissions==='object'?profile.permissions:buildDevicePermissions(role),verified,status:banned?'banned':'active',firstLogin:previous.firstLogin||profile.firstLogin||new Date().toISOString()};
  if(profile.banDetails)payload.banDetails=profile.banDetails;
  else if(banned)payload.banDetails=banDetails;
  if(typeof profile.displayName==='string'&&profile.displayName.trim())payload.displayName=profile.displayName.trim().slice(0,120);
  if(typeof (previous.deviceName||profile.deviceName)==='string')payload.deviceName=previous.deviceName||profile.deviceName;
  return payload;
}

/** Atomically transfer the existing physical-device record to the new Auth UID. */
export async function registerRestoredDevice(db:Firestore,uid:string,installationId:string,deviceInfo:string,autoBan:boolean,banDetails:Profile) {
  try {
    await transferDevice(db,uid,installationId,deviceInfo,autoBan,banDetails);
  } catch(error) {
    const code=String((error as {code?:string})?.code||'');
    if(code!=='permission-denied'&&code!=='firestore/permission-denied')throw error;
    // Older deployed rules allow restoring our own UID, but not reading/deleting
    // the previous UID until the owner record exists. Do not downgrade its role.
    const currentRef=doc(db,'devices',uid),profileRef=doc(db,'installations',installationId);
    if((await getDoc(currentRef)).exists())return;
    const snapshot=await getDoc(profileRef);
    const profile=snapshot.exists()?snapshot.data():{};
    const payload=restoredDevicePayload(profile,{},installationId,deviceInfo,autoBan,banDetails);
    await setDoc(currentRef,{...payload,lastSeenAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await setDoc(profileRef,{...payload,installationId,lastUid:uid,updatedBy:uid,updatedAt:serverTimestamp()},{merge:true});
    if(payload.role==='owner'&&typeof profile.lastUid==='string'&&profile.lastUid!==uid&&/^[\w-]{6,128}$/.test(profile.lastUid)) {
      const previousRef=doc(db,'devices',profile.lastUid);
      const previous=await getDoc(previousRef);
      if(previous.exists()&&previous.data().installationId===installationId)await deleteDoc(previousRef);
    }
  }
}

async function transferDevice(db:Firestore,uid:string,installationId:string,deviceInfo:string,autoBan:boolean,banDetails:Profile) {
  return runTransaction(db,async tx=>{
    const currentRef=doc(db,'devices',uid),profileRef=doc(db,'installations',installationId);
    const current=await tx.get(currentRef);
    if(current.exists())return;
    const snapshot=await tx.get(profileRef);
    const profile=snapshot.exists()?snapshot.data():{};
    const previousUid=typeof profile.lastUid==='string'&&/^[\w-]{6,128}$/.test(profile.lastUid)&&profile.lastUid!==uid?profile.lastUid:'';
    const previousRef=previousUid?doc(db,'devices',previousUid):null;
    const previous=previousRef?await tx.get(previousRef):null;
    const previousData=previous?.exists()&&previous.data().installationId===installationId?previous.data():{};
    const payload=restoredDevicePayload(profile,previousData,installationId,deviceInfo,autoBan,banDetails);
    tx.set(currentRef,{...payload,lastSeenAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.set(profileRef,{...payload,installationId,lastUid:uid,updatedBy:uid,updatedAt:serverTimestamp()},{merge:true});
    if(previousRef&&previous?.exists()&&previous.data().installationId===installationId)tx.delete(previousRef);
  });
}

export async function stableAndroidInstallationId(getNative:()=>Promise<string>,getFallback:()=>Promise<string>,cached?:string|null) {
  for(const read of [getNative,getFallback]) {
    try {const id=(await read()).trim().toLowerCase();if(/^[a-f0-9]{16}$/.test(id))return 'android_'+id;}catch {}
  }
  if(cached&&/^android_[a-zA-Z0-9_-]+$/.test(cached))return cached;
  // A transient plugin failure must not manufacture another physical device.
  throw new Error('Nie udało się odczytać identyfikatora Androida. Rejestracja zostanie ponowiona.');
}
