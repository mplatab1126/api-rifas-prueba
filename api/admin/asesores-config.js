import { supabaseAdmin as supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { invalidarCacheAsesores } from '../lib/asesores.js';

// ──────────────────────────────────────────────────────────────────────────
// Endpoint para la configuración por asesor (tabla `asesores_config`).
//
// Centraliza flags que antes estaban hardcoded en 7 archivos distintos.
// Por ahora solo maneja `es_independiente`, pero está pensado para
// agregar más flags en el futuro sin cambiar la API.
//
// Acciones:
//   - listar:     devuelve TODOS los asesores (desde ASESORES_SECRETO)
//                 y sus flags actuales. Solo Mateo.
//   - actualizar: cambia un flag para un asesor. Solo Mateo.
// ──────────────────────────────────────────────────────────────────────────

const ADMINS = ['mateo'];

function listarTodosLosAsesores() {
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  // Conjunto único de nombres (puede haber varias contraseñas para un mismo asesor)
  return [...new Set(Object.values(asesores))].sort((a, b) => a.localeCompare(b, 'es'));
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { contrasena, accion, asesor_nombre, campo, valor } = req.body || {};

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }

  // ── Lista de nombres marcados como independientes ──
  // Accesible para cualquier asesor autenticado: el frontend necesita
  // saber esta lista para decidir qué UI mostrar (ej. ocultar el toggle
  // "oficina/calle" cuando un independiente registra efectivo).
  if (accion === 'lista_independientes') {
    const { data, error } = await supabase
      .from('asesores_config')
      .select('asesor_nombre')
      .eq('es_independiente', true);

    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });

    return res.status(200).json({
      status: 'ok',
      independientes: (data || []).map(r => r.asesor_nombre)
    });
  }

  // ── Las siguientes acciones solo son para Mateo ──
  if (!ADMINS.includes(nombreAsesor.toLowerCase())) {
    return res.status(403).json({ status: 'error', mensaje: 'Solo el administrador puede gestionar asesores.' });
  }

  // ── Listar todos los asesores con su configuración actual ──
  if (!accion || accion === 'listar') {
    const todos = listarTodosLosAsesores();

    const { data, error } = await supabase
      .from('asesores_config')
      .select('asesor_nombre, es_independiente, updated_at');

    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });

    const mapa = new Map((data || []).map(r => [r.asesor_nombre, r]));

    const asesores = todos.map(nombre => {
      const config = mapa.get(nombre);
      return {
        nombre,
        es_independiente: config?.es_independiente ?? false,
        existe_en_bd: !!config
      };
    });

    return res.status(200).json({ status: 'ok', asesores });
  }

  // ── Actualizar un flag para un asesor ──
  if (accion === 'actualizar') {
    if (!asesor_nombre || !campo || typeof valor !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        mensaje: 'Faltan campos: asesor_nombre, campo, valor (boolean)'
      });
    }

    // Whitelist de campos editables (evita que se mande cualquier columna)
    const CAMPOS_PERMITIDOS = ['es_independiente'];
    if (!CAMPOS_PERMITIDOS.includes(campo)) {
      return res.status(400).json({ status: 'error', mensaje: `Campo '${campo}' no editable.` });
    }

    // Verificar que el asesor exista en ASESORES_SECRETO (no permitir crear nombres random)
    const todos = listarTodosLosAsesores();
    if (!todos.includes(asesor_nombre)) {
      return res.status(400).json({
        status: 'error',
        mensaje: `'${asesor_nombre}' no es un asesor registrado.`
      });
    }

    const payload = {
      asesor_nombre,
      [campo]: valor,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('asesores_config')
      .upsert(payload, { onConflict: 'asesor_nombre' });

    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });

    invalidarCacheAsesores();
    return res.status(200).json({ status: 'ok', mensaje: 'Asesor actualizado.' });
  }

  return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida.' });
}
