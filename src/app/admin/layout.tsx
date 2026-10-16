export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className="flex w-full max-w-none min-w-0 flex-1 flex-col self-stretch">
      {children}
    </div>
  );
}
