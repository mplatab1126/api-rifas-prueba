import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error' });

  const { texto, cifras } = req.body;
  if (!texto || texto.trim().length < 3) {
    return res.status(400).json({ status: 'error', mensaje: 'Cuéntame más sobre tu sueño o señal.' });
  }

  const numCifras = cifras === 3 ? 3 : 2;
  const rangoMax = numCifras === 3 ? 999 : 99;
  const rangoDesc = numCifras === 3 ? 'del 001 al 999, de 3 cifras' : 'del 01 al 99, de 2 cifras';

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ status: 'error', mensaje: 'El Oráculo no está disponible en este momento.' });

  try {
    const prompt = `Eres el Oráculo de la Suerte de "Los Plata", una rifa colombiana. Tu misión es interpretar sueños y señales del día para sugerir números de la suerte en la lotería diaria (números ${rangoDesc}).

El cliente te dice: "${texto}"

Responde en este JSON exacto (sin markdown, sin explicaciones extra):
{
  "interpretacion": "Una frase poética, mística y motivadora de máximo 2 oraciones que interprete la señal o sueño. Usa emojis sutiles. Habla en segunda persona (tú).",
  "numeros": [número1, número2, número3]
}

Los números deben ser enteros entre 1 y ${rangoMax}, elegidos con lógica simbólica relacionada al sueño (ej: un gato → ${numCifras === 3 ? '170' : '17'} por la tradición de la charada, un perro → ${numCifras === 3 ? '070' : '07'}, etc.). Devuelve exactamente 3 números distintos.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const raw = data.content?.[0]?.text?.trim();
    if (!raw) throw new Error('Sin respuesta de la IA');

    const parsed = JSON.parse(raw);

    return res.status(200).json({
      status: 'ok',
      interpretacion: parsed.interpretacion,
      numeros: parsed.numeros
    });

  } catch (e) {
    return res.status(500).json({
      status: 'error',
      mensaje: '🔮 Las estrellas están nubladas en este momento. Intenta de nuevo en unos segundos.'
    });
  }
}
