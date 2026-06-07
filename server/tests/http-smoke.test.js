import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.JWT_SECRET ||= 'phase6-http-test-secret';
process.env.MEDIA_STORAGE_PROVIDER = 'local';

let server;
let baseUrl;

before(async () => {
  const { app } = await import('../src/app.js');
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test('health exposes phase 6 runtime state without requiring MongoDB', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.status, 'degraded');
  assert.equal(body.storage.provider, 'local');
  assert.equal(typeof body.jobs.dead, 'object');
  assert.equal(body.realtimeEnabled, true);
});

test('phase 6 operational endpoints require authentication', async () => {
  for (const path of [
    '/api/ops/jobs',
    '/api/ops/alerts',
    '/api/channel-configs/000000000000000000000000/diagnostics',
    '/api/messages/000000000000000000000000/media/content',
    '/api/calendars',
    '/api/appointments',
    '/api/booking-links',
    '/api/workflows',
    '/api/workflow-runs',
    '/api/forms',
    '/api/landing-pages',
    '/api/funnels',
    '/api/funnel-steps/000000000000000000000000'
  ]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 401, path);
  }
});
