import type { ReactNode } from 'react';

export function LegalDocument({
  kicker,
  title,
  updated,
  children,
}: {
  kicker: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-3xl min-w-0 flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-sm font-semibold tracking-wide text-teal-800">{kicker}</p>
      <h1 className="mt-1 text-2xl font-bold break-keep text-zinc-950 sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500">시행일 {updated}</p>
      <div className="mt-8 max-h-[70vh] space-y-6 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 text-sm leading-6 text-zinc-700 sm:p-8">
        {children}
      </div>
    </article>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}
