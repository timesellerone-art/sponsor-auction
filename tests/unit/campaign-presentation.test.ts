import assert from 'node:assert/strict';
import test from 'node:test';
import {
  campaignCoverUrl,
  classifyCampaignCategory,
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

test('가계부 앱 기본 커버는 동물이 아니다', () => {
  const cover = campaignCoverUrl({
    id: 'auc-app',
    title: '똑똑한 가계부 앱',
    description: '가계부 앱 온보딩 숏폼',
  });
  assert.match(cover, /photo-1512941937669-90a1b58e7e9c/);
  assert.doesNotMatch(cover, /1548199973|1514888286974/);
});
