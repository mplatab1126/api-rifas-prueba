import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { pdfBase64, contrasena } = req.body;
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');
  if (!asesores[contrasena]) return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  if (!pdfBase64) return res.status(400).json({ status: 'error', mensaje: 'No se envió ningún PDF' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    const buffer = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ''), 'base64');
    const pdfData = await pdfParse(buffer);
    const movimientos = parseConsolidadoBancolombia(pdfData.text);

    if (!movimientos.length) {
      return res.status(400).json({ status: 'error', mensaje: 'No se encontraron movimientos en el PDF. Verifica que sea un consolidado de Bancolombia.' });
    }

    const fechas = [...new Set(movimientos.map(m => m.fecha))];

    const ingresos = movimientos.filter(m => m.tipo === 'ingreso');
    const egresos = movimientos.filter(m => m.tipo === 'egreso');

    // Traer transferencias (ingresos) de las fechas del consolidado
    let transferenciasDB = [];
    if (ingresos.length > 0) {
      const { data } = await supabase
        .from('transferencias')
        .select('id, monto, referencia, fecha_pago, hora_pago, plataforma, estado')
        .in('fecha_pago', fechas);
      transferenciasDB = data || [];
    }

    // Traer gastos (egresos) de las fechas del consolidado
    let gastosDB = [];
    if (egresos.length > 0) {
      const { data } = await supabase
        .from('gastos')
        .select('id, monto, referencia, fecha, hora, plataforma, descripcion, categoria')
        .in('fecha', fechas);
      gastosDB = data || [];
    }

    // Matching: marcar cada transferencia/gasto de la DB como "usada" para no duplicar matches
    const transUsadas = new Set();
    const gastosUsados = new Set();

    const resultados = movimientos.map(mov => {
      if (mov.tipo === 'ingreso') {
        const match = buscarMatchIngreso(mov, transferenciasDB, transUsadas);
        if (match) {
          transUsadas.add(match.id);
          return { ...mov, encontrado: true, matchId: match.id, matchEstado: match.estado };
        }
        return { ...mov, encontrado: false };
      } else {
        const match = buscarMatchEgreso(mov, gastosDB, gastosUsados);
        if (match) {
          gastosUsados.add(match.id);
          return { ...mov, encontrado: true, matchId: match.id, matchCategoria: match.categoria };
        }
        return { ...mov, encontrado: false };
      }
    });

    const faltantes = resultados.filter(r => !r.encontrado);
    const encontrados = resultados.filter(r => r.encontrado);

    return res.status(200).json({
      status: 'ok',
      resumen: {
        totalPDF: movimientos.length,
        totalIngresos: ingresos.length,
        totalEgresos: egresos.length,
        encontrados: encontrados.length,
        faltantes: faltantes.length,
        fechas
      },
      faltantes,
      encontrados
    });

  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: 'Error procesando: ' + error.message });
  }
}

// ─── PARSER DEL CONSOLIDADO BANCOLOMBIA ────────────────────────────────────────

function parseConsolidadoBancolombia(textoRaw) {
  const lineas = textoRaw.split('\n');

  // Limpiar: quitar headers, footers, paginación
  const limpias = lineas.filter(l => {
    const t = l.trim();
    if (!t) return false;
    if (/^Empresa:|^NIT:|^Saldo|^Impreso por/i.test(t)) return false;
    if (/^FECHA\s+DESCRIPCI[OÓ]N/i.test(t)) return false;
    if (/^Número de Cuenta|^Tipo de cuenta|^Fecha y Hora/i.test(t)) return false;
    if (/^\d+\s+Página\s+\d+\s+de$/i.test(t)) return false;
    if (/^--\s*\d+\s*of\s*\d+\s*--$/.test(t)) return false;
    return true;
  });

  // Agrupar en bloques: cada bloque empieza con una fecha YYYY/MM/DD
  const bloques = [];
  let actual = null;

  for (const linea of limpias) {
    const t = linea.trim();
    if (/^\d{4}\/\d{2}\/\d{2}\s/.test(t)) {
      if (actual) bloques.push(actual);
      actual = t;
    } else if (actual) {
      actual += ' ' + t;
    }
  }
  if (actual) bloques.push(actual);

  const movimientos = [];
  for (const bloque of bloques) {
    const mov = parseBloque(bloque);
    if (mov) movimientos.push(mov);
  }
  return movimientos;
}

