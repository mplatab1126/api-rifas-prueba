# Plan de Mejoras — ChateaPro + Sistema Los Plata S.A.S.

Fecha de creación: 18 de marzo de 2026

---

## Datos clave del sistema (al momento de crear este plan)

| Dato | Valor | Significado |
|---|---|---|
| Total de contactos en WhatsApp | **48,926** | Gente que alguna vez escribió |
| Activos por día | **~349** | Solo el 0.7% de los contactos están activos |
| Nuevos por día | **~48** | Personas nuevas que llegan de Meta Ads |
| Mensajes del bot por día | **~714** | Lo que responde la IA automáticamente |
| Mensajes de asesores por día | **~977** | Lo que responden los asesores manualmente |
| Tiempo promedio de respuesta | **~1 hora** | Tiempo que tardan los asesores en contestar |
| Conversaciones abiertas | **48,620** | No se están cerrando conversaciones |
| Conversaciones cerradas por día | **0** | Ninguna se marca como terminada |
| Tags de difusión | **93** | Cada difusión tiene su tag de éxito y "FALLÓ" |
| Plantillas de WhatsApp | **Múltiples** | Aprobadas por Meta para difusiones |

---

## NIVEL 1 — Victorias rápidas

### 1. Rescate automático con Twilio cuando Meta bloquea
- **Estado**: Pendiente
- **Problema**: Cuando se hacen difusiones de cobro por WhatsApp, Meta bloquea muchos envíos. Esos clientes quedan con el tag "FALLÓ" y nadie los contacta después.
- **Solución**: Crear un endpoint que:
  1. Busque en ChateaPro todos los suscriptores que tienen tags "FALLÓ"
  2. Cruce sus teléfonos con Supabase para saber cuánto deben
  3. Programe automáticamente una llamada de Twilio para cobrarles
- **Impacto**: Recuperar dinero de clientes que hoy se escapan porque Meta los bloquea.
- **Archivos involucrados**: Nuevo endpoint en `/api/admin/`, reutiliza lógica de `difusion-llamadas.js`

### 2. Alerta de plantillas bloqueadas
- **Estado**: Pendiente
- **Problema**: No hay forma rápida de saber cuántas plantillas fallan en cada difusión.
- **Solución**: Un endpoint o sección en `rendimiento.html` que muestre:
  - "De la última difusión, X enviadas, Y fallaron"
  - Porcentaje de fallo por plantilla
  - Tendencia (¿está empeorando?)
- **Impacto**: Tomar decisiones rápidas (cambiar texto de plantilla, o pasar a Twilio).
- **Datos disponibles**: Tags de ChateaPro con patrón `[APTO] Xto adicional` y `[APTO] Xto adicional FALLÓ`

### 3. Cerrar conversaciones automáticamente
- **Estado**: Pendiente
- **Problema**: Hay 48,620 conversaciones abiertas y se cierran 0 por día. Eso satura la bandeja de los asesores.
- **Solución**: Crear un cron job (tarea automática) que use la API de ChateaPro para cerrar conversaciones donde el cliente no ha respondido en X días (por ejemplo 7 días).
- **Impacto**: Bandeja limpia = asesores más rápidos = mejor tiempo de respuesta.
- **API necesaria**: `GET /subscribers` para filtrar por última interacción, luego cerrar con la API.

---

## NIVEL 2 — Mejoras de alto impacto

### 4. Dashboard de embudo de ventas (funnel)
- **Estado**: Pendiente
- **Problema**: Existen tags de conversión (ViewContent → LeadSubmitted → QualifiedLead → AddToCart → InitiateCheckout → Purchase) pero no se visualizan en ningún lado.
- **Solución**: Agregar una sección en `rendimiento.html` que muestre cuántas personas hay en cada paso del embudo.
- **Ejemplo visual**:
  - 1,000 vieron el contenido (ViewContent)
  - → 400 dieron sus datos (LeadSubmitted)
  - → 200 separaron boleta (AddToCart)
  - → 50 pagaron (Purchase)
- **Impacto**: Ver EXACTAMENTE dónde se pierden los clientes y arreglar ese paso.
- **Datos disponibles**: Custom events de ChateaPro (`Boleta vendida - Ventas/Interacción/Tráfico - ABO`, `Conversación iniciada`)

