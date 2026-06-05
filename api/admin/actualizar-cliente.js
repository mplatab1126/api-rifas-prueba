import { supabase } from '../lib/supabase.js';
import { aplicarCors } from '../lib/cors.js';
import { validarAsesor } from '../lib/auth.js';
import { esTelefonoValido } from '../lib/telefono.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', mensaje: 'Método no permitido' });

  const { telefono, nombre, apellido, ciudad, contrasena, documento_tipo, documento_numero, correo } = req.body;

  if (!validarAsesor(contrasena)) return res.status(401).json({ status: 'error', mensaje: 'Contraseña de asesor incorrecta' });

  if (!telefono) return res.status(400).json({ status: 'error', mensaje: 'Falta el teléfono del cliente' });

  // Validación defensiva: no dejar que se actualice el cliente si el teléfono está corrupto.
  // NO lo limpiamos aquí porque cambiaría la clave primaria de la tabla clientes.
  // Aceptamos celular colombiano (esTelefonoValido) O un número internacional de 7 a 15 dígitos
  // (el sistema vende a clientes de cualquier país; el número es el de su WhatsApp).
  const soloDigitos = String(telefono).replace(/\D/g, '');
  if (!esTelefonoValido(telefono) && (soloDigitos.length < 7 || soloDigitos.length > 15)) {
    return res.status(400).json({ status: 'error', mensaje: `🚫 El teléfono "${telefono}" no es válido (debe tener entre 7 y 15 dígitos, incluyendo el código del país).` });
  }

  // La tabla clientes exige que estos campos no estén vacíos.
  if (!String(nombre || '').trim())   return res.status(400).json({ status: 'error', mensaje: '🚫 Falta el nombre del cliente.' });
  if (!String(apellido || '').trim()) return res.status(400).json({ status: 'error', mensaje: '🚫 Falta el apellido del cliente.' });
  if (!String(ciudad || '').trim())   return res.status(400).json({ status: 'error', mensaje: '🚫 Falta la ciudad del cliente.' });

  // Documento opcional — solo se persiste si viene con valor
  const docTipoLimpio = documento_tipo ? String(documento_tipo).trim().toUpperCase() : null;
  const docNumeroLimpio = documento_numero ? String(documento_numero).trim() : null;

  // Correo opcional — si lo llenan debe tener formato válido
  const correoLimpio = correo ? String(correo).trim() : null;
  if (correoLimpio && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correoLimpio)) {
    return res.status(400).json({ status: 'error', mensaje: `🚫 El correo "${correoLimpio}" no tiene un formato válido.` });
  }

  try {
    const payload = {
      telefono: telefono,
      nombre: String(nombre).trim(),
      apellido: String(apellido).trim(),
      ciudad: String(ciudad).trim()
    };
    if (docTipoLimpio) payload.documento_tipo = docTipoLimpio;
    if (docNumeroLimpio) payload.documento_numero = docNumeroLimpio;
    if (correoLimpio) payload.correo = correoLimpio;

    // Upsert: crea el registro si no existe, o actualiza si ya existe
    const { error } = await supabase
      .from('clientes')
      .upsert(payload, { onConflict: 'telefono' });

    if (error) throw error;

    return res.status(200).json({ status: 'ok', mensaje: '¡Datos del cliente actualizados correctamente!' });
  } catch (error) {
    return res.status(500).json({ status: 'error', mensaje: error.message });
  }
}
