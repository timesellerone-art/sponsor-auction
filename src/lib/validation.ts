import { isDeadlinePassed } from '@/lib/auction-engine';
import { isAuctionClosed, type AuctionStatus, type PlatformType } from '@/types/auction';
import { hasOffPlatformContact } from '@/utils/filter';

export const MIN_TITLE_LENGTH = 5;
export const MIN_DESCRIPTION_LENGTH = 10;
export const MIN_PROPOSAL_LENGTH = 20;
export const MIN_EXPECTED_VIEWS = 1_000;
export const MIN_BUDGET = 10_000;
export const MAX_BUDGET = 100_000_000;
export const MAX_BID_AMOUNT = 100_000_000;

export const VALIDATION = {
  titleRequired: '제목을 입력해 주세요.',
  titleTooShort: `제목은 ${MIN_TITLE_LENGTH}자 이상 입력해 주세요.`,
  budgetRequired: '예산을 입력해 주세요.',
  budgetNotPositive: '예산은 0원 이하일 수 없습니다.',
  budgetTooLow: '최소 1만 원 이상 입력해 주세요.',
  budgetTooHigh: '예산은 1억 원을 초과할 수 없습니다.',
  descriptionRequired: '상세설명을 입력해 주세요.',
  descriptionTooShort: `상세설명은 ${MIN_DESCRIPTION_LENGTH}자 이상 입력해 주세요.`,
  deadlineRequired: '마감일을 선택해 주세요.',
  expectedViewsRequired: '예상 조회수를 입력해 주세요.',
  expectedViewsTooLow: '예상 조회수는 1,000회 이상이어야 합니다.',
  startingPriceRequired: '시작가를 입력해 주세요.',
  slotWindowInvalid: '슬롯 종료 시각은 시작 시각보다 뒤여야 합니다.',
  timeslotBidTooLow: '현재 최고가보다 높은 금액으로 입찰해 주세요.',
  bidRequired: '제안 금액을 입력해 주세요.',
  bidNotPositive: '제안 금액은 0원 이하일 수 없습니다.',
  bidTooHigh: '제안 금액은 1억 원을 초과할 수 없습니다.',
  bidOverBudget: '제안 금액이 캠페인 예산을 초과합니다.',
  proposalRequired: '제안 내용/소개글을 입력해 주세요.',
  proposalTooShort: `제안 내용/소개글은 ${MIN_PROPOSAL_LENGTH}자 이상 입력해 주세요.`,
  channelRequired: '채널 URL 또는 포트폴리오 링크를 입력해 주세요.',
  channelInvalid: 'https:// 또는 http://로 시작하는 올바른 URL을 입력해 주세요.',
  offPlatformContact:
    '전화번호, 이메일, 카카오 ID, 외부 링크 등 플랫폼 우회 연락처는 사용할 수 없습니다.',
  auctionClosed: '마감된 역경매에는 제안할 수 없습니다.',
  duplicateBid: '이미 이 역경매에 제안을 제출했습니다.',
  alreadyAwarded: '이미 낙찰 완료된 역경매입니다.',
  alreadyProcessed: '이미 처리된 요청입니다.',
  actionInFlight: '이미 처리 중입니다. 잠시만 기다려 주세요.',
  blindAuctionAward: '블라인드된 역경매는 낙찰할 수 없습니다.',
  blindAlready: '이미 블라인드 처리된 게시글입니다.',
  unblindAlready: '이미 블라인드가 해제된 게시글입니다.',
  sanctionAlready: '이미 같은 제재 상태입니다.',
  payoutAlready: '이미 승인된 정산입니다.',
  termsRequired: '서비스 이용약관에 동의해 주세요.',
  privacyRequired: '개인정보처리방침에 동의해 주세요.',
  refundRequired: '구매 조건 확인 및 환불 규정에 동의해 주세요.',
} as const;

