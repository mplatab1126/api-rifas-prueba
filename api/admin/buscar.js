import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Permisos (CORS) para que tu HTML pueda comunicarse con esta API
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Extraer lo que el asesor escribió (la 'q' de query)
  // Permite recibirlo por URL (GET) o por datos (POST)
  const q = req.query.q || (req.body && req.body.q);
  
  if (!q) {
    return res.status(400).json({ tipo: 'ERROR_SERVIDOR', mensaje: 'Escribe algo para buscar.' });
  }

  // 3. TRUCO: Limpiamos el texto y dejamos solo los números.
  let queryLimpio = String(q).replace(/\D/g, '');

  // NUEVO: Si el número tiene 12 dígitos y empieza por "57", le quitamos el "57"
  if (queryLimpio.length === 12 && queryLimpio.startsWith('57')) {
    queryLimpio = queryLimpio.slice(2); // Esto recorta los 2 primeros números
  }

  // 4. Conectamos con tu base de datos Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    // ---------------------------------------------------------
    // CASO A: EL ASESOR BUSCÓ UNA BOLETA (4 DÍGITOS EXACTOS)
    // ---------------------------------------------------------
    if (queryLimpio.length === 4) {
      // Buscamos la boleta y los datos de su dueño
      const { data: boleta, error } = await supabase
        .from('boletas')
        .select(`
          numero,
          total_abonado,
          saldo_restante,
          telefono_cliente,
          clientes (nombre, apellido, ciudad)
        `)
        .eq('numero', queryLimpio)
        .single();

      if (error && error.code === 'PGRST116') { 
      return res.status(200).json({ tipo: 'NO_EXISTE', mensaje: '❌ Esta boleta no pertenece a tu inventario.' });
      }
      if (error) throw error;

      // Si la boleta existe pero no tiene dueño, también está libre
      if (!boleta.telefono_cliente) {
        return res.status(200).json({ tipo: 'BOLETA_DISPONIBLE', data: { numero: queryLimpio } });
      } else {
        // La boleta tiene dueño: avisamos que está OCUPADA y enviamos los datos
        return res.status(200).json({
          tipo: 'BOLETA_OCUPADA',
          data: {
            infoVenta: {
              numero: boleta.numero,
              nombre: boleta.clientes?.nombre || '',
              apellido: boleta.clientes?.apellido || '',
              ciudad: boleta.clientes?.ciudad || '',
              telefono: boleta.telefono_cliente,
              totalAbonos: boleta.total_abonado,
              restante: boleta.saldo_restante
            }
          }
        });
      }
    }

    // ---------------------------------------------------------
    // CASO B: EL ASESOR BUSCÓ UN CELULAR (10 DÍGITOS EXACTOS)
    // ---------------------------------------------------------
    else if (queryLimpio.length === 10) {
      // Buscamos todas las boletas que tengan este teléfono asignado
      const { data: clienteBoletas, error } = await supabase
        .from('boletas')
        .select(`
          numero,
          total_abonado,
          saldo_restante,
          telefono_cliente,
          clientes (nombre, apellido, ciudad)
        `)
        .eq('telefono_cliente', queryLimpio);

      if (error) throw error;

      // Si no trajo boletas, el cliente no existe o no tiene nada separado
      if (!clienteBoletas || clienteBoletas.length === 0) {
        return res.status(200).json({ tipo: 'NO_EXISTE', mensaje: 'No hay cliente o boletas con este número de celular.' });
      }

      // Empacamos la lista en el formato exacto que espera tu panel HTML
      const lista = clienteBoletas.map(b => ({
        numero: b.numero,
        nombre: b.clientes?.nombre || '',
        apellido: b.clientes?.apellido || '',
        ciudad: b.clientes?.ciudad || '',
        telefono: b.telefono_cliente,
        totalAbonos: b.total_abonado,
        restante: b.saldo_restante
      }));

      return res.status(200).json({ tipo: 'CLIENTE_ENCONTRADO', lista: lista });
    }

    // ---------------------------------------------------------
    // CASO C: NO ES NI 4 NI 10 DÍGITOS
    // ---------------------------------------------------------
    else {
       return res.status(200).json({ tipo: 'NO_EXISTE', mensaje: 'Por favor, ingresa 4 dígitos para buscar boleta o 10 dígitos para celular.' });
    }

  } catch (error) {
    return res.status(500).json({ tipo: 'ERROR_SERVIDOR', mensaje: 'Error interno: ' + error.message });
  }
}
