export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { contrasena } = req.body;
  
  // 🌟 DICCIONARIO DE ASESORES
  const asesores = {
    'sal32': 'Saldarriaga',
    'ar94': 'Arias',
    'car61': 'Carlos',
    'an45': 'Anyeli',
    'm8a3': 'Mateo',
    'lu34': 'Luisa',
    'li05': 'Liliana',
    'ne26': 'Nena',
    '1234': 'Admin' // Tu clave maestra
  };

  const nombreAsesor = asesores[contrasena];

  if (nombreAsesor) {
    return res.status(200).json({ status: 'ok', mensaje: 'Acceso concedido', asesor: nombreAsesor });
  } else {
    return res.status(401).json({ status: 'error', mensaje: 'Contraseña incorrecta' });
  }
}
