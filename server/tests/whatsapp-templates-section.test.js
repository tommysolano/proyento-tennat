import assert from 'node:assert/strict';
import test from 'node:test';
import { ChannelConfig } from '../src/models/ChannelConfig.js';
import { MessageTemplate, metaCategoryFromMessageCategory } from '../src/models/MessageTemplate.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import {
  TemplateSyncService,
  buildComponents,
  buildOutboundTemplate,
  metaCategoryFor,
  mapMetaStatus,
  normalizeName,
  validateForRegister,
  reconcileTemplates,
  assertCloudAccountForTemplate
} from '../src/modules/communications/TemplateSyncService.js';

const COMPANY = 'aaaaaaaaaaaaaaaaaaaaaaaa';

// ---- Stub en memoria compartido (sin base de datos) ----
function matchesCondition(value, condition) {
  if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
    if ('$ne' in condition) return String(value ?? '') !== String(condition.$ne ?? '');
    if ('$in' in condition) return condition.$in.some((item) => String(item) === String(value ?? ''));
  }
  return String(value ?? '') === String(condition ?? '');
}
function matchesFilter(doc, filter = {}) {
  return Object.entries(filter).every(([key, condition]) => matchesCondition(doc[key], condition));
}
function channelDoc(raw) {
  return {
    ...raw,
    getDecryptedCredentials: () => raw.credentials || {},
    save: async function save() { return this; }
  };
}
function channelQuery(list, one) {
  const q = {
    select: () => q,
    sort: () => q,
    then: (resolve, reject) => Promise.resolve(one ? list[0] || null : list).then(resolve, reject),
    catch: (reject) => Promise.resolve(one ? list[0] || null : list).catch(reject)
  };
  return q;
}
function stubChannelConfig(docs) {
  const collection = docs.map(channelDoc);
  const originals = { findOne: ChannelConfig.findOne, find: ChannelConfig.find };
  ChannelConfig.findOne = (filter) => channelQuery(collection.filter((d) => matchesFilter(d, filter)), true);
  ChannelConfig.find = (filter) => channelQuery(collection.filter((d) => matchesFilter(d, filter)), false);
  return () => Object.assign(ChannelConfig, originals);
}

const COMPLETE_CLOUD = {
  _id: 'cfg1',
  companyId: COMPANY,
  distributorId: null,
  channel: 'whatsapp_cloud',
  status: 'connected',
  isDefault: true,
  phoneNumberId: 'PN1',
  externalBusinessId: 'WABA1',
  createdBy: 'user1',
  credentials: { accessToken: 'token' }
};

function draftTemplate(overrides = {}) {
  return {
    _id: 'tpl1',
    companyId: COMPANY,
    distributorId: null,
    name: 'Confirmacion de Cita',
    channel: 'whatsapp_cloud',
    type: 'whatsapp_template',
    language: 'es',
    messageCategory: 'commercial',
    metaCategory: 'UTILITY',
    content: 'Hola {{1}}, tu cita es el {{2}}.',
    headerType: 'text',
    headerText: 'Recordatorio',
    footer: 'Equipo',
    buttons: [
      { type: 'quick_reply', text: 'Confirmar' },
      { type: 'url', text: 'Ver', url: 'https://x.co' },
      { type: 'phone', text: 'Llamar', phone: '+593999' }
    ],
    variables: ['1', '2'],
    variableSamples: [
      { key: '1', example: 'Juan' },
      { key: '2', example: 'lunes' }
    ],
    providerTemplateId: '',
    status: 'draft',
    createdBy: 'user1',
    saved: false,
    async save() { this.saved = true; return this; },
    ...overrides
  };
}

// ---- Helpers puros ----

test('buildComponents arma HEADER/BODY/FOOTER/BUTTONS con ejemplos', () => {
  const components = buildComponents(draftTemplate());
  const byType = Object.fromEntries(components.map((component) => [component.type, component]));

  assert.equal(byType.HEADER.format, 'TEXT');
  assert.equal(byType.BODY.text, 'Hola {{1}}, tu cita es el {{2}}.');
  assert.deepEqual(byType.BODY.example.body_text, [['Juan', 'lunes']]);
  assert.equal(byType.FOOTER.text, 'Equipo');
  assert.equal(byType.BUTTONS.buttons.length, 3);
  assert.deepEqual(byType.BUTTONS.buttons[0], { type: 'QUICK_REPLY', text: 'Confirmar' });
  assert.deepEqual(byType.BUTTONS.buttons[1], { type: 'URL', text: 'Ver', url: 'https://x.co' });
  assert.deepEqual(byType.BUTTONS.buttons[2], { type: 'PHONE_NUMBER', text: 'Llamar', phone_number: '+593999' });
});

