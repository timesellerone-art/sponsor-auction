import { Suspense } from 'react';
import { TimeslotDetail } from './TimeslotDetail';

function DetailFallback() {
  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      <div className="h-5 w-20 animate-pulse rounded bg-zinc-200" />
      <div className="mt-6 h-48 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}

async function Loader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TimeslotDetail id={id} />;
}

export default function InventoryDetailPage({
  params,
}: PageProps<'/inventory/[id]'>) {
  return (
    <Suspense fallback={<DetailFallback />}>
      <Loader params={params} />
    </Suspense>
  );
}
