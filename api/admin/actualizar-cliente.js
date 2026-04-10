import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { telefono, nombre, apellido, ciudad, contrasena } = req.body;

  // SEGURIDAD
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  if (!asesores[contrasena]) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });
  }

  if (!telefono) return res.status(400).json({ status: 'error', mensaje: 'Falta el teléfono del cliente' });

  try {
    // Upsert: crea el registro si no existe, o actualiza si ya existe
    const { error } = await supabase
      .from('clientes')
      .upsert({
        telefono: telefono,
        nombre: nombre || '',
        apellido: apellido || '',
        ciudad: ciudad || ''
      }, { onConflict: 'telefono' });

    if (error) throw error;

    return res.status(200).json({ status: 'ok', mensaje: '¡Datos del cliente actualizados correctamente!' });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
