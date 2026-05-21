import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena } = req.body;
  if (!validarAsesor(contrasena)) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  try {
    // Mapa de asesor y fecha por boleta (ventas), y set de avisos de llamada
    const { data: movimientos } = await supabase
      .from('registro_movimientos')
      .select('boleta, asesor, accion, created_at')
      .in('accion', ['Nueva Venta', 'Aviso Llamada', 'Aviso Cobro'])
      .order('created_at', { ascending: true });

    const movMap = {};
    const avisosSet = new Set();
    const avisosInfo = {};
    const cobrosSet = new Set();
    const cobrosInfo = {};

    (movimientos || []).forEach(m => {
      if (m.accion === 'Nueva Venta' && m.boleta && !movMap[m.boleta]) movMap[m.boleta] = m;
      if (m.accion === 'Aviso Llamada' && m.boleta) {
        avisosSet.add(String(m.boleta));
        avisosInfo[String(m.boleta)] = { asesor: m.asesor, fecha: m.created_at };
      }
      if (m.accion === 'Aviso Cobro' && m.boleta) {
        cobrosSet.add(String(m.boleta));
        cobrosInfo[String(m.boleta)] = { asesor: m.asesor, fecha: m.created_at };
      }
    });

    // Boletas grandes (4 cifras): solo las separadas sin abono
    const { data: grandes, error: errGrandes } = await supabase
      .from('boletas')
      .select('numero, asesor, fecha_venta, telefono_cliente, clientes(nombre, apellido)')
      .not('telefono_cliente', 'is', null)
      .neq('estado', 'LIBRE')
      .eq('total_abonado', 0);

    if (errGrandes) throw errGrandes;

    const lista = [];

    (grandes || []).forEach(b => {
      const num = String(b.numero);
      lista.push({
        numero: b.numero,
        tipo: 'grande',
        nombre: b.clientes ? `${b.clientes.nombre || ''} ${b.clientes.apellido || ''}`.trim() : 'Sin nombre',
        telefono: b.telefono_cliente || '',
        asesor: b.asesor || movMap[num]?.asesor || '—',
        fecha_venta: b.fecha_venta || movMap[num]?.created_at || null,
        llamada: avisosSet.has(num),
        llamada_asesor: avisosInfo[num]?.asesor || null,
        llamada_fecha: avisosInfo[num]?.fecha || null,
        cobro: cobrosSet.has(num),
        cobro_asesor: cobrosInfo[num]?.asesor || null,
        cobro_fecha: cobrosInfo[num]?.fecha || null
      });
    });

    // Ordenar de más antigua a más nueva
    lista.sort((a, b) => {
      if (!a.fecha_venta) return 1;
      if (!b.fecha_venta) return -1;
      return new Date(a.fecha_venta) - new Date(b.fecha_venta);
    });

    return res.status(200).json({ status: 'ok', lista, total: lista.length });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
