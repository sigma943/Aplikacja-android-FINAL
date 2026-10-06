'use client';
import { useId } from 'react';

/** Crisp, code-native carrier artwork; no map screenshots or raster assets. */
export default function CarrierBusIcon({ color, label, city = false }: { color: string; label: string; city?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 112 120" className="h-full w-full" aria-hidden="true" data-carrier-bus-svg>
      <defs>
        <linearGradient id={`body-${id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={color}/><stop offset="1" stopColor={color} stopOpacity=".68"/></linearGradient>
        <linearGradient id={`glass-${id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#233847"/><stop offset="1" stopColor="#07151f"/></linearGradient>
      </defs>
      <ellipse cx="56" cy="111" rx="31" ry="4" fill="currentColor" opacity=".08"/>
      <rect x="26" y="97" width="12" height="12" rx="4" fill="#17212a"/><rect x="74" y="97" width="12" height="12" rx="4" fill="#17212a"/>
      <path d="M22 46h-5v19h5M90 46h5v19h-5" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"/>
      <rect x="23" y="12" width="66" height="92" rx={city ? 12 : 18} fill={`url(#body-${id})`} stroke="white" strokeOpacity=".3" strokeWidth="1.5"/>
      <rect x="30" y="19" width="52" height="14" rx="4" fill="#0a1a25" fillOpacity=".85"/>
      <text x="56" y="29" textAnchor="middle" fill="white" fontSize="8" fontWeight="800" fontFamily="sans-serif" letterSpacing="1">{label}</text>
      <rect x="29" y="39" width="54" height="35" rx="7" fill={`url(#glass-${id})`}/>
      <path d="m34 43 13 0-14 25z" fill="white" opacity=".09"/>
      {city && <path d="M56 40v33" stroke="white" strokeOpacity=".18"/>}
      <path d="m39 70 10-7m13 7 10-7" stroke="#668092" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="44" y="86" width="24" height="7" rx="3" fill="#0c2930" fillOpacity=".4"/>
      <rect x="30" y="83" width="10" height="6" rx="3" fill="#f5fbff"/><rect x="72" y="83" width="10" height="6" rx="3" fill="#f5fbff"/>
      <path d="M34 98h44" stroke="white" strokeOpacity=".25" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
