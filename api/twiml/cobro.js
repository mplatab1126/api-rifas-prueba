const PLANTILLA_DEFAULT = 'Hola {nombre}, te llamamos de Los Plata. Te informamos que tienes un saldo pendiente de {total} pesos en {boletas}. Por favor comunícate con nosotros para ponerte al día. ¡Muchas gracias y que tengas un excelente día!';

const DIGITOS = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];

function boletaParaVoz(numero) {
  const str = String(numero).padStart(4, '0');
  const par1 = str.slice(0, 2);
  const par2 = str.slice(2, 4);
  function par(p) {
    return p[0] === '0' ? `${DIGITOS[+p[0]]} ${DIGITOS[+p[1]]}` : p;
  }
  return `${par(par1)}, ${par(par2)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end();
  }

  const { nombre, boletas, total, plantilla, voz } = req.query;

  const nombreCliente = nombre ? decodeURIComponent(nombre) : 'cliente';
  const boletasTexto = boletas ? decodeURIComponent(boletas) : '';
  const totalTexto   = total   ? decodeURIComponent(total)   : '';

  let detalleBoletas = '';
  const listaNumeros = boletasTexto.split(',').filter(Boolean);

  if (listaNumeros.length === 1) {
    detalleBoletas = `tu boleta número ${boletaParaVoz(listaNumeros[0])}`;
  } else if (listaNumeros.length > 1) {
    const ultimas = listaNumeros.pop();
    detalleBoletas = `tus boletas número ${listaNumeros.map(boletaParaVoz).join(', ')} y ${boletaParaVoz(ultimas)}`;
  }

  const template = plantilla ? decodeURIComponent(plantilla) : PLANTILLA_DEFAULT;
  const mensaje = template
    .replace(/\{nombre\}/g, nombreCliente)
    .replace(/\{total\}/g, totalTexto)
    .replace(/\{boletas\}/g, detalleBoletas);

  const vozSeleccionada = voz ? decodeURIComponent(voz) : 'elevenlabs';

  let twiml;
  if (vozSeleccionada === 'elevenlabs') {
    const appUrl = process.env.APP_URL;
    const textoEncoded = encodeURIComponent(mensaje);
    const audioUrl = `${appUrl}/api/twiml/audio-elevenlabs?texto=${textoEncoded}`;
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
</Response>`;
  } else {
    const escapedMsg = mensaje.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const lang = vozSeleccionada.startsWith('Google.es-MX') || vozSeleccionada.includes('Mia') || vozSeleccionada.includes('Andres') ? 'es-MX' : 'es-US';
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${vozSeleccionada}" language="${lang}">${escapedMsg}</Say>
</Response>`;
  }

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}
