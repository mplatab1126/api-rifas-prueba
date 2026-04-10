import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, numeros } = req.body;
  if (!contrasena || !numeros || !numeros.length) {
    return res.status(400).json({ status: 'error', mensaje: 'Faltan datos' });
  }

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  try {
    for (const numero of numeros) {
      const num = String(numero).trim();
      let tabla = 'boletas';
      if (num.length === 2) tabla = 'boletas_diarias';
      else if (num.length === 3) tabla = 'boletas_diarias_3cifras';

      const { error } = await supabase
        .from(tabla)
        .update({ asesor: nombreAsesor })
        .eq('numero', num);

      if (error) throw error;
    }

    return res.status(200).json({ status: 'ok', mensaje: `Boleta(s) reclamada(s) por ${nombreAsesor}` });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
