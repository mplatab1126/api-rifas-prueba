// ver-house-data.jsx — Datos del buscador "Ver mi boleta" (Casa Santa Teresita)
// Solo necesita países y helper de formato; la vista detallada vive en /boleta/[num].

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

window.formatCOP = window.formatCOP || function(n) {
  return "$" + n.toLocaleString("es-CO");
};
