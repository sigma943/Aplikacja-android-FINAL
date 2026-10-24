'use client';
import type {InputHTMLAttributes} from 'react';
import {Calendar} from 'lucide-react';

/** Keep the platform calendar picker, with the same outlined icon as the filter. */
export function AdminDateField({className='',type='date',disabled,...props}:InputHTMLAttributes<HTMLInputElement>){
 return <div className="admin-date-field relative min-w-0">
  <input {...props} type={type} disabled={disabled} className={`admin-date-input admin-range-date ${className}`}/>
  <Calendar size={18} strokeWidth={1.8} aria-hidden="true" className={`pointer-events-none absolute right-4 top-1/2 z-10 -translate-y-1/2 ${disabled?'opacity-35':''}`}/>
 </div>;
}