### 5. Despertar clientes dormidos inteligentemente
- **Estado**: Pendiente
- **Problema**: Hay ~48,577 contactos inactivos. Gente que alguna vez escribió pero ya no interactúa.
- **Solución**: Crear segmentos inteligentes cruzando datos de ChateaPro con Supabase:
  - "Separaron boleta + abonaron algo + les falta > $50,000 + no escriben hace 2 semanas"
  - "Pidieron información + nunca separaron boleta + están en WhatsApp"
  - Luego enviar difusión personalizada o programar llamada.
- **Impacto**: Cada cliente dormido que se despierte es dinero que ya estaba casi cobrado.

### 6. Monitoreo de calidad de asesores en tiempo real
- **Estado**: Pendiente
- **Problema**: El tiempo promedio de respuesta es de 1 hora. No se ve en tiempo real quién responde lento.
- **Solución**: Alertas tipo "Carlos Flores lleva 30 min sin responder a 5 conversaciones asignadas". Se puede mostrar en `rendimiento.html` o enviar notificación.
- **Impacto**: Reducir tiempo de respuesta = más ventas cerradas.
- **API necesaria**: `/flow/agent-activity-log/data` y `/flow-agent-summary`

---

## NIVEL 3 — Mejoras estratégicas

### 7. Actualizar el bot automáticamente desde Supabase
- **Estado**: Pendiente
- **Problema**: Cada vez que cambia un premio, precio o fecha, hay que actualizar los bot fields de ChateaPro manualmente.
- **Solución**: Endpoint que lea la tabla `rifas` y `premios_rifa` de Supabase y actualice automáticamente los bot fields de ChateaPro (nombre de rifa, precio, premios, fechas).
- **Impacto**: Cero errores humanos cuando se cambia de rifa. Todo consistente.
- **API necesaria**: `PUT /flow/set-bot-field-by-name`

### 8. Análisis de conversaciones con IA
- **Estado**: Pendiente
- **Problema**: No se sabe por qué algunos clientes no compran. ¿El bot dijo algo raro? ¿El precio los asustó?
- **Solución**: Leer las últimas X conversaciones donde el cliente NO compró, pasarlas por GPT-4o, y generar un resumen tipo: "El 30% preguntó por envíos y no supimos responder. El 20% dijo que era caro."
- **Impacto**: Mejorar los flujos basándose en datos reales, no en suposiciones.
- **API necesaria**: `/subscriber/chat-messages`

### 9. Score de probabilidad de pago por cliente
- **Estado**: Pendiente
- **Problema**: Se trata a todos los clientes igual. Misma difusión a alguien que lleva 3 meses sin pagar que a alguien que abonó ayer.
- **Solución**: Cruzar datos de Supabase (cuánto lleva abonado, hace cuánto pagó, cuántas boletas tiene) con datos de ChateaPro (última interacción, plantillas fallidas, si está marcado como molesto) para un "score" de 1 a 10.
- **Impacto**: Asesores más eficientes, más cobros por hora.

---

## Orden recomendado de ejecución

| Prioridad | Mejora | Razón |
|---|---|---|
| 1ro | Rescate con Twilio cuando Meta bloquea | Dinero inmediato que se está perdiendo |
| 2do | Cerrar conversaciones automáticamente | Desbloquea a los asesores |
| 3ro | Dashboard de embudo de ventas | Muestra dónde se pierden clientes |
| 4to | Alerta de plantillas bloqueadas | Mejores decisiones de difusión |
| 5to | Despertar clientes dormidos | Base enorme sin explotar |
| 6to+ | Los demás según necesidad | Monitoreo, IA, scores |

---

## Notas técnicas importantes

### Formato de teléfonos (ya resuelto)
- **Supabase**: Guarda los últimos 10 dígitos (ej: `3103874973`)
- **ChateaPro**: Usa formato con código de país (ej: `+573103874973`)
- **Twilio**: Necesita formato E.164 (ej: `+573103874973`)
- La función `formatearTelefono()` ya maneja ambos formatos correctamente.
- Para cruzar datos ChateaPro ↔ Supabase: tomar los últimos 10 dígitos del teléfono de ChateaPro.

### Tokens de ChateaPro
- Línea 1: `process.env.CHATEA_TOKEN_LINEA_1` (flow_ns: f159929)
- Línea 2: `process.env.CHATEA_TOKEN_LINEA_2` (flow_ns: f166221)
- Ambos guardados como variables de entorno encriptadas en Vercel.

### Documentación completa de la API
- Ver `.cursor/rules/chateapro.mdc` para referencia completa de endpoints, flujos, tags, campos y configuración.
