/**
 * GET /api/app/numeros-disponibles
 *
 * Devuelve numeros de boleta disponibles para comprar.
 *
 * Query params:
 *   - tipo: "4cifras" | "2cifras" | "3cifras" (default: "4cifras")
 *   - cantidad: cuantos numeros devolver (default 20, max 50)
 *   - buscar: buscar un numero especifico (ej: "0523")
 *
 * No requiere autenticacion (info publica).
 */

import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS', 'Content-Type, Authorization')) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo no permitido' });
  }

  const tipo = req.query.tipo || '4cifras';
  const cantidad = Math.min(Number(req.query.cantidad) || 20, 50);
  const buscar = req.query.buscar || null;

  const tiposValidos = ['4cifras', '2cifras', '3cifras'];
  if (!tiposValidos.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo invalido. Usa: 4cifras, 2cifras o 3cifras' });
  }

  const tablas = {
    '4cifras': 'boletas',
    '2cifras': 'boletas_diarias',
    '3cifras': 'boletas_diarias_3cifras',
  };

  try {
    // Si busca un numero especifico
    if (buscar) {
      const { data, error } = await supabase
        .from(tablas[tipo])
        .select('numero, estado, precio_total')
        .eq('numero', buscar)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Numero no encontrado' });
      }

      return res.status(200).json({
        numero: data.numero,
        disponible: data.estado === 'Disponible',
        estado: data.estado,
        precio: Number(data.precio_total || 0),
      });
    }

    // Traer numeros disponibles
    // Para 4 cifras: seleccionar variedad de diferentes series (0xxx, 1xxx, etc)
    if (tipo === '4cifras') {
      const disponibles = [];

      // Traer algunos de cada serie para variedad
      const porSerie = Math.max(Math.ceil(cantidad / 10), 2);
      const promesas = [];

      for (let i = 0; i <= 9; i++) {
        const prefijo = String(i);
        promesas.push(
          supabase
            .from('boletas')
            .select('numero, precio_total')
            .eq('estado', 'Disponible')
            .gte('numero', prefijo + '000')
            .lte('numero', prefijo + '999')
            .limit(porSerie)
        );
      }

      const resultados = await Promise.all(promesas);
      for (const r of resultados) {
        if (r.data) disponibles.push(...r.data);
      }

      // Mezclar y limitar
      disponibles.sort(() => Math.random() - 0.5);
      const seleccionados = disponibles.slice(0, cantidad);
      seleccionados.sort((a, b) => Number(a.numero) - Number(b.numero));

      // Contar total disponibles
      const { count } = await supabase
        .from('boletas')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'Disponible');

      return res.status(200).json({
        tipo,
        numeros: seleccionados.map(n => ({
          numero: n.numero,
          precio: Number(n.precio_total || 0),
        })),
        total_disponibles: count || 0,
        mostrando: seleccionados.length,
      });

    } else {
      // Para diarias: son pocos numeros, traer todos los disponibles
      const { data, error } = await supabase
        .from(tablas[tipo])
        .select('numero, precio_total')
        .eq('estado', 'Disponible')
        .order('numero', { ascending: true });

      if (error) throw error;

      return res.status(200).json({
        tipo,
        numeros: (data || []).map(n => ({
          numero: n.numero,
          precio: Number(n.precio_total || 0),
        })),
        total_disponibles: (data || []).length,
        mostrando: (data || []).length,
      });
    }

  } catch (error) {
    console.error('Error en numeros-disponibles:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