const CHANNEL_URL_PATTERN =
  /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)$/;

export function isValidChannelUrl(value: string) {
  return CHANNEL_URL_PATTERN.test(value.trim());
}

export function parseAmount(raw: string): { empty: boolean; value: number } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { empty: true, value: Number.NaN };
  }

  const value = Number(trimmed);
  return { empty: false, value };
}

export type AuctionFieldErrors = {
  title?: string;
  budget?: string;
  description?: string;
  deadline?: string;
};

export type TimeSlotFieldErrors = {
  title?: string;
  expectedViews?: string;
  startingPrice?: string;
  description?: string;
  slotStart?: string;
  slotEnd?: string;
  deadline?: string;
};

export type BidFieldErrors = {
  creatorChannelUrl?: string;
  bidAmount?: string;
  proposalText?: string;
  agreeTerms?: string;
  agreePrivacy?: string;
};

export function validateAuctionForm(values: {
  title: string;
  budget: string;
  description: string;
  deadline: string;
}): AuctionFieldErrors {
  const errors: AuctionFieldErrors = {};
  const title = values.title.trim();
  const description = values.description.trim();
  const budget = parseAmount(values.budget);

  if (!title) {
    errors.title = VALIDATION.titleRequired;
  } else if (title.length < MIN_TITLE_LENGTH) {
    errors.title = VALIDATION.titleTooShort;
  }

  if (budget.empty) {
    errors.budget = VALIDATION.budgetRequired;
  } else if (!Number.isFinite(budget.value) || budget.value <= 0) {
    errors.budget = VALIDATION.budgetNotPositive;
  } else if (budget.value < MIN_BUDGET) {
    errors.budget = VALIDATION.budgetTooLow;
  } else if (budget.value > MAX_BUDGET) {
    errors.budget = VALIDATION.budgetTooHigh;
  }

  if (!description) {
    errors.description = VALIDATION.descriptionRequired;
  } else if (description.length < MIN_DESCRIPTION_LENGTH) {
    errors.description = VALIDATION.descriptionTooShort;
  }

  if (!values.deadline) {
    errors.deadline = VALIDATION.deadlineRequired;
  }

  return errors;
}

export function validateAuctionPayload(input: {
  title: string;
  budget: number;
  description: string;
  deadline: string;
}): string | null {
  const title = input.title.trim();
  const description = input.description.trim();

  if (!title) {
    return VALIDATION.titleRequired;
  }
  if (title.length < MIN_TITLE_LENGTH) {
    return VALIDATION.titleTooShort;
  }
  if (!Number.isFinite(input.budget) || input.budget <= 0) {
    return VALIDATION.budgetNotPositive;
  }
  if (input.budget < MIN_BUDGET) {
    return VALIDATION.budgetTooLow;
  }
  if (input.budget > MAX_BUDGET) {
    return VALIDATION.budgetTooHigh;
  }
  if (!description) {
    return VALIDATION.descriptionRequired;
  }
  if (description.length < MIN_DESCRIPTION_LENGTH) {
    return VALIDATION.descriptionTooShort;
  }
  if (!input.deadline.trim()) {
    return VALIDATION.deadlineRequired;
  }

  return null;
}

