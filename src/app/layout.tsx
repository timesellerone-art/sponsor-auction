import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AccessReasonToast } from '@/components/AccessReasonToast';
import { AuthProvider } from '@/components/AuthProvider';
import { Navbar } from '@/components/Navbar';
import { SiteFooter } from '@/components/SiteFooter';
import { ToastHost } from '@/components/Toast';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SponsorAuction',
  description: '마이크로 스폰서십 역경매 플랫폼',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full w-full antialiased`}
    >
      <body className="flex min-h-full w-full flex-col overflow-x-clip bg-background font-sans text-foreground">
        <AuthProvider>
          <Navbar />
          <main className="flex min-h-screen w-full min-w-0 flex-1 flex-col">
            {children}
          </main>
          <SiteFooter />
          <ToastHost />
          <AccessReasonToast />
        </AuthProvider>
      </body>
    </html>
  );
}
