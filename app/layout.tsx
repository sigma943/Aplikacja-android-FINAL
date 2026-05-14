import type {Metadata} from 'next';
import './globals.css';
import { FirebaseProvider } from '@/components/FirebaseProvider';

export const metadata: Metadata = {
  title: 'PKS Live',
  description: 'PKS Live - sledzenie autobusow na zywo.',
  applicationName: 'PKS Live',
  icons: {
    icon: '/ikona.png',
    apple: '/ikona.png',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pl">
      <body suppressHydrationWarning className="bg-[#0f0c1b] text-white">
        <FirebaseProvider>
          {children}
        </FirebaseProvider>
      </body>
    </html>
  );
}
