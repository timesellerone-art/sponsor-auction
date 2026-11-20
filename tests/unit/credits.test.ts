import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyCreditRpcError } from '../../src/lib/credits';

describe('credit rpc error mapping', () => {
  it('잔액 부족은 INSUFFICIENT_CREDIT로 본다', () => {
    const error = classifyCreditRpcError('insufficient_credit');
    assert.equal(error.code, 'INSUFFICIENT_CREDIT');
    assert.match(error.message, /부족/);
  });

  it('잘못된 금액과 없는 프로필을 구분한다', () => {
    assert.equal(classifyCreditRpcError('invalid_credit_amount').code, 'INVALID_AMOUNT');
    assert.equal(classifyCreditRpcError('profile_not_found').code, 'PROFILE_NOT_FOUND');
    assert.equal(classifyCreditRpcError('invalid_credit_type').code, 'INVALID_TYPE');
  });

  it('중복 reference는 DUPLICATE_REFERENCE로 본다', () => {
    assert.equal(classifyCreditRpcError('duplicate_credit_reference').code, 'DUPLICATE_REFERENCE');
    assert.equal(
      classifyCreditRpcError(
        'duplicate key value violates unique constraint "credit_transactions_user_type_ref_idx"',
      ).code,
      'DUPLICATE_REFERENCE',
    );
  });
});
