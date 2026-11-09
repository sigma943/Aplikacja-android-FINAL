import {NextResponse} from 'next/server';
import {googleMapsLink,resolveGoogleMapsLink,GOOGLE_MAPS_HEADERS} from '@/lib/google-maps-link';
import {withRequestDeadline} from '@/lib/request-deadline';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const value=new URL(request.url).searchParams.get('url')||'';
 if(value.length>4096||!googleMapsLink(value))return NextResponse.json({error:'Nieprawidłowy link Google Maps.'},{status:400});
 try{
  const point=await withRequestDeadline(signal=>resolveGoogleMapsLink(value,async(url,active)=>{
   const response=await fetch(url,{signal:active,redirect:'manual',cache:'no-store',headers:GOOGLE_MAPS_HEADERS});
   const length=Number(response.headers.get('content-length')||0);if(length>2000000)throw Error('Odpowiedź linku jest zbyt duża.');
   return {status:response.status,headers:Object.fromEntries(response.headers.entries()),text:response.status>=300&&response.status<400?'':await response.text()};
  },signal),request.signal,18000);
  return NextResponse.json({lat:point.lat,lon:point.lon},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error&&error.name!=='AbortError'?error.message:'Odczyt linku trwał zbyt długo. Spróbuj ponownie lub wklej współrzędne.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