test('buildComponents usa header_handle para cabecera de media', () => {
  const components = buildComponents(draftTemplate({ headerType: 'image', headerMediaUrl: 'https://img' }));
  const header = components.find((component) => component.type === 'HEADER');
  assert.equal(header.format, 'IMAGE');
  assert.deepEqual(header.example.header_handle, ['https://img']);
});

test('mapeo de categorias y estados alineado a Meta', () => {
  assert.equal(metaCategoryFromMessageCategory('commercial'), 'MARKETING');
  assert.equal(metaCategoryFromMessageCategory('transactional'), 'UTILITY');
  assert.equal(metaCategoryFor({ metaCategory: 'AUTHENTICATION' }), 'AUTHENTICATION');
  assert.equal(metaCategoryFor({ messageCategory: 'commercial' }), 'MARKETING');

  assert.equal(mapMetaStatus('APPROVED'), 'approved');
  assert.equal(mapMetaStatus('PENDING'), 'pending');
  assert.equal(mapMetaStatus('REJECTED'), 'rejected');
  assert.equal(mapMetaStatus('PAUSED'), 'disabled');
  assert.equal(mapMetaStatus('lo-que-sea'), 'pending');
});

test('normalizeName produce snake_case sin espacios', () => {
  assert.equal(normalizeName('Confirmacion de Cita'), 'confirmacion_de_cita');
  assert.equal(normalizeName('  Hola--Mundo!! '), 'hola_mundo');
});

test('validateForRegister exige ejemplos por variable', () => {
  const missing = validateForRegister(draftTemplate({ variableSamples: [{ key: '1', example: 'Juan' }] }));
  assert.equal(missing.valid, false);
  assert.match(missing.errors.join(' '), /\{\{2\}\}/);

  const ok = validateForRegister(draftTemplate());
  assert.equal(ok.valid, true);
  assert.equal(ok.normalizedName, 'confirmacion_de_cita');
});

test('assertCloudAccountForTemplate rechaza QR con error claro y acepta cloud', () => {
  assert.throws(() => assertCloudAccountForTemplate(null), /No hay un numero/);
  assert.throws(
    () => assertCloudAccountForTemplate({ channel: 'whatsapp_qr' }),
    /El numero QR no admite plantillas/
  );
  const account = { channel: 'whatsapp_cloud' };
  assert.equal(assertCloudAccountForTemplate(account), account);
});

test('buildOutboundTemplate sustituye valores y cae a ejemplos', () => {
  const template = draftTemplate();
  const withValues = buildOutboundTemplate(template, { 1: 'Ana', 2: 'martes' });
  const body = withValues.components.find((component) => component.type === 'body');
  assert.deepEqual(body.parameters.map((parameter) => parameter.text), ['Ana', 'martes']);

  const fallback = buildOutboundTemplate(template, {});
  const fallbackBody = fallback.components.find((component) => component.type === 'body');
  assert.deepEqual(fallbackBody.parameters.map((parameter) => parameter.text), ['Juan', 'lunes']);
});

test('reconcileTemplates actualiza existentes, importa nuevas y marca rechazadas con motivo', () => {
  const locals = [
    { _id: 'L1', name: 'promo', language: 'es', providerTemplateId: '', status: 'pending' }
  ];
  const remotes = [
    { name: 'promo', language: 'es', status: 'APPROVED', providerTemplateId: 'PT9', components: [] },
    {
      name: 'aviso_nuevo',
      language: 'es',
      status: 'REJECTED',
      rejectedReason: 'Contenido no permitido',
      components: [{ type: 'BODY', text: 'x' }]
    }
  ];
  const { updates, imports } = reconcileTemplates(locals, remotes);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].localId, 'L1');
  assert.equal(updates[0].changes.status, 'approved');
  assert.equal(updates[0].changes.providerTemplateId, 'PT9');

  assert.equal(imports.length, 1);
  assert.equal(imports[0].name, 'aviso_nuevo');
  assert.equal(imports[0].status, 'rejected');
  assert.equal(imports[0].rejectionReason, 'Contenido no permitido');
});

test('parseStatusChanges extrae message_template_status_update con motivo', () => {
  const payload = {
    entry: [
      {
        changes: [
          { field: 'messages', value: {} },
          {
            field: 'message_template_status_update',
            value: {
              message_template_id: '123',
              message_template_name: 'promo',
              message_template_language: 'es',
              event: 'REJECTED',
              reason: 'INVALID_FORMAT'
            }
          }
        ]
      }
    ]
  };
  const changes = TemplateSyncService.parseStatusChanges(payload);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].status, 'rejected');
  assert.equal(changes[0].reason, 'INVALID_FORMAT');
  assert.equal(changes[0].providerTemplateId, '123');
});

