import { cn } from '@/lib/utils';
import type { ShowcasePlatform } from '@/components/home/showcase';

function YouTubeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M23.5 7.2a3.1 3.1 0 0 0-2.2-2.2C19.4 4.6 12 4.6 12 4.6s-7.4 0-9.3.4A3.1 3.1 0 0 0 .5 7.2 32 32 0 0 0 0 12a32 32 0 0 0 .5 4.8 3.1 3.1 0 0 0 2.2 2.2c1.9.4 9.3.4 9.3.4s7.4 0 9.3-.4a3.1 3.1 0 0 0 2.2-2.2A32 32 0 0 0 24 12a32 32 0 0 0-.5-4.8ZM9.8 15.5v-7l6.2 3.5-6.2 3.5Z"
      />
    </svg>
  );
}

function InstagramMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M8 2h8a6 6 0 0 1 6 6v8a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6Zm0 2a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4H8Zm10.2 1.3a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4ZM12 7.2A4.8 4.8 0 1 1 12 16.8 4.8 4.8 0 0 1 12 7.2Zm0 2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z"
      />
    </svg>
  );
}

function TikTokMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M14.5 3c.4 2.6 1.9 4.3 4.5 4.6v2.5c-1.5 0-2.9-.5-4.1-1.3v6.6c0 3.4-2.7 6.1-6.2 6.1S2.5 18.8 2.5 15.4c0-3.3 2.6-6 5.9-6.1v2.6c-1.8.1-3.2 1.6-3.2 3.5 0 1.9 1.6 3.5 3.5 3.5s3.5-1.6 3.5-3.5V3h2.3Z"
      />
    </svg>
  );
}

const platformIcon: Record<
  ShowcasePlatform,
  { label: string; className: string; Icon: typeof YouTubeMark }
> = {
  youtube: {
    label: 'YouTube',
    className: 'bg-[#FF0000] text-white',
    Icon: YouTubeMark,
  },
  instagram: {
    label: 'Instagram',
    className: 'bg-gradient-to-br from-amber-400 via-pink-500 to-violet-600 text-white',
    Icon: InstagramMark,
  },
  tiktok: {
    label: 'TikTok',
    className: 'bg-[#1C1917] text-white',
    Icon: TikTokMark,
  },
};

export function CreatorAvatar({
  src,
  alt,
  platform,
  size = 'md',
  className,
}: {
  src: string;
  alt: string;
  platform?: ShowcasePlatform;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const box = size === 'sm' ? 'size-7' : 'size-10';
  const badge = size === 'sm' ? 'size-3.5' : 'size-4';
  const icon = size === 'sm' ? 'size-2' : 'size-2.5';
  const meta = platform ? platformIcon[platform] : null;
  const Icon = meta?.Icon;

  return (
    <span className={cn('relative shrink-0', box, className)}>
      <img
        src={src}
        alt={alt}
        width={size === 'sm' ? 28 : 40}
        height={size === 'sm' ? 28 : 40}
        className="size-full rounded-full object-cover ring-1 ring-stone-900/10"
      />
      {meta && Icon ? (
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full ring-1 ring-white',
            badge,
            meta.className,
          )}
          title={meta.label}
        >
          <span className="sr-only">{meta.label}</span>
          <Icon className={icon} />
        </span>
      ) : null}
    </span>
  );
}
