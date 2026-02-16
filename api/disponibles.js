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
    // 3. Traemos las boletas libres (sin límite pequeño, para garantizar que haya de todas las series)
    const { data: libres, error } = await supabase
      .from('boletas')
      .select('numero')
      .is('telefono_cliente', null);

    if (error) throw error;

    if (!libres || libres.length === 0) {
      return res.status(200).json({ numeros_disponibles: "No hay boletas disponibles en este momento." });
    }

    // 4. Creamos los "cajones" para separar las boletas según su primer número (0 al 9)
    const series = { '0':[], '1':[], '2':[], '3':[], '4':[], '5':[], '6':[], '7':[], '8':[], '9':[] };
    
    // Clasificamos cada boleta en su cajón correspondiente
    for (let b of libres) {
      const primerDigito = b.numero.charAt(0);
      if (series[primerDigito]) {
        series[primerDigito].push(b.numero);
      }
    }

    let seleccionados = [];

    // 5. Entramos a cada cajón, los barajamos y sacamos 5 de cada uno
    for (let i = 0; i <= 9; i++) {
      let grupo = series[i.toString()];
      if (grupo && grupo.length > 0) {
        // Barajamos este grupito al azar
        grupo.sort(() => 0.5 - Math.random());
        // Tomamos los primeros 5 (o los que haya, si quedan menos de 5 en esa serie)
        seleccionados.push(...grupo.slice(0, 5));
      }
    }

    // 6. Ahora que tenemos los 50 números, los ordenamos matemáticamente de MENOR a MAYOR
    seleccionados.sort((a, b) => parseInt(a) - parseInt(b));

    // 7. Los unimos todos en un solo texto separado por guiones
    const textoFinal = seleccionados.join(' - ');

    // 8. Se lo enviamos a Chatea Pro
    res.status(200).json({
      numeros_disponibles: textoFinal
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
