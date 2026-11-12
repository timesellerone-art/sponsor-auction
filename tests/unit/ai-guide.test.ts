import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getGeminiApiKey,
  guideFingerprint,
  guideToAiReport,
  isLowQualityDescription,
  parseGuidePayload,
} from '../../src/lib/ai-guide';

describe('AI 가이드 입력 가드', () => {
  it('비어 있거나 10자 미만이면 저품질이다', () => {
    assert.equal(isLowQualityDescription(''), true);
    assert.equal(isLowQualityDescription('   '), true);
    assert.equal(isLowQualityDescription('짧은설명'), true);
    assert.equal(isLowQualityDescription('비건 세럼 사용법을 영상으로 보여주세요'), false);
  });

  it('같은 자음·모음·단어 반복 테스트 문구는 차단한다', () => {
    assert.equal(isLowQualityDescription('ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ'), true);
    assert.equal(isLowQualityDescription('aaaaaaaaaa'), true);
    assert.equal(isLowQualityDescription('테스트테스트테스트테스트'), true);
    assert.equal(isLowQualityDescription('테스트 테스트 테스트 테스트'), true);
    assert.equal(
      isLowQualityDescription('비건 스킨케어 사용 전후를 15초 릴스로 보여 주세요.'),
      false,
    );
  });
});

describe('AI 가이드 JSON 정규화', () => {
  it('콘셉트 3개와 예상 효과가 있으면 통과한다', () => {
    const parsed = parseGuidePayload({
      concepts: [
        { title: '3초 훅 컷', description: '첫 장면에 제품 클로즈업을 넣고 자막으로 궁금증을 던지세요. 바로 사용샷으로 이어가세요.' },
        { title: '루틴 삽입', summary: '세안 루틴 중간에 제품을 자연스럽게 꺼내 바르세요.' },
        { title: '저장 유도 CTA', description: '마지막 2초에 저장 버튼을 가리키며 챌린지를 안내하세요.' },
      ],
      expectedEffect: '릴스 저장과 프로필 방문이 함께 늘어납니다. 예산은 1~2명 테스트 후 확장하세요.',
    });
    assert.equal(parsed?.concepts.length, 3);
    assert.equal(parsed?.concepts[1]?.description.includes('세안 루틴'), true);
    const report = guideToAiReport(parsed!);
    assert.equal(report.concepts[0]?.summary, parsed?.concepts[0]?.description);
  });

  it('콘셉트가 부족하면 거부한다', () => {
    assert.equal(
      parseGuidePayload({
        concepts: [{ title: '훅', description: '촬영하세요.' }],
        expectedEffect: '효과가 있습니다.',
      }),
      null,
    );
  });

  it('지문이 같으면 같은 캠페인으로 본다', () => {
    const input = {
      title: '비건 세럼',
      platform: 'instagram_reels',
      budget: 500000,
      description: '민감 피부를 위한 세럼 리뷰를 15초로 찍어 주세요.',
    };
    assert.equal(guideFingerprint(input), guideFingerprint({ ...input }));
    assert.notEqual(guideFingerprint(input), guideFingerprint({ ...input, budget: 600000 }));
  });

  it('placeholder Gemini 키는 없는 것으로 본다', () => {
    assert.equal(getGeminiApiKey({ GEMINI_API_KEY: '   ' }), '');
    assert.equal(getGeminiApiKey({ GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY' }), '');
    assert.equal(getGeminiApiKey({ GEMINI_API_KEY: 'real-key-value' }), 'real-key-value');
  });
});
