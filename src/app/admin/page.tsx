import { Suspense } from 'react';
import { connection } from 'next/server';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { getAdminBoardFromDatabase } from '@/lib/admin-payouts.server';

export const instant = false;

async function AdminDashboardGate() {
  await connection();
  const { payouts, bids, profiles } = await getAdminBoardFromDatabase();
  return (
    <AdminDashboard
      initialPayouts={payouts}
      initialBids={bids}
      initialProfiles={profiles}
    />
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-w-0 w-full max-w-none flex-1 flex-col gap-4">
          <div className="h-16 animate-pulse rounded-2xl bg-white" />
          <div className="h-64 animate-pulse rounded-2xl bg-white" />
        </div>
      }
    >
      <AdminDashboardGate />
    </Suspense>
  );
}