function parseBloque(bloque) {
  const fechaMatch = bloque.match(/^(\d{4}\/\d{2}\/\d{2})/);
  if (!fechaMatch) return null;
  const fecha = fechaMatch[1].replace(/\//g, '-');

  // Valor: último patrón con decimales (X,XXX.XX o -X,XXX.XX)
  const valorMatches = [...bloque.matchAll(/(-?[\d,]+\.\d{2})/g)];
  if (!valorMatches.length) return null;
  const valorStr = valorMatches[valorMatches.length - 1][1];
  const valor = parseFloat(valorStr.replace(/,/g, ''));
  if (isNaN(valor) || valor === 0) return null;

  // Quitar fecha del inicio y valor del final para obtener la parte media
  let medio = bloque.substring(fechaMatch[0].length);
  const posValor = medio.lastIndexOf(valorStr);
  if (posValor > 0) medio = medio.substring(0, posValor);
  medio = medio.trim();

  // Separar sucursal del resto
  const partes = medio.split(/\t+/);
  let descripcionArea = partes.length > 1 ? partes.slice(1).join(' ') : medio;

  let descripcion = '';
  let referencia = '';
  let tipoMov = '';

  if (descripcionArea.includes('TRANSFERENCIA CTA SUC VIRTUAL')) {
    tipoMov = 'bancolombia';
    descripcion = 'Transferencia Bancolombia';
    const resto = descripcionArea.replace(/.*TRANSFERENCIA CTA SUC VIRTUAL\s*/, '').trim();
    const refs = resto.split(/\s+/).filter(r => /^\d{5,}$/.test(r));
    referencia = refs[0] || '';
  } else if (descripcionArea.includes('CONSIGNACION CORRESPONSAL CB')) {
    tipoMov = 'corresponsal';
    descripcion = 'Consignación Corresponsal';
    referencia = '';
  } else if (descripcionArea.includes('TRANSFERENCIA DESDE NEQUI')) {
    tipoMov = 'nequi';
    descripcion = 'Transferencia Nequi';
    const resto = descripcionArea.replace(/.*TRANSFERENCIA DESDE NEQUI\s*/, '').trim();
    referencia = resto;
  } else if (descripcionArea.includes('TRANSFERENCIA DESDE DAVIPLATA')) {
    tipoMov = 'daviplata';
    descripcion = 'Transferencia Daviplata';
    const resto = descripcionArea.replace(/.*TRANSFERENCIA DESDE DAVIPLATA\s*/, '').trim();
    referencia = resto;
  } else if (descripcionArea.includes('RETIRO CORRESPONSAL CB')) {
    tipoMov = 'retiro_corresponsal';
    descripcion = 'Retiro Corresponsal';
  } else if (descripcionArea.includes('COMPRA INTL')) {
    tipoMov = 'compra_intl';
    descripcion = descripcionArea.replace(/.*?(COMPRA INTL\s+\S+).*/, '$1').trim();
  } else if (descripcionArea.includes('VALOR IVA')) {
    tipoMov = 'iva';
    descripcion = 'Valor IVA';
  } else if (descripcionArea.includes('COMIS CONSIGNACION')) {
    tipoMov = 'comision';
    descripcion = 'Comisión Consignación';
  } else if (descripcionArea.includes('COMPRA EN')) {
    tipoMov = 'compra';
    descripcion = descripcionArea.replace(/.*?(COMPRA EN\s+\S+).*/, '$1').trim();
  } else if (descripcionArea.includes('ABONO INTERESES')) {
    tipoMov = 'intereses';
    descripcion = 'Abono Intereses';
  } else {
    tipoMov = 'otro';
    descripcion = descripcionArea.substring(0, 60).trim();
  }

  return {
    fecha,
    descripcion,
    referencia: referencia.trim(),
    valor: Math.abs(valor),
    tipo: valor < 0 ? 'egreso' : 'ingreso',
    tipoMov,
    textoOriginal: bloque.substring(0, 120)
  };
}

// ─── MATCHING: INGRESOS vs TRANSFERENCIAS ──────────────────────────────────────

function buscarMatchIngreso(mov, transferenciasDB, usadas) {
  const candidatas = transferenciasDB.filter(t =>
    !usadas.has(t.id) &&
    t.fecha_pago === mov.fecha &&
    Number(t.monto) === mov.valor
  );
  if (!candidatas.length) return null;

  // Estrategia por tipo de movimiento
  if (mov.tipoMov === 'bancolombia' && mov.referencia) {
    const match = candidatas.find(t => {
      const refDB = String(t.referencia || '');
      return refDB === mov.referencia || refDB.includes(mov.referencia) || mov.referencia.includes(refDB);
    });
    if (match) return match;
  }

  if (mov.tipoMov === 'nequi') {
    // Extraer últimos 4 dígitos de la referencia del PDF
    const digitosMatch = mov.referencia.match(/(\d{4})\s*$/);
    const ultimos4 = digitosMatch ? digitosMatch[1] : '';
    // Extraer teléfono completo si es numérico
    const telMatch = mov.referencia.match(/^(\d{10,})$/);
    const telefono = telMatch ? telMatch[1] : '';

    const match = candidatas.find(t => {
      const refDB = String(t.referencia || '');
      if (telefono && refDB === telefono) return true;
      if (telefono && refDB.includes(telefono)) return true;
      if (ultimos4 && refDB.endsWith(ultimos4)) return true;
      // Plataforma Nequi + mismo monto + misma fecha (con ref parcial)
      const platDB = String(t.plataforma || '').toLowerCase();
      if (platDB.includes('nequi') && ultimos4 && refDB.includes(ultimos4)) return true;
      return false;
    });
    if (match) return match;
  }

  if (mov.tipoMov === 'daviplata') {
    const digitosMatch = mov.referencia.match(/(\d{4})\s*$/);
    const ultimos4 = digitosMatch ? digitosMatch[1] : '';

    const match = candidatas.find(t => {
      const refDB = String(t.referencia || '');
      const platDB = String(t.plataforma || '').toLowerCase();
      if (platDB.includes('daviplata')) return true;
      if (ultimos4 && refDB.endsWith(ultimos4)) return true;
      return false;
    });
    if (match) return match;
  }

  if (mov.tipoMov === 'corresponsal') {
    const match = candidatas.find(t => {
      const platDB = String(t.plataforma || '').toLowerCase();
      return platDB.includes('corresponsal');
    });
    if (match) return match;
  }

  if (mov.tipoMov === 'intereses') {
    return candidatas[0] || null;
  }

  // Fallback: si hay exactamente una candidata con mismo monto+fecha, probablemente es match
  if (candidatas.length === 1) return candidatas[0];

  return null;
}

// ─── MATCHING: EGRESOS vs GASTOS ───────────────────────────────────────────────

function buscarMatchEgreso(mov, gastosDB, usados) {
  const candidatos = gastosDB.filter(g =>
    !usados.has(g.id) &&
    g.fecha === mov.fecha &&
    Number(g.monto) === mov.valor
  );
  if (!candidatos.length) return null;

  // Para egresos, el match principal es fecha + monto. Si hay varios, intentar por descripción
  if (candidatos.length === 1) return candidatos[0];

  // Intentar match por descripción similar
  const descLower = mov.descripcion.toLowerCase();
  const match = candidatos.find(g => {
    const descDB = String(g.descripcion || '').toLowerCase();
    return descDB.includes(descLower) || descLower.includes(descDB);
  });

  return match || candidatos[0];
}
