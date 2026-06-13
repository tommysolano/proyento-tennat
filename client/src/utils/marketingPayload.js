const OPTIONAL_OBJECT_ID_FIELDS = new Set([
  'assignTo',
  'pipelineId',
  'stageId',
  'bookingLinkId',
  'associatedFormId',
  'associatedBookingLinkId',
  'reviewWidgetId',
  'formId',
  'landingPageId',
  'satisfactionSurveyId',
  'nextStepId',
  'entryStepId',
  'campaignId',
  'integrationId'
]);

const OPTIONAL_OBJECT_ID_ARRAY_FIELDS = new Set([
  'addTags',
  'notifyUsers'
]);

function isBlank(value) {
  return typeof value === 'string' && value.trim() === '';
}

export function normalizeMarketingPayload(value, fieldName = '') {
  if (OPTIONAL_OBJECT_ID_FIELDS.has(fieldName) && isBlank(value)) {
    return null;
  }

  if (OPTIONAL_OBJECT_ID_ARRAY_FIELDS.has(fieldName)) {
    return Array.isArray(value)
      ? value.filter((item) => item !== null && item !== undefined && !isBlank(item))
      : [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeMarketingPayload(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeMarketingPayload(item, key)
      ])
    );
  }

  return value;
}
