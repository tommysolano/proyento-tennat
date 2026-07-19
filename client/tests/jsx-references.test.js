import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function jsxFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) return jsxFiles(fullPath);
    return fullPath.endsWith('.jsx') ? [fullPath] : [];
  });
}

/** Nombres que el archivo importa, declara localmente o recibe destructurados. */
function declaredNames(source) {
  const names = new Set(['Fragment', 'React']);

  for (const match of source.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/gm)) {
    const clause = match[1];
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const alias = part.includes(' as ') ? part.split(' as ')[1] : part;
        const name = alias.trim();
        if (name) names.add(name);
      }
    }
    const defaultImport = clause.replace(/\{[\s\S]*?\}/g, '').replace(/,/g, ' ').trim();
    for (const part of defaultImport.split(/\s+/)) {
      const name = part.replace(/^\*$/, '').replace(/^as$/, '').trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }

  for (const pattern of [
    /(?:^|\s)function\s+([A-Z][\w$]*)/g,
    /(?:const|let|var)\s+([A-Z][\w$]*)\s*=/g,
    /class\s+([A-Z][\w$]*)/g
  ]) {
    for (const match of source.matchAll(pattern)) names.add(match[1]);
  }

  // Componentes recibidos por props y renderizados: `const { icon: Icon } = props`
  // o `{ icon: Icon = Inbox }` en la firma.
  for (const match of source.matchAll(/:\s*([A-Z][\w$]*)\s*(?:=|[,}])/g)) {
    names.add(match[1]);
  }

  // Destructuring de arrays: `.map(([label, value, Icon]) => ...)`.
  for (const match of source.matchAll(/\[([^[\]]*)\]\s*(?:\)?\s*=>|=)/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim();
      if (/^[A-Z][\w$]*$/.test(name)) names.add(name);
    }
  }

  return names;
}

/** Componentes usados en JSX: `<Foo`, `</Foo`, `<Foo.Bar`. */
function usedComponents(source) {
  const used = new Set();
  for (const match of source.matchAll(/<\/?([A-Z][\w$]*)/g)) used.add(match[1]);
  return used;
}

test('todo componente JSX usado esta importado o declarado en su archivo', () => {
  const problems = [];

  for (const file of jsxFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    const declared = declaredNames(source);
    for (const component of usedComponents(source)) {
      if (!declared.has(component)) {
        problems.push(`${file.slice(SRC.length + 1)}: <${component}>`);
      }
    }
  }

  assert.deepEqual(
    problems,
    [],
    `Componentes JSX sin import ni declaracion:\n${problems.join('\n')}`
  );
});
