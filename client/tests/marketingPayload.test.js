import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeMarketingPayload } from '../src/utils/marketingPayload.js';

test('normalizes blank optional marketing ObjectIds without mutating other strings', () => {
  const payload = {
    name: '',
    settings: {
      entryStepId: '',
      nextStepId: '  ',
      redirectUrl: ''
    },
    formId: '',
    addTags: ['', '507f1f77bcf86cd799439011', null]
  };

  assert.deepEqual(normalizeMarketingPayload(payload), {
    name: '',
    settings: {
      entryStepId: null,
      nextStepId: null,
      redirectUrl: ''
    },
    formId: null,
    addTags: ['507f1f77bcf86cd799439011']
  });
  assert.equal(payload.settings.entryStepId, '');
});
