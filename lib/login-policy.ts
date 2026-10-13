type LoginDevice={role?:string;verified?:boolean;loginApproved?:boolean}|null|undefined;
export function newLoginsEnabled(value:unknown){return value!==false;}
export function loginExempt(device:LoginDevice){return device?.role==='owner'||device?.role==='admin'||device?.verified===true;}
/** Legacy devices are already admitted. Only a new, pending registration is held. */
export function isNewLoginBlocked(device:LoginDevice,enabled:boolean){return enabled===false&&device?.loginApproved===false&&!loginExempt(device);}
export function registrationLoginApproved(profile:Record<string,any>,previous:Record<string,any>,enabled:boolean){
  if(typeof profile.loginApproved==='boolean')return profile.loginApproved;
  if(typeof previous.loginApproved==='boolean')return previous.loginApproved;
  return Object.keys(profile).length>0||Object.keys(previous).length>0||enabled;
}
