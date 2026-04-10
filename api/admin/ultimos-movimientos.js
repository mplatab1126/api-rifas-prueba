import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;

  const { contrasena } = req.body;
  if (!validarAsesor(contrasena)) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  try {
    // Leemos la nueva tabla de Bitácora (registro_movimientos)
    const { data, error } = await supabase
      .from('registro_movimientos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    return res.status(200).json({ status: 'ok', lista: data });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
