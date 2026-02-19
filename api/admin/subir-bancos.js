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
  const asesores = { 'sal32':'Saldarriaga', 'ar94':'Arias', 'car61':'Carlos', 'an45':'Anyeli', 'AYX':'Mateo', 'lu34':'Luisa', 'li05':'Liliana', 'ne26':'Nena', '1234':'Admin' };
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
      .select('monto, fecha_pago, referencia, plataforma')
      .in('fecha_pago', fechas);

    if (errExistentes) throw errExistentes;

    // 5. ESCUDO ANTI-CLONES (Filtramos los duplicados)
    const transferenciasNuevas = transferencias.filter(tNueva => {
      return !existentes.some(tExist => {
        // Si no es la misma fecha, monto o plataforma, definitivamente NO son la misma
        if (tNueva.fecha_pago !== tExist.fecha_pago || tNueva.monto !== tExist.monto || tNueva.plataforma !== tExist.plataforma) {
          return false;
        }

        // REGLA NEQUI: Si ambas son de Nequi, sacamos solo los números y comparamos los últimos 4
        if (tNueva.plataforma === 'Nequi') {
          const digitosNueva = String(tNueva.referencia).replace(/\D/g, ''); 
          const digitosExist = String(tExist.referencia).replace(/\D/g, '');
          
          if (digitosNueva.length >= 4 && digitosExist.length >= 4) {
            const ultimos4Nueva = digitosNueva.slice(-4);
            const ultimos4Exist = digitosExist.slice(-4);
            if (ultimos4Nueva === ultimos4Exist) return true; // ¡Son la misma! La descartamos
          }
        }

        // Para Bancolombia u otros bancos, comparamos la referencia exacta
        return String(tNueva.referencia).trim() === String(tExist.referencia).trim();
      });
    });

    // 6. Si todas las transferencias del archivo ya existían, no hacemos nada y avisamos
    if (transferenciasNuevas.length === 0) {
      return res.status(200).json({ 
        status: 'ok', 
        mensaje: `Se leyeron ${transferencias.length} pagos, pero todos ya estaban registrados. Cero duplicados.` 
      });
    }

    // 7. Insertar SOLO las transferencias que son verdaderamente nuevas
    const { error } = await supabase.from('transferencias').insert(transferenciasNuevas);

    if (error) throw error;

    return res.status(200).json({ 
      status: 'ok', 
      mensaje: `¡Éxito! Se subieron ${transferenciasNuevas.length} transferencias nuevas.\n(Se bloquearon ${transferencias.length - transferenciasNuevas.length} repetidas).` 
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error interno: ' + error.message });
  }
}
