export default async function handler(req, res) {
  // Permisos CORS
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

  const { contrasena } = req.body;
  
  // Aquí validamos con la misma clave que usas en los otros archivos
  const claveMaestra = process.env.ADMIN_PASSWORD || '1234';

  if (contrasena === claveMaestra) {
    return res.status(200).json({ status: 'ok', mensaje: 'Acceso concedido' });
  } else {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }
}
