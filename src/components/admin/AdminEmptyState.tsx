export function AdminEmptyState({ message }: { message?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
      <p className="text-base font-medium text-zinc-800">등록된 데이터가 없습니다</p>
      {message ? <p className="mt-2 text-sm text-zinc-500">{message}</p> : null}
    </div>
  );
}
