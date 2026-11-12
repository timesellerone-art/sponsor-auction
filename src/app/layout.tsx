import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import { AccessReasonToast } from '@/components/AccessReasonToast';
import { AuthProvider } from '@/components/AuthProvider';
import { Navbar } from '@/components/Navbar';
import { RealtimeNotifications } from '@/components/RealtimeNotifications';
import { RoleIntentProvider } from '@/components/RoleIntentProvider';
import { RoleRouteGuard } from '@/components/RoleRouteGuard';
import { SiteFooter } from '@/components/SiteFooter';
import { AiSupportWidget } from '@/components/support/AiSupportWidget';
import { ToastHost } from '@/components/Toast';
import './globals.css';

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Clink',
  description: '기획부터 매칭까지, 크리에이터 협업의 새로운 기준. 제품만 등록하면 AI가 촬영 콘셉트를 설계합니다.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className={`${geistMono.variable} h-full w-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="flex min-h-full w-full min-w-0 flex-col overflow-x-clip bg-background font-sans text-foreground">
        <AuthProvider>
          <RoleIntentProvider>
            <RealtimeNotifications />
            <RoleRouteGuard>
              <Navbar />
              <main className="flex min-h-screen w-full min-w-0 max-w-none flex-1 flex-col overflow-x-clip">
                {children}
              </main>
              <SiteFooter />
              <AiSupportWidget />
              <ToastHost />
              <AccessReasonToast />
            </RoleRouteGuard>
          </RoleIntentProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
