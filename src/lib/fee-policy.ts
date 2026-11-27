export const ADVERTISER_FEE_RATE = 0.15;
export const VAT_RATE = 0.1;
export const WITHHOLDING_RATE = 0.033;
export const ADVERTISER_FEE_PERCENT = Math.round(ADVERTISER_FEE_RATE * 100);
export const VAT_PERCENT = Math.round(VAT_RATE * 100);
export const WITHHOLDING_PERCENT = Math.round(WITHHOLDING_RATE * 1000) / 10;

export const CREATOR_FEE_BRACKETS = [
  { min: 0, max: 1_000_000, rate: 0.12, label: '소액 구간(100만 원 미만)' },
  { min: 1_000_000, max: 5_000_000, rate: 0.1, label: '중형 구간(100만 원 이상 ~ 500만 원 미만)' },
  { min: 5_000_000, max: Number.POSITIVE_INFINITY, rate: 0.08, label: '대형 구간(500만 원 이상)' },
] as const;

export type CreatorFeeBracket = (typeof CREATOR_FEE_BRACKETS)[number];

function asWon(value: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.round(value);
}

export function floorToTenWon(value: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value / 10) * 10;
}

export function creatorFeeBracket(amount: number): CreatorFeeBracket {
  const won = asWon(amount);
  if (won >= 5_000_000) {
    return CREATOR_FEE_BRACKETS[2];
  }
  if (won >= 1_000_000) {
    return CREATOR_FEE_BRACKETS[1];
  }
  return CREATOR_FEE_BRACKETS[0];
}

export function creatorFeeRate(amount: number) {
  if (asWon(amount) <= 0) {
    return CREATOR_FEE_BRACKETS[0].rate;
  }
  return creatorFeeBracket(amount).rate;
}

export function advertiserFeeFromBid(bidAmount: number) {
  const won = asWon(bidAmount);
  if (won <= 0) {
    return 0;
  }
  return Math.round(won * ADVERTISER_FEE_RATE);
}

export function advertiserPayableAmount(bidAmount: number) {
  const won = asWon(bidAmount);
  if (won <= 0) {
    return 0;
  }
  return won + advertiserFeeFromBid(won);
}

/** 광고주 공급가액(낙찰 + 15%)에 대한 부가세 10%. */
export function advertiserVatFromBid(bidAmount: number) {
  const supply = advertiserPayableAmount(bidAmount);
  if (supply <= 0) {
    return 0;
  }
  return Math.round(supply * VAT_RATE);
}

/** 광고주 결제 합계 = 공급가액(낙찰 + 15%) + 부가세 10%. */
export function advertiserTotalCharge(bidAmount: number) {
  const supply = advertiserPayableAmount(bidAmount);
  if (supply <= 0) {
    return 0;
  }
  return supply + advertiserVatFromBid(bidAmount);
}

export function creatorPlatformFeeAmount(bidAmount: number) {
  const won = asWon(bidAmount);
  if (won <= 0) {
    return 0;
  }
  return Math.round(won * creatorFeeRate(won));
}

export function creatorPayoutAmount(bidAmount: number) {
  const won = asWon(bidAmount);
  if (won <= 0) {
    return 0;
  }
  return Math.max(0, won - creatorPlatformFeeAmount(won));
}

export function creatorWithholdingAmount(bidAmount: number) {
  return Math.round(creatorPayoutAmount(bidAmount) * WITHHOLDING_RATE);
}

export function creatorBusinessVatAmount(bidAmount: number) {
  return Math.round(creatorPayoutAmount(bidAmount) * VAT_RATE);
}

export function creatorIndividualNetAmount(bidAmount: number) {
  return Math.max(0, creatorPayoutAmount(bidAmount) - creatorWithholdingAmount(bidAmount));
}

export function platformFeeFromAmount(amount: number) {
  const won = asWon(amount);
  if (won <= 0) {
    return 0;
  }
  return advertiserFeeFromBid(won) + creatorPlatformFeeAmount(won);
}

export function platformNetFeeFromBid(bidAmount: number) {
  return floorToTenWon(platformFeeFromAmount(bidAmount));
}

function recoverBidMatching(target: number, compute: (bid: number) => number) {
  const guessedTotal = Math.round(target / ((1 + ADVERTISER_FEE_RATE) * (1 + VAT_RATE)));
  const guessedSupply = Math.round(target / (1 + ADVERTISER_FEE_RATE));
  for (const guessed of [guessedTotal, guessedSupply]) {
    for (let delta = 0; delta <= 3; delta += 1) {
      const candidates = delta === 0 ? [guessed] : [guessed - delta, guessed + delta];
      for (const candidate of candidates) {
        if (candidate > 0 && compute(candidate) === target) {
          return candidate;
        }
      }
    }
  }
  return 0;
}

export function bidAmountFromAdvertiserCharge(chargeAmount: number) {
  if (typeof chargeAmount !== 'number' || !Number.isFinite(chargeAmount) || chargeAmount <= 0) {
    return 0;
  }
  const hold = asWon(chargeAmount);
  return (
    recoverBidMatching(hold, advertiserTotalCharge) ||
    recoverBidMatching(hold, advertiserPayableAmount)
  );
}

export function advertiserChargeMatchesBid(bidAmount: number, amount: number) {
  return advertiserTotalCharge(bidAmount) === amount;
}

export function bidAmountFromCreatorPayout(payoutAmount: number) {
  if (typeof payoutAmount !== 'number' || !Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    return 0;
  }
  for (const bracket of CREATOR_FEE_BRACKETS) {
    const recovered = Math.round(payoutAmount / (1 - bracket.rate));
    if (recovered <= 0) {
      continue;
    }
    if (creatorFeeRate(recovered) === bracket.rate && creatorPayoutAmount(recovered) === payoutAmount) {
      return recovered;
    }
  }
  return Math.round(payoutAmount / (1 - CREATOR_FEE_BRACKETS[0].rate));
}

