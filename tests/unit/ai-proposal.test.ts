import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFallbackProposal,
  buildProposalPrompt,
  parseProposalBody,
  parseProposalPayload,
} from '../../src/lib/ai-proposal';

describe('크리에이터 AI 제안서', () => {
  it('요청 본문을 정규화한다', () => {
    const parsed = parseProposalBody({
      campaignTitle: ' 세럼 릴스 ',
      campaignDescription: '민감 피부 후기',
      category: '뷰티·패션',
      platform: 'instagram_reels',
      creatorStyle: ' 솔직 리뷰 ',
    });
    assert.equal(parsed.campaignTitle, '세럼 릴스');
    assert.equal(parsed.creatorStyle, '솔직 리뷰');
  });

  it('프롬프트에 1:1 규칙과 Gemini 금지를 넣는다', () => {
    const prompt = buildProposalPrompt({
      campaignTitle: '세럼 릴스',
      campaignDescription: '민감 피부 후기',
      category: 'beauty',
      platform: 'instagram_reels',
      creatorStyle: '자취방 감성 브이로그',
    });
    assert.match(prompt, /한 줄 기획 콘셉트/);
    assert.match(prompt, /1:1 매칭/);
    assert.match(prompt, /Gemini라는 단어는 쓰지 마세요/);
    assert.equal(prompt.includes('3~5명'), true);
  });

  it('폴백 초안은 3단 구성이고 복수 매칭을 쓰지 않는다', () => {
    const draft = buildFallbackProposal({
      campaignTitle: '육아템 숏폼',
      campaignDescription: '기저귀 교체 루틴',
      category: 'parenting',
      platform: 'youtube_shorts',
      creatorStyle: '',
    });
    assert.match(draft, /한 줄 기획 콘셉트/);
    assert.match(draft, /촬영 및 편집 구성안/);
    assert.match(draft, /이 캠페인에 딱 맞는 이유/);
    assert.equal(draft.includes('1~2명'), false);
    assert.equal(draft.includes('Gemini'), false);
    assert.ok(draft.length >= 280);
  });

  it('JSON proposal 필드를 파싱한다', () => {
    const parsed = parseProposalPayload({
      proposal:
        '한 줄 기획 콘셉트\n훅을 넣고 본론에서 사용샷을 보여 준 뒤 엔딩 CTA로 저장을 유도합니다. 진정성 있는 리뷰로 1편의 콘텐츠에 집중합니다. 과장된 조회수 없이 실제 사용 장면을 보여 드립니다.',
    });
    assert.equal(Boolean(parsed && parsed.includes('한 줄 기획 콘셉트')), true);
  });
});
