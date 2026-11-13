import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { androidChromeIntentUrl, detectInAppBrowser } from '../../src/lib/in-app-browser';

describe('인앱 브라우저 감지', () => {
  it('카카오·네이버·인스타·페이스북 인앱을 구분한다', () => {
    assert.equal(detectInAppBrowser('Mozilla/5.0 KAKAOTALK Android').inApp, true);
    assert.equal(detectInAppBrowser('Mozilla/5.0 KAKAOTALK Android').android, true);
    assert.equal(detectInAppBrowser('Mozilla/5.0 NAVER iPhone').marker, 'NAVER');
    assert.equal(detectInAppBrowser('Mozilla/5.0 Instagram iPhone').ios, true);
    assert.equal(detectInAppBrowser('Mozilla/5.0 FBAN iPhone').inApp, true);
    assert.equal(detectInAppBrowser('Mozilla/5.0 Chrome/120.0.0.0 Mobile Safari').inApp, false);
  });

  it('안드로이드는 Chrome intent URL을 만든다', () => {
    const intent = androidChromeIntentUrl('https://www.clinkapp.kr/login');
    assert.match(intent, /^intent:\/\/www\.clinkapp\.kr\/login#Intent;/);
    assert.match(intent, /package=com\.android\.chrome/);
    assert.match(intent, /S\.browser_fallback_url=https%3A%2F%2Fwww\.clinkapp\.kr%2Flogin/);
  });
});