export function validateBidForm(values: {
  creatorChannelUrl: string;
  bidAmount: string;
  proposalText: string;
  auctionBudget?: number;
  agreeTerms?: boolean;
  agreePrivacy?: boolean;
}): BidFieldErrors {
  const errors: BidFieldErrors = {};
  const proposal = values.proposalText.trim();
  const amount = parseAmount(values.bidAmount);

  if (amount.empty) {
    errors.bidAmount = VALIDATION.bidRequired;
  } else if (!Number.isFinite(amount.value) || amount.value <= 0) {
    errors.bidAmount = VALIDATION.bidNotPositive;
  } else if (amount.value > MAX_BID_AMOUNT) {
    errors.bidAmount = VALIDATION.bidTooHigh;
  } else if (
    typeof values.auctionBudget === 'number' &&
    Number.isFinite(values.auctionBudget) &&
    amount.value > values.auctionBudget
  ) {
    errors.bidAmount = VALIDATION.bidOverBudget;
  }

  if (!proposal) {
    errors.proposalText = VALIDATION.proposalRequired;
  } else if (proposal.length < MIN_PROPOSAL_LENGTH) {
    errors.proposalText = VALIDATION.proposalTooShort;
  } else if (hasOffPlatformContact(proposal)) {
    errors.proposalText = VALIDATION.offPlatformContact;
  }

  if (!values.creatorChannelUrl.trim()) {
    errors.creatorChannelUrl = VALIDATION.channelRequired;
  } else if (!isValidChannelUrl(values.creatorChannelUrl)) {
    errors.creatorChannelUrl = VALIDATION.channelInvalid;
  }

  if (!values.agreeTerms) {
    errors.agreeTerms = VALIDATION.termsRequired;
  }
  if (!values.agreePrivacy) {
    errors.agreePrivacy = VALIDATION.privacyRequired;
  }

  return errors;
}

export function getBidBlockReason(auction: {
  status?: AuctionStatus;
  isBlind?: boolean;
  winnerBidId?: string | null;
  deadline?: string;
}): string | null {
  if (
    auction.isBlind ||
    Boolean(auction.winnerBidId) ||
    isAuctionClosed(auction.status) ||
    (auction.status != null && auction.status !== 'active') ||
    isDeadlinePassed(auction.deadline)
  ) {
    return VALIDATION.auctionClosed;
  }

  return null;
}

export function getAwardBlockReason(auction: {
  status?: AuctionStatus;
  isBlind?: boolean;
  winnerBidId?: string | null;
}): string | null {
  if (auction.isBlind) {
    return VALIDATION.blindAuctionAward;
  }

  if (
    Boolean(auction.winnerBidId) ||
    isAuctionClosed(auction.status) ||
    (auction.status != null && auction.status !== 'active')
  ) {
    return VALIDATION.alreadyAwarded;
  }

  return null;
}

export function validateTimeSlotPayload(input: {
  title: string;
  description: string;
  expectedViews: number;
  startingPrice: number;
  slotStart: string;
  slotEnd: string;
  deadline: string;
  platform?: PlatformType;
}): string | null {
  const title = input.title.trim();
  if (!title) {
    return VALIDATION.titleRequired;
  }
  if (title.length < MIN_TITLE_LENGTH) {
    return VALIDATION.titleTooShort;
  }
  const description = input.description.trim();
  if (!description) {
    return VALIDATION.descriptionRequired;
  }
  if (description.length < MIN_DESCRIPTION_LENGTH) {
    return VALIDATION.descriptionTooShort;
  }
  if (!Number.isFinite(input.expectedViews) || input.expectedViews <= 0) {
    return VALIDATION.expectedViewsRequired;
  }
  if (input.expectedViews < MIN_EXPECTED_VIEWS) {
    return VALIDATION.expectedViewsTooLow;
  }
  if (!Number.isFinite(input.startingPrice) || input.startingPrice <= 0) {
    return VALIDATION.startingPriceRequired;
  }
  if (input.startingPrice < MIN_BUDGET) {
    return VALIDATION.budgetTooLow;
  }
  if (input.startingPrice > MAX_BUDGET) {
    return VALIDATION.budgetTooHigh;
  }
  if (!input.slotStart.trim() || !input.slotEnd.trim()) {
    return VALIDATION.slotWindowInvalid;
  }
  const start = Date.parse(input.slotStart);
  const end = Date.parse(input.slotEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return VALIDATION.slotWindowInvalid;
  }
  if (!input.deadline.trim()) {
    return VALIDATION.deadlineRequired;
  }
  return null;
}