// ---- Operaciones con stubs ----

test('recordSuccessfulUse incrementa usageCount y es no-op sin plantilla', async (t) => {
  const calls = [];
  const original = MessageTemplate.updateOne;
  MessageTemplate.updateOne = async (filter, update) => { calls.push({ filter, update }); return { modifiedCount: 1 }; };
  t.after(() => { MessageTemplate.updateOne = original; });

  assert.equal(await TemplateSyncService.recordSuccessfulUse(null, COMPANY), false);
  assert.equal(calls.length, 0);

  assert.equal(await TemplateSyncService.recordSuccessfulUse('tpl1', COMPANY), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].update, { $inc: { usageCount: 1 } });
});

test('registerTemplate registra en Meta y persiste providerTemplateId/estado', async (t) => {
  const template = draftTemplate();
  const originalFindOne = MessageTemplate.findOne;
  const originalActivity = ActivityLog.create;
  MessageTemplate.findOne = async () => template;
  ActivityLog.create = async (doc) => doc;
  const restoreChannel = stubChannelConfig([COMPLETE_CLOUD]);
  t.after(() => {
    MessageTemplate.findOne = originalFindOne;
    ActivityLog.create = originalActivity;
    restoreChannel();
  });

  let captured = null;
  const adapter = {
    async createMessageTemplate(args) {
      captured = args;
      return { success: true, providerTemplateId: 'PT100', status: 'PENDING' };
    }
  };

  const result = await TemplateSyncService.registerTemplate(COMPANY, 'tpl1', { adapter });
  assert.equal(captured.name, 'confirmacion_de_cita');
  assert.equal(captured.category, 'UTILITY');
  assert.ok(captured.components.some((component) => component.type === 'BODY'));
  assert.equal(result.providerTemplateId, 'PT100');
  assert.equal(result.status, 'pending');
  assert.equal(template.saved, true);
});

test('registerTemplate reporta el campo de credencial faltante si la cuenta esta incompleta', async (t) => {
  const template = draftTemplate();
  const originalFindOne = MessageTemplate.findOne;
  MessageTemplate.findOne = async () => template;
  const restoreChannel = stubChannelConfig([{ ...COMPLETE_CLOUD, credentials: {} }]);
  t.after(() => {
    MessageTemplate.findOne = originalFindOne;
    restoreChannel();
  });

  await assert.rejects(
    () => TemplateSyncService.registerTemplate(COMPANY, 'tpl1', { adapter: { createMessageTemplate: async () => ({ success: true }) } }),
    (error) => {
      assert.equal(error.status, 400);
      assert.ok(error.missing.includes('accessToken'));
      return true;
    }
  );
});

test('syncTemplates actualiza locales e importa nuevas desde Meta', async (t) => {
  const locals = [
    { _id: 'L1', companyId: COMPANY, name: 'promo', language: 'es', channel: 'whatsapp_cloud', providerTemplateId: '', status: 'pending' }
  ];
  const updates = [];
  const creates = [];
  const originalFind = MessageTemplate.find;
  const originalUpdate = MessageTemplate.updateOne;
  const originalCreate = MessageTemplate.create;
  const originalActivity = ActivityLog.create;
  MessageTemplate.find = async () => locals;
  MessageTemplate.updateOne = async (filter, update) => { updates.push({ filter, update }); return { modifiedCount: 1 }; };
  MessageTemplate.create = async (doc) => { creates.push(doc); return doc; };
  ActivityLog.create = async (doc) => doc;
  const restoreChannel = stubChannelConfig([COMPLETE_CLOUD]);
  t.after(() => {
    MessageTemplate.find = originalFind;
    MessageTemplate.updateOne = originalUpdate;
    MessageTemplate.create = originalCreate;
    ActivityLog.create = originalActivity;
    restoreChannel();
  });

  const adapter = {
    async listMessageTemplates() {
      return {
        success: true,
        templates: [
          { name: 'promo', language: 'es', status: 'APPROVED', providerTemplateId: 'PT9', components: [] },
          {
            name: 'aviso_nuevo',
            language: 'es',
            status: 'REJECTED',
            rejectedReason: 'Motivo',
            components: [{ type: 'BODY', text: 'Cuerpo' }]
          }
        ]
      };
    }
  };

  const result = await TemplateSyncService.syncTemplates(COMPANY, { adapter });
  assert.equal(result.updated, 1);
  assert.equal(result.imported, 1);
  assert.equal(updates[0].update.$set.status, 'approved');
  assert.equal(creates[0].name, 'aviso_nuevo');
  assert.equal(creates[0].status, 'rejected');
  assert.equal(creates[0].rejectionReason, 'Motivo');
  assert.equal(creates[0].content, 'Cuerpo');
});
