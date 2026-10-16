export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className="flex min-h-screen w-full min-w-0 flex-1 flex-col py-4 sm:py-6">
      {children}
    </div>
  );
}
