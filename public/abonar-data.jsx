// abonar-data.jsx — Países + helper de formato
// (En la Capa 2 se conectará la búsqueda real de boletas a la base de datos)

window.PAISES = [
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
  { code: "+506", iso: "CR", name: "Costa Rica", flag: "🇨🇷", digits: 8 },
  { code: "+503", iso: "SV", name: "El Salvador", flag: "🇸🇻", digits: 8 },
  { code: "+502", iso: "GT", name: "Guatemala", flag: "🇬🇹", digits: 8 },
  { code: "+504", iso: "HN", name: "Honduras", flag: "🇭🇳", digits: 8 },
  { code: "+505", iso: "NI", name: "Nicaragua", flag: "🇳🇮", digits: 8 },
  { code: "+591", iso: "BO", name: "Bolivia", flag: "🇧🇴", digits: 8 },
  { code: "+598", iso: "UY", name: "Uruguay", flag: "🇺🇾", digits: 8 },
  { code: "+595", iso: "PY", name: "Paraguay", flag: "🇵🇾", digits: 9 },
  { code: "+1809", iso: "DO", name: "República Dominicana", flag: "🇩🇴", digits: 7 },
  { code: "+39", iso: "IT", name: "Italia", flag: "🇮🇹", digits: 10 },
  { code: "+33", iso: "FR", name: "Francia", flag: "🇫🇷", digits: 9 },
  { code: "+44", iso: "GB", name: "Reino Unido", flag: "🇬🇧", digits: 10 },
];

window.formatCOP = function(n) {
  return "$" + Number(n || 0).toLocaleString("es-CO");
};
