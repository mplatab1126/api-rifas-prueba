import { supabase } from './lib/supabase.js';
import { aplicarCors } from './lib/cors.js';
import { limpiarTelefono } from './lib/telefono.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'GET,OPTIONS,PATCH,DELETE,POST,PUT')) return;

  // 2. Recibimos el teléfono que manda Chatea Pro
  const { telefono } = req.query;

  if (!telefono) {
    return res.status(400).json({ error: 'Falta el número de teléfono' });
  }

  // 3. Limpiamos el número (con indicativo para registros nuevos, sufijo para buscar viejos)
  const telefonoLimpio = limpiarTelefono(telefono);
  const last10 = String(telefono).replace(/\D/g, '').slice(-10);

  try {
    // 5. Buscamos TODAS las boletas que le pertenecen a este teléfono
    // Agregamos "total_abonado" para traerlo de la base de datos
    const { data: boletas, error } = await supabase
      .from('boletas')
      .select(`
        numero,
        saldo_restante,
        total_abonado,
        clientes (nombre)
      `)
      .like('telefono_cliente', '%' + last10);

    if (error) throw error;

    // 6. Si el cliente no tiene boletas (es un prospecto nuevo)
    if (!boletas || boletas.length === 0) {
      return res.status(200).json({
        boletas_cliente: "",
        deuda_cliente: "",
        abonado_cliente: "",
        nombre_cliente: "",
        enlaces_boletas: "",
        resumen: "",
        fecha_ultimo_abono: ""
      });
    }

    // 7. EMPACAMOS LOS DATOS
    const listaNumeros = boletas.map(b => b.numero).join(', ');
    
    // Sumamos la deuda total y tomamos el mínimo abonado entre todas las boletas
    const deudaTotal = boletas.reduce((suma, b) => suma + Number(b.saldo_restante), 0);
    const abonadoTotal = Math.min(...boletas.map(b => Number(b.total_abonado)));
    
    const nombre = boletas[0].clientes?.nombre || "Cliente";
    
    // Lista de enlaces con doble salto de línea y emoji
    const listaEnlaces = boletas.map(b => `🎟️ *Boleta ${b.numero}:*\nhttps://www.losplata.com.co/boleta/${b.numero}`).join('\n\n');

    // Resumen bonito: número de boleta + saldo restante de cada una
    const formatearPesos = (valor) =>
      '$' + Number(valor).toLocaleString('es-CO');

    const resumen = boletas.map(b =>
      `🎟️ *Boleta ${b.numero}* → Restante: *${formatearPesos(b.saldo_restante)}*`
    ).join('\n\n');

    // 8. Buscamos la fecha del último abono entre todas las boletas del cliente
    const numerosArray = boletas.map(b => b.numero);
    const { data: abonos } = await supabase
      .from('abonos')
      .select('fecha_pago')
      .in('numero_boleta', numerosArray)
      .order('fecha_pago', { ascending: false })
      .limit(1);

    let fechaUltimoAbono = "";
    if (abonos && abonos.length > 0 && abonos[0].fecha_pago) {
      const fecha = new Date(abonos[0].fecha_pago);
      const y = fecha.getFullYear();
      const m = String(fecha.getMonth() + 1).padStart(2, '0');
      const d = String(fecha.getDate()).padStart(2, '0');
      fechaUltimoAbono = `${y}-${m}-${d}`;
    }

    // 9. Le respondemos a Chatea Pro con el paquete listo y valores COMPLETOS
    res.status(200).json({
      boletas_cliente: listaNumeros,
      deuda_cliente: deudaTotal,
      abonado_cliente: abonadoTotal,
      nombre_cliente: nombre,
      enlaces_boletas: listaEnlaces,
      resumen,
      fecha_ultimo_abono: fechaUltimoAbono
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
