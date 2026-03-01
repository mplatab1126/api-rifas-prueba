import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Permisos CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { stats, globales, contrasena } = req.body;

  // Seguridad
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  if (!asesores[contrasena]) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const openAiKey = process.env.OPENAI_API_KEY; 
  if (!openAiKey) return res.status(500).json({ status: 'error', mensaje: 'Falta la API Key de OpenAI en el servidor' });

  try {
    // 🧠 EL PROMPT MAESTRO PARA LA IA
    const prompt = `
      Eres un Analista de Datos Senior y Director Comercial de Alto Nivel.
      A continuación, te proporciono las estadísticas filtradas de nuestra operación de venta de rifas (boletas) para un apartamento.

      DATOS GLOBALES DEL PERIODO:
      ${JSON.stringify(globales)}

      RENDIMIENTO POR ASESOR:
      ${JSON.stringify(stats)}

      Instrucciones:
      Devuelve ÚNICAMENTE un reporte en código HTML limpio (sin etiquetas <html>, <head> o <body>, solo el contenido interior). Usa este estilo visual en línea:
      - Títulos con <h3> y <h4>, usando color #0f172a y fuente sans-serif.
      - Párrafos legibles con color #475569 y font-size 0.95rem.
      - Para resaltar métricas buenas usa color #10b981 (verde fuerte) y para métricas malas usa #ef4444 (rojo).
      - Utiliza listas <ul> y <li> con márgenes limpios.
      - Utiliza separadores <hr style="border:0; border-top:1px dashed #cbd5e1; margin:20px 0;">.

      Estructura Obligatoria del Reporte (Compórtate como un profesional estadístico):
      1. 📊 RESUMEN EJECUTIVO: Un análisis duro del panorama general. (¿Fueron buenos los ingresos totales? ¿La conversión general es sana o estamos quemando tráfico?).
      2. 👤 ANÁLISIS DETALLADO POR ASESOR: Evalúa a CADA asesor presente en los datos sacando 1 conclusión por cada uno basada en cruzar sus datos:
         - Analiza su relación entre 'Ventas (Nuevas)' y 'Cantidad de Abonos'.
         - Analiza su Tasa de Conversión y su Ingreso por Chat (IPC).
         - Identifica anomalías (Ej: "Este asesor tiene muchos chats y 0 ventas, está perdiendo tráfico", o "Este asesor recauda mucho pero no chatea, está gestionando cartera").
      3. 🚀 3 RECOMENDACIONES ESTRATÉGICAS: Basado puramente en los cuellos de botella de estos datos, dime qué directrices debo darle al equipo mañana.
      
      No incluyas saludos genéricos, ni comillas invertidas de markdown (\`\`\`). Entrega directamente el HTML puro. Sé incisivo, analítico, crítico y constructivo. Usa emojis de forma profesional.
    `;

    // Llamada a OpenAI
    const responseAI = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Usamos el modelo más inteligente
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    const dataAI = await responseAI.json();
    if (dataAI.error) throw new Error(dataAI.error.message);

    // Limpiamos el texto por si OpenAI manda bloques de markdown
    const htmlReport = dataAI.choices[0].message.content.trim().replace(/```html/g, '').replace(/```/g, '');

    return res.status(200).json({ status: 'ok', html: htmlReport });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error en la IA: ' + error.message });
  }
}
