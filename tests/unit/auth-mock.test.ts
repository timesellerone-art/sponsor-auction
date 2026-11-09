import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEMO_CREATOR_BANK_ACCOUNT,
  DEMO_CREATOR_SETTLEMENT_EMAIL,
  DEMO_PASSWORD,
  demoSessionUser,
  isDemoAccountEmail,
  isDemoCredentials,
} from '../../src/lib/auth-mock';

describe('데모 계정 헬퍼', () => {
  it('안내된 세 계정의 이메일만 데모로 본다', () => {
    assert.equal(isDemoAccountEmail('admin@demo.com'), true);
    assert.equal(isDemoAccountEmail('brand@demo.com'), true);
    assert.equal(isDemoAccountEmail('creator@demo.com'), true);
    assert.equal(isDemoAccountEmail('owner@example.com'), false);
  });

  it('비밀번호가 맞을 때만 데모 자격으로 본다', () => {
    assert.equal(isDemoCredentials('admin@demo.com', DEMO_PASSWORD), true);
    assert.equal(isDemoCredentials('admin@demo.com', 'wrong'), false);
  });

  it('데모 세션은 고정 UID와 역할을 쓴다', () => {
    const admin = demoSessionUser('admin@demo.com');
    assert.equal(admin?.id, 'usr-demo-admin');
    assert.equal(admin?.role, 'admin');
    const brand = demoSessionUser('brand@demo.com');
    assert.equal(brand?.id, 'usr-demo-advertiser');
    assert.deepEqual(brand?.roles, ['advertiser', 'creator']);
    assert.equal(brand?.currentMode, 'advertiser');
    const creator = demoSessionUser('creator@demo.com');
    assert.equal(creator?.currentMode, 'creator');
    assert.equal(creator?.email, DEMO_CREATOR_SETTLEMENT_EMAIL);
    assert.equal(DEMO_CREATOR_BANK_ACCOUNT, '신한은행 110-123-456789');
  });
});
