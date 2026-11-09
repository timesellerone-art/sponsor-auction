import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateBypassContent } from '../../src/lib/moderation/bypassFilter';

describe('우회 방지 필터: 오탐 방지', () => {
  it('기획안 1번, 포트폴리오, 등록 번호는 통과한다', () => {
    for (const text of [
      '기획안 1번 안으로 촬영하겠습니다.',
      '포트폴리오 중심으로 구성합니다.',
      '등록 번호와 순번만 표기합니다.',
      '주소지 분위기만 담아 제작합니다.',
      '조회수 1200000회 평균 채널입니다.',
      '견적 1000000원 예산에 맞춥니다.',
    ]) {
      const result = validateBypassContent(text);
      assert.equal(result.isValid, true, text);
    }
  });

  it('과제 번호, 핸드폰 리뷰, 카카오뱅크 캠페인은 통과한다', () => {
    for (const text of [
      '과제 번호와 촬영 순번만 맞추겠습니다.',
      '핸드폰 리뷰 촬영 중심으로 구성합니다.',
      '카카오뱅크 모먼트 광고 톤에 맞춥니다.',
    ]) {
      const result = validateBypassContent(text);
      assert.equal(result.isValid, true, text);
    }
  });
});

describe('우회 방지 필터: 연락처·숫자 패턴', () => {
  it('표준 휴대폰 번호를 차단한다', () => {
    const result = validateBypassContent('촬영 후 010-1234-5678로 연락 주세요.');
    assert.equal(result.isValid, false);
  });

  it('공백·특수문자 삽입 꼼수를 차단한다', () => {
    const result = validateBypassContent('제 번호는 0 1 0 1 2 3 4 5 6 7 8 입니다.');
    assert.equal(result.isValid, false);
  });

  it('한글 발음 연속 표기를 차단한다', () => {
    const result = validateBypassContent('공일공일이삼사오육칠팔입니다 촬영 가능합니다.');
    assert.equal(result.isValid, false);
  });

  it('하이픈 없는 계좌·전화 연속 숫자를 차단한다', () => {
    const result = validateBypassContent('입금은 110234567890 이쪽으로 부탁합니다.');
    assert.equal(result.isValid, false);
  });
});

describe('우회 방지 필터: 메신저·직거래', () => {
  it('카톡 변형과 직거래 은어를 차단한다', () => {
    for (const text of [
      '제작 진행은 카톡으로 하면 빠릅니다.',
      '카 톡 아이디 남겨 주세요.',
      'open 카톡으로 소통합시다.',
      'ㅋㅌ으로 연락하면 됩니다.',
      'ㅋ ㅌ 아이디 남겨 주시면 촬영 가능합니다.',
      'telegram 아이디 있습니다.',
      '직거래로 정산하면 수수료가 없어요.',
      '무통장으로 개인입금 부탁드립니다.',
      '제 번호 남겨 드릴게요. 촬영은 가능합니다.',
      '계좌번호로 정산하면 됩니다. 제안 드립니다.',
    ]) {
      const result = validateBypassContent(text);
      assert.equal(result.isValid, false, text);
    }
  });

  it('유튜브 포트폴리오 링크는 허용하고 오픈카톡 링크는 막는다', () => {
    const youtube = validateBypassContent('https://youtube.com/@test', {
      allowPortfolioUrl: true,
    });
    const kakao = validateBypassContent('https://open.kakao.com/o/abc123', {
      allowPortfolioUrl: true,
    });
    assert.equal(youtube.isValid, true);
    assert.equal(kakao.isValid, false);
  });
});
