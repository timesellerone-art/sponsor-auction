export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className="flex w-full min-w-0 max-w-none flex-1 flex-col overflow-x-clip px-2 py-4 sm:px-4 sm:py-6">
      {children}
    </div>
  );
}
