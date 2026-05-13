// ver-house-data.jsx — Datos mock + países para la boleta de La Plata House

window.PAISES = window.PAISES || [
  { code: "+57", iso: "CO", name: "Colombia", flag: "🇨🇴", digits: 10 },
  { code: "+1",  iso: "US", name: "Estados Unidos", flag: "🇺🇸", digits: 10 },
  { code: "+34", iso: "ES", name: "España", flag: "🇪🇸", digits: 9 },
  { code: "+52", iso: "MX", name: "México", flag: "🇲🇽", digits: 10 },
  { code: "+593", iso: "EC", name: "Ecuador", flag: "🇪🇨", digits: 9 },
  { code: "+58", iso: "VE", name: "Venezuela", flag: "🇻🇪", digits: 10 },
  { code: "+51", iso: "PE", name: "Perú", flag: "🇵🇪", digits: 9 },
  { code: "+54", iso: "AR", name: "Argentina", flag: "🇦🇷", digits: 10 },
  { code: "+56", iso: "CL", name: "Chile", flag: "🇨🇱", digits: 9 },
  { code: "+507", iso: "PA", name: "Panamá", flag: "🇵🇦", digits: 8 },
];

// Foto principal del hero (puede usarse también como fallback)
window.HOUSE_HERO_IMG = "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Habitacio%CC%81n+principal+foto+1.jpg";

// Galería completa de la casa — usada en el carrusel del hero de la boleta
window.HOUSE_GALERIA = [
  { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Habitacio%CC%81n+principal+foto+1.jpg", titulo: "Habitación principal" },
  { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Comedor+foto+1.jpg",                  titulo: "Comedor" },
  { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Cocina.jpg",                          titulo: "Cocina" },
  { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Cine+foto+1.jpg",                     titulo: "Sala de cine" },
  { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Escaleras.jpg",                       titulo: "Escaleras" },
  { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Habitacio%CC%81n+principal+foto+2.jpg", titulo: "Habitación principal" },
  { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Ban%CC%83o+habitacio%CC%81n+principal.jpg", titulo: "Baño habitación principal" },
  { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Habitacio%CC%81n+secundaria+foto+1.jpg", titulo: "Habitación secundaria" },
  { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Ban%CC%83o+social+piso+2.jpg",        titulo: "Baño social piso 2" },
  { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Ban%CC%83o+social+piso+1.jpg",        titulo: "Baño social piso 1" }
];

// Base de datos mock — clientes indexados por teléfono (sin código de país)
window.MOCK_CLIENTES_HOUSE = {
  // Cliente con varias boletas (1 paga, 1 pendiente)
  "3107334957": {
    nombre: "Juan",
    apellido: "Pérez",
    ciudad: "Chinchiná, Caldas",
    telefono: "+57 3107334957",
    documento: { tipo: "CC", numero: "1.087.654.321" },
    boletas: [
      {
        numero: "0234",
        rifa: "La Plata House",
        valorTotal: 150000,
        totalAbonado: 150000,
        saldoPendiente: 0,
        estado: "paga",
        historial: [
          { fecha: "12 de febrero, 2026", monto: 50000 },
          { fecha: "8 de marzo, 2026", monto: 50000 },
          { fecha: "20 de abril, 2026", monto: 50000 },
        ],
      },
      {
        numero: "0512",
        rifa: "La Plata House",
        valorTotal: 150000,
        totalAbonado: 60000,
        saldoPendiente: 90000,
        estado: "pendiente",
        historial: [
          { fecha: "15 de febrero, 2026", monto: 30000 },
          { fecha: "10 de abril, 2026", monto: 30000 },
        ],
      },
    ],
  },

  // Cliente con una sola boleta sin abonos previos
  "3001112233": {
    nombre: "María",
    apellido: "González",
    ciudad: "Pereira, Risaralda",
    telefono: "+57 3001112233",
    documento: { tipo: "CC", numero: "1.094.123.456" },
    boletas: [
      {
        numero: "0789",
        rifa: "La Plata House",
        valorTotal: 150000,
        totalAbonado: 0,
        saldoPendiente: 150000,
        estado: "pendiente",
        historial: [],
      },
    ],
  },

  // Cliente extranjero (Panamá, 8 dígitos)
  "61234567": {
    nombre: "Carlos",
    apellido: "Mendoza",
    ciudad: "Ciudad de Panamá",
    telefono: "+507 61234567",
    documento: { tipo: "PA", numero: "AB1234567" },
    boletas: [
      {
        numero: "1023",
        rifa: "La Plata House",
        valorTotal: 150000,
        totalAbonado: 120000,
        saldoPendiente: 30000,
        estado: "pendiente",
        historial: [
          { fecha: "5 de marzo, 2026", monto: 60000 },
          { fecha: "18 de abril, 2026", monto: 60000 },
        ],
      },
    ],
  },
};

// Helper de formato
window.formatCOP = window.formatCOP || function(n) {
  return "$" + n.toLocaleString("es-CO");
};
