import type { PlatformType } from '@/types/auction';

export type AiConcept = {
  title: string;
  summary: string;
};

export type AiReport = {
  concepts: AiConcept[];
  expectedEffect: string;
};

export type AiAnalyzeInput = {
  title: string;
  platform: PlatformType | string;
  budget: number;
  description: string;
};

export type AiAnalyzeResponse = {
  source: 'ai' | 'fallback';
  report: AiReport;
};

export type AiGuideConcept = {
  title: string;
  description: string;
};

export type AiGuidePayload = {
  concepts: AiGuideConcept[];
  expectedEffect: string;
};

export type AiGuideRequest = {
  campaignId?: string;
  title: string;
  description: string;
  platform: PlatformType | string;
  budget: number;
};

export type AiGuideSuccessResponse = AiGuidePayload & {
  fallback: false;
  cached?: boolean;
};

export type AiGuideFallbackResponse = {
  fallback: true;
};

export type AiGuideResponse = AiGuideSuccessResponse | AiGuideFallbackResponse;
