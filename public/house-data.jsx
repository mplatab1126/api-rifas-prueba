// house-data.jsx — Datos del flujo Comprar boleta · Casa Santa Teresita

window.RIFA_INFO = {
  nombre: "Casa Santa Teresita",
  edicion: "Barrio Santa Teresita · Chinchiná, Caldas",
  ubicacion: "Barrio Santa Teresita · Chinchiná, Caldas",
  fechaSorteoMayor: "Sábado 4 de julio de 2026",
  loteria: "Lotería de Boyacá",
  // Para countdown — fecha objetivo (premio mayor)
  fechaObjetivo: "2026-07-04T22:30:00-05:00",
  precioBoleta: 150000,
  abonoMinimo: 20000,
  abonoSemanal: 20000,
  premioAnticipadoMonto: 5000000,
  alternativaCash: 300000000, // $300M si no quiere la casa

  // Galería completa de la casa (orden curado: video oficial → zonas sociales → habitaciones → servicios)
  galeria: [
    { tipo: "video", videoId: "1_KG5fXGzK0", titulo: "Video oficial", vertical: true, posterUrl: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Cine+foto+1.jpg" },
    { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Comedor+foto+1.jpg",                  titulo: "Comedor",                planta: 1, vertical: true  },
    { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Cocina.jpg",                          titulo: "Cocina",                 planta: 1, vertical: false },
    { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Escaleras.jpg",                       titulo: "Escaleras",              planta: 1, vertical: true  },
    { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Cine+foto+1.jpg",                     titulo: "Sala de cine",           planta: 2, vertical: true  },
    { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Habitacio%CC%81n+principal+foto+1.jpg", titulo: "Habitación principal",   planta: 2, vertical: true  },
    { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Habitacio%CC%81n+principal+foto+2.jpg", titulo: "Habitación principal",   planta: 2, vertical: true  },
    { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Ban%CC%83o+habitacio%CC%81n+principal.jpg", titulo: "Baño habitación principal", planta: 2, vertical: true },
    { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Habitacio%CC%81n+secundaria+foto+1.jpg", titulo: "Habitación secundaria", planta: 2, vertical: true  },
    { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Ban%CC%83o+social+piso+2.jpg",        titulo: "Baño social piso 2",     planta: 2, vertical: true  },
    { url: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Ban%CC%83o+social+piso+1.jpg",        titulo: "Baño social piso 1",     planta: 1, vertical: true  }
  ],

  // Carrusel del hero — solo las fotos "wow" (subset de la galería)
  carrusel: [
    "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Habitacio%CC%81n+principal+foto+1.jpg",
    "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Cocina.jpg",
    "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Cine+foto+1.jpg",
    "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Comedor+foto+1.jpg"
  ],

  // Espacios — para sección de características
  plantas: [
    {
      nombre: "Primera planta",
      espacios: [
        "Sala muy amplia",
        "Comedor de cuatro puestos",
        "Habitación adecuada como oficina",
        "Cocina grande",
        "Patio de ropas",
        "Baño social"
      ]
    },
    {
      nombre: "Segunda planta",
      espacios: [
        "Habitación adecuada como sala de cine",
        "Habitación principal con baño privado y closet",
        "Habitación secundaria",
        "Baño social"
      ]
    }
  ],

  // Premio único (la casa) + alternativa
  premios: [
    {
      tipo: "MAYOR",
      nombre: "Casa Santa Teresita",
      descripcion: "Casa de dos plantas en Santa Teresita · O $300.000.000 en efectivo si prefiere",
      fecha: "Sábado 4 de julio de 2026",
      imagen: "https://losplata.s3.us-east-2.amazonaws.com/casa+santa+teresita+1/Habitacio%CC%81n+principal+foto+1.jpg"
    }
  ]
};

// Íconos 3D — biblioteca LOCAL en assets/icons-3d/ (set premium negro mate + acentos dorados)
// Reglas en BRAND.md §11. NO descargar del CDN — usar siempre los archivos locales.
window.ICONS_3D = {
  // Premios / dinero
  key:       "assets/icons-3d/key.png",
  moneyBag:  "assets/icons-3d/money-bag.png",
  money:     "assets/icons-3d/money.png",
  giftBox:   "assets/icons-3d/gift-box.png",
  ticket:    "assets/icons-3d/gift.png",
  ribbon:    "assets/icons-3d/ribbon.png",
  trophy:    "assets/icons-3d/trophy.png",
  // Datos del sorteo
  calendar:  "assets/icons-3d/calender.png",
  target:    "assets/icons-3d/target.png",
  location:  "assets/icons-3d/map-pin.png",
  arrow:     "assets/icons-3d/location.png",
  // Confianza / institucional
  shield:    "assets/icons-3d/shield.png",
  fileText:  "assets/icons-3d/file-text.png",
  fileNew:   "assets/icons-3d/file-new.png",
  folder:    "assets/icons-3d/folder.png",
  folderFav: "assets/icons-3d/folder-fav.png",
  copy:      "assets/icons-3d/copy.png",
  lock:      "assets/icon-3d-lock.png",
  tick:      "assets/icons-3d/tick.png",
  thumb:     "assets/icons-3d/thumb-up.png",
  // Conversación
  chat:      "assets/icons-3d/chat-bubble.png"
};

window.PAISES = window.PAISES || [
  { code: "+57", iso: "CO", name: "Colombia", flag: "🇨🇴", digits: 10 },
  { code: "+1",  iso: "US", name: "Estados Unidos", flag: "🇺🇸", digits: 10 },
  { code: "+34", iso: "ES", name: "España", flag: "🇪🇸", digits: 9 },
  { code: "+52", iso: "MX", name: "México", flag: "🇲🇽", digits: 10 },
  { code: "+593", iso: "EC", name: "Ecuador", flag: "🇪🇨", digits: 9 },
  { code: "+58", iso: "VE", name: "Venezuela", flag: "🇻🇪", digits: 10 },
  { code: "+507", iso: "PA", name: "Panamá", flag: "🇵🇦", digits: 8 },
  { code: "+", iso: "OTHER", name: "Otro país", flag: "🌐", digits: 15, custom: true }
];

window.TIPOS_DOCUMENTO = window.TIPOS_DOCUMENTO || [
  { code: "CC",  name: "Cédula de ciudadanía" },
  { code: "CE",  name: "Cédula de extranjería" },
  { code: "NIT", name: "NIT" },
  { code: "PA",  name: "Pasaporte" }
];

window.formatCOP = window.formatCOP || function(n) {
  return "$" + n.toLocaleString("es-CO");
};

// Boletas disponibles — llama a la API real (/api/disponibles).
// excluir: array opcional de números que ya están en pantalla y NO queremos repetir.
window.fetchBoletasDisponibles = async function(excluir) {
  try {
    // canal=web → separa el "cajón de mostrados" de la página web del de Camila (ChateaPro)
    let url = "/api/disponibles?canal=web";
    if (Array.isArray(excluir) && excluir.length > 0) {
      url += "&exclude=" + encodeURIComponent(excluir.join(","));
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const texto = data && data.numeros_disponibles;
    if (typeof texto !== "string" || !texto.includes(" - ")) return [];
    return texto
      .split(" - ")
      .map(n => String(n).trim())
      .filter(n => /^\d{1,4}$/.test(n))
      .map(n => n.padStart(4, "0"))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  } catch (e) {
    console.error("[fetchBoletasDisponibles]", e);
    return [];
  }
};

// Fallback sin conexión — solo se usa si el fetch falla y queremos algo en pantalla
window.generarBoletasDisponibles = window.generarBoletasDisponibles || function() {
  const total = 10000;
  const set = new Set();
  let seed = 54321;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  while (set.size < total - 1500) { set.add(Math.floor(rand() * total)); }
  return Array.from(set).sort((a, b) => a - b).map(n => String(n).padStart(4, "0"));
};
