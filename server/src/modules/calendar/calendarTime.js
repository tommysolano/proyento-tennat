const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function assertTimeZone(timeZone) {
  if (!isValidTimeZone(timeZone)) {
    throw Object.assign(new Error('timezone invalida'), { status: 400 });
  }
  return timeZone;
}

export function dateKeyInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDaysToDateKey(dateKey, days) {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) throw Object.assign(new Error('date debe usar YYYY-MM-DD'), { status: 400 });
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayOfWeekForDateKey(dateKey) {
  return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function zonedDateTimeToUtc(dateKey, time, timeZone) {
  const dateMatch = DATE_KEY_PATTERN.exec(dateKey);
  const timeMatch = TIME_PATTERN.exec(time);
  if (!dateMatch || !timeMatch) {
    throw Object.assign(new Error('Fecha u hora local invalida'), { status: 400 });
  }
  assertTimeZone(timeZone);
  const desired = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    0,
    0
  );
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(new Date(candidate), timeZone);
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const difference = desired - represented;
    candidate += difference;
    if (difference === 0) break;
  }
  return new Date(candidate);
}

export function dateKeysBetween(from, to, timeZone, maxDays = 370) {
  let current = dateKeyInZone(from, timeZone);
  const last = dateKeyInZone(to, timeZone);
  const result = [];
  while (current <= last && result.length < maxDays) {
    result.push(current);
    current = addDaysToDateKey(current, 1);
  }
  return result;
}

export function parseDate(value, field = 'fecha') {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error(`${field} debe ser una fecha valida`), { status: 400 });
  }
  return date;
}

export function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}
