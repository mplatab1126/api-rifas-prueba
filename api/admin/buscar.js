import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const q = req.query.q || (req.body && req.body.q);
  if (!q) return res.status(400).json({ tipo: 'ERROR_SERVIDOR', mensaje: 'Escribe algo para buscar.' });

  // 🚨 1. REGLA ESTRICTA: Bloquear letras
  if (/[a-zA-Z]/.test(String(q))) {
    return res.status(200).json({ 
      tipo: 'ERROR_SERVIDOR', 
      mensaje: `⚠️ Búsqueda inválida.\nEscribiste "${q}", pero no puedes combinar letras y números.\nEscribe únicamente los números.` 
    });
  }

  // 2. Limpiamos espacios o símbolos
  let queryLimpio = String(q).replace(/\D/g, '');

  // 3. Ajuste por si pegan un celular con el 57 de Colombia
  if (queryLimpio.length === 12 && queryLimpio.startsWith('57')) {
    queryLimpio = queryLimpio.slice(2); 
  }

  // 🚨 4. REGLA DE TAMAÑO ACTUALIZADA (Ahora permite 3 cifras)
  if (queryLimpio.length === 1 || (queryLimpio.length > 4 && queryLimpio.length !== 10)) {
    return res.status(200).json({ 
      tipo: 'ERROR_SERVIDOR', 
      mensaje: `⚠️ Formato incorrecto.\nEscribiste un número de ${queryLimpio.length} cifras.\n\nEl sistema solo permite buscar:\n• 2 cifras (Diaria)\n• 3 cifras (Diaria 3C)\n• 4 cifras (Apto)\n• 10 cifras (Celular)` 
    });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // --- CASO A: 4 CIFRAS (APARTAMENTO) ---
    if (queryLimpio.length === 4) {
      const { data: boleta, error } = await supabase
        .from('boletas')
        .select(`numero, total_abonado, saldo_restante, telefono_cliente, asesor, clientes (nombre, apellido, ciudad)`)
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
              numero: boleta.numero, nombre: boleta.clientes?.nombre || '', apellido: boleta.clientes?.apellido || '', ciudad: boleta.clientes?.ciudad || '', telefono: boleta.telefono_cliente, totalAbonos: boleta.total_abonado, restante: boleta.saldo_restante, asesor: boleta.asesor
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
        const { data: clienteDB } = await supabase
          .from('clientes')
          .select('nombre, apellido, ciudad')
          .eq('telefono', boleta.telefono_cliente)
          .maybeSingle();
        return res.status(200).json({
          tipo: 'BOLETA_OCUPADA',
          data: {
            infoVenta: {
              numero: boleta.numero,
              nombre: clienteDB?.nombre || boleta.nombre_cliente || '',
              apellido: clienteDB?.apellido || '',
              ciudad: clienteDB?.ciudad || '',
              telefono: boleta.telefono_cliente,
              totalAbonos: boleta.total_abonado || 0,
              restante: boleta.saldo_restante !== null && boleta.saldo_restante !== undefined ? boleta.saldo_restante : 20000
            }
          }
        });
      }
    }
    // --- CASO C: 3 CIFRAS ---
    else if (queryLimpio.length === 3) {
      const { data: boleta, error } = await supabase
        .from('boletas_diarias_3cifras')
        .select('*')
        .eq('numero', queryLimpio)
        .single();

      if (error && error.code === 'PGRST116') return res.status(200).json({ tipo: 'NO_EXISTE', mensaje: '❌ Esta boleta de 3 cifras no existe.' });
      if (error) throw error;

      if (boleta.estado === 'Disponible' || !boleta.telefono_cliente) {
        return res.status(200).json({ tipo: 'BOLETA_DISPONIBLE', data: { numero: queryLimpio } });
      } else {
        const { data: clienteDB } = await supabase
          .from('clientes')
          .select('nombre, apellido, ciudad')
          .eq('telefono', boleta.telefono_cliente)
          .maybeSingle();
        return res.status(200).json({
          tipo: 'BOLETA_OCUPADA',
          data: {
            infoVenta: {
              numero: boleta.numero,
              nombre: clienteDB?.nombre || boleta.nombre_cliente || '',
              apellido: clienteDB?.apellido || '',
              ciudad: clienteDB?.ciudad || '',
              telefono: boleta.telefono_cliente,
              totalAbonos: boleta.total_abonado || 0,
              restante: boleta.saldo_restante !== null && boleta.saldo_restante !== undefined ? boleta.saldo_restante : 5000
            }
          }
        });
      }
    }
    // --- CASO D: CELULAR (AHORA SÍ BUSCA EN LAS 3 TABLAS A LA VEZ) ---
    else if (queryLimpio.length === 10) {
      
      const { data: clienteBoletasApto } = await supabase
        .from('boletas')
        .select(`numero, total_abonado, saldo_restante, telefono_cliente, asesor, clientes (nombre, apellido, ciudad)`)
        .eq('telefono_cliente', queryLimpio);

      const { data: clienteBoletasDiarias } = await supabase
        .from('boletas_diarias')
        .select('*')
        .eq('telefono_cliente', queryLimpio);

      const { data: clienteBoletas3Cifras } = await supabase
        .from('boletas_diarias_3cifras')
        .select('*')
        .eq('telefono_cliente', queryLimpio);

      if ((!clienteBoletasApto || clienteBoletasApto.length === 0) && 
          (!clienteBoletasDiarias || clienteBoletasDiarias.length === 0) &&
          (!clienteBoletas3Cifras || clienteBoletas3Cifras.length === 0)) {
        
        const { data: clienteSolo } = await supabase
          .from('clientes')
          .select('nombre, apellido, ciudad, telefono')
          .eq('telefono', queryLimpio)
          .maybeSingle();

        if (clienteSolo) {
          return res.status(200).json({ tipo: 'CLIENTE_SIN_BOLETAS', data: clienteSolo });
        }
        return res.status(200).json({ tipo: 'NO_EXISTE', mensaje: 'No hay cliente o boletas con este celular en ninguna rifa.' });
      }

      let lista = [];

      if (clienteBoletasApto && clienteBoletasApto.length > 0) {
        lista.push(...clienteBoletasApto.map(b => ({
          numero: b.numero, nombre: b.clientes?.nombre || '', apellido: b.clientes?.apellido || '', ciudad: b.clientes?.ciudad || '', telefono: b.telefono_cliente, totalAbonos: b.total_abonado, restante: b.saldo_restante, asesor: b.asesor
        })));
      }

      // Buscamos datos del cliente en la tabla clientes para nombre/apellido/ciudad correctos
      const { data: clienteDB } = await supabase
        .from('clientes')
        .select('nombre, apellido, ciudad')
        .eq('telefono', queryLimpio)
        .maybeSingle();

      if (clienteBoletasDiarias && clienteBoletasDiarias.length > 0) {
        lista.push(...clienteBoletasDiarias.map(b => ({
          numero: b.numero,
          nombre: clienteDB?.nombre || b.nombre_cliente || '',
          apellido: clienteDB?.apellido || '',
          ciudad: clienteDB?.ciudad || '',
          telefono: b.telefono_cliente,
          totalAbonos: b.total_abonado || 0,
          restante: b.saldo_restante !== null && b.saldo_restante !== undefined ? b.saldo_restante : 20000
        })));
      }

      if (clienteBoletas3Cifras && clienteBoletas3Cifras.length > 0) {
        lista.push(...clienteBoletas3Cifras.map(b => ({
          numero: b.numero,
          nombre: clienteDB?.nombre || b.nombre_cliente || '',
          apellido: clienteDB?.apellido || '',
          ciudad: clienteDB?.ciudad || '',
          telefono: b.telefono_cliente,
          totalAbonos: b.total_abonado || 0,
          restante: b.saldo_restante !== null && b.saldo_restante !== undefined ? b.saldo_restante : 5000
        })));
      }

      return res.status(200).json({ tipo: 'CLIENTE_ENCONTRADO', lista: lista });
    }

  } catch (error) {
    return res.status(500).json({ tipo: 'ERROR_SERVIDOR', mensaje: 'Error interno: ' + error.message });
  }
}
