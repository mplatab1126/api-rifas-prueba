import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, boleta, telefono, accion } = req.body;
  // accion: 'marcar' o 'desmarcar'

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!boleta) return res.status(400).json({ status: 'error', mensaje: 'Falta el número de boleta' });

  try {
    if (accion === 'desmarcar') {
      const { error } = await supabase
        .from('registro_movimientos')
        .delete()
        .eq('accion', 'Aviso Cobro')
        .eq('boleta', String(boleta));

      if (error) throw error;
      return res.status(200).json({ status: 'ok', marcado: false });
    } else {
      // Verificar que no exista ya
      const { data: existente } = await supabase
        .from('registro_movimientos')
        .select('id')
        .eq('accion', 'Aviso Cobro')
        .eq('boleta', String(boleta))
        .maybeSingle();

      if (!existente) {
        const { error } = await supabase
          .from('registro_movimientos')
          .insert({
            asesor: nombreAsesor,
            accion: 'Aviso Cobro',
            boleta: String(boleta),
            detalle: `Aviso de cobro enviado al cliente ${telefono || ''}`
          });
        if (error) throw error;
      }

      return res.status(200).json({ status: 'ok', marcado: true, asesor: nombreAsesor });
    }
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
