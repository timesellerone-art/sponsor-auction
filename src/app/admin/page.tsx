import { Suspense } from 'react';
import { connection } from 'next/server';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { getAdminBoardFromDatabase } from '@/lib/admin-payouts.server';

export const instant = false;

async function AdminDashboardGate() {
  await connection();
  const { payouts, bids } = await getAdminBoardFromDatabase();
  return <AdminDashboard initialPayouts={payouts} initialBids={bids} />;
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-[1920px] min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
          <div className="h-16 animate-pulse rounded-2xl bg-white" />
          <div className="h-64 animate-pulse rounded-2xl bg-white" />
        </div>
      }
    >
      <AdminDashboardGate />
    </Suspense>
  );
}