export function validateTimeSlotForm(values: {
  title: string;
  description: string;
  expectedViews: string;
  startingPrice: string;
  slotStart: string;
  slotEnd: string;
  deadline: string;
}): TimeSlotFieldErrors {
  const errors: TimeSlotFieldErrors = {};
  const views = parseAmount(values.expectedViews);
  const price = parseAmount(values.startingPrice);
  const payloadError = validateTimeSlotPayload({
    title: values.title,
    description: values.description,
    expectedViews: views.empty ? 0 : views.value,
    startingPrice: price.empty ? 0 : price.value,
    slotStart: values.slotStart,
    slotEnd: values.slotEnd,
    deadline: values.deadline,
  });
  if (!values.title.trim()) {
    errors.title = VALIDATION.titleRequired;
  } else if (values.title.trim().length < MIN_TITLE_LENGTH) {
    errors.title = VALIDATION.titleTooShort;
  }
  if (!values.description.trim()) {
    errors.description = VALIDATION.descriptionRequired;
  } else if (values.description.trim().length < MIN_DESCRIPTION_LENGTH) {
    errors.description = VALIDATION.descriptionTooShort;
  }
  if (views.empty) {
    errors.expectedViews = VALIDATION.expectedViewsRequired;
  } else if (views.value < MIN_EXPECTED_VIEWS) {
    errors.expectedViews = VALIDATION.expectedViewsTooLow;
  }
  if (price.empty) {
    errors.startingPrice = VALIDATION.startingPriceRequired;
  } else if (price.value < MIN_BUDGET) {
    errors.startingPrice = VALIDATION.budgetTooLow;
  } else if (price.value > MAX_BUDGET) {
    errors.startingPrice = VALIDATION.budgetTooHigh;
  }
  if (!values.slotStart || !values.slotEnd) {
    errors.slotStart = VALIDATION.slotWindowInvalid;
  } else {
    const start = Date.parse(values.slotStart);
    const end = Date.parse(values.slotEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      errors.slotEnd = VALIDATION.slotWindowInvalid;
    }
  }
  if (!values.deadline) {
    errors.deadline = VALIDATION.deadlineRequired;
  }
  if (payloadError && Object.keys(errors).length === 0) {
    errors.title = payloadError;
  }
  return errors;
}

export function validateBidPayload(input: {
  bidAmount: number;
  proposalText: string;
  creatorChannelUrl: string;
  auctionBudget?: number;
  auctionStatus?: AuctionStatus;
  isBlind?: boolean;
  winnerBidId?: string | null;
  deadline?: string;
}): string | null {
  const closedReason = getBidBlockReason({
    status: input.auctionStatus,
    isBlind: input.isBlind,
    winnerBidId: input.winnerBidId,
    deadline: input.deadline,
  });
  if (closedReason) {
    return closedReason;
  }
  if (!Number.isFinite(input.bidAmount) || input.bidAmount <= 0) {
    return VALIDATION.bidNotPositive;
  }
  if (input.bidAmount > MAX_BID_AMOUNT) {
    return VALIDATION.bidTooHigh;
  }
  if (
    typeof input.auctionBudget === 'number' &&
    Number.isFinite(input.auctionBudget) &&
    input.bidAmount > input.auctionBudget
  ) {
    return VALIDATION.bidOverBudget;
  }
  const proposal = input.proposalText.trim();
  if (!proposal) {
    return VALIDATION.proposalRequired;
  }
  if (proposal.length < MIN_PROPOSAL_LENGTH) {
    return VALIDATION.proposalTooShort;
  }
  if (hasOffPlatformContact(proposal)) {
    return VALIDATION.offPlatformContact;
  }
  if (!input.creatorChannelUrl.trim()) {
    return VALIDATION.channelRequired;
  }
  if (!isValidChannelUrl(input.creatorChannelUrl)) {
    return VALIDATION.channelInvalid;
  }

  return null;
}
