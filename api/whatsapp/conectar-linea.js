/**
 * "Conectar línea": suscribe nuestra app de Meta a la WABA de una línea, para
 * que los mensajes de ese número lleguen a nuestro webhook. Solo gerencia.
 *
 * Hace la llamada técnica POST /{WABA_ID}/subscribed_apps con el token de la
 * app (variable de entorno), sin exponerlo. Reusable para cada línea nueva.
 *
 * Recibe (POST, JSON): { contrasena, linea_id }   (linea_id = phone_number_id)
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { esGerencia } from '../lib/asesores.js';
import { configWhatsapp } from '../lib/whatsapp.js';
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, linea_id } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!esGerencia(nombre)) return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia puede conectar líneas.' });
  if (!linea_id) return res.status(400).json({ status: 'error', mensaje: 'Falta la línea.' });

  const { data: linea } = await supabase
    .from('lineas_whatsapp')
    .select('waba_id, nombre')
    .eq('phone_number_id', linea_id)
    .maybeSingle();
  if (!linea || !linea.waba_id) {
    return res.status(200).json({ status: 'error', mensaje: 'Esta línea no tiene su cuenta de WhatsApp (WABA) configurada.' });
  }

  const { token } = configWhatsapp();
  if (!token) return res.status(200).json({ status: 'error', mensaje: 'Falta WHATSAPP_TOKEN en Vercel.' });

  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${linea.waba_id}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      return res.status(200).json({ status: 'error', mensaje: data.error?.message || `HTTP ${resp.status}` });
    }
    await supabase.from('lineas_whatsapp').update({ suscrita: true }).eq('phone_number_id', linea_id);
    return res.status(200).json({ status: 'ok', mensaje: `Línea "${linea.nombre}" conectada. Sus mensajes ya llegarán al sistema.` });
  } catch (err) {
    return res.status(200).json({ status: 'error', mensaje: err.message });
  }
}
