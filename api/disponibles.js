import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Permisos CORS para Chatea Pro
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Conexión a tu bóveda de Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    // 3. Buscamos hasta 1000 boletas que estén LIBRES (que no tengan teléfono)
    const { data: libres, error } = await supabase
      .from('boletas')
      .select('numero')
      .is('telefono_cliente', null)
      .limit(1000);

    if (error) throw error;

    if (!libres || libres.length === 0) {
      return res.status(200).json({ numeros_disponibles: "No hay boletas disponibles en este momento." });
    }

    // 4. EL TRUCO DE LA RULETA: Mezclamos (barajamos) los números al azar
    const mezclados = libres.sort(() => 0.5 - Math.random());

    // 5. Escogemos solo los primeros 50 números de la lista ya mezclada
    const seleccionados = mezclados.slice(0, 50);

    // 6. Los unimos todos en un solo texto separado por guiones
    const textoFinal = seleccionados.map(b => b.numero).join(' - ');

    // 7. Se lo enviamos a Chatea Pro
    res.status(200).json({
      numeros_disponibles: textoFinal
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
