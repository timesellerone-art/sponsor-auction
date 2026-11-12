import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import { AccessReasonToast } from '@/components/AccessReasonToast';
import { AuthProvider } from '@/components/AuthProvider';
import { Navbar } from '@/components/Navbar';
import { RealtimeNotifications } from '@/components/RealtimeNotifications';
import { RoleRouteGuard } from '@/components/RoleRouteGuard';
import { SiteFooter } from '@/components/SiteFooter';
import { ToastHost } from '@/components/Toast';
import './globals.css';

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Clink',
  description: '좋은 브랜드는 크리에이터와 함께 콘텐츠를 만듭니다.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className={`${geistMono.variable} h-full w-full antialiased`}>
      <body className="flex min-h-full w-full min-w-0 flex-col overflow-x-clip bg-background font-sans text-foreground">
        <AuthProvider>
          <RealtimeNotifications />
          <RoleRouteGuard>
            <Navbar />
            <main className="flex min-h-screen w-full min-w-0 max-w-none flex-1 flex-col overflow-x-clip">
              {children}
            </main>
            <SiteFooter />
            <ToastHost />
            <AccessReasonToast />
          </RoleRouteGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
