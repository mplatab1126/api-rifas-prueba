/**
 * Captura la respuesta JSON de get-nodes al abrir el editor de un subflujo en ChateaPro.
 *
 * Requisitos:
 *   npm install
 *   npx playwright install chromium
 *
 * Variables de entorno:
 *   CHATEAPRO_EMAIL, CHATEAPRO_PASSWORD — login web
 *   CHATEAPRO_FLOW — default f159929
 *   CHATEAPRO_SUBFLOW_NS — default f159929s3427087 (Plantilla - hoy 7 p.m.)
 *   CHATEAPRO_HEADLESS — "0" para ver el navegador (debug)
 *
 * Salida: tmp/chateapro-subflow-<ns>-nodes.json
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const FLOW = process.env.CHATEAPRO_FLOW || 'f159929';
const SUBFLOW_NS = process.env.CHATEAPRO_SUBFLOW_NS || 'f159929s3427087';
const email = process.env.CHATEAPRO_EMAIL;
const password = process.env.CHATEAPRO_PASSWORD;
const headless = process.env.CHATEAPRO_HEADLESS !== '0';

const editorUrl = `https://chateapro.app/flow/${FLOW}#/${SUBFLOW_NS}/edit`;
const outFile = path.join(root, 'tmp', `chateapro-subflow-${SUBFLOW_NS}-nodes.json`);

if (!email || !password) {
  console.error('Faltan CHATEAPRO_EMAIL y/o CHATEAPRO_PASSWORD en el entorno.');
  process.exit(1);
}

async function tryLogin(page) {
  const candidates = [
    'https://chateapro.app/login',
    'https://chateapro.app/',
  ];

  for (const url of candidates) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    const emailSel = 'input[type="email"], input[name="email"], input#email, input[autocomplete="username"]';
    const passSel = 'input[type="password"]';
    const emailBox = page.locator(emailSel).first();
    const passBox = page.locator(passSel).first();
    try {
      await emailBox.waitFor({ state: 'visible', timeout: 8000 });
      await passBox.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      continue;
    }
    await emailBox.fill(email);
    await passBox.fill(password);
    const submit = page.locator('button[type="submit"], button:has-text("Ingresar"), button:has-text("Entrar"), button:has-text("Login")').first();
    await submit.click();
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => null);
    return true;
  }
  return false;
}

async function main() {
  let captured = null;

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('response', async (response) => {
    const u = response.url();
    if (!u.includes('get-nodes')) return;
    if (response.status() !== 200) return;
    try {
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const body = await response.json();
      if (body?.data?.nodeDataArray?.length) {
        captured = body;
      }
    } catch {
      /* cuerpo no JSON */
    }
  });

  const ok = await tryLogin(page);
  if (!ok) {
    console.error('No se encontró formulario de login. Abre CHATEAPRO_HEADLESS=0 y revisa la URL real.');
    await browser.close();
    process.exit(1);
  }

  console.log('Abriendo editor:', editorUrl);
  await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });

  for (let i = 0; i < 60 && !captured; i++) {
    await page.waitForTimeout(1000);
  }

  await fs.promises.mkdir(path.dirname(outFile), { recursive: true });
  if (!captured) {
    await fs.promises.writeFile(
      outFile,
      JSON.stringify(
        {
          error: 'No se interceptó get-nodes. Prueba CHATEAPRO_HEADLESS=0 o aumenta la espera.',
          editorUrl,
        },
        null,
        2
      ),
      'utf8'
    );
    console.error('No se capturó get-nodes. Archivo de diagnóstico:', outFile);
  } else {
    await fs.promises.writeFile(outFile, JSON.stringify(captured, null, 2), 'utf8');
    const n = captured.data.nodeDataArray?.length ?? 0;
    console.log('OK:', n, 'nodos guardados en', outFile);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
