import { createClient } from '@supabase/supabase-js';

function numeroAPalabras(n) {
  const num = Math.round(n);
  if (num === 0) return 'cero';
  const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis',
    'diecisiete', 'dieciocho', 'diecinueve'];
  const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta',
    'sesenta', 'setenta', 'ochenta', 'noventa'];
  const centenas = ['', 'cien', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
    'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
  function menorMil(n) {
    if (n < 20) return unidades[n];
    if (n < 30) return n === 20 ? 'veinte' : 'veinti' + unidades[n % 10];
    if (n < 100) { const r = n % 10; return decenas[Math.floor(n / 10)] + (r > 0 ? ' y ' + unidades[r] : ''); }
    if (n === 100) return 'cien';
    const r = n % 100;
    return centenas[Math.floor(n / 100)] + (r > 0 ? ' ' + menorMil(r) : '');
  }
  function convertir(n) {
    if (n < 1000) return menorMil(n);
    if (n < 1000000) { const m = Math.floor(n / 1000); const r = n % 1000; return (m === 1 ? 'mil' : menorMil(m) + ' mil') + (r > 0 ? ' ' + menorMil(r) : ''); }
    const m = Math.floor(n / 1000000); const r = n % 1000000;
    return (m === 1 ? 'un millón' : menorMil(m) + ' millones') + (r > 0 ? ' ' + convertir(r) : '');
  }
  return convertir(num);
}

function formatearTelefono(telefono) {
  const limpio = String(telefono).replace(/\D/g, '');
  if (limpio.length === 10) return `+57${limpio}`;
  if (limpio.length >= 11 && limpio.length <= 15) return `+${limpio}`;
  return null;
}

