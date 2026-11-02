/** Empty/invalid deadlines stay blocked; permanent bans have no deadline. */
export function banExpiryTime(device:{status?:string;banDetails?:{expiresAt?:unknown}|null}):number|null {
 if(device.status!=='banned'||typeof device.banDetails?.expiresAt!=='string'||!device.banDetails.expiresAt)return null;
 const at=Date.parse(device.banDetails.expiresAt);
 return Number.isFinite(at)?at:null;
}
export function hasExpiredBan(device:Parameters<typeof banExpiryTime>[0],now=Date.now()):boolean {
 const at=banExpiryTime(device);return at!==null&&at<=now;
}
