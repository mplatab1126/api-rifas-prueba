// build-jsx.mjs — Precompila los archivos .jsx de /public a .js con esbuild.
// Se ejecuta automáticamente en cada deploy de Vercel (ver vercel.json).
// También se puede correr localmente con: npm run build

import { build } from 'esbuild';
import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

function listarJsx(dir) {
  const archivos = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) continue;
    if (nombre.endsWith('.jsx')) archivos.push(ruta);
  }
  return archivos;
}

const entradas = listarJsx(PUBLIC_DIR);

if (entradas.length === 0) {
  console.log('No se encontraron archivos .jsx para compilar.');
  process.exit(0);
}

console.log(`Compilando ${entradas.length} archivos .jsx → .js…`);

try {
  await build({
    entryPoints: entradas,
    outdir: PUBLIC_DIR,
    outExtension: { '.js': '.js' },
    loader: { '.jsx': 'jsx' },
    bundle: false,
    minify: true,
    target: ['es2018'],
    logLevel: 'info',
  });
  console.log('Build OK.');
  for (const e of entradas) {
    console.log('  ✓ ' + basename(e) + ' → ' + basename(e).replace(/\.jsx$/, '.js'));
  }
} catch (err) {
  console.error('ERROR en el build:', err.message);
  process.exit(1);
}
