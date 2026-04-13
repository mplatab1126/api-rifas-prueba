/**
 * GET /api/app/contacto
 *
 * Devuelve la informacion de contacto y soporte para la app.
 * Los clientes pueden usar esto para abrir WhatsApp directamente
 * o ver las cuentas de pago.
 *
 * No requiere autenticacion.
 */

import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS', 'Content-Type, Authorization')) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  res.status(200).json({
    empresa: 'Los Plata S.A.S.',
    whatsapp: {
      linea_1: process.env.WHATSAPP_LINEA_1 || '',
      linea_2: process.env.WHATSAPP_LINEA_2 || '',
    },
    horario: 'Lunes a Sabado, 8:00 AM - 6:00 PM',
    metodos_pago: [
      {
        plataforma: 'Nequi',
        numero: process.env.NEQUI_NUMERO || '',
        titular: process.env.NEQUI_TITULAR || 'Los Plata S.A.S.',
      },
      {
        plataforma: 'Daviplata',
        numero: process.env.DAVIPLATA_NUMERO || '',
        titular: process.env.DAVIPLATA_TITULAR || 'Los Plata S.A.S.',
      },
      {
        plataforma: 'Bancolombia',
        numero: process.env.BANCOLOMBIA_CUENTA || '',
        titular: process.env.BANCOLOMBIA_TITULAR || 'Los Plata S.A.S.',
        tipo_cuenta: process.env.BANCOLOMBIA_TIPO || 'Ahorros',
      },
    ],
    redes_sociales: {
      instagram: process.env.INSTAGRAM_URL || '',
      facebook: process.env.FACEBOOK_URL || '',
    },
    web: 'https://www.losplata.com.co',
  });
}
