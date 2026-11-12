import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SUPPORT_QUICK_PROMPTS,
  buildSupportSystemPrompt,
  parseSupportModelPayload,
  quoteContextFromUserText,
  sanitizeSupportReply,
} from '../../src/lib/support-knowledge';

describe('클링크 상담 지식', () => {
  it('퀵 질문 4개와 확정 수수료 정책을 포함한다', () => {
    assert.equal(SUPPORT_QUICK_PROMPTS.length, 4);
    const prompt = buildSupportSystemPrompt();
    assert.match(prompt, /광고주: 낙찰 금액의 15%/);
    assert.match(prompt, /12%/);
    assert.match(prompt, /10%/);
    assert.match(prompt, /8%/);
    assert.match(prompt, /단일 구간/);
    assert.match(prompt, /원천징수/);
    assert.equal(prompt.includes('타임 경매'), true);
  });

  it('금액 질문에는 확정 계산 문장을 붙인다', () => {
    const context = quoteContextFromUserText('250만 원 제안하면 얼마 받나요?');
    assert.match(context, /2,500,000원/);
    assert.match(context, /10%/);
    assert.match(context, /250,000원/);
    assert.match(context, /2,175,750원/);
  });

  it('모델 JSON만 통과시킨다', () => {
    assert.equal(parseSupportModelPayload({ reply: '안내입니다', escalate: true })?.escalate, true);
    assert.equal(parseSupportModelPayload({ message: 'ok' })?.reply, 'ok');
    assert.equal(parseSupportModelPayload({}), null);
    assert.equal(parseSupportModelPayload({ reply: '{"reply":"x"}' }), null);
    assert.match(
      sanitizeSupportReply('{"reply":"잘렸습니다"}', '확정 계산: 10%'),
      /확정 계산/,
    );
  });
});
