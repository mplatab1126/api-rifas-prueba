export default async function handler(req, res) {
  // Twilio hace GET a este endpoint cuando el cliente contesta la llamada
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end();
  }

  const { nombre, boletas, total } = req.query;

  const nombreCliente = nombre ? decodeURIComponent(nombre) : 'cliente';
  const boletasTexto = boletas ? decodeURIComponent(boletas) : '';
  const totalTexto   = total   ? decodeURIComponent(total)   : '';

  // Construir la parte del mensaje sobre las boletas
  let detalleBoletas = '';
  const listaNumeros = boletasTexto.split(',').filter(Boolean);

  if (listaNumeros.length === 1) {
    detalleBoletas = `tu boleta número ${listaNumeros[0]}`;
  } else if (listaNumeros.length > 1) {
    const ultimas = listaNumeros.pop();
    detalleBoletas = `tus boletas número ${listaNumeros.join(', ')} y ${ultimas}`;
  }

  const mensaje =
    `Hola ${nombreCliente}, te llamamos de Rifas Colombia. ` +
    `Te informamos que tienes un saldo pendiente de ${totalTexto} pesos ` +
    `en ${detalleBoletas}. ` +
    `Por favor comunícate con nosotros para ponerte al día. ` +
    `¡Muchas gracias y que tengas un excelente día!`;

  // TwiML: XML que le dice a Twilio qué voz usar y qué decir
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lupe" language="es-MX">${mensaje}</Say>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}
