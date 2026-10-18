export const INTERFACE_FONTS=[
  {id:'system',name:'Systemowy',kind:'Domyślny'},
  {id:'sans',name:'Klasyczny',kind:'Bezszeryfowy'},
  {id:'mono',name:'Monospace',kind:'Stała szerokość'},
  {id:'serif',name:'Szeryfowy',kind:'Klasyczny'},
  ...['Inter','Roboto','Open Sans','Lato','Montserrat','Nunito','Poppins','Ubuntu','Merriweather','Source Sans 3','JetBrains Mono','Comfortaa'].map(name=>({id:name,name,kind:'Google Fonts'})),
] as const;
export type InterfaceFont=string;
export function parseGoogleFontLink(input:unknown):{family:string;url:string}|null{
  if(typeof input!=='string'||input.length>2048)return null;
  try{
    const url=new URL(input.trim());
    if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
    let family='';
    if(url.hostname==='fonts.google.com'&&/^\/specimen\/[^/]+\/?$/.test(url.pathname))family=decodeURIComponent(url.pathname.split('/')[2].replace(/\+/g,' '));
    else if(url.hostname==='fonts.googleapis.com'&&['/css','/css2'].includes(url.pathname)&&url.searchParams.getAll('family').length===1)family=(url.searchParams.get('family')||'').split(':')[0];
    family=family.trim().replace(/\s+/g,' ');
    if(!/^[A-Za-z][A-Za-z0-9 -]{0,79}$/.test(family))return null;
    return {family,url:googleFontUrl(family)};
  }catch{return null;}
}
export function googleFontUrl(family:string){return 'https://fonts.googleapis.com/css2?family='+encodeURIComponent(family).replace(/%20/g,'+')+'&display=swap';}
export function interfaceGoogleFont(value:{fontFamily:string;customFontUrl:string}):string{
  if(value.fontFamily==='custom')return parseGoogleFontLink(value.customFontUrl)?.family||'';
  return INTERFACE_FONTS.find(font=>font.id===value.fontFamily)?.kind==='Google Fonts'?value.fontFamily:'';
}
export function interfaceFontStack(value:{fontFamily:string;customFontUrl:string}):string{
  if(value.fontFamily==='mono')return 'ui-monospace, SFMono-Regular, Consolas, monospace';
  if(value.fontFamily==='sans')return 'Arial, Helvetica, sans-serif';
  if(value.fontFamily==='serif')return 'Georgia, "Times New Roman", serif';
  const google=interfaceGoogleFont(value);
  return google?JSON.stringify(google)+', system-ui, sans-serif':'system-ui, sans-serif';
}
const loading=new Map<string,Promise<void>>();
/** Only selected families are requested. Failed loads remain retryable. */
export function loadInterfaceGoogleFont(family:string):Promise<void>{
  if(!family||typeof document==='undefined')return Promise.resolve();
  const existing=loading.get(family);if(existing)return existing;
  const promise=new Promise<void>((resolve,reject)=>{
    const link=document.createElement('link');link.rel='stylesheet';link.href=googleFontUrl(family);link.dataset.interfaceFont=family;
    const timer=setTimeout(()=>fail(),12000);
    const fail=()=>{clearTimeout(timer);link.remove();reject(new Error('Nie udało się pobrać czcionki. Sprawdź link i połączenie z internetem.'));};
    link.onerror=fail;
    link.onload=()=>{document.fonts.load('16px '+JSON.stringify(family),'Zażółć gęślą jaźń 0123456789').then(faces=>{if(!faces.length){fail();return;}clearTimeout(timer);resolve();},fail);};
    document.head.appendChild(link);
  });
  loading.set(family,promise);promise.catch(()=>loading.delete(family));return promise;
}
