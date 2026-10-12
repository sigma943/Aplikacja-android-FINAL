import {INITIAL_THEME_SCRIPT} from '@/lib/app-theme';
import type {Metadata} from 'next';
import './globals.css';
import UIMotionProvider from '@/components/UIMotionProvider';
import StatisticsCollector from '@/components/StatisticsCollector';
import AppProviders from '@/components/AppProviders';

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
      <head>
        <meta name="theme-color" content="#000000" />
        <script
          dangerouslySetInnerHTML={{
            __html: INITIAL_THEME_SCRIPT,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <AppProviders>
          <StatisticsCollector />
          <UIMotionProvider>{children}</UIMotionProvider>
        </AppProviders>
      </body>
    </html>
  );
}
