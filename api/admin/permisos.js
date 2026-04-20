import { supabaseAdmin as supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

const PAGINAS = [
  { id: 'admin',             label: 'Panel de Ventas' },
  { id: 'caja',              label: 'Cuadre de Caja' },
  { id: 'rifas-menu',        label: 'Rifas Diarias' },
  { id: 'rendimiento',       label: 'Rendimiento' },
  { id: 'llamadas',          label: 'Llamadas IA' },
  { id: 'horarios',          label: 'Gestión de Horarios' },
  { id: 'rifas',             label: 'Centro Financiero' },
  { id: 'estado',            label: 'Estado de Resultados' },
  { id: 'finanzas-alejo',    label: 'Finanzas personales (Alejo)' },
  { id: 'permisos',          label: 'Permisos' },
  { id: 'clasificaciones',   label: 'Monitor IA' },
];

const GERENCIA_DEFAULT = ['mateo', 'alejo p', 'alejo plata'];
const SOLO_MATEO_DEFAULT = ['mateo'];
const SOLO_ALEJO_DEFAULT = ['alejo p', 'alejo plata'];

function listarTodosLosAsesores() {
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  return [...new Set(Object.values(asesores))].sort();
}

function defaultPermitido(asesorNombre, paginaId) {
  const name = asesorNombre.toLowerCase().trim();
  if (['admin', 'caja', 'rifas-menu'].includes(paginaId)) return true;
  if (['rendimiento', 'llamadas', 'horarios'].includes(paginaId)) return GERENCIA_DEFAULT.includes(name);
  if (['rifas', 'estado', 'permisos', 'clasificaciones'].includes(paginaId)) return SOLO_MATEO_DEFAULT.includes(name);
  if (paginaId === 'finanzas-alejo') return SOLO_ALEJO_DEFAULT.includes(name);
  return false;
}

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST', 'Content-Type')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena, accion, asesor_nombre, pagina_id, permitido } = req.body;

  const nombreAsesor = validarAsesor(contrasena);
  if (!nombreAsesor) {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }

  // ── Obtener mis permisos (para sidebar / cache) ──
  if (!accion || accion === 'mis_permisos') {
    const { data, error } = await supabase
      .from('permisos_asesores')
      .select('pagina_id, permitido')
      .eq('asesor_nombre', nombreAsesor);

    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });

    const hasDb = data && data.length > 0;
    const permisos = {};

    if (hasDb) {
      for (const row of data) permisos[row.pagina_id] = row.permitido;
    } else {
      for (const p of PAGINAS) permisos[p.id] = defaultPermitido(nombreAsesor, p.id);
    }

    return res.status(200).json({ status: 'ok', permisos, asesor: nombreAsesor });
  }

  // ── Listar todos los permisos (solo admin) ──
  if (accion === 'listar_todo') {
    const ADMINS = ['mateo'];
    if (!ADMINS.includes(nombreAsesor.toLowerCase())) {
      return res.status(403).json({ status: 'error', mensaje: 'Solo administradores pueden ver todos los permisos.' });
    }

    const todosAsesores = listarTodosLosAsesores();

    const { data, error } = await supabase
      .from('permisos_asesores')
      .select('*')
      .order('asesor_nombre');

    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });

    const matrix = {};
    for (const asesor of todosAsesores) {
      matrix[asesor] = {};
      for (const pagina of PAGINAS) {
        const dbRow = data?.find(r => r.asesor_nombre === asesor && r.pagina_id === pagina.id);
        matrix[asesor][pagina.id] = dbRow ? dbRow.permitido : defaultPermitido(asesor, pagina.id);
      }
    }

    return res.status(200).json({
      status: 'ok',
      asesores: todosAsesores,
      paginas: PAGINAS,
      permisos: matrix
    });
  }

  // ── Actualizar un permiso ──
  if (accion === 'actualizar') {
    const ADMINS = ['mateo'];
    if (!ADMINS.includes(nombreAsesor.toLowerCase())) {
      return res.status(403).json({ status: 'error', mensaje: 'Solo administradores pueden modificar permisos.' });
    }

    if (!asesor_nombre || !pagina_id || typeof permitido !== 'boolean') {
      return res.status(400).json({ status: 'error', mensaje: 'Faltan campos: asesor_nombre, pagina_id, permitido' });
    }

    const { error } = await supabase
      .from('permisos_asesores')
      .upsert({
        asesor_nombre,
        pagina_id,
        permitido,
        updated_at: new Date().toISOString()
      }, { onConflict: 'asesor_nombre,pagina_id' });

    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });

    return res.status(200).json({ status: 'ok', mensaje: 'Permiso actualizado' });
  }

  // ── Inicializar permisos con valores por defecto ──
  if (accion === 'inicializar') {
    const ADMINS = ['mateo'];
    if (!ADMINS.includes(nombreAsesor.toLowerCase())) {
      return res.status(403).json({ status: 'error', mensaje: 'Solo administradores pueden inicializar permisos.' });
    }

    const todosAsesores = listarTodosLosAsesores();
    const rows = [];
    for (const asesor of todosAsesores) {
      for (const pagina of PAGINAS) {
        rows.push({
          asesor_nombre: asesor,
          pagina_id: pagina.id,
          permitido: defaultPermitido(asesor, pagina.id)
        });
      }
    }

    const { error } = await supabase
      .from('permisos_asesores')
      .upsert(rows, { onConflict: 'asesor_nombre,pagina_id' });

    if (error) return res.status(500).json({ status: 'error', mensaje: error.message });

    return res.status(200).json({ status: 'ok', inicializados: rows.length });
  }

  return res.status(400).json({ status: 'error', mensaje: 'Acción no reconocida.' });
}
