import { Suspense } from 'react';
import { connection } from 'next/server';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

export const instant = false;

async function AdminDashboardGate() {
  await connection();
  return <AdminDashboard />;
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
          <div className="h-16 animate-pulse rounded-2xl bg-white" />
          <div className="h-64 animate-pulse rounded-2xl bg-white" />
        </div>
      }
    >
      <AdminDashboardGate />
    </Suspense>
  );
}
