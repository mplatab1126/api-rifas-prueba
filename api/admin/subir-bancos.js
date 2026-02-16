import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Permisos (CORS)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { transferencias, contrasena } = req.body;

  // 2. Seguridad
  const claveMaestra = process.env.ADMIN_PASSWORD || 'LosPlata2026';
  if (contrasena !== claveMaestra) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }

  if (!transferencias || transferencias.length === 0) {
    return res.status(400).json({ status: 'error', mensaje: 'No se enviaron datos' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // 3. Insertar todas las transferencias de forma masiva (Bulk Insert)
    const { error } = await supabase.from('transferencias').insert(transferencias);

    if (error) throw error;

    return res.status(200).json({ 
      status: 'ok', 
      mensaje: `¡Éxito! Se cargaron ${transferencias.length} transferencias a la base de datos.` 
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
