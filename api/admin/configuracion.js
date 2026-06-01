import { supabaseAdmin as supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

// ──────────────────────────────────────────────────────────────────────────
// Endpoint para los interruptores globales del sistema (tabla `configuracion`).
//
// Acciones:
//   - get:  devuelve el estado del interruptor "Pendiente". Lo puede leer
//           cualquier asesor autenticado (el panel necesita saber si mostrar
//           o esconder el botón "Pendiente").
//   - set:  prende/apaga el interruptor. SOLO Mateo.
// ──────────────────────────────────────────────────────────────────────────

const ADMINS = ['mateo']; // solo Mateo puede prender/apagar el interruptor
const CLAVES_PERMITIDAS = ['pendiente_habilitado'];

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, accion, clave, valor } = req.body || {};

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }

  // ── GET: cualquier asesor autenticado puede leer el estado ──
  if (!accion || accion === 'get') {
    const { data, error } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'pendiente_habilitado')
      .maybeSingle();

    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
    return res.status(200).json({ status: 'ok', pendiente_habilitado: data?.valor === 'true' });
  }

  // ── SET: solo Mateo ──
  if (accion === 'set') {
    if (!ADMINS.includes(nombreAsesor.toLowerCase())) {
      return res.status(403).json({ status: 'error', mensaje: 'Solo el administrador puede cambiar este interruptor.' });
    }
    if (!CLAVES_PERMITIDAS.includes(clave)) {
      return res.status(400).json({ status: 'error', mensaje: `Clave '${clave}' no permitida.` });
    }

    const valorStr = (valor === true || valor === 'true') ? 'true' : 'false';

    const { error } = await supabase
      .from('configuracion')
      .upsert({ clave, valor: valorStr, updated_at: new Date().toISOString() }, { onConflict: 'clave' });

    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
    return res.status(200).json({ status: 'ok', pendiente_habilitado: valorStr === 'true' });
  }

  return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida.' });
}
