// hub-data.jsx — Datos del hub (tarjetas y configuración)

const HUB_TARJETAS = [
  {
    id: "ver-boleta",
    titulo: "Ver mi boleta",
    icono3d: "assets/icon-3d-document.png",
    color: "slate",
    href: "/ver-mi-boleta-la-plata-house"
  },
  {
    id: "abonar",
    titulo: "Abonar a mi boleta",
    icono3d: "assets/icon-3d-wallet.png",
    color: "green",
    href: "/abonar"
  },
  {
    id: "canales",
    titulo: "Canales oficiales",
    icono3d: "assets/icon-3d-call.png",
    color: "blue",
    href: "/canales-oficiales"
  },
  {
    id: "oficina",
    titulo: "Oficina y documentos",
    icono3d: "assets/icon-3d-shield.png",
    color: "teal",
    href: "#oficina"
  },
  {
    id: "ganadores",
    titulo: "Ganadores anteriores",
    icono3d: "assets/icon-3d-trophy.png",
    color: "amber",
    href: "#ganadores"
  }
];

window.HUB_TARJETAS = HUB_TARJETAS;
