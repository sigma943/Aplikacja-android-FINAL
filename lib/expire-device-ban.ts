import {doc,runTransaction,deleteField,serverTimestamp,type Firestore} from 'firebase/firestore';
import {hasExpiredBan} from './ban-expiry';

/** Re-read inside the transaction: an administrator may have extended the ban. */
export async function expireDeviceBan(db:Firestore,id:string,actorId:string):Promise<boolean>{
 return runTransaction(db,async transaction=>{
  const ref=doc(db,'devices',id),snapshot=await transaction.get(ref);
  if(!snapshot.exists()||!hasExpiredBan(snapshot.data()))return false;
  const device=snapshot.data(),installationId=typeof device.installationId==='string'?device.installationId:'';
  const profileRef=installationId?doc(db,'installations',installationId):null;
  // Match manual unblocking: verification prevents immediate automatic re-banning.
  const patch={status:'active',verified:true,banDetails:deleteField()};
  transaction.update(ref,patch);
  if(profileRef)transaction.set(profileRef,{...patch,installationId,role:device.role,permissions:device.permissions,loginApproved:device.loginApproved!==false,updatedBy:actorId,updatedAt:serverTimestamp()},{merge:true});
  return true;
 });
}
