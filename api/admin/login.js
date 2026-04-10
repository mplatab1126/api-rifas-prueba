import { aplicarCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (aplicarCors(req, res, 'OPTIONS,POST')) return;

  const { contrasena } = req.body;
  
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');

  const nombreAsesor = asesores[contrasena];

  if (nombreAsesor) {
    return res.status(200).json({ status: 'ok', mensaje: 'Acceso concedido', asesor: nombreAsesor });
  } else {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }
}
