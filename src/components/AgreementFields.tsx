'use client';

import Link from 'next/link';

type AgreementFieldsProps = {
  agreeTerms: boolean;
  agreePrivacy: boolean;
  onTermsChange: (value: boolean) => void;
  onPrivacyChange: (value: boolean) => void;
  termsError?: string;
  privacyError?: string;
};

export function AgreementFields({
  agreeTerms,
  agreePrivacy,
  onTermsChange,
  onPrivacyChange,
  termsError,
  privacyError,
}: AgreementFieldsProps) {
  return (
    <div
      id="bid-agreements"
      className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3"
    >
      <label className="flex items-start gap-2 text-sm text-zinc-800">
        <input
          type="checkbox"
          checked={agreeTerms}
          onChange={(event) => onTermsChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-teal-700"
          aria-label="서비스 이용약관에 동의합니다"
        />
        <span>
          <Link
            href="/terms"
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="font-semibold text-teal-800 hover:underline"
          >
            서비스 이용약관
          </Link>
          에 동의합니다 (필수)
        </span>
      </label>
      {termsError ? (
        <p className="pl-6 text-xs text-rose-600" role="alert">
          {termsError}
        </p>
      ) : null}

      <label className="flex items-start gap-2 text-sm text-zinc-800">
        <input
          type="checkbox"
          checked={agreePrivacy}
          onChange={(event) => onPrivacyChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-teal-700"
          aria-label="개인정보처리방침에 동의합니다"
        />
        <span>
          <Link
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="font-semibold text-teal-800 hover:underline"
          >
            개인정보처리방침
          </Link>
          에 동의합니다 (필수)
        </span>
      </label>
      {privacyError ? (
        <p className="pl-6 text-xs text-rose-600" role="alert">
          {privacyError}
        </p>
      ) : null}
    </div>
  );
}
