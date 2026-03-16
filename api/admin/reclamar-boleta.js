import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, numeros } = req.body;
  if (!contrasena || !numeros || !numeros.length) {
    return res.status(400).json({ status: 'error', mensaje: 'Faltan datos' });
  }

  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

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
