import { AccessGuard } from '@/components/AccessGuard';

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <AccessGuard allow="admin">
      <div className="flex w-full min-w-0 max-w-none flex-1 flex-col overflow-x-clip px-2 pt-4 pb-36 sm:px-4 sm:pt-6 md:pb-8">
        {children}
      </div>
    </AccessGuard>
  );
}
