# Plan de Mejoras ChateaPro — Los Plata S.A.S.

Fecha: 18 de marzo de 2026

---

## Diagnóstico actual (datos reales del 17 de marzo)

| Dato | Valor | Qué significa |
|---|---|---|
| Total de contactos en WhatsApp | **48,926** | Gente que alguna vez escribió |
| Activos ayer | **349** (0.7%) | Solo una fracción interactúa cada día |
| Nuevos ayer (de Meta Ads) | **48** | Personas nuevas que llegaron |
| Mensajes del bot | **714** | Lo que respondió la IA |
| Mensajes de asesores | **977** | Lo que respondieron humanos (más que el bot) |
| Tiempo promedio de respuesta | **~1 hora** | Los asesores tardan en contestar |
| Conversaciones cerradas ayer | **0** | Nadie cerró conversaciones |
| Conversaciones abiertas | **48,620** | Bandeja totalmente saturada |
| Tags de "FALLÓ" | **20+ tags** | Difusiones que Meta bloqueó |
| Plantillas de WhatsApp | **Múltiples** | Algunas aprobadas, algunas rechazadas |

---

## NIVEL 1 — Victorias rápidas

### 1. Rescate automático con Twilio cuando Meta bloquea
- **Estado**: ✅ COMPLETADO (18 marzo 2026)
- **Problema**: Se hacen difusiones de cobro por WhatsApp, pero Meta bloquea muchos envíos. Esos clientes quedan con el tag "FALLÓ" y nadie los contacta.
- **Lo que se construyó**:
  - Sección "Rescate WhatsApp" en el Centro de Llamadas (`llamadas.html`)
  - Endpoint `api/admin/rescate-whatsapp.js` que consulta ChateaPro y cruza con Supabase
  - Checkboxes agrupados L1/L2 para seleccionar múltiples difusiones fallidas
  - Filtro por fecha de último abono (para no llamar a quienes ya pagaron)
  - Filtro por máximo abonado por boleta
  - Mensaje personalizable con variables `{nombre}`, `{total}`, `{boletas}`
  - Voz clonada de Alejandro (ElevenLabs) en vez de voz robótica
  - Número colombiano de Medellín (+57 604 590 8967)
  - Tracking de costos de Twilio y ElevenLabs en la página
  - Llamadas de prueba con grabación y seguimiento de estado

---

### 2. Alerta de plantillas bloqueadas
- **Estado**: ✅ COMPLETADO (19 marzo 2026)
- **Problema**: No hay forma rápida de saber cuántas plantillas fallan en cada difusión.
- **Lo que se construyó**:
  - Nueva sección "📬 Salud de Difusiones WhatsApp" en `rendimiento.html` (sección 4, entre Meta Ads e IA)
  - Endpoint `api/admin/rescate-whatsapp.js` ampliado con acción `stats` que consulta ChateaPro en tiempo real
  - El sistema empareja automáticamente cada tag de éxito con su tag de "FALLÓ" correspondiente
  - Consulta ambas líneas de WhatsApp (L1 y L2) y suma los totales
  - KPIs: total de difusiones, enviados, bloqueados, % fallo global, peor difusión
  - Tabla detallada ordenada por % de fallo (mayor primero), con badges de color:
    - Verde = menos de 20% de fallo (OK)
    - Amarillo = 20-39% de fallo (ALTO)
    - Rojo = 40%+ de fallo (CRÍTICO)
  - Botón "Cargar Estadísticas" bajo demanda (no se carga automáticamente porque consulta ChateaPro en vivo)

---

### 3. Cerrar conversaciones automáticamente
- **Estado**: 🔲 Pendiente
- **Problema**: 48,620 conversaciones abiertas y 0 cerradas ayer. La bandeja de asesores está saturada.
- **Solución**: Crear un cron job (tarea automática que corre cada día) que use la API de ChateaPro para cerrar conversaciones donde:
  - El cliente no ha respondido en 7+ días
  - La conversación está en estado "open" sin agente asignado
- **Impacto**: Bandeja limpia → asesores más rápidos → mejor tiempo de respuesta.

---

## NIVEL 2 — Mejoras de alto impacto

### 4. Dashboard de embudo de ventas (funnel)
- **Estado**: 🔲 Pendiente
- **Problema**: Existen tags de conversión (ViewContent → LeadSubmitted → QualifiedLead → AddToCart → InitiateCheckout → Purchase) pero no se visualizan.
- **Solución**: Agregar en rendimiento.html un embudo visual que muestre cuántas personas hay en cada paso. Ejemplo:
  ```
  ViewContent:       1,000 personas
  LeadSubmitted:       400 (40% conversión)
  QualifiedLead:       250 (63% conversión)
  AddToCart:           200 (80% conversión)  ← separaron boleta
  InitiateCheckout:    100 (50% conversión)  ← iniciaron pago
  Purchase:             50 (50% conversión)  ← pagaron
  ```
- **Impacto**: Saber EXACTAMENTE dónde se pierden los clientes y arreglar ese paso.

---

### 5. Despertar clientes dormidos inteligentemente
- **Estado**: 🔲 Pendiente
- **Problema**: 48,577 contactos inactivos. Gente que alguna vez escribió pero ya no interactúa.
- **Solución**: Crear segmentos cruzando ChateaPro + Supabase:
  - "Separaron boleta + abonaron algo + les falta > $50,000 + no escriben hace 2 semanas"
  - "Pidieron información pero nunca separaron boleta + últimos 30 días"
  - "Boleta pagada al 80%+ pero dejaron de pagar hace 1 mes"
  Luego enviar difusión personalizada o programar llamada de Twilio según el segmento.
