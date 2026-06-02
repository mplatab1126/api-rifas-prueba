import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { limpiarTelefono } from '../lib/telefono.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS,POST')) return;

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

  // 🚨 4. REGLA DE TAMAÑO: 4 cifras = boleta. 10 cifras o más = celular (nacional o internacional).
  if (queryLimpio.length !== 4 && queryLimpio.length < 10) {
    return res.status(200).json({
      tipo: 'ERROR_SERVIDOR',
      mensaje: `⚠️ Formato incorrecto.\nEscribiste un número de ${queryLimpio.length} cifras.\n\nEl sistema solo permite buscar:\n• 4 cifras (boleta)\n• 10 o más cifras (Celular nacional o internacional)`
    });
  }

  try {
    // --- CASO A: 4 CIFRAS (APARTAMENTO) ---
    if (queryLimpio.length === 4) {
      const { data: boleta, error } = await supabase
        .from('boletas')
        .select(`numero, total_abonado, saldo_restante, telefono_cliente, asesor, clientes (nombre, apellido, ciudad, documento_tipo, documento_numero, correo)`)
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
              numero: boleta.numero, nombre: boleta.clientes?.nombre || '', apellido: boleta.clientes?.apellido || '', ciudad: boleta.clientes?.ciudad || '', telefono: boleta.telefono_cliente, totalAbonos: boleta.total_abonado, restante: boleta.saldo_restante, asesor: boleta.asesor,
              documento_tipo: boleta.clientes?.documento_tipo || '', documento_numero: boleta.clientes?.documento_numero || '', correo: boleta.clientes?.correo || ''
            }
          }
        });
      }
    }
    // --- CASO B: CELULAR ---
    else if (queryLimpio.length >= 10) {
      const last10 = queryLimpio.slice(-10);

      const { data: clienteBoletasApto } = await supabase
        .from('boletas')
        .select(`numero, total_abonado, saldo_restante, telefono_cliente, asesor, clientes (nombre, apellido, ciudad, documento_tipo, documento_numero, correo)`)
        .like('telefono_cliente', '%' + last10);

      if (!clienteBoletasApto || clienteBoletasApto.length === 0) {
        // Buscamos TODAS las filas que coincidan (puede haber duplicados con/sin el 57 adelante).
        const { data: clientesEncontrados } = await supabase
          .from('clientes')
          .select('nombre, apellido, ciudad, telefono, correo')
          .like('telefono', '%' + last10);

        if (clientesEncontrados && clientesEncontrados.length > 0) {
          // Si hay varios duplicados, preferimos el registro con teléfono "limpio" (10 dígitos sin prefijo).
          const candidato = clientesEncontrados.find(c =>
            String(c.telefono || '').replace(/\D/g, '').length === 10
          ) || clientesEncontrados[0];
          return res.status(200).json({ tipo: 'CLIENTE_SIN_BOLETAS', data: candidato });
        }
        return res.status(200).json({ tipo: 'NO_EXISTE', mensaje: 'No hay cliente o boletas con este celular.' });
      }

      const lista = clienteBoletasApto.map(b => ({
        numero: b.numero, nombre: b.clientes?.nombre || '', apellido: b.clientes?.apellido || '', ciudad: b.clientes?.ciudad || '', telefono: b.telefono_cliente, totalAbonos: b.total_abonado, restante: b.saldo_restante, asesor: b.asesor,
        documento_tipo: b.clientes?.documento_tipo || '', documento_numero: b.clientes?.documento_numero || '', correo: b.clientes?.correo || ''
      }));

      return res.status(200).json({ tipo: 'CLIENTE_ENCONTRADO', lista: lista });
    }

  } catch (error) {
    return res.status(500).json({ tipo: 'ERROR_SERVIDOR', mensaje: 'Error interno: ' + error.message });
  }
}
