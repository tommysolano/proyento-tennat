import { sanitize, sanitizeError } from './sanitize.js';

function write(level, event, metadata = {}) {
  const entry = sanitize({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...metadata
  });
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info(event, metadata) {
    write('info', event, metadata);
  },
  warn(event, metadata) {
    write('warn', event, metadata);
  },
  error(event, error, metadata = {}) {
    write('error', event, { ...metadata, error: sanitizeError(error) });
  }
};
