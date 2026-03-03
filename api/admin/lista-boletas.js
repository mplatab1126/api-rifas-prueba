import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { contrasena } = req.body;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  if (!asesores[contrasena]) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // Mapa de asesor y fecha por boleta (ventas), y set de avisos de llamada
    const { data: movimientos } = await supabase
      .from('registro_movimientos')
      .select('boleta, asesor, accion, created_at')
      .in('accion', ['Nueva Venta', 'Aviso Llamada'])
      .order('created_at', { ascending: true });

    const movMap = {};
    const avisosSet = new Set();
    const avisosInfo = {};

    (movimientos || []).forEach(m => {
      if (m.accion === 'Nueva Venta' && m.boleta && !movMap[m.boleta]) movMap[m.boleta] = m;
      if (m.accion === 'Aviso Llamada' && m.boleta) {
        avisosSet.add(String(m.boleta));
        avisosInfo[String(m.boleta)] = { asesor: m.asesor, fecha: m.created_at };
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

    // Boletas diarias 2 cifras: solo las separadas sin abono
    const { data: diarias2, error: errDiarias2 } = await supabase
      .from('boletas_diarias')
      .select('numero, telefono_cliente, nombre_cliente')
      .not('telefono_cliente', 'is', null)
      .eq('total_abonado', 0);

    if (errDiarias2) throw errDiarias2;

    // Boletas diarias 3 cifras: solo las separadas sin abono
    const { data: diarias3, error: errDiarias3 } = await supabase
      .from('boletas_diarias_3cifras')
      .select('numero, telefono_cliente, nombre_cliente')
      .not('telefono_cliente', 'is', null)
      .eq('total_abonado', 0);

    if (errDiarias3) throw errDiarias3;

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
        llamada_fecha: avisosInfo[num]?.fecha || null
      });
    });

    (diarias2 || []).forEach(b => {
      const num = String(b.numero);
      const mov = movMap[num];
      lista.push({
        numero: b.numero,
        tipo: 'diaria2',
        nombre: b.nombre_cliente || 'Sin nombre',
        telefono: b.telefono_cliente || '',
        asesor: mov?.asesor || '—',
        fecha_venta: mov?.created_at || null,
        llamada: avisosSet.has(num),
        llamada_asesor: avisosInfo[num]?.asesor || null,
        llamada_fecha: avisosInfo[num]?.fecha || null
      });
    });

    (diarias3 || []).forEach(b => {
      const num = String(b.numero);
      const mov = movMap[num];
      lista.push({
        numero: b.numero,
        tipo: 'diaria3',
        nombre: b.nombre_cliente || 'Sin nombre',
        telefono: b.telefono_cliente || '',
        asesor: mov?.asesor || '—',
        fecha_venta: mov?.created_at || null,
        llamada: avisosSet.has(num),
        llamada_asesor: avisosInfo[num]?.asesor || null,
        llamada_fecha: avisosInfo[num]?.fecha || null
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
