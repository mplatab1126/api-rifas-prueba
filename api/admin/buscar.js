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

  // 🚨 4. REGLA ESTRICTA DE TAMAÑO (Bloquea 1, 3 o cantidades raras)
  if (queryLimpio.length === 1 || queryLimpio.length === 3 || (queryLimpio.length > 4 && queryLimpio.length !== 10)) {
    return res.status(200).json({ 
      tipo: 'ERROR_SERVIDOR', 
      mensaje: `⚠️ Formato incorrecto.\nEscribiste un número de ${queryLimpio.length} cifras.\n\nEl sistema solo permite buscar:\n• 2 cifras (Rifa Diaria)\n• 4 cifras (Apartamento)\n• 10 cifras (Celular)` 
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
      
      // 1. Buscamos las boletas del Apartamento (4 cifras)
      const { data: clienteBoletasApto, error: errApto } = await supabase
        .from('boletas')
        .select(`numero, total_abonado, saldo_restante, telefono_cliente, asesor, clientes (nombre, apellido, ciudad)`)
        .eq('telefono_cliente', queryLimpio);

      if (errApto) throw errApto;

      // 2. Buscamos las boletas de la Rifa Diaria (2 cifras)
      const { data: clienteBoletasDiarias, error: errDiarias } = await supabase
        .from('boletas_diarias')
        .select('*')
        .eq('telefono_cliente', queryLimpio);

      if (errDiarias) throw errDiarias;

      if ((!clienteBoletasApto || clienteBoletasApto.length === 0) && (!clienteBoletasDiarias || clienteBoletasDiarias.length === 0)) {
        
        // El cliente no tiene boletas, pero vamos a revisar si existe en nuestra agenda de clientes
        const { data: clienteSolo, error: errCliente } = await supabase
          .from('clientes')
          .select('nombre, apellido, ciudad, telefono')
          .eq('telefono', queryLimpio)
          .maybeSingle();

        // Si lo encontramos en la agenda, le avisamos al panel
        if (clienteSolo) {
          return res.status(200).json({ 
            tipo: 'CLIENTE_SIN_BOLETAS', 
            data: clienteSolo 
          });
        }

        // Si definitivamente no está en ningún lado
        return res.status(200).json({ tipo: 'NO_EXISTE', mensaje: 'No hay cliente o boletas con este celular en ninguna rifa.' });
      }

      let lista = [];

      if (clienteBoletasApto && clienteBoletasApto.length > 0) {
        lista.push(...clienteBoletasApto.map(b => ({
          numero: b.numero, 
          nombre: b.clientes?.nombre || '', 
          apellido: b.clientes?.apellido || '', 
          ciudad: b.clientes?.ciudad || '', 
          telefono: b.telefono_cliente, 
          totalAbonos: b.total_abonado, 
          restante: b.saldo_restante,
          asesor: b.asesor
        })));
      }

      if (clienteBoletasDiarias && clienteBoletasDiarias.length > 0) {
        lista.push(...clienteBoletasDiarias.map(b => ({
          numero: b.numero, 
          nombre: b.nombre_cliente || '', 
          apellido: '',
          ciudad: '', 
          telefono: b.telefono_cliente, 
          totalAbonos: b.total_abonado || 0, 
          restante: b.saldo_restante !== null && b.saldo_restante !== undefined ? b.saldo_restante : 20000
        })));
      }

      return res.status(200).json({ tipo: 'CLIENTE_ENCONTRADO', lista: lista });
    }
    else {
       return res.status(200).json({ tipo: 'NO_EXISTE', mensaje: 'Ingresa 4 dígitos (Apartamento), 2 dígitos (Diaria) o 10 dígitos (Celular).' });
    }

  } catch (error) {
    return res.status(500).json({ tipo: 'ERROR_SERVIDOR', mensaje: 'Error interno: ' + error.message });
  }
}
