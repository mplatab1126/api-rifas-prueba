import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { contrasena, excluidos = [], action } = req.body;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];

  if (!nombreAsesor) return res.status(401).json({ error: 'Contraseña incorrecta' });

  try {
    if (action === 'kpis') {
      const { count: totalRegistros } = await supabase
        .from('registro_sorteo')
        .select('*', { count: 'exact', head: true });

      const { data: allRegistros } = await supabase
        .from('registro_sorteo')
        .select('telefono_whatsapp')
      
      const participantesUnicos = new Set((allRegistros || []).map(r => r.telefono_whatsapp)).size;

      const { data: boletas } = await supabase
        .from('registro_sorteo')
        .select('numero_boleta');

      return res.status(200).json({
        total_boletas: totalRegistros || 0,
        participantes: participantesUnicos,
        boletas: (boletas || []).map(b => b.numero_boleta)
      });
    }

    if (action === 'generar') {
      let query = supabase
        .from('registro_sorteo')
        .select('*');

      if (excluidos.length > 0) {
        query = query.not('numero_boleta', 'in', '(' + excluidos.join(',') + ')');
      }

      const { data: elegibles, error } = await query;

      if (error) throw error;
      if (!elegibles || elegibles.length === 0) {
        return res.status(404).json({ error: 'No hay registros elegibles' });
      }

      const indice = Math.floor(Math.random() * elegibles.length);
      const ganador = elegibles[indice];

      return res.status(200).json({
        ganador: {
          nombre_completo: ganador.nombre_completo,
          ciudad: ganador.ciudad,
          telefono_whatsapp: ganador.telefono_whatsapp,
          numero_boleta: ganador.numero_boleta,
          tipo_registro: ganador.tipo_registro || 'automatico'
        },
        elegibles_total: elegibles.length
      });
    }

    return res.status(400).json({ error: 'Acción no válida' });

  } catch (error) {
    console.error('Error sorteo-ganador:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
}
