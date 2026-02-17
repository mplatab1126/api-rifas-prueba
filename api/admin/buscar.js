import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const q = req.query.q || (req.body && req.body.q);
  if (!q) return res.status(400).json({ tipo: 'ERROR_SERVIDOR', mensaje: 'Escribe algo para buscar.' });

  let queryLimpio = String(q).replace(/\D/g, '');
  if (queryLimpio.length === 12 && queryLimpio.startsWith('57')) {
    queryLimpio = queryLimpio.slice(2); 
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // --- CASO A: 4 CIFRAS (APARTAMENTO) ---
    if (queryLimpio.length === 4) {
      const { data: boleta, error } = await supabase
        .from('boletas')
        .select(`numero, total_abonado, saldo_restante, telefono_cliente, clientes (nombre, apellido, ciudad)`)
        .eq('numero', queryLimpio)
        .single();

      if (error && error.code === 'PGRST116') return res.status(200).json({ tipo: 'NO_EXISTE', mensaje: '❌ Esta boleta no pertenece a tu inventario.' });
      if (error) throw error;

      if (!boleta.telefono_cliente) {
        return res.status(200).json({ tipo: 'BOLETA_DISPONIBLE', data: { numero: queryLimpio } });
      } else {
        return res.status(200).json({
          tipo: 'BOLETA_OCUPADA',
          data: {
            infoVenta: {
              numero: boleta.numero, nombre: boleta.clientes?.nombre || '', apellido: boleta.clientes?.apellido || '', ciudad: boleta.clientes?.ciudad || '', telefono: boleta.telefono_cliente, totalAbonos: boleta.total_abonado, restante: boleta.saldo_restante
            }
          }
        });
      }
    }
    // --- CASO B: 2 CIFRAS (RIFA DIARIA) ---
    else if (queryLimpio.length === 2) {
      const { data: boleta, error } = await supabase
        .from('boletas_diarias')
        .select('*')
        .eq('numero', queryLimpio)
        .single();

      if (error && error.code === 'PGRST116') return res.status(200).json({ tipo: 'NO_EXISTE', mensaje: '❌ Esta boleta diaria no existe.' });
      if (error) throw error;

      if (boleta.estado === 'Disponible' || !boleta.telefono_cliente) {
        return res.status(200).json({ tipo: 'BOLETA_DISPONIBLE', data: { numero: queryLimpio } });
      } else {
        return res.status(200).json({
          tipo: 'BOLETA_OCUPADA',
          data: {
            infoVenta: {
              numero: boleta.numero, 
              nombre: boleta.nombre_cliente || '', 
              apellido: '', // La diaria no usa apellido
              ciudad: '', 
              telefono: boleta.telefono_cliente, 
              totalAbonos: boleta.total_abonado || 0, 
              restante: boleta.saldo_restante !== null && boleta.saldo_restante !== undefined ? boleta.saldo_restante : 20000
            }
          }
        });
      }
    }
    // --- CASO C: CELULAR ---
    else if (queryLimpio.length === 10) {
      const { data: clienteBoletas, error } = await supabase
        .from('boletas')
        .select(`numero, total_abonado, saldo_restante, telefono_cliente, clientes (nombre, apellido, ciudad)`)
        .eq('telefono_cliente', queryLimpio);

      if (error) throw error;

      if (!clienteBoletas || clienteBoletas.length === 0) {
        return res.status(200).json({ tipo: 'NO_EXISTE', mensaje: 'No hay cliente o boletas con este celular.' });
      }

      const lista = clienteBoletas.map(b => ({
        numero: b.numero, nombre: b.clientes?.nombre || '', apellido: b.clientes?.apellido || '', ciudad: b.clientes?.ciudad || '', telefono: b.telefono_cliente, totalAbonos: b.total_abonado, restante: b.saldo_restante
      }));

      return res.status(200).json({ tipo: 'CLIENTE_ENCONTRADO', lista: lista });
    }
    else {
       return res.status(200).json({ tipo: 'NO_EXISTE', mensaje: 'Ingresa 4 dígitos (Apartamento), 2 dígitos (Diaria) o 10 dígitos (Celular).' });
    }

  } catch (error) {
    return res.status(500).json({ tipo: 'ERROR_SERVIDOR', mensaje: 'Error interno: ' + error.message });
  }
}
