import crypto from 'crypto';
import { aplicarCors } from '../lib/cors.js';
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'POST,OPTIONS')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { telefono, boletas, monto } = req.body || {};

  if (!telefono || !Array.isArray(boletas) || boletas.length === 0 || !monto) {
    return res.status(400).json({ error: 'Faltan datos: telefono, boletas[] y monto' });
  }

  const last10 = String(telefono).replace(/\D/g, '').slice(-10);
  const montoNum = Math.floor(Number(monto));

  if (Number.isNaN(montoNum) || montoNum < 10000) {
    return res.status(400).json({ error: 'El monto mínimo es $10.000' });
  }

  // Normalizar números de boleta (siempre 4 dígitos)
  const boletasLimpias = boletas.map(b => String(b).padStart(4, '0'));

  try {
    // Validar que las boletas existen y pertenecen a este teléfono
    const { data: boletasDB, error } = await supabase
      .from('boletas')
      .select('numero, saldo_restante, telefono_cliente')
      .in('numero', boletasLimpias)
      .like('telefono_cliente', '%' + last10);

    if (error) throw error;
    if (!boletasDB || boletasDB.length !== boletasLimpias.length) {
      return res.status(404).json({ error: 'Una o más boletas no se encontraron para este teléfono' });
    }

    const totalSaldo = boletasDB.reduce((s, b) => s + Number(b.saldo_restante || 0), 0);
    if (montoNum > totalSaldo) {
      return res.status(400).json({ error: `El monto ($${montoNum}) supera el saldo total pendiente ($${totalSaldo})` });
    }

    // Reference autodescriptiva: ABO-{last10}-{boletas separadas por punto}-{montoPesos}-{ts}
    const ts = Date.now();
    const reference = `ABO-${last10}-${boletasLimpias.join('.')}-${montoNum}-${ts}`;

    if (reference.length > 95) {
      return res.status(400).json({ error: 'Demasiadas boletas seleccionadas' });
    }

    // Calcular signature de integridad (Wompi exige sha256)
    const amountInCents = montoNum * 100;
    const currency = 'COP';
    const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;

    if (!integritySecret) {
      return res.status(500).json({ error: 'Falta configurar WOMPI_INTEGRITY_SECRET' });
    }

    const stringToSign = `${reference}${amountInCents}${currency}${integritySecret}`;
    const signature = crypto.createHash('sha256').update(stringToSign).digest('hex');

    const publicKey = process.env.WOMPI_PUBLIC_KEY;
    if (!publicKey) {
      return res.status(500).json({ error: 'Falta configurar WOMPI_PUBLIC_KEY' });
    }

    const redirectUrl = 'https://www.losplata.com.co/abonar';

    const checkoutUrl = 'https://checkout.wompi.co/p/?' + [
      `public-key=${encodeURIComponent(publicKey)}`,
      `currency=${currency}`,
      `amount-in-cents=${amountInCents}`,
      `reference=${encodeURIComponent(reference)}`,
      `signature:integrity=${signature}`,
      `redirect-url=${encodeURIComponent(redirectUrl)}`
    ].join('&');

    return res.status(200).json({ url: checkoutUrl, reference });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
