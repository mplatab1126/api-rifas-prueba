import { supabase } from './lib/supabase.js';
import { aplicarCors } from './lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS,POST')) return;

  // GET: Contar registros o buscar boletas por teléfono
  if (req.method === 'GET') {
    const { action, telefono } = req.query;

    if (action === 'count') {
      const { count, error } = await supabase
        .from('registro_sorteo')
        .select('*', { count: 'exact', head: true });
      if (error) return res.status(500).json({ error: 'Error del servidor' });
      return res.status(200).json({ total: count || 0 });
    }

    if (action === 'lista') {
      try {
        const { data, error } = await supabase
          .from('registro_sorteo')
          .select('nombre_completo, ciudad, telefono_whatsapp')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const agrupado = {};
        (data || []).forEach(r => {
          const key = r.telefono_whatsapp;
          if (!agrupado[key]) {
            const partes = r.nombre_completo.trim().split(' ');
            let nombreProtegido;
            if (partes.length >= 2) {
              nombreProtegido = partes[0] + ' ' + partes[partes.length - 1].charAt(0) + '.';
            } else {
              nombreProtegido = partes[0];
            }
            agrupado[key] = { nombre: nombreProtegido, ciudad: r.ciudad, boletas: 0 };
          }
          agrupado[key].boletas++;
        });

        const lista = Object.values(agrupado);
        return res.status(200).json({ registros: lista });
      } catch (err) {
        console.error('Error lista registros:', err);
        return res.status(500).json({ error: 'Error del servidor' });
      }
    }

    if (action === 'buscar' && telefono) {
      const telLimpio = String(telefono).replace(/\D/g, '');
      if (telLimpio.length < 7 || telLimpio.length > 15) {
        return res.status(400).json({ error: 'Número inválido' });
      }

      try {
        const { data: boletas, error } = await supabase
          .from('boletas')
          .select('numero, telefono_cliente, clientes (nombre, apellido, ciudad)')
          .like('telefono_cliente', '%' + telLimpio.slice(-10))
          // Busca por los últimos dígitos para compatibilidad con registros viejos y nuevos

        if (error) throw error;
        if (!boletas || boletas.length === 0) {
          return res.status(404).json({ error: 'No encontramos boletas con ese número de WhatsApp. Verifica e intenta de nuevo.' });
        }

        const cliente = boletas[0].clientes;
        const nombreCompleto = ((cliente?.nombre || '') + ' ' + (cliente?.apellido || '')).trim() || '—';

        return res.status(200).json({
          nombre: nombreCompleto,
          ciudad: cliente?.ciudad || '—',
          telefono: telLimpio,
          boletas: boletas.map(b => b.numero)
        });
      } catch (err) {
        console.error('Error buscar boletas:', err);
        return res.status(500).json({ error: 'Error del servidor' });
      }
    }

    return res.status(400).json({ error: 'Acción no válida' });
  }

  // POST: Registrar boletas en el sorteo
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { nombre_completo, ciudad, telefono_whatsapp, boletas, tipo } = req.body;

  if (!nombre_completo || !ciudad || !telefono_whatsapp || !boletas || !boletas.length) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const telefonoLimpio = String(telefono_whatsapp).replace(/\D/g, '');
  const tipoRegistro = tipo === 'manual' ? 'manual' : 'automatico';

  try {
    const boletasLimpias = boletas.map(b => ("0000" + String(b).trim()).slice(-4));

    const { data: existentes } = await supabase
      .from('registro_sorteo')
      .select('numero_boleta')
      .in('numero_boleta', boletasLimpias);

    const yaRegistradas = (existentes || []).map(e => e.numero_boleta);
    const nuevas = boletasLimpias.filter(b => !yaRegistradas.includes(b));

    if (nuevas.length === 0) {
      return res.status(409).json({
        error: boletas.length === 1
          ? 'La boleta ' + boletasLimpias[0] + ' ya fue registrada.'
          : 'Todas tus boletas ya están registradas.'
      });
    }

    const registros = nuevas.map(b => ({
      nombre_completo: nombre_completo.trim(),
      ciudad: ciudad.trim(),
      telefono_whatsapp: telefonoLimpio,
      numero_boleta: b,
      tipo_registro: tipoRegistro
    }));

    const { error } = await supabase
      .from('registro_sorteo')
      .insert(registros);

    if (error) throw error;

    res.status(201).json({
      ok: true,
      mensaje: 'Registro exitoso',
      boletas_registradas: nuevas
    });

  } catch (error) {
    console.error('Error registro-sorteo:', error);
    res.status(500).json({ error: 'Error del servidor. Intenta nuevamente.' });
  }
}
