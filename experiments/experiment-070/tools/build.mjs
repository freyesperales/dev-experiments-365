// Inlines core.cjs into template.html -> index.html (single self-contained file).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = readFileSync(join(root, 'core.cjs'), 'utf8').replace(/<\/script/gi, '<\\/script');
const tpl = readFileSync(join(root, 'template.html'), 'utf8');
if (!tpl.includes('/*CORE*/')) throw new Error('template missing /*CORE*/ marker');
writeFileSync(join(root, 'index.html'), tpl.replace('/*CORE*/', () => core));
console.log('built index.html', (tpl.length + core.length), 'bytes');
