import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LANDING_GUIDE, LANDING_INTRO } from '../../src/components/home/landing-audience';

const FORBIDDEN = [
  '크리에이터 3~5명과 협업',
  '여러 크리에이터와 나누어',
  '다수의 인플루언서 분산 집행',
];

function allCopy() {
  return JSON.stringify({ LANDING_INTRO, LANDING_GUIDE });
}

describe('랜딩 역할별 소개 카피', () => {
  it('광고주/크리에이터 헤드라인과 1:1 단독 매칭 기준을 고정한다', () => {
    assert.equal(
      LANDING_INTRO.advertiser.headline,
      '예산과 제품만 올리면, 핏이 맞는 크리에이터가 기획안을 제안합니다',
    );
    assert.equal(
      LANDING_INTRO.creator.headline,
      '내 채널에 어울리는 캠페인을 찾고, AI 제안서로 빠르게 스폰서십을 수주하세요',
    );
    assert.match(LANDING_GUIDE.advertiser.steps[1].title, /1:1 단독 매칭/);
    assert.match(LANDING_GUIDE.advertiser.steps[1].body, /가장 적합한 1명/);
    assert.match(LANDING_GUIDE.creator.steps[1].body, /1:1 매칭/);
  });

  it('1:N 분할 매칭 표현을 사용하지 않는다', () => {
    const copy = allCopy();
    for (const phrase of FORBIDDEN) {
      assert.equal(copy.includes(phrase), false, phrase);
    }
  });
});