const GERENCIA = ['Mateo', 'Alejo P', 'Alejo Plata'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { contrasena, accion, ...payload } = req.body;

  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];
  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!GERENCIA.includes(nombreAsesor)) {
    return res.status(403).json({ status: 'error', mensaje: 'Solo gerencia puede gestionar las llamadas.' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // ── PREVIEW: muestra los clientes que serían llamados ──
  if (accion === 'preview') {
    try {
      const maxAbonado = payload.max_abonado;

      let query = supabase
        .from('boletas')
        .select('numero, saldo_restante, total_abonado, telefono_cliente, clientes(nombre, apellido)')
        .gt('saldo_restante', 0)
        .not('telefono_cliente', 'is', null);

      if (maxAbonado !== undefined && maxAbonado !== null && maxAbonado !== '') {
        query = query.lte('total_abonado', Number(maxAbonado));
      }

      const { data: boletas, error } = await query;
      if (error) throw error;
      if (!boletas || boletas.length === 0) {
        return res.status(200).json({ status: 'ok', clientes: [], total_clientes: 0, total_saldo: 0 });
      }

      const porCliente = {};
      for (const b of boletas) {
        const tel = b.telefono_cliente;
        if (!porCliente[tel]) {
          porCliente[tel] = {
            telefono: tel,
            nombre: b.clientes?.nombre || 'Sin nombre',
            apellido: b.clientes?.apellido || '',
            boletas: [],
            totalSaldo: 0
          };
        }
        porCliente[tel].boletas.push(b.numero);
        porCliente[tel].totalSaldo += Number(b.saldo_restante);
      }

      const clientes = Object.values(porCliente)
        .filter(c => formatearTelefono(c.telefono) !== null)
        .sort((a, b) => b.totalSaldo - a.totalSaldo);

      const totalSaldo = clientes.reduce((s, c) => s + c.totalSaldo, 0);

      return res.status(200).json({
        status: 'ok',
        clientes,
        total_clientes: clientes.length,
        total_saldo: totalSaldo,
        total_boletas: boletas.length
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', mensaje: error.message });
    }
  }

  // ── LANZAR: ejecuta las llamadas a los clientes seleccionados ──
  if (accion === 'lanzar') {
    try {
      const { clientes_seleccionados, plantilla } = payload;
      if (!clientes_seleccionados || clientes_seleccionados.length === 0) {
        return res.status(400).json({ status: 'error', mensaje: 'No seleccionaste ningún cliente.' });
      }

      const twilio = (await import('twilio')).default;
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const appUrl = process.env.APP_URL;
      if (!appUrl) return res.status(500).json({ status: 'error', mensaje: 'Falta APP_URL en el servidor.' });

      const resultados = [];

      for (const cliente of clientes_seleccionados) {
        const telefonoE164 = formatearTelefono(cliente.telefono);
        if (!telefonoE164) {
          resultados.push({ telefono: cliente.telefono, nombre: cliente.nombre, status: 'omitido', detalle: 'Teléfono inválido' });
          continue;
        }

        const params = new URLSearchParams({
          nombre: cliente.nombre,
          boletas: cliente.boletas.join(','),
          total: numeroAPalabras(cliente.totalSaldo)
        });
        if (plantilla) params.set('plantilla', plantilla);
        const twimlUrl = `${appUrl}/api/twiml/cobro?${params.toString()}`;

        try {
          const statusCallbackUrl = `${appUrl}/api/twiml/estado-llamada`;
          const llamada = await twilioClient.calls.create({
            to: telefonoE164,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: twimlUrl,
            method: 'GET',
            record: true,
            recordingStatusCallback: statusCallbackUrl,
            recordingStatusCallbackMethod: 'POST',
            statusCallback: statusCallbackUrl,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            statusCallbackMethod: 'POST'
          });

          await supabase.from('llamadas_twilio').insert({
            sid: llamada.sid,
            telefono: cliente.telefono,
            nombre_cliente: `${cliente.nombre} ${cliente.apellido || ''}`.trim(),
            boletas: cliente.boletas.join(', '),
            saldo: cliente.totalSaldo,
            estado: 'iniciada',
            lanzada_por: nombreAsesor
          });

          await supabase.from('registro_movimientos').insert({
            asesor: nombreAsesor,
            accion: 'Llamada Automática',
            boleta: cliente.boletas.join(', '),
            detalle: `Difusión por ${nombreAsesor}: Llamada a ${cliente.nombre} (${cliente.telefono}). Saldo: $${cliente.totalSaldo.toLocaleString('es-CO')}. SID: ${llamada.sid}`
          });

          resultados.push({
            telefono: cliente.telefono,
            nombre: cliente.nombre,
            boletas: cliente.boletas,
            saldo: cliente.totalSaldo,
            status: 'ok',
            sid: llamada.sid
          });
        } catch (errLlamada) {
          resultados.push({ telefono: cliente.telefono, nombre: cliente.nombre, status: 'error', detalle: errLlamada.message });
        }
      }

      return res.status(200).json({
        status: 'ok',
        total: clientes_seleccionados.length,
        exitosas: resultados.filter(r => r.status === 'ok').length,
        fallidas: resultados.filter(r => r.status === 'error').length,
        omitidas: resultados.filter(r => r.status === 'omitido').length,
        resultados
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', mensaje: error.message });
    }
  }

  // ── HISTORIAL: llamadas recientes desde la tabla llamadas_twilio ──
  if (accion === 'historial') {
    try {
      const limite = payload.limite || 200;
      const { data, error } = await supabase
        .from('llamadas_twilio')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limite);

      if (error) throw error;
      return res.status(200).json({ status: 'ok', llamadas: data || [] });
    } catch (error) {
      return res.status(500).json({ status: 'error', mensaje: error.message });
    }
  }

  // ── TEST: llamada de prueba a un número específico ──
  if (accion === 'test') {
    try {
      const { telefono_test, plantilla } = payload;
      if (!telefono_test) return res.status(400).json({ status: 'error', mensaje: 'Falta el número de teléfono.' });

      const telefonoE164 = formatearTelefono(telefono_test);
      if (!telefonoE164) return res.status(400).json({ status: 'error', mensaje: 'Número de teléfono inválido.' });

      const twilio = (await import('twilio')).default;
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const appUrl = process.env.APP_URL;
      if (!appUrl) return res.status(500).json({ status: 'error', mensaje: 'Falta APP_URL en el servidor.' });

      const params = new URLSearchParams({
        nombre: 'Cliente Prueba',
        boletas: '0000',
        total: 'cien mil'
      });
      if (plantilla) params.set('plantilla', plantilla);
      const twimlUrl = `${appUrl}/api/twiml/cobro?${params.toString()}`;

      const llamada = await twilioClient.calls.create({
        to: telefonoE164,
        from: process.env.TWILIO_PHONE_NUMBER,
        url: twimlUrl,
        method: 'GET'
      });

      return res.status(200).json({
        status: 'ok',
        mensaje: `Llamada de prueba enviada a ${telefonoE164}`,
        sid: llamada.sid
      });
    } catch (error) {
      return res.status(500).json({ status: 'error', mensaje: error.message });
    }
  }

  return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida. Usa: preview, lanzar, historial, test' });
}
