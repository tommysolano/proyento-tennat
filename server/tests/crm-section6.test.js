import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import mongoose from 'mongoose';
import { CommercialRelation } from '../src/models/CommercialRelation.js';
import { CrmList } from '../src/models/CrmList.js';
import { Opportunity } from '../src/models/Opportunity.js';
import { Tag } from '../src/models/Tag.js';
import { UserViewPreference } from '../src/models/UserViewPreference.js';
import {
  normalizeObjectIdArray,
  sanitizeVisibleColumns,
  tagScopeFilter
} from '../src/utils/crmOrganization.js';

const ids = Array.from({ length: 8 }, () => new mongoose.Types.ObjectId());

test('CRM lists support contact and opportunity bases with tenant indexes', async () => {
  const contactList = new CrmList({
    companyId: ids[0],
    distributorId: ids[1],
    name: 'Prospectos prioritarios',
    entityType: 'contact',
    createdBy: ids[4]
  });
  await contactList.validate();

  const opportunityList = new CrmList({
    companyId: ids[0],
    name: 'Renovaciones',
    entityType: 'opportunity',
    createdBy: ids[4]
  });
  await opportunityList.validate();
  assert.equal(opportunityList.entityType, 'opportunity');
  assert.equal(
    CrmList.schema.indexes().some(([fields]) => fields.companyId === 1 && fields.entityType === 1),
    true
  );
});

test('bulk CRM IDs reject empty, invalid and oversized payloads', () => {
  assert.deepEqual(
    normalizeObjectIdArray([ids[0], String(ids[0]), ids[1]]),
    [String(ids[0]), String(ids[1])]
  );
  assert.throws(() => normalizeObjectIdArray([]), /arreglo no vacio/);
  assert.throws(() => normalizeObjectIdArray(['']), /invalidos o vacios/);
  assert.throws(() => normalizeObjectIdArray(['no-es-object-id']), /invalidos o vacios/);
  assert.throws(
    () => normalizeObjectIdArray(Array.from({ length: 501 }, () => new mongoose.Types.ObjectId())),
    /maximo de 500/
  );
});

test('visible columns are sanitized per module and keep required personal fields', () => {
  assert.deepEqual(
    sanitizeVisibleColumns('contacts', ['email', 'unknown', 'status']),
    ['name', 'assignedTo', 'status', 'action', 'email']
  );
  assert.deepEqual(
    sanitizeVisibleColumns('opportunities', ['tags', 'value']),
    ['title', 'assignedTo', 'status', 'action', 'tags', 'value']
  );
  assert.throws(() => sanitizeVisibleColumns('billing', []), /Modulo/);
});

test('view preferences are personal by company, user, module and view', async () => {
  const preference = new UserViewPreference({
    companyId: ids[0],
    userId: ids[1],
    module: 'contacts',
    visibleColumns: ['name', 'status']
  });
  await preference.validate();
  const uniqueIndex = UserViewPreference.schema.indexes().find(([, options]) => options.unique);
  assert.deepEqual(uniqueIndex[0], { companyId: 1, userId: 1, module: 1, view: 1 });
});

test('commercial relations preserve the primary opportunity contact and validate metadata', async () => {
  const relation = new CommercialRelation({
    companyId: ids[0],
    contactId: ids[1],
    opportunityId: ids[2],
    relationType: 'decision_maker',
    campaign: 'Q2',
    relatedAt: new Date(),
    createdBy: ids[3]
  });
  await relation.validate();
  assert.equal(relation.relationType, 'decision_maker');

  const opportunity = new Opportunity({
    companyId: ids[0],
    contactId: ids[1],
    pipelineId: ids[2],
    stageId: ids[3],
    title: 'Compra anual',
    tags: [ids[4]],
    lists: [ids[6]],
    createdBy: ids[5]
  });
  await opportunity.validate();
  assert.equal(String(opportunity.contactId), String(ids[1]));
  assert.deepEqual(opportunity.tags.map(String), [String(ids[4])]);
  assert.deepEqual(opportunity.lists.map(String), [String(ids[6])]);
});

test('tag scopes default legacy tags to contacts and separate opportunities', async () => {
  const legacyTag = new Tag({
    companyId: ids[0],
    name: 'VIP',
    normalizedName: 'vip',
    createdBy: ids[1]
  });
  await legacyTag.validate();
  assert.equal(legacyTag.scope, 'contact');
  assert.deepEqual(tagScopeFilter('opportunity'), { scope: 'opportunity' });
  assert.equal(tagScopeFilter('contact').$or.length, 3);
});

test('CRM organization routes enforce tenant scope, module scope and all-or-nothing bulk updates', () => {
  const organizationRoutes = readFileSync(
    new URL('../src/routes/crmOrganizationRoutes.js', import.meta.url),
    'utf8'
  );
  const contactRoutes = readFileSync(
    new URL('../src/routes/contactRoutes.js', import.meta.url),
    'utf8'
  );
  const opportunityRoutes = readFileSync(
    new URL('../src/routes/opportunityRoutes.js', import.meta.url),
    'utf8'
  );

  assert.match(organizationRoutes, /companyId: user\.companyId/);
  assert.match(organizationRoutes, /resources\.length !== normalized\.length/);
  assert.match(organizationRoutes, /contact:\s*\{/);
  assert.match(organizationRoutes, /opportunity:\s*\{/);
  assert.match(organizationRoutes, /Esta relacion comercial ya existe/);
  assert.match(organizationRoutes, /requireModule\('contacts'\)/);
  assert.match(organizationRoutes, /requireModule\('opportunities'\)/);
  assert.match(contactRoutes, /La lista no pertenece a contactos/);
  assert.match(contactRoutes, /tagScopeFilter\('contact'\)/);
  assert.match(opportunityRoutes, /La lista no pertenece a oportunidades/);
  assert.match(opportunityRoutes, /tagScopeFilter\('opportunity'\)/);
});
