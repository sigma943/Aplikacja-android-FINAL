// Keep original bytes: canvas resizing would discard animated GIF frames.
export const MAX_BAN_IMAGE_BYTES=600*1024;
const MIME:Record<string,string>={gif:'image/gif',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',svg:'image/svg+xml'};
export function banImageMime(file:{name:string;type:string;size:number}){
  if(file.size>MAX_BAN_IMAGE_BYTES)throw new Error('Plik jest za duży (maks. 600 KB). Dla większego GIF-a lub zdjęcia wklej bezpośredni adres HTTPS.');
  const extension=file.name.split('.').pop()?.toLowerCase()||'';
  const type=file.type.toLowerCase();
  const mime=Object.values(MIME).includes(type)?type:MIME[extension];
  if(!mime)throw new Error('Wybierz GIF, JPG, PNG, WebP, AVIF, BMP lub SVG.');
  return mime;
}
export function banImageAddress(value:string){
  const address=value.trim();
  if(!address)return '';
  try{const url=new URL(address);if(url.protocol==='https:'||url.protocol==='http:')return url.href;}catch{}
  throw new Error('Podaj bezpośredni adres HTTP lub HTTPS do obrazka.');
}
export function readBanImage(file:File):Promise<string>{
  const mime=banImageMime(file);
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Nie udało się odczytać obrazka.'));
    reader.onabort=()=>reject(new Error('Odczyt obrazka został przerwany.'));
    reader.onload=()=>typeof reader.result==='string'?resolve(reader.result.replace(/^data:[^;]*;/,`data:${mime};`)):reject(new Error('Nie udało się odczytać obrazka.'));
    reader.readAsDataURL(file);
  });
}
