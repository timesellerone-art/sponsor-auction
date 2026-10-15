import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col justify-center overflow-x-clip px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-teal-800">페이지를 찾을 수 없음</p>
        <h1 className="mt-2 text-xl font-bold text-zinc-950">요청하신 주소가 없습니다</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          주소가 바뀌었거나 삭제된 페이지일 수 있습니다. 홈에서 캠페인을 다시 찾아 주세요.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
        >
          홈으로 이동
        </Link>
      </div>
    </div>
  );
}
