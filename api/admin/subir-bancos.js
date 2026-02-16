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

  // 4. SEGURIDAD: Validar la clave del asesor y obtener su nombre
  const asesores = { 'sal32':'Saldarriaga', 'ar94':'Arias', 'car61':'Carlos', 'an45':'Anyeli', 'm8a3':'Mateo', 'lu34':'Luisa', 'li05':'Liliana', 'ne26':'Nena', '1234':'Admin' };
  const nombreAsesor = asesores[contrasena];

  if (!nombreAsesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });
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
