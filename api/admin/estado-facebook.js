import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena } = req.body;
  if (!validarAsesor(contrasena)) return res.status(401).json({ status: 'error', mensaje: 'No autorizado' });

  const cuentas = [
    { id: process.env.FB_ACT_1_ID, token: process.env.FB_ACT_1_TOKEN, nombre: 'Facebook de Mateo' },
    { id: process.env.FB_ACT_2_ID, token: process.env.FB_ACT_2_TOKEN, nombre: 'Facebook de Alejandro' }
  ].filter(c => c.id && c.token);

  if (cuentas.length === 0) return res.status(200).json({ status: 'error', mensaje: 'Faltan las llaves de Facebook' });

  try {
    // estados: { nombre → effective_status }
    const estados = {};

    for (const cuenta of cuentas) {
      const idLimpio = cuenta.id.replace(/\D/g, '');

      for (const endpoint of ['campaigns', 'adsets', 'ads']) {
        let url = `https://graph.facebook.com/v19.0/act_${idLimpio}/${endpoint}?fields=id,name,effective_status&limit=500&access_token=${cuenta.token.trim()}`;

        while (url) {
          const r = await fetch(url);
          const d = await r.json();
          if (d.error) break;
          if (d.data) {
            for (const item of d.data) {
              // Si el mismo nombre aparece en dos cuentas, ACTIVE tiene prioridad
              if (!estados[item.name] || item.effective_status === 'ACTIVE') {
                estados[item.name] = item.effective_status;
              }
            }
          }
          url = d.paging?.next || null;
        }
      }
    }

    return res.status(200).json({ status: 'ok', estados });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
