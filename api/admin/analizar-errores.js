import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { CLASIFICADOR_SYSTEM_DEFAULT } from '../chateapro/clasificador-prompt.js';

/**
 * Agente Analista — analiza errores en Supabase y devuelve reporte en markdown
 * con recomendaciones para mejorar el prompt del clasificador.
 * Usa Claude Sonnet 4.6 (más inteligente que Haiku para detectar patrones).
 *
 * Body: { contrasena: "LosP", horas?: 2 }
 * Respuesta: { status:'ok', stats:{...}, reporte_markdown:'...' }
 */

const SOLO_MATEO_DEFAULT = ['mateo'];

async function tienePermiso(asesorNombre) {
  const name = asesorNombre.toLowerCase().trim();
  const { data } = await supabaseAdmin
    .from('permisos_asesores')
    .select('permitido')
    .eq('asesor_nombre', asesorNombre)
    .eq('pagina_id', 'clasificaciones')
    .maybeSingle();
  if (data && typeof data.permitido === 'boolean') return data.permitido;
  return SOLO_MATEO_DEFAULT.includes(name);
}

async function callSonnet(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || JSON.stringify(d));
  return (d.content?.[0]?.text || '').trim();
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const nombre = validarAsesor(req.body?.contrasena);
  if (!nombre) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!(await tienePermiso(nombre))) {
    return res.status(403).json({ status: 'error', mensaje: 'No tienes permiso' });
  }

  const horas = Math.max(1, Math.min(168, Number(req.body?.horas) || 24));
  const desde = new Date(Date.now() - horas * 3600 * 1000).toISOString();
  const incluirAnalizadas = !!req.body?.incluir_analizadas;

  let query = supabase
    .from('clasificaciones_plantilla')
    .select('id, categoria, mensaje_analizado, evaluado_at, evaluacion_correcta, evaluacion_categoria_correcta, evaluacion_razon')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1000);

  // Por defecto, solo las que no han sido analizadas por el agente
  if (!incluirAnalizadas) query = query.is('analizado_agente_at', null);

  const { data: rows, error } = await query;

  if (error) return res.status(500).json({ status: 'error', mensaje: error.message });
  if (!rows || rows.length === 0) {
    return res.status(200).json({
      status: 'ok',
      mensaje: incluirAnalizadas
        ? 'Sin datos en este período'
        : 'Sin clasificaciones nuevas desde el último análisis. Activa "Re-analizar todo" si quieres revisar el período completo.',
      stats: null,
      reporte_markdown: '',
    });
  }

  const evaluadas = rows.filter(r => r.evaluado_at);
  const correctas = evaluadas.filter(r => r.evaluacion_correcta === true);
  const errores = evaluadas.filter(r => r.evaluacion_correcta === false);

  const stats = {
    total: rows.length,
    evaluadas: evaluadas.length,
    correctas: correctas.length,
    errores: errores.length,
    precision_pct: evaluadas.length > 0 ? +(correctas.length / evaluadas.length * 100).toFixed(1) : null,
  };

  if (errores.length === 0) {
    // Marcar como analizadas SOLO las que realmente se analizaron (las evaluadas por el monitor)
    if (!incluirAnalizadas && evaluadas.length > 0) {
      const ids = evaluadas.map(r => r.id);
      await supabase
        .from('clasificaciones_plantilla')
        .update({ analizado_agente_at: new Date().toISOString() })
        .in('id', ids);
    }
    return res.status(200).json({
      status: 'ok',
      stats,
      analizadas_ahora: evaluadas.length,
      reporte_markdown: `## ✅ Sin errores\n\nEn las últimas ${horas}h se evaluaron ${evaluadas.length} clasificaciones y **todas fueron correctas**. El prompt está funcionando bien.`,
    });
  }

  // Agrupar por transición de error
  const trans = {};
  for (const r of errores) {
    const k = `${r.categoria} → ${r.evaluacion_categoria_correcta || '?'}`;
    if (!trans[k]) trans[k] = { count: 0, ejemplos: [] };
    trans[k].count++;
    if (trans[k].ejemplos.length < 5) trans[k].ejemplos.push({ msg: (r.mensaje_analizado || '').substring(0, 200), razon: r.evaluacion_razon || '' });
  }
  const sortedTrans = Object.entries(trans).sort((a, b) => b[1].count - a[1].count);

  const ejemplos = errores.slice(0, 25).map(e =>
    `- Cliente dijo: "${(e.mensaje_analizado || '').substring(0, 200)}"\n  Bot clasificó: ${e.categoria}\n  Correcto: ${e.evaluacion_categoria_correcta || '?'}\n  Razón: ${e.evaluacion_razon || ''}`
  ).join('\n\n');

  const prompt = `Eres un analista experto en clasificación de intenciones con LLMs. Analiza los errores y propone mejoras CONCRETAS al prompt del clasificador de Los Plata (rifas Colombia).

=== PROMPT ACTUAL ===
${CLASIFICADOR_SYSTEM_DEFAULT}

=== DATOS ===
Total evaluados: ${stats.evaluadas} | Precisión: ${stats.precision_pct}% | Errores: ${stats.errores}

Transiciones frecuentes (categoria_bot → debería):
${sortedTrans.slice(0, 8).map(([k, v]) => `  ${k}: ${v.count} casos`).join('\n')}

Ejemplos:
${ejemplos}

=== TAREA ===
Responde en este formato markdown:

## 🎯 Diagnóstico
3 líneas máximo.

## 🔍 Patrones de error
Por cada patrón:
- **Patrón X**: descripción
- Evidencia (2 ejemplos cortos)
- Frecuencia

## 🛠️ Recomendaciones concretas al prompt
Texto exacto para copy-paste. Sé específico.

## ⚖️ ¿Modelo o prompt?
- Si los errores son casos cubiertos por el prompt pero Haiku los ignora → subir a Sonnet.
- Si son casos no cubiertos → mejorar prompt con recomendaciones arriba.

## 📈 Precisión esperada
Estimación con las mejoras.

Sé directo en español colombiano.`;

  try {
    const reporte = await callSonnet(prompt);

    // Marcar como analizadas SOLO las que realmente se analizaron (las evaluadas por el monitor)
    if (!incluirAnalizadas && evaluadas.length > 0) {
      const ids = evaluadas.map(r => r.id);
      await supabase
        .from('clasificaciones_plantilla')
        .update({ analizado_agente_at: new Date().toISOString() })
        .in('id', ids);
    }

    return res.status(200).json({ status: 'ok', stats, analizadas_ahora: evaluadas.length, reporte_markdown: reporte });
  } catch (e) {
    return res.status(500).json({ status: 'error', mensaje: 'Error del analista: ' + e.message });
  }
}
