# TenantDesk — cliente

Aplicacion React (Vite 6 + React Router 7 + Tailwind 3). Se levanta desde la
raiz del repo con `npm run dev`, que arranca cliente y servidor a la vez.

## Sello de version del bundle

Al montar, la app imprime una linea en la consola del navegador:

```
[TenantDesk] development · build 5237521 @ 2026-07-20T04:12:33.918Z
```

- **`development` / `production`** — el modo de Vite (`import.meta.env.MODE`).
- **`5237521`** — el commit corto del que se genero el bundle.
- **`+cambios-sin-commitear`** — aparece si el arbol tenia cambios sin commitear
  al arrancar. Es lo normal mientras se desarrolla.
- **fecha ISO** — el instante en que arranco el dev server o se hizo el build.

### Para que sirve

Para responder en segundos a la pregunta "¿esto que veo en pantalla es el
codigo que acabo de escribir?". Antes de reportar un bug de interfaz:

1. Abre la consola del navegador y busca la linea `[TenantDesk]`.
2. Comparala con `git rev-parse --short HEAD` en la terminal.

Si **no coinciden**, el navegador esta ejecutando codigo viejo y el bug no es
real: reinicia el dev server y recarga con Ctrl+Shift+R. Si **coinciden**, el
bug si esta en el codigo actual y merece investigarse.

Ojo: la fecha se fija cuando arranca el dev server, no en cada recarga. Si
llevas el server encendido un rato, la fecha sera antigua aunque el codigo este
al dia — el dato que importa es el commit.

### Verificacion inequivoca sin navegador

El dev server transforma los modulos bajo demanda, asi que se le puede
preguntar directamente que esta sirviendo. Util cuando se sospecha de cache:

```bash
# ¿la tabla de empresas sirve el menu de acciones nuevo?
curl -s http://localhost:5173/src/pages/distributor/sections/DistributorCompaniesSection.jsx \
  | grep -c ActionsMenu
```

Un `0` significa que el dev server no esta sirviendo el codigo de disco. Un
numero mayor que cero significa que si, y entonces el problema esta en el
navegador (cache, pestana vieja, otro puerto).

Para las clases de Tailwind, `curl http://localhost:5173/src/styles.css`. En
dev el CSS viaja envuelto en un modulo JS, asi que las barras de las clases van
doblemente escapadas: `bg-slate-950/60` aparece como `bg-slate-950\\/60`.
Buscar la forma sin escapar da un falso negativo.
