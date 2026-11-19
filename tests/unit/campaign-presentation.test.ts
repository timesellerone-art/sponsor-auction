import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAMPAIGN_CATEGORIES,
  SELECTABLE_CAMPAIGN_CATEGORIES,
  campaignCoverUrl,
  classifyCampaignCategory,
  displayCampaignDescription,
  isTestCampaignCopy,
  parseImageFromDescription,
  resolveCampaignCategory,
  withImageMarker,
} from '../../src/lib/campaign-presentation';

test('테크·앱 키워드는 반려동물보다 우선한다', () => {
  assert.equal(classifyCampaignCategory('똑똑한 가계부 앱', '가계 관리 숏폼'), 'tech');
  assert.equal(classifyCampaignCategory('핀테크 앱 X 스레드 체험단', '해외송금 수수료 비교'), 'tech');
  assert.equal(classifyCampaignCategory('SaaS 노트북 리뷰', '스마트폰 화면 녹화'), 'tech');
});

test('반려동물·뷰티·푸드 키워드는 카테고리에 맞게 분류된다', () => {
  assert.equal(classifyCampaignCategory('강아지 매트 리뷰', '배변매트 사용 후기'), 'pet');
  assert.equal(classifyCampaignCategory('시카 앰플 15초 릴스', '스킨케어 클로즈업'), 'beauty');
  assert.equal(classifyCampaignCategory('그래놀라 홈카페', '브런치와 커피'), 'food');
});

test('업로드 이미지가 있으면 카테고리 기본 커버보다 우선한다', () => {
  const uploaded = 'https://cdn.example.com/product.jpg';
  assert.equal(
    campaignCoverUrl({
      id: 'auc-app',
      title: '가계부 앱 캠페인',
      description: '가계부 앱 사용 숏폼',
      imageUrl: uploaded,
    }),
    uploaded,
  );
});

test('공식 분야는 전체 포함 8종이다', () => {
  assert.equal(CAMPAIGN_CATEGORIES.length, 8);
  assert.deepEqual(
    CAMPAIGN_CATEGORIES.map((item) => item.label),
    [
      '전체',
      '뷰티·패션',
      '푸드·카페',
      '테크·앱',
      '리빙·인테리어',
      '반려동물',
      '헬스·운동',
      '육아·라이프',
    ],
  );
  assert.equal(SELECTABLE_CAMPAIGN_CATEGORIES.length, 7);
});

test('육아·라이프 키워드와 저장된 분야를 우선한다', () => {
  assert.equal(classifyCampaignCategory('육아템 리뷰', '기저귀 교체 숏폼'), 'parenting');
  assert.equal(
    resolveCampaignCategory({
      title: '강아지 매트',
      description: '배변매트',
      category: 'parenting',
    }),
    'parenting',
  );
  assert.equal(
    displayCampaignDescription('콘텐츠 분야: 육아·라이프\n\n이유식 루틴 브이로그'),
    '이유식 루틴 브이로그',
  );
});

test('image_url 컬럼이 없어도 설명 마커로 대표 사진을 복원한다', () => {
  const uploaded = 'https://cdn.example.com/cover-육아.jpg';
  const marked = withImageMarker('콘텐츠 분야: 육아·라이프\n\n기저귀 루틴 숏폼', uploaded);
  assert.equal(parseImageFromDescription(marked), uploaded);
  assert.equal(displayCampaignDescription(marked), '기저귀 루틴 숏폼');
  assert.equal(
    campaignCoverUrl({
      id: 'auc-parenting',
      title: '육아템 리뷰',
      description: marked,
    }),
    uploaded,
  );
});

test('키보드 연타·한글 자모 장난 입력은 테스트 캠페인으로 본다', () => {
  assert.equal(isTestCampaignCopy('ㄴㅁㄹㅇㄴㅁㄹㅇ', '테스트'), true);
  assert.equal(isTestCampaignCopy('xdcgvsdf', '설명'), true);
  assert.equal(isTestCampaignCopy('미나어재어나ㅓ이미마넝', '캠페인'), true);
  assert.equal(isTestCampaignCopy('qwesadzxcvgfhjhgjnxfgbhcfgbcd', '캠페인'), true);
  assert.equal(isTestCampaignCopy('니ㅏ어린ㄴㄴ', '캠페인'), true);
  assert.equal(
    isTestCampaignCopy(
      '강아지 슬개골 보호 논슬립 거실 매트 언박싱 및 적응기',
      '미끄러운 마루 바닥에서 우다다 뛰어다니는 소형견',
    ),
    false,
  );
  assert.equal(isTestCampaignCopy('여름 무알콜 맥주 숏폼 캠페인', '20대 타깃 무알콜 맥주 신제품 론칭'), false);
  assert.equal(isTestCampaignCopy('여름 신제품', '캠페인 목적 납품형식을 적어 주세요'), false);
});

test('가계부 앱 기본 커버는 동물이 아니다', () => {
  const cover = campaignCoverUrl({
    id: 'auc-app',
    title: '똑똑한 가계부 앱',
    description: '가계부 앱 온보딩 숏폼',
  });
  assert.match(cover, /\/covers\/tech\.jpg/);
  assert.doesNotMatch(cover, /\/covers\/pet\.jpg|\/covers\/default-cat\.jpg/);
});
