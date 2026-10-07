'use client';
import {usePathname} from 'next/navigation';
import {FirebaseProvider} from './FirebaseProvider';
/** The local widget runner reads public transport data without starting an app session. */
export default function AppProviders({children}:{children:React.ReactNode}) {
  const path=usePathname();
  if(path?.startsWith('/widget-data'))return <>{children}</>;
  return <FirebaseProvider>{children}</FirebaseProvider>;
}
