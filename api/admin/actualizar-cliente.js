import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { telefono, nombre, apellido, ciudad, contrasena } = req.body;

  // SEGURIDAD
  const asesores = { 'sal32':'Saldarriaga', 'ar94':'Arias', 'car61':'Carlos', 'an45':'Anyeli', 'AYX':'Mateo', 'lu34':'Luisa', 'li05':'Liliana', 'ne26':'Nena', '1234':'Admin' };
  if (!asesores[contrasena]) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });
  }

  if (!telefono) return res.status(400).json({ status: 'error', mensaje: 'Falta el teléfono del cliente' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // Actualizamos la tabla de clientes donde coincida el número de teléfono
    const { error } = await supabase
      .from('clientes')
      .update({
        nombre: nombre || '',
        apellido: apellido || '',
        ciudad: ciudad || ''
      })
      .eq('telefono', telefono);

    if (error) throw error;

    return res.status(200).json({ status: 'ok', mensaje: '¡Datos del cliente actualizados correctamente!' });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
