import assert from 'node:assert/strict';
import test from 'node:test';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { OperationalAlertService } from '../src/modules/ops/OperationalAlertService.js';
import { WhatsAppQualityService } from '../src/modules/communications/WhatsAppQualityService.js';
import { normalizeQualityRating } from '../src/modules/conversations/adapters/WhatsAppCloudAdapter.js';

function fakeConfig(overrides = {}) {
  return {
    _id: 'cfg1',
    companyId: 'company1',
    distributorId: null,
    displayName: 'WhatsApp Ventas',
    channel: 'whatsapp_cloud',
    qualityRating: 'GREEN',
    messagingLimit: 'TIER_1K',
    createdBy: 'user1',
    saved: false,
    async save() { this.saved = true; return this; },
    ...overrides
  };
}

function captureCalls(t) {
  const activities = [];
  const alerts = [];
  const origActivity = ActivityLog.create;
  const origAlert = OperationalAlertService.create;
  ActivityLog.create = async (doc) => { activities.push(doc); return doc; };
  OperationalAlertService.create = async (doc) => { alerts.push(doc); return doc; };
  t.after(() => { ActivityLog.create = origActivity; OperationalAlertService.create = origAlert; });
  return { activities, alerts };
}

test('normalizeQualityRating mapea variantes de Meta al enum', () => {
  assert.equal(normalizeQualityRating('GREEN'), 'GREEN');
  assert.equal(normalizeQualityRating('high'), 'GREEN');
  assert.equal(normalizeQualityRating('RED'), 'RED');
  assert.equal(normalizeQualityRating('LOW'), 'RED');
  assert.equal(normalizeQualityRating('lo-que-sea'), 'UNKNOWN');
});

test('worsened detecta empeoramiento y no lo confunde con mejora', () => {
  assert.equal(WhatsAppQualityService.worsened('GREEN', 'YELLOW'), true);
  assert.equal(WhatsAppQualityService.worsened('GREEN', 'RED'), true);
  assert.equal(WhatsAppQualityService.worsened('YELLOW', 'GREEN'), false);
  assert.equal(WhatsAppQualityService.worsened('UNKNOWN', 'RED'), false);
});

test('applyUpdate registra actividad cuando el rating empeora', async (t) => {
  const { activities, alerts } = captureCalls(t);
  const config = fakeConfig({ qualityRating: 'GREEN' });
  const result = await WhatsAppQualityService.applyUpdate(config, { qualityRating: 'YELLOW' });

  assert.equal(config.qualityRating, 'YELLOW');
  assert.equal(config.saved, true);
  assert.equal(result.worsened, true);
  assert.equal(activities.length, 1);
  assert.equal(activities[0].type, 'channel_quality_changed');
  assert.equal(alerts.length, 0); // YELLOW no dispara alerta
});

test('applyUpdate crea una OperationalAlert critica al pasar a RED', async (t) => {
  const { alerts } = captureCalls(t);
  const config = fakeConfig({ qualityRating: 'YELLOW' });
  await WhatsAppQualityService.applyUpdate(config, { qualityRating: 'RED' });

  assert.equal(config.qualityRating, 'RED');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, 'channel_quality_red');
  assert.equal(alerts[0].severity, 'critical');
  assert.equal(String(alerts[0].relatedId), 'cfg1');
});

test('applyUpdate no re-alerta si el rating no cambia (idempotente)', async (t) => {
  const { activities, alerts } = captureCalls(t);
  const config = fakeConfig({ qualityRating: 'RED', messagingLimit: 'TIER_1K' });
  const result = await WhatsAppQualityService.applyUpdate(config, { qualityRating: 'RED', messagingLimit: 'TIER_1K' });

  assert.equal(result.worsened, false);
  assert.equal(activities.length, 0);
  assert.equal(alerts.length, 0);
});

test('parseWebhookChanges extrae solo phone_number_quality_update', () => {
  const payload = {
    entry: [
      {
        changes: [
          { field: 'messages', value: { messages: [{ id: 'm1' }] } },
          {
            field: 'phone_number_quality_update',
            value: {
              phone_number_id: 'PN123',
              display_phone_number: '+593999',
              current_quality_rating: 'RED',
              current_limit: 'TIER_250'
            }
          }
        ]
      }
    ]
  };
  const changes = WhatsAppQualityService.parseWebhookChanges(payload);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].phoneNumberId, 'PN123');
  assert.equal(changes[0].qualityRating, 'RED');
  assert.equal(changes[0].messagingLimit, 'TIER_250');
});
