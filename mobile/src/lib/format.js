/**
 * Funciones de formato para mostrar datos en la app.
 */

// Formato de dinero colombiano: $50.000
export function formatMoney(amount) {
  const num = Number(amount || 0);
  return '$' + num.toLocaleString('es-CO');
}

// Formato de fecha corta: 13 abr 2026
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${date.getDate()} ${meses[date.getMonth()]} ${date.getFullYear()}`;
}

// Formato de fecha y hora: 13 abr 2026, 2:30 PM
export function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  let hours = date.getHours();
  const mins = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${date.getDate()} ${meses[date.getMonth()]} ${date.getFullYear()}, ${hours}:${mins} ${ampm}`;
}

// Color segun estado de la boleta
export function statusColor(estado) {
  switch (estado) {
    case 'Pagada': return '#4CAF50';
    case 'Reservado': return '#FF9800';
    case 'Disponible': return '#2196F3';
    default: return '#FF9800';
  }
}

// Label para tipo de boleta
export function tipoLabel(tipo) {
  switch (tipo) {
    case '4cifras': return 'Principal';
    case '2cifras': return 'Diaria 2 cifras';
    case '3cifras': return 'Diaria 3 cifras';
    default: return tipo;
  }
}
