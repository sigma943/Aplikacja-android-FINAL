import {newLoginsEnabled,registrationLoginApproved} from './login-policy';
import {doc,getDoc,setDoc,deleteDoc,runTransaction,serverTimestamp,type Firestore} from 'firebase/firestore';
import {buildDevicePermissions,type DeviceRole} from './admin/rbac';

type Profile=Record<string,any>;
export function restoredDevicePayload(profile:Profile,previous:Profile,installationId:string,deviceInfo:string,autoBan:boolean,banDetails:Profile,loginEnabled=true) {
  const role:DeviceRole=profile.role==='owner'||profile.role==='admin'?profile.role:'user';
  const verified=role!=='user'||profile.verified===true;
  const banned=profile.status==='banned'||(!profile.status&&role==='user'&&!verified&&autoBan);
  const payload:Profile={loginApproved:registrationLoginApproved(profile,previous,loginEnabled),installationId,identityVersion:3,deviceInfo,role,permissions:profile.permissions&&typeof profile.permissions==='object'?profile.permissions:buildDevicePermissions(role),verified,status:banned?'banned':'active',firstLogin:previous.firstLogin||profile.firstLogin||new Date().toISOString()};
  if(profile.banDetails)payload.banDetails=profile.banDetails;
  else if(banned)payload.banDetails=banDetails;
  if(typeof profile.displayName==='string'&&profile.displayName.trim())payload.displayName=profile.displayName.trim().slice(0,120);
  if(typeof (previous.deviceName||profile.deviceName)==='string')payload.deviceName=previous.deviceName||profile.deviceName;
  return payload;
}

/** Atomically transfer the existing physical-device record to the new Auth UID. */
export async function registerRestoredDevice(db:Firestore,uid:string,installationId:string,deviceInfo:string,autoBan:boolean,banDetails:Profile,loginEnabled=true) {
  try {
    await transferDevice(db,uid,installationId,deviceInfo,autoBan,banDetails,loginEnabled);
  } catch(error) {
    const code=String((error as {code?:string})?.code||'');
    if(code!=='permission-denied'&&code!=='firestore/permission-denied')throw error;
    // Some rule versions require our restored identity to exist before reading
    // or deleting the previous UID. Never downgrade its saved role.
    const currentRef=doc(db,'devices',uid),profileRef=doc(db,'installations',installationId);
    if((await getDoc(currentRef)).exists())return;
    const snapshot=await getDoc(profileRef);
    const profile=snapshot.exists()?snapshot.data():{};
    const security=Object.keys(profile).length?null:await getDoc(doc(db,'admin_settings','security'));
    const enabled=security?.exists()?newLoginsEnabled(security.data().loginEnabled):loginEnabled;
    const payload=restoredDevicePayload(profile,{},installationId,deviceInfo,autoBan,banDetails,enabled);
    await setDoc(currentRef,{...payload,lastSeenAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await setDoc(profileRef,{...payload,installationId,restorationMetadataVersion:1,lastUid:uid,updatedBy:uid,updatedAt:serverTimestamp()},{merge:true});
    if(typeof profile.lastUid==='string'&&profile.lastUid!==uid&&/^[\w-]{6,128}$/.test(profile.lastUid)) {
      const previousRef=doc(db,'devices',profile.lastUid);
      const previous=await getDoc(previousRef);
      if(previous.exists()&&previous.data().installationId===installationId)await deleteDoc(previousRef);
    }
  }
}

async function transferDevice(db:Firestore,uid:string,installationId:string,deviceInfo:string,autoBan:boolean,banDetails:Profile,loginEnabled=true) {
  return runTransaction(db,async tx=>{
    const currentRef=doc(db,'devices',uid),profileRef=doc(db,'installations',installationId);
    const current=await tx.get(currentRef);
    if(current.exists())return;
    const snapshot=await tx.get(profileRef);
    const profile=snapshot.exists()?snapshot.data():{};
    const previousUid=typeof profile.lastUid==='string'&&/^[\w-]{6,128}$/.test(profile.lastUid)&&profile.lastUid!==uid?profile.lastUid:'';
    const previousRef=previousUid?doc(db,'devices',previousUid):null;
    // The mirrored profile is authoritative. Do not expose another UID's device
    // document to fresh anonymous accounts merely to copy its metadata.
    // The legacy read remains only for APK-before-rules compatibility; deployment
    // backfills old profiles before this read is restricted by the new rules.
    const profileComplete=profile.restorationMetadataVersion===1;
    const previous=previousRef&&!profileComplete?await tx.get(previousRef):null;
    const previousData=previous?.exists()&&previous.data().installationId===installationId?previous.data():{};
    const security=Object.keys(profile).length||Object.keys(previousData).length?null:await tx.get(doc(db,'admin_settings','security'));
    const enabled=security?.exists()?newLoginsEnabled(security.data().loginEnabled):loginEnabled;
    const payload=restoredDevicePayload(profile,previousData,installationId,deviceInfo,autoBan,banDetails,enabled);
    tx.set(currentRef,{...payload,lastSeenAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.set(profileRef,{...payload,installationId,restorationMetadataVersion:1,lastUid:uid,updatedBy:uid,updatedAt:serverTimestamp()},{merge:true});
    if(previousRef&&(profileComplete||(previous?.exists()&&previous.data().installationId===installationId)))tx.delete(previousRef);
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
