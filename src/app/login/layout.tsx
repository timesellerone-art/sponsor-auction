import type { ReactNode } from 'react';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://nid.naver.com" />
      <link rel="preconnect" href="https://kauth.kakao.com" />
      <link rel="preconnect" href="https://accounts.google.com" />
      {children}
    </>
  );
}
