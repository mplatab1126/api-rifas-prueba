import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Permisos (CORS)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });
  }

  const { transferencias, contrasena } = req.body;

  // 2. SEGURIDAD: Validar la clave del asesor
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  const nombreAsesor = asesores[contrasena];

  if (!nombreAsesor) return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });
  if (!transferencias || transferencias.length === 0) return res.status(400).json({ status: 'error', mensaje: 'No se enviaron datos' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // 3. Obtener las fechas de los pagos que estamos intentando subir
    const fechas = [...new Set(transferencias.map(t => t.fecha_pago))];

    // 4. Traer los pagos que YA EXISTEN en la base de datos en esas fechas
    const { data: existentes, error: errExistentes } = await supabase
      .from('transferencias')
      .select('monto, fecha_pago, referencia, plataforma, hora_pago')
      .in('fecha_pago', fechas);

    if (errExistentes) throw errExistentes;

    // 5. ESCUDO ANTI-CLONES 1: Filtramos contra la base de datos
    const transferenciasNuevas = transferencias.filter(tNueva => {
      return !existentes.some(tExist => {
        if (tNueva.fecha_pago !== tExist.fecha_pago || tNueva.monto !== tExist.monto || tNueva.plataforma !== tExist.plataforma) {
          return false;
        }

        // REGLA DE LA HORA
        if (tNueva.hora_pago && tExist.hora_pago && tNueva.hora_pago !== tExist.hora_pago) {
          return false;
        }

        // REGLA NEQUI
        if (tNueva.plataforma === 'Nequi') {
          const digitosNueva = String(tNueva.referencia).replace(/\D/g, ''); 
          const digitosExist = String(tExist.referencia).replace(/\D/g, '');
          
          if (digitosNueva.length >= 4 && digitosExist.length >= 4) {
            const ultimos4Nueva = digitosNueva.slice(-4);
            const ultimos4Exist = digitosExist.slice(-4);
            if (ultimos4Nueva === ultimos4Exist) return true;
          }
        }

        return String(tNueva.referencia).trim() === String(tExist.referencia).trim();
      });
    });

    if (transferenciasNuevas.length === 0) {
      return res.status(200).json({ 
        status: 'ok', 
        mensaje: `Se leyeron ${transferencias.length} pagos, pero todos ya estaban registrados. Cero duplicados.` 
      });
    }

    // 6. ESCUDO ANTI-CLONES 2 (NUEVO): Filtramos duplicados DENTRO del mismo lote de subida
    const loteLimpio = [];
    transferenciasNuevas.forEach(tNueva => {
      const esDuplicadoInterno = loteLimpio.some(tLimpia => 
        tLimpia.fecha_pago === tNueva.fecha_pago && 
        tLimpia.monto === tNueva.monto && 
        tLimpia.referencia === tNueva.referencia &&
        tLimpia.hora_pago === tNueva.hora_pago
      );
      if (!esDuplicadoInterno) loteLimpio.push(tNueva);
    });

    // 7. INSERCIÓN BLINDADA (NUEVO): Subimos una por una
    let exitosas = 0;
    let fallidas = 0;

    for (const trans of loteLimpio) {
      const { error } = await supabase.from('transferencias').insert(trans);
      if (error) {
        fallidas++; // Si falla, solo suma al contador de fallos y continúa con la siguiente
      } else {
        exitosas++;
      }
    }

    // 8. Crear un mensaje de resumen detallado
    let mensajeFinal = `¡Éxito! Se subieron ${exitosas} transferencias nuevas.\n`;
    
    const bloqueadasBD = transferencias.length - transferenciasNuevas.length;
    if (bloqueadasBD > 0) {
      mensajeFinal += `\n🔒 Se ignoraron ${bloqueadasBD} que ya estaban en el sistema.`;
    }
    
    const bloqueadasInternas = transferenciasNuevas.length - loteLimpio.length;
    if (bloqueadasInternas > 0) {
      mensajeFinal += `\n⚠️ Se ignoraron ${bloqueadasInternas} archivos duplicados en esta misma subida.`;
    }

    if (fallidas > 0) {
      mensajeFinal += `\n❌ Hubo ${fallidas} transferencias que no se pudieron guardar por un error en su formato.`;
    }

    return res.status(200).json({ status: 'ok', mensaje: mensajeFinal });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
