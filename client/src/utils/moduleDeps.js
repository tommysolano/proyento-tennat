// Logica de dependencias entre modulos calculada desde el registro que envia el
// backend (cada modulo trae `requires` y `recommends`). Es una conveniencia de
// UI para cascada y avisos; la VERDAD del estado efectivo es el diagnostico del
// backend, no esto.

/** Indexa una lista de modulos por su key. */
export function indexModules(modules = []) {
  return new Map(modules.map((module) => [module.key, module]));
}

/** Requires duros de un modulo que NO estan habilitados en `enabledKeys`. */
export function missingRequires(moduleKey, modules = [], enabledKeys = new Set()) {
  const byKey = indexModules(modules);
  const seen = new Set();
  const walk = (key) => {
    for (const dependency of byKey.get(key)?.requires || []) {
      if (seen.has(dependency)) continue;
      seen.add(dependency);
      walk(dependency);
    }
  };
  walk(moduleKey);
  return [...seen].filter((key) => !enabledKeys.has(key));
}

/** Recommends de un modulo que no estan habilitados (aviso suave, no bloquea). */
export function missingRecommends(moduleKey, modules = [], enabledKeys = new Set()) {
  const byKey = indexModules(modules);
  return (byKey.get(moduleKey)?.recommends || []).filter((key) => !enabledKeys.has(key));
}

/** Modulos habilitados que dependen (duro) de `moduleKey`: se rompen si se apaga. */
export function enabledDependents(moduleKey, modules = [], enabledKeys = new Set()) {
  return modules
    .filter((module) => (module.requires || []).includes(moduleKey) && enabledKeys.has(module.key))
    .map((module) => module.key);
}

/** Nombre legible de un modulo por su key. */
export function moduleLabel(key, modules = []) {
  return indexModules(modules).get(key)?.name || key;
}
