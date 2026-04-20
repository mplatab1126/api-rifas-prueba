import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { esTelefonoValido } from '../lib/telefono.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { telefono, nombre, apellido, ciudad, contrasena } = req.body;

  if (!validarAsesor(contrasena)) return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });

  if (!telefono) return res.status(400).json({ status: 'error', mensaje: 'Falta el teléfono del cliente' });

  // Validación defensiva: no dejar que se actualice el cliente si el teléfono está corrupto.
  // NO lo limpiamos aquí porque cambiaría la clave primaria de la tabla clientes.
  if (!esTelefonoValido(telefono)) {
    return res.status(400).json({ status: 'error', mensaje: `🚫 El teléfono "${telefono}" no es válido (debe ser 12 dígitos: 57 + celular colombiano que empieza con 3). Corrígelo antes de guardar.` });
  }

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
