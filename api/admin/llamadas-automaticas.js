import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

// Convierte un número entero a palabras en español (para que la voz lo lea bien)
function numeroAPalabras(n) {
  const num = Math.round(n);
  if (num === 0) return 'cero';

  const unidades = [
    '', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis',
    'diecisiete', 'dieciocho', 'diecinueve'
  ];
  const decenas = [
    '', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta',
    'sesenta', 'setenta', 'ochenta', 'noventa'
  ];
  const centenas = [
    '', 'cien', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
    'seiscientos', 'setecientos', 'ochocientos', 'novecientos'
  ];

  function menorMil(n) {
    if (n < 20) return unidades[n];
    if (n < 30) return n === 20 ? 'veinte' : 'veinti' + unidades[n % 10];
    if (n < 100) {
      const resto = n % 10;
      return decenas[Math.floor(n / 10)] + (resto > 0 ? ' y ' + unidades[resto] : '');
    }
    if (n === 100) return 'cien';
    const resto = n % 100;
    return centenas[Math.floor(n / 100)] + (resto > 0 ? ' ' + menorMil(resto) : '');
  }

  function convertir(n) {
    if (n < 1000) return menorMil(n);
    if (n < 1000000) {
      const miles = Math.floor(n / 1000);
      const resto = n % 1000;
      const prefijo = miles === 1 ? 'mil' : menorMil(miles) + ' mil';
      return prefijo + (resto > 0 ? ' ' + menorMil(resto) : '');
    }
    const millones = Math.floor(n / 1000000);
    const resto = n % 1000000;
    const prefijo = millones === 1 ? 'un millón' : menorMil(millones) + ' millones';
    return prefijo + (resto > 0 ? ' ' + convertir(resto) : '');
  }

  return convertir(num);
}

// Convierte un celular colombiano de 10 dígitos al formato E.164 que exige Twilio
function formatearTelefono(telefono) {
  const limpio = String(telefono).replace(/\D/g, '');
  if (limpio.length === 10) return `+57${limpio}`;
  if (limpio.length === 12 && limpio.startsWith('57')) return `+${limpio}`;
  return null;
}

export default async function handler(req, res) {
  // Solo GET o POST (el cron de Vercel usa GET)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Seguridad: solo puede ejecutarse con el CRON_SECRET correcto
  const authHeader = req.headers['authorization'];
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const appUrl = process.env.APP_URL; // ej: https://tu-app.vercel.app

  if (!appUrl) {
    return res.status(500).json({ error: 'Falta la variable de entorno APP_URL' });
  }

  try {
    // 1. Consultar todas las boletas grandes con saldo pendiente y con cliente asignado
    const { data: boletas, error: errorBoletas } = await supabase
      .from('boletas')
      .select('numero, saldo_restante, telefono_cliente, clientes(nombre, apellido)')
      .gt('saldo_restante', 0)
      .not('telefono_cliente', 'is', null);

    if (errorBoletas) throw errorBoletas;
    if (!boletas || boletas.length === 0) {
      return res.status(200).json({ status: 'ok', mensaje: 'No hay boletas con saldo pendiente.', llamadas: 0 });
    }

    // 2. Agrupar boletas por cliente (un cliente puede tener varias boletas)
    const porCliente = {};
    for (const boleta of boletas) {
      const tel = boleta.telefono_cliente;
      if (!porCliente[tel]) {
        porCliente[tel] = {
          telefono: tel,
          nombre: boleta.clientes?.nombre || 'cliente',
          numeroBoletas: [],
          totalSaldo: 0
        };
      }
      porCliente[tel].numeroBoletas.push(boleta.numero);
      porCliente[tel].totalSaldo += Number(boleta.saldo_restante);
    }

    // 3. Hacer una llamada por cada cliente
    const resultados = [];

    for (const cliente of Object.values(porCliente)) {
      const telefonoE164 = formatearTelefono(cliente.telefono);

      if (!telefonoE164) {
        resultados.push({
          telefono: cliente.telefono,
          nombre: cliente.nombre,
          status: 'omitido',
          detalle: 'Número de teléfono con formato inválido'
        });
        continue;
      }

      // Armar la URL del TwiML con los datos del cliente codificados
      const params = new URLSearchParams({
        nombre: cliente.nombre,
        boletas: cliente.numeroBoletas.join(','),
        total: numeroAPalabras(cliente.totalSaldo)
      });
      const twimlUrl = `${appUrl}/api/twiml/cobro?${params.toString()}`;

      try {
        const llamada = await twilioClient.calls.create({
          to: telefonoE164,
          from: process.env.TWILIO_PHONE_NUMBER,
          url: twimlUrl,
          method: 'GET'
        });

        // Registrar en la bitácora de movimientos
        await supabase.from('registro_movimientos').insert({
          asesor: 'Sistema Automático',
          accion: 'Llamada Automática',
          boleta: cliente.numeroBoletas.join(', '),
          detalle: `Llamada de cobro a ${cliente.nombre} (${cliente.telefono}). Saldo: $${cliente.totalSaldo.toLocaleString('es-CO')}. SID: ${llamada.sid}`
        });

        resultados.push({
          telefono: cliente.telefono,
          nombre: cliente.nombre,
          boletas: cliente.numeroBoletas,
          saldo: cliente.totalSaldo,
          status: 'ok',
          sid: llamada.sid
        });

      } catch (errorLlamada) {
        resultados.push({
          telefono: cliente.telefono,
          nombre: cliente.nombre,
          status: 'error',
          detalle: errorLlamada.message
        });
      }
    }

    // 4. Respuesta con resumen del proceso
    return res.status(200).json({
      status: 'ok',
      total_clientes: Object.keys(porCliente).length,
      llamadas_exitosas: resultados.filter(r => r.status === 'ok').length,
      llamadas_fallidas: resultados.filter(r => r.status === 'error').length,
      llamadas_omitidas: resultados.filter(r => r.status === 'omitido').length,
      resultados
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
