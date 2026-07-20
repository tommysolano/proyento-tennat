// Margen para no cerrar sesion por desfases de reloj de pocos segundos.
export const CLOCK_SKEW_MS = 30000;

/**
 * Lee la expiracion (`exp`) de un JWT sin verificar la firma. Solo sirve para
 * decidir del lado del cliente si una sesion sigue siendo teoricamente valida.
 * Devuelve el instante de expiracion en ms, o null si no se puede leer.
 */
export function tokenExpiry(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const json = JSON.parse(decoded);
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * `true` solo si el token es legible Y ya paso su expiracion (con margen). Un
 * token ilegible devuelve `false` a proposito: un 401 suelto no debe cerrar la
 * sesion salvo que podamos confirmar que el token realmente caduco.
 */
export function tokenIsExpired(token, now = Date.now()) {
  const expiry = tokenExpiry(token);
  if (expiry === null) return false;
  return now > expiry - CLOCK_SKEW_MS;
}
