export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { contrasena } = req.body;
  
  const asesores = JSON.parse(process.env.ASESORES_SECRETO || '{}');

  const nombreAsesor = asesores[contrasena];

  if (nombreAsesor) {
    return res.status(200).json({ status: 'ok', mensaje: 'Acceso concedido', asesor: nombreAsesor });
  } else {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }
}