- **Impacto**: Cada cliente dormido que se despierte es dinero que ya estaba casi cobrado.

---

### 6. Monitoreo de calidad de asesores en tiempo real
- **Estado**: 🔲 Pendiente
- **Problema**: Tiempo promedio de respuesta de 1 hora. Algunos asesores probablemente responden rápido y otros lento.
- **Solución**: 
  - Consultar la API de ChateaPro para obtener tiempos de respuesta por asesor
  - Mostrar alertas: "Carlos Flores lleva 30 min sin responder a 5 conversaciones"
  - Se puede agregar a rendimiento.html o enviarse como mensaje a Mateo por WhatsApp
- **Impacto**: Reducir el tiempo de respuesta = más ventas cerradas.

---

## NIVEL 3 — Mejoras estratégicas

### 7. Actualizar el bot automáticamente desde Supabase
- **Estado**: 🔲 Pendiente
- **Problema**: Cada vez que cambia un premio, precio o fecha de sorteo, hay que actualizar los bot fields de ChateaPro manualmente.
- **Solución**: Un endpoint que lea las tablas `rifas` y `premios_rifa` de Supabase y actualice los bot fields de ChateaPro automáticamente usando la API `PUT /flow/set-bot-field-by-name`.
- **Impacto**: Cero errores humanos al cambiar de rifa. Todo consistente.

---

### 8. Análisis de conversaciones con IA
- **Estado**: 🔲 Pendiente
- **Problema**: No se sabe por qué algunos clientes no compran. ¿El bot dijo algo raro? ¿El precio los asustó?
- **Solución**: 
  1. Usar `GET /subscriber/chat-messages` para traer las últimas conversaciones donde el cliente NO compró
  2. Pasarlas por GPT-4o
  3. Generar un resumen: "El 30% preguntó por envíos a otras ciudades y no les supimos responder"
- **Impacto**: Mejorar los flujos basándose en datos reales, no en suposiciones.

---

### 9. Score de probabilidad de pago por cliente
- **Estado**: 🔲 Pendiente
- **Problema**: Se trata a todos los clientes igual en las difusiones y llamadas.
- **Solución**: Cruzar datos de Supabase (cuánto lleva abonado, hace cuánto pagó, cuántas boletas tiene) con datos de ChateaPro (última interacción, cuántas plantillas le fallaron, si está marcado como molesto) para dar un score de 1 a 10 a cada cliente. Los asesores se enfocan primero en los que más probabilidad tienen de pagar.
- **Impacto**: Asesores más eficientes, más cobros por hora.

---

## Orden de ejecución recomendado

| # | Mejora | Estado | Por qué en este orden |
|---|---|---|---|
| 1 | Rescate con Twilio cuando Meta bloquea | ✅ Hecho | Dinero inmediato que se estaba perdiendo |
| 2 | Alerta de plantillas bloqueadas | ✅ Hecho | Sección en rendimiento.html con % éxito/fallo por difusión |
| 3 | Cerrar conversaciones automáticamente | 🔲 Siguiente | Desbloquea la bandeja de asesores |
| 4 | Dashboard de embudo de ventas | 🔲 | Saber dónde se pierden los clientes |
| 5 | Despertar clientes dormidos | 🔲 | Base enorme de 48,000+ sin explotar |
| 6 | Monitoreo de calidad de asesores | 🔲 | Reducir tiempo de respuesta |
| 7 | Actualizar bot desde Supabase | 🔲 | Eliminar errores manuales |
| 8 | Análisis de conversaciones con IA | 🔲 | Optimizar flujos con datos |
| 9 | Score de probabilidad de pago | 🔲 | Máxima eficiencia de cobro |

---

## Costos del sistema de llamadas

| Concepto | Costo |
|---|---|
| ElevenLabs (Plan Creator) | $22 USD/mes |
| Número Twilio (Medellín) | $14 USD/mes |
| Llamada a celular colombiano | ~$0.034 USD por llamada |
| Llamada a fijo colombiano | ~$0.095 USD por llamada |
| **Fijo mensual** | **$36 USD/mes (~$155,000 COP)** |
| Capacidad ElevenLabs | ~550 llamadas/mes (110,000 caracteres) |

---

## Notas técnicas

- **API de ChateaPro**: `https://chateapro.app/api` — Documentación completa en `.cursor/rules/chateapro.mdc`
- **Tokens**: Guardados como variables de entorno en Vercel (`CHATEA_TOKEN_LINEA_1`, `CHATEA_TOKEN_LINEA_2`)
- **ElevenLabs**: API key y Voice ID en Vercel (`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`)
- **Twilio**: Número colombiano `+576045908967` en Vercel (`TWILIO_PHONE_NUMBER`)
- **Teléfonos**: ChateaPro guarda el número completo con indicativo de país. Supabase guarda solo los últimos 10 dígitos. Para funciones de Twilio que crucen con ChateaPro, usar el teléfono de ChateaPro.
- **Archivos clave**: `api/admin/rescate-whatsapp.js`, `api/admin/difusion-llamadas.js`, `api/twiml/cobro.js`, `api/twiml/audio-elevenlabs.js`, `public/llamadas.html`
