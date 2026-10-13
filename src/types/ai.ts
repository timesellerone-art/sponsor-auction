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
