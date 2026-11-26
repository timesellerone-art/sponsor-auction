import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SUPPORT_CHAT_MODELS,
  SUPPORT_QUICK_PROMPTS,
  answerSupportLocally,
  buildSupportSystemPrompt,
  classifyGeminiHttpStatus,
  classifyGeminiThrown,
  isOperatorSupportCase,
  matchSupportKnowledge,
  parseSupportModelPayload,
  quoteContextFromUserText,
  sanitizeSupportReply,
  supportReplyFromModelText,
} from '../../src/lib/support-knowledge';

describe('클링크 상담 지식', () => {
  it('퀵 질문 4개와 확정 수수료·화면 경로를 포함한다', () => {
    assert.equal(SUPPORT_QUICK_PROMPTS.length, 4);
    assert.match(SUPPORT_QUICK_PROMPTS[0], /광고 등록/);
    const prompt = buildSupportSystemPrompt();
    assert.match(prompt, /광고주: 낙찰 금액의 15%|광고주 15%/);
    assert.match(prompt, /12%/);
    assert.match(prompt, /10%/);
    assert.match(prompt, /8%/);
    assert.match(prompt, /단일 구간|누진 아님/);
    assert.match(prompt, /원천징수/);
    assert.match(prompt, /\+ 캠페인 등록/);
    assert.match(prompt, /마이페이지/);
    assert.match(prompt, /계정 설정/);
    assert.match(prompt, /콘텐츠 제안하기/);
    assert.equal(prompt.includes('타임 경매'), true);
    assert.match(prompt, /개인 또는 팀/);
    assert.match(prompt, /대표 계정/);
    assert.equal(prompt.includes('캠페인당 1명'), false);
    assert.match(prompt, /escalate=false/);
  });

  it('광고 등록 같은 기본 질문은 로컬 안내로 답하고 1:1로 넘기지 않는다', () => {
    const answer = matchSupportKnowledge('광고등록방법은?');
    assert.match(answer, /\+ 캠페인 등록/);
    assert.match(answer, /광고주/);
    assert.match(answer, /개인 또는 팀/);
    assert.equal(answer.includes('1명'), false);
    assert.equal(isOperatorSupportCase('광고등록방법은?'), false);
    assert.equal(answerSupportLocally('광고등록방법은?')?.escalate, false);

    const bid = matchSupportKnowledge('콘텐츠 제안하는 방법');
    assert.match(bid, /콘텐츠 제안하기/);

    const fee = matchSupportKnowledge('수수료가 궁금해요');
    assert.match(fee, /15%/);
    assert.match(fee, /12%/);

    const biz = matchSupportKnowledge('사업자등록은 어디서 하나요');
    assert.match(biz, /계정 설정/);
    assert.match(biz, /상태 조회/);

    const signup = matchSupportKnowledge('가입절차는?');
    assert.match(signup, /\/login/);
    assert.match(signup, /Google/);

    const settle = matchSupportKnowledge('정산은?');
    assert.match(settle, /정산 계좌/);

    assert.equal(isOperatorSupportCase('환불 규정이 궁금해요'), false);
    assert.equal(isOperatorSupportCase('정산이 누락됐어요'), true);
    assert.equal(isOperatorSupportCase('결제 오류로 돈이 빠졌어요'), true);
    assert.equal(isOperatorSupportCase('상담원 연결해줘'), true);
    assert.equal(isOperatorSupportCase('분쟁 신고합니다'), true);
  });

  it('금액 질문에는 확정 계산 문장을 붙인다', () => {
    const context = quoteContextFromUserText('250만 원 제안하면 얼마 받나요?');
    assert.match(context, /2,500,000원/);
    assert.match(context, /10%/);
    assert.match(context, /250,000원/);
    assert.match(context, /2,175,750원/);
    const local = answerSupportLocally('250만 원 제안하면 얼마 받나요?');
    assert.equal(local?.escalate, false);
    assert.match(local?.reply ?? '', /2,175,750원/);
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

  it('Gemini JSON·일반 텍스트를 상담 답변으로 읽고 HTTP 원인을 분류한다', () => {
    assert.equal(
      supportReplyFromModelText('{"reply":"가입은 /login 에서 합니다.","escalate":false}')?.reply.includes('/login'),
      true,
    );
    assert.equal(supportReplyFromModelText('광고주는 상단 [+ 캠페인 등록]을 누릅니다.')?.escalate, false);
    assert.equal(supportReplyFromModelText('{"oops":true}'), null);
    assert.equal(classifyGeminiHttpStatus(401), 'invalid_api_key');
    assert.equal(classifyGeminiHttpStatus(429), 'quota');
    assert.equal(classifyGeminiHttpStatus(404), 'model_not_found');
    const aborted = new Error('The operation was aborted');
    aborted.name = 'AbortError';
    assert.equal(classifyGeminiThrown(aborted), 'timeout');
    assert.equal((SUPPORT_CHAT_MODELS as readonly string[]).includes('gemini-2.5-flash'), false);
    assert.equal(SUPPORT_CHAT_MODELS[0], 'gemini-3.5-flash-lite');
  });
});
