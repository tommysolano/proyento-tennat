import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/**
 * Sello de version del bundle. Sirve para distinguir en segundos "el navegador
 * ejecuta codigo viejo" de "el bug es real": si el commit que se imprime en
 * consola no coincide con el HEAD actual, lo que se ve en pantalla no es lo
 * que hay en disco.
 */
function buildStamp() {
  let commit = 'sin-git';
  let dirty = false;
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
  } catch {
    // Repositorio no disponible (CI sin .git, tarball, etc.).
  }
  return `${commit}${dirty ? '+cambios-sin-commitear' : ''} @ ${new Date().toISOString()}`;
}

/**
 * Se inyecta en el HTML en lugar de usar `define`: en dev Vite no hace
 * sustitucion textual de los define ni los agrega a `import.meta.env` (que
 * solo se alimenta de los ficheros .env), asi que el sello quedaria vacio
 * justo en desarrollo, que es donde hace falta. Via HTML funciona igual en
 * `vite dev` y en `vite build`.
 */
function buildStampPlugin() {
  const stamp = buildStamp();
  return {
    name: 'tenantdesk-build-stamp',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          injectTo: 'head-prepend',
          children: `window.__APP_BUILD__=${JSON.stringify(stamp)};`
        }
      ];
    }
  };
}

export default defineConfig({
  plugins: [react(), buildStampPlugin()],
  server: {
    port: 5173
  }
});