export function creatorPayoutFromCharge(chargeAmount: number) {
  return creatorPayoutAmount(bidAmountFromAdvertiserCharge(chargeAmount));
}

export type FeeQuote = {
  amount: number;
  bracketLabel: string;
  creatorRate: number;
  creatorRatePercent: number;
  creatorFee: number;
  creatorPayout: number;
  individualWithholding: number;
  individualNet: number;
  businessVat: number;
  businessSupply: number;
  advertiserRate: number;
  advertiserRatePercent: number;
  advertiserFee: number;
  advertiserPayable: number;
  advertiserVat: number;
  advertiserTotal: number;
};

export function describeFeeQuote(bidAmount: number): FeeQuote {
  const amount = asWon(bidAmount);
  const bracket = creatorFeeBracket(amount);
  const creatorFee = creatorPlatformFeeAmount(amount);
  const creatorPayout = creatorPayoutAmount(amount);
  return {
    amount,
    bracketLabel: amount > 0 ? bracket.label : CREATOR_FEE_BRACKETS[0].label,
    creatorRate: amount > 0 ? bracket.rate : CREATOR_FEE_BRACKETS[0].rate,
    creatorRatePercent: Math.round((amount > 0 ? bracket.rate : CREATOR_FEE_BRACKETS[0].rate) * 100),
    creatorFee,
    creatorPayout,
    individualWithholding: creatorWithholdingAmount(amount),
    individualNet: creatorIndividualNetAmount(amount),
    businessVat: creatorBusinessVatAmount(amount),
    businessSupply: creatorPayout,
    advertiserRate: ADVERTISER_FEE_RATE,
    advertiserRatePercent: Math.round(ADVERTISER_FEE_RATE * 100),
    advertiserFee: advertiserFeeFromBid(amount),
    advertiserPayable: advertiserPayableAmount(amount),
    advertiserVat: advertiserVatFromBid(amount),
    advertiserTotal: advertiserTotalCharge(amount),
  };
}

export function formatWonAmount(value: number) {
  return `${asWon(value).toLocaleString('ko-KR')}원`;
}

function manWonLabel(won: number) {
  return `${Math.round(won / 10_000).toLocaleString('ko-KR')}만 원`;
}

export function creatorFeeShortRatesCopy() {
  return CREATOR_FEE_BRACKETS.map((bracket) => `${Math.round(bracket.rate * 100)}%`).join('/');
}

export function creatorFeePolicyCopy(separator = ' · ') {
  const parts = CREATOR_FEE_BRACKETS.map((bracket) => {
    const percent = `${Math.round(bracket.rate * 100)}%`;
    if (bracket.min <= 0) {
      return `${manWonLabel(bracket.max)} 미만 ${percent}`;
    }
    if (!Number.isFinite(bracket.max)) {
      return `${manWonLabel(bracket.min)} 이상 ${percent}`;
    }
    return `${manWonLabel(bracket.min)}~${manWonLabel(bracket.max)} 미만 ${percent}`;
  });
  return `${parts.join(separator)} (단일 구간)`;
}

export function formatFeeQuoteKorean(quote: FeeQuote) {
  if (quote.amount <= 0) {
    return '확정 지급액을 숫자로 알려주시면 구간 수수료와 세무 분기를 계산해 드립니다.';
  }
  return [
    `확정 지급액 ${formatWonAmount(quote.amount)}은 ${quote.bracketLabel}이라 크리에이터 수수료 ${quote.creatorRatePercent}%가 단일 구간으로 적용됩니다.`,
    `플랫폼 수수료 ${formatWonAmount(quote.creatorFee)}를 공제하면 ${formatWonAmount(quote.creatorPayout)}입니다.`,
    `개인 크리에이터는 사업소득 ${WITHHOLDING_PERCENT}% 원천징수 ${formatWonAmount(quote.individualWithholding)}를 추가로 떼면 실수령 ${formatWonAmount(quote.individualNet)}입니다.`,
    `사업자등록번호 검증 크리에이터는 최종 정산액(공급가) ${formatWonAmount(quote.businessSupply)}에 VAT ${VAT_PERCENT}% ${formatWonAmount(quote.businessVat)}를 별도 세금계산서로 발행하고 원천징수는 없습니다.`,
    `광고주는 같은 확정 지급액에 수수료 ${quote.advertiserRatePercent}% ${formatWonAmount(quote.advertiserFee)}를 합산한 공급가액 ${formatWonAmount(quote.advertiserPayable)}에 부가세 ${VAT_PERCENT}% ${formatWonAmount(quote.advertiserVat)}를 별도 가산해 ${formatWonAmount(quote.advertiserTotal)}를 토스페이먼츠 단건 에스크로로 결제합니다.`,
  ].join(' ');
}

const MAN_UNIT = 10_000;
const AMOUNT_PATTERNS = [
  /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+(?:\.[0-9]+)?)\s*만원/g,
  /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*만\s*원/g,
  /([0-9]{1,3}(?:,[0-9]{3})+)\s*원/g,
  /([0-9]{4,})\s*원/g,
] as const;

export function extractProposalAmounts(text: string) {
  const found = new Set<number>();
  for (const pattern of AMOUNT_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      const raw = match[1]?.replace(/,/g, '') ?? '';
      const numeric = Number(raw);
      if (Number.isFinite(numeric) && numeric > 0) {
        const won = /만/.test(match[0]) ? Math.round(numeric * MAN_UNIT) : Math.round(numeric);
        if (won >= 1_000) {
          found.add(won);
        }
      }
      match = pattern.exec(text);
    }
  }
  return [...found];
}
