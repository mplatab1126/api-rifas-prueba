import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Permisos
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { referencia, contrasena } = req.body;

  // 2. Seguridad
  const asesores = { 'sal32':'Saldarriaga', 'ar94':'Arias', 'car61':'Carlos', 'an45':'Anyeli', 'm8a3':'Mateo', 'lu34':'Luisa', 'li05':'Liliana', 'ne26':'Nena', '1234':'Admin' };
  if (!asesores[contrasena]) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!referencia) return res.status(400).json({ status: 'error', mensaje: 'Falta la referencia' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // 3. Buscar la transferencia original (¡BÚSQUEDA INTELIGENTE!)
    const refLimpia = referencia.trim(); // Limpiamos espacios accidentales al inicio o final

    const { data: transList, error: errTrans } = await supabase
      .from('transferencias')
      .select('*')
      .ilike('referencia', `%${refLimpia}%`) // Busca cualquier referencia que CONTENGA el texto/número
      .order('fecha_pago', { ascending: false }) // Si hay varias, trae la más reciente
      .limit(1);

    if (errTrans || !transList || transList.length === 0) {
      return res.status(404).json({ status: 'error', mensaje: 'La referencia no existe en la base de datos.' });
    }

    const trans = transList[0];

    // Si está libre, no hay nada que liberar, pero le avisamos al asesor
    if (trans.estado === 'LIBRE') {
       return res.status(200).json({ status: 'ok', tipo: 'LIBRE', data: trans });
    }

    // 4. Si está asignada, buscamos el "abono" exacto para poder eliminarlo
    const { data: abonoList, error: errAbono } = await supabase
      .from('abonos')
      .select('*')
      .eq('referencia_transferencia', referencia)
      .limit(1);

    const abono = abonoList ? abonoList[0] : null;

    if (!abono) {
       return res.status(200).json({ status: 'ok', tipo: 'ASIGNADA_SIN_ABONO', data: trans });
    }

    // 5. Enviamos todo al panel frontal para pintar la tarjeta
    return res.status(200).json({
       status: 'ok',
       tipo: 'ASIGNADA',
       transferencia: trans,
       abono: abono
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
