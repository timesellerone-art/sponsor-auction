import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-2 px-4 py-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="min-w-0">© {new Date().getFullYear()} SponsorAuction</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="약관">
          <Link href="/terms" className="hover:text-zinc-800 hover:underline">
            서비스 이용약관
          </Link>
          <Link href="/privacy" className="hover:text-zinc-800 hover:underline">
            개인정보처리방침
          </Link>
        </nav>
      </div>
    </footer>
  );
}
