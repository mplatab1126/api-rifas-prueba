import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { contrasena } = req.body;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // Buscamos al asesor en la nueva tabla usando su username (que actúa como contraseña)
    const { data, error } = await supabase
      .from('asesores')
      .select('*')
      .eq('username', contrasena)
      .single();

    if (error || !data) {
      return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
    }

    // Le devolvemos a la página todos los datos del juego (Gamificación)
    return res.status(200).json({ 
      status: 'ok', 
      mensaje: 'Acceso concedido', 
      asesor: data.nombre,
      comision_actual: data.comision_actual || 0,
      meta_sueno: data.meta_sueno || 'Mi gran meta',
      meta_valor: data.meta_valor || 1
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error de conexión' });
  }
}
