/**
 * Helpers PUROS (sin imports pesados) para automatizaciones de chat:
 *  - normalizeKeyword: normaliza texto entrante para hacer matching por palabra
 *    clave de forma fiable (minusculas, sin acentos, sin puntuacion, 1 espacio).
 *  - classifyReply: clasifica una respuesta como 'yes' | 'no' | 'other' para que
 *    las condiciones de un workflow puedan bifurcar tras un paso wait_reply.
 *
 * Se mantiene aislado a proposito: lo importan tanto ConversationService (ingesta
 * de entrantes) como WorkflowService (reanudacion) sin crear ciclos de import.
 */

export function normalizeKeyword(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const YES_WORDS = [
  'si', 'sii', 'claro', 'ok', 'okey', 'dale', 'listo', 'confirmo', 'confirmado',
  'confirmar', 'asistire', 'voy', 'de acuerdo', 'perfecto', 'yes', 'sisi'
];
const NO_WORDS = [
  'no', 'nel', 'cancelar', 'cancela', 'cancelo', 'no puedo', 'no voy',
  'no asistire', 'reagendar', 'reprogramar', 'otro dia', 'negativo'
];

/** 'yes' | 'no' | 'other'. Puro y testeable. */
export function classifyReply(text) {
  const normalized = normalizeKeyword(text);
  if (!normalized) return 'other';
  if (NO_WORDS.some((word) => normalized === word || normalized.startsWith(`${word} `))) return 'no';
  if (YES_WORDS.some((word) => normalized === word || normalized.startsWith(`${word} `))) return 'yes';
  return 'other';
}

export { YES_WORDS, NO_WORDS };
