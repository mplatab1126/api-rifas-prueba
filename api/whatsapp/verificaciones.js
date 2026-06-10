/**
 * Estado de la verificación de pago con reintentos (SOLO LECTURA, para la ficha de la bandeja).
 *
 * Responde la pregunta operativa "¿el sistema SIGUE intentando verificar este pago, o ya se
 * rindió y le toca al asesor?" — antes solo se veía el "estamos verificando tu pago" en el
 * chat, sin saber en qué iba el relojito (intento 2 de 4, próximo a las 3:15, rendido, etc.).
 *
 * POST { contrasena, linea_id, telefono } → { verificaciones: [la más reciente primero] }
 * Lo puede ver CUALQUIER asesor con acceso a la línea (es información operativa, sin secretos).
 */

import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { puedeVerLinea } from '../lib/asesores.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, linea_id, telefono } = req.body || {};
  const nombre = validarAsesor(contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Acceso restringido.' });
  if (!linea_id || !telefono) return res.status(200).json({ status: 'error', mensaje: 'Falta la línea o el teléfono.' });
  if (!(await puedeVerLinea(nombre, linea_id))) return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta línea.' });

  try {
    const tel = String(telefono).replace(/\D/g, '');
    const { data, error } = await supabaseAdmin
      .from('verificaciones_pago')
      .select('estado, intentos, max_intentos, proximo_intento_at, resultado, created_at, actualizado_at')
      .eq('linea_id', String(linea_id)).eq('telefono', tel)
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) return res.status(200).json({ status: 'error', mensaje: error.message });

    // N4 (pedido de Mateo): la rendición va ENLAZADA al abono pendiente. Si DESPUÉS de que
    // el sistema se rindió alguien registró un abono a este cliente (a mano en la bandeja o
    // el admin, por el cron, etc.), el caso ya NO está pendiente: se adjunta ese abono para
    // que la tarjeta muestre "✅ caso cerrado" en vez del 🆘 rojo que pedía revisión.
    const lista = data || [];
    const masReciente = lista[0];
    if (masReciente && masReciente.estado === 'rendido') {
      try {
        const last10 = tel.slice(-10);
        const { data: bols } = await supabaseAdmin
          .from('boletas').select('numero').like('telefono_cliente', '%' + last10);
        const numeros = (bols || []).map(b => b.numero);
        if (numeros.length) {
          const { data: abs } = await supabaseAdmin
            .from('abonos')
            .select('monto, fecha_pago, numero_boleta, asesor')
            .in('numero_boleta', numeros)
            .gt('fecha_pago', masReciente.created_at)
            .order('fecha_pago', { ascending: false })
            .limit(1);
          if (abs && abs.length) masReciente.abono_posterior = abs[0];
        }
      } catch (_) {}
    }
    return res.status(200).json({ status: 'ok', verificaciones: lista });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: e.message });
  }
}
