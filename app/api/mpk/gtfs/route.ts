import {MPK_GTFS_URL} from '@/lib/pks-gtfs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const headers:Record<string,string>={Accept:'application/zip'};
  for(const name of ['if-none-match','if-modified-since']){const value=request.headers.get(name);if(value)headers[name]=value;}
  const upstream=await fetch(MPK_GTFS_URL,{headers,cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(upstream.status!==200&&upstream.status!==304)return new Response('Rozkład MPK niedostępny',{status:502});
  const output:Record<string,string>={'Content-Type':'application/zip','Cache-Control':'no-store'};
  for(const name of ['etag','last-modified']){const value=upstream.headers.get(name);if(value)output[name]=value;}
  return new Response(upstream.status===304?null:upstream.body,{status:upstream.status,headers:output});
 }catch{return new Response('Rozkład MPK niedostępny',{status:502});}
}
