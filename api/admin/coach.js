export default async function handler(req, res) {
  // Permisos para que tu página pueda leer esto
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Recibimos el nombre del asesor que inició sesión
  const { nombre } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ mensaje: "Falta conectar la llave de la IA en Vercel." });
  }

  // Las instrucciones secretas para la IA (El Prompt)
  const prompt = `Actúa como un coach de ventas motivacional para la empresa Los Plata. El asesor ${nombre} acaba de iniciar sesión en su panel de trabajo. Salúdalo con mucho entusiasmo en un solo párrafo muy corto (máximo 40 palabras). Motívalo a vender boletas de la rifa hoy y recuérdale que su esfuerzo lo acerca a sus metas. Usa un par de emojis.`;

  try {
    // Nos conectamos a Google Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    const data = await response.json();
    const mensajeCoach = data.candidates[0].content.parts[0].text;

    // Le enviamos el mensaje a tu página
    res.status(200).json({ mensaje: mensajeCoach });
  } catch (error) {
    // Si la IA falla, mandamos un mensaje de emergencia
    res.status(500).json({ mensaje: `¡Hola ${nombre}! Hoy es un gran día para romper récords de ventas. ¡Vamos con toda! 🚀` });
  }
}
