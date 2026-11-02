import { readFile } from 'node:fs/promises';
import ts from 'typescript';

function moduleUrl(source) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}

const motionUrl = moduleUrl(await readFile(new URL('../lib/enemy-motion.ts', import.meta.url), 'utf8'));
const directorUrl = moduleUrl(await readFile(new URL('../lib/combat-director.ts', import.meta.url), 'utf8'));
const tests = (await readFile(new URL('../tests/combat-director.test.ts', import.meta.url), 'utf8'))
  .replaceAll("'../lib/enemy-motion'", JSON.stringify(motionUrl))
  .replaceAll("'../lib/combat-director'", JSON.stringify(directorUrl));
await import(moduleUrl(tests));
