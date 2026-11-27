import { Suspense } from 'react';
import { redirect } from 'next/navigation';

function DetailFallback() {
  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      <div className="h-5 w-20 animate-pulse rounded bg-zinc-200" />
      <div className="mt-6 h-40 animate-pulse rounded-2xl bg-clink-peach" />
      <div className="mt-5 h-48 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}

async function CampaignDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/auctions/${id}`);
  return null;
}

export default function CampaignDetailAliasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<DetailFallback />}>
      <CampaignDetailLoader params={params} />
    </Suspense>
  );
}
