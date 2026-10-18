export const INTERFACE_FONTS=[
  {id:'system',name:'Systemowy',kind:'Domyślny'},
  {id:'sans',name:'Klasyczny',kind:'Bezszeryfowy'},
  {id:'mono',name:'Monospace',kind:'Stała szerokość'},
  {id:'serif',name:'Szeryfowy',kind:'Klasyczny'},
  ...['Inter','Roboto','Open Sans','Lato','Montserrat','Nunito','Poppins','Ubuntu','Merriweather','Source Sans 3','JetBrains Mono','Comfortaa'].map(name=>({id:name,name,kind:'Google Fonts'})),
] as const;
export type InterfaceFont=string;
export type GoogleFontLink={family:string;url:string};
/** Read URLs from Google's copied link/import snippets without executing HTML or CSS. */
export function parseGoogleFontInput(input:unknown):GoogleFontLink[]{
  if(typeof input!=='string'||input.length>16384)return [];
  const text=input.trim().replace(/&(?:amp|#38|#x26);/gi,'&');
  const links=[...text.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map(match=>match[1]);
  links.push(...[...text.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/gi)].map(match=>match[1]));
  links.push(...[...text.matchAll(/@import\s+url\(\s*(https:\/\/[^\s)]+)\s*\)/gi)].map(match=>match[1]));
  if(!links.length)links.push(text);
  const families=new Set<string>();
  for(const address of links){
    try{
      const url=new URL(address);
      if(url.protocol!=='https:'||url.username||url.password||url.port)continue;
      let names:string[]=[];
      if(url.hostname==='fonts.google.com'&&/^\/specimen\/[^/]+\/?$/.test(url.pathname))names=[decodeURIComponent(url.pathname.split('/')[2].replace(/\+/g,' '))];
      else if(url.hostname==='fonts.googleapis.com'&&['/css','/css2'].includes(url.pathname))names=url.searchParams.getAll('family').flatMap(spec=>spec.split('|')).map(spec=>spec.split(':')[0]);
      for(const name of names){
        const family=name.trim().replace(/\s+/g,' ');
        if(/^[A-Za-z][A-Za-z0-9 -]{0,79}$/.test(family))families.add(family);
      }
    }catch{/* Ignore preconnects and non-font text from a copied embed block. */}
  }
  if(families.size>20)return [];
  return [...families].map(family=>({family,url:googleFontUrl(family)}));
}
export function parseGoogleFontLink(input:unknown):GoogleFontLink|null{
  const fonts=parseGoogleFontInput(input);return fonts.length===1?fonts[0]:null;
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
  if(typeof navigator!=='undefined'&&navigator.onLine===false)return Promise.reject(new Error('Brak połączenia z internetem.'));
  const promise=new Promise<void>((resolve,reject)=>{
    const link=document.createElement('link');link.rel='stylesheet';link.href=googleFontUrl(family);link.dataset.interfaceFont=family;
    let settled=false;
    const finish=(error?:string)=>{
      if(settled)return;settled=true;clearTimeout(timer);link.onload=null;link.onerror=null;
      if(error){link.remove();reject(new Error(error));}else resolve();
    };
    const timer=setTimeout(()=>finish('Przekroczono czas pobierania.'),12000);
    link.onerror=()=>finish(typeof navigator!=='undefined'&&navigator.onLine===false?'Brak połączenia z internetem.':'Nie udało się pobrać czcionki.');
    link.onload=()=>{document.fonts.load('16px '+JSON.stringify(family),'Zażółć gęślą jaźń 0123456789').then(faces=>finish(faces.length?undefined:'Nie znaleziono czcionki.'),()=>finish('Nie udało się wczytać czcionki.'));};
    document.head.appendChild(link);
  });
  loading.set(family,promise);promise.catch(()=>loading.delete(family));return promise;
}
