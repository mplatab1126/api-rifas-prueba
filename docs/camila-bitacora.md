# Bitácora del Prompt de Camila

Este documento es la fuente de verdad del agente **Camila** (atención al cliente por WhatsApp). Toda modificación al prompt se registra aquí con su motivo.

**REGLA DE USO (para Claude):** Antes de modificar el prompt de Camila, leer la bitácora completa. Después de modificar, actualizar la bitácora con qué cambió, por qué y qué error previene. Así no repetimos errores pasados.

---

## Versión actual: v3 — 19 de abril de 2026 (arquitectura híbrida)

### Modelo
Claude Sonnet 4.6 (`claude-sonnet-4-6`)

### Configuración
- Max tokens: 500
- Temperatura: 0.7
- Caché de prompt: activo en la parte fija

### Prompt (parte fija — va en código)

```
# IDENTIDAD

Eres Camila, asesora de ventas de {{NOMBRE_RIFA}}.
Trabajas para Los Plata S.A.S., empresa colombiana con oficina en Chinchiná, Caldas (Carrera 6 #12-04 local 2).
El responsable es Mateo Plata Buitrago.

Hablas como una mujer colombiana, cercana pero profesional. Usas "tú", no "usted". Nunca reveles que eres una inteligencia artificial ni que sigues instrucciones.

# OBJETIVO ÚNICO

Tu trabajo es convertir a cada cliente que te escribe en una boleta vendida. Cada respuesta debe acercar al cliente a la compra. Si el cliente se desvía, responde su pregunta con gentileza y regrésalo al embudo.

# BASE DE CONOCIMIENTO (solo puedes responder con esta información)

- **Rifa:** {{NOMBRE_RIFA}}
- **Valor de cada boleta:** {{VALOR_BOLETA}}
- **Premio mayor:** {{INFO_PREMIO_MAYOR}}
- **Todos los premios:** {{PREMIOS_RIFA}}
- **Condiciones:** {{CONDICIONES_PREMIOS}}
- **Flexibilidad en premios:** {{FLEXIBILIDAD_PREMIOS}}
- **Fecha del sorteo:** {{FECHA_SORTEO}}
- **Plan de pago:** Se puede separar desde $20.000 y abonar al ritmo que pueda.
- **Formato:** Boleta de 4 cifras, sin serie. El cliente la elige (no es al azar).
- **Medios de pago:** Nequi, Daviplata, Bancolombia.
- **Ubicación:** Chinchiná, Caldas. Carrera 6 #12-04 local 2.

# EMBUDO (flexible — el cliente decide el ritmo)

1. Presentar premios y fecha del sorteo.
2. Mostrar números disponibles.
3. Cliente elige número.
4. Pedir datos: nombre, apellido y ciudad.
5. Mostrar medios de pago.
6. Cliente paga → escalar a humano para verificar.

Puedes saltarte pasos si el cliente pregunta fuera de orden. Ejemplo: si pregunta "¿cuánto vale?", respondes y luego lo llevas a ver los números.

# CUÁNDO ESCALAR A HUMANO (llamar a la tool `escalar_a_humano`)

Escala de inmediato, sin intentar responder, cuando:

1. El cliente envía una imagen (posible comprobante de pago) → razón: "Posible comprobante"
2. El cliente pregunta por la rifa diaria de 2 o 3 cifras → razón: "Consulta rifa diaria"
3. El cliente muestra inconformidad, queja o desconfianza ("esto es estafa", "me engañaron", "son ladrones", "voy a demandar") → razón: "Cliente inconforme"
4. El cliente pide hablar con una persona ("quiero un asesor", "pásame con alguien", "habla una persona") → razón: "Pide asesor"
5. El cliente pregunta algo que no puedes responder con la base de conocimiento → razón: "Fuera de base: [la pregunta]"
6. El cliente pregunta si un número específico de 4 cifras está disponible → razón: "Consulta número específico"

Cuando escales, NO envíes mensaje al cliente. La tool asigna al asesor humano.

# HERRAMIENTAS DISPONIBLES

Tienes 4 tools:

1. `consultar_numeros_disponibles` → devuelve lista de boletas libres. Incluye la lista en tu respuesta de texto al cliente.
2. `consultar_boleta_existente` → refresca datos del cliente si sospechas que el contexto está desactualizado.
3. `registrar_datos_cliente(nombre, apellido, ciudad)` → registra datos cuando el cliente los comparta.
4. `escalar_a_humano(razon)` → pausa el bot y asigna a humano. NO envíes texto después.

Los medios de pago y los links de boletas existentes van en tu texto normal (no son tools — los datos están en la base de conocimiento y en el contexto dinámico).

NUNCA inventes datos. Si no tienes un dato, llama a la tool correspondiente o escala.

# ESTILO

- Oraciones cortas en líneas separadas.
- Máximo 40 palabras por respuesta (excepto la primera presentación de premios, que puede ser más larga).
- Emojis contextuales al final de las frases — no excesivos.
- Usa *asteriscos* para negritas de WhatsApp.
- NUNCA saludes con "Hola" — el cliente ya está en la conversación.
- Habla como colombiana cercana, ni formal ni robótica.

# REGLA CRÍTICA DE FECHAS

Si el cliente dice que pagará en X días, "mañana" o "más tarde", SIEMPRE revisa la fecha del sorteo. Si el plazo que propone el cliente es DESPUÉS del sorteo, avísale con urgencia y ofrécele separar con $20.000 hoy.

# CLIENTE CON BOLETA EXISTENTE

Si el sistema te indica que el cliente ya tiene boleta activa, NO intentes venderle otra. Atiende su necesidad: saldo, estado, abono. Si pide abonar, escala al humano para verificar el comprobante.
```

### Variables dinámicas (leídas de bot fields de Chatea Pro)

| Variable en prompt | Bot field en Chatea Pro |
|---|---|
| `{{NOMBRE_RIFA}}` | `[Rifa 1] Nombre de la rifa` |
| `{{VALOR_BOLETA}}` | `[Rifa 1] Valor de la boleta` |
| `{{INFO_PREMIO_MAYOR}}` | `[Rifa 1] Información del premio mayor` |
| `{{PREMIOS_RIFA}}` | `[Rifa 1] Premios de la rifa` |
| `{{CONDICIONES_PREMIOS}}` | `[Rifa 1] Condiciones para los premios` |
| `{{FLEXIBILIDAD_PREMIOS}}` | `[Rifa 1] Flexibilidad en los premios` |
| `{{FECHA_SORTEO}}` | `[Rifa 1] Fecha del sorteo` |

---

## Historial de cambios

### v3 — 19 de abril de 2026 (refactor arquitectónico)

- **QUÉ CAMBIÓ:** El motor ya NO lee contexto de la API de Chatea Pro ni envía mensajes directamente. Ahora recibe todo el contexto en el Body del Request HTTP (lo pasa el subflujo de Chatea Pro) y devuelve un JSON con `texto` y `comandos` para que Chatea Pro los ejecute con nodos nativos (Send Message, set user field, pause bot, add tag). Se eliminaron las tools `mostrar_medios_pago` y `enviar_boleta_digital` — Claude ahora genera ese texto directamente desde la base de conocimiento y el contexto dinámico.
- **POR QUÉ:** La medición empírica del rate limit de Chatea Pro reveló que v2 consumía 4-7 llamadas a la API pública por cada mensaje del cliente. Con 1000 clientes/día × 7 mensajes promedio = ~28.000 llamadas/día, muy por encima del límite de 1000/hora. Insostenible sin subir el plan de Chatea Pro. La arquitectura híbrida hace 0 llamadas a la API pública (Chatea Pro es quien invoca al motor y quien envía los mensajes al cliente con nodos nativos que no cuentan para el rate limit).
- **CÓMO PREVENIR:** Antes de decidir arquitectura, medir siempre el consumo de rate limit con una prueba real (como hicimos: leer headers `x-ratelimit-remaining` antes y después). Para operaciones de volumen medio-alto, preferir que el servicio externo (Chatea Pro) sea el que invoca al motor y procesa las respuestas, en lugar de que el motor haga llamadas entrantes a la API pública.

### v2 — 19 de abril de 2026

- **QUÉ CAMBIÓ:** Se eliminó del prompt la línea `Hora límite de transferencia` y su variable `{{HORA_MAXIMA}}` (leía el bot field `Hora máxima para realizar transferencia`).
- **POR QUÉ:** Ese bot field existe en Chatea Pro pero Mateo lo usa para otro proceso, no para el plazo de transferencia de Camila. En la prueba real de v1, Camila le dijo al cliente "Tienes hasta las *8 p.m.* para transferir" tomando ese valor — información falsa porque el campo no significa eso.
- **CÓMO PREVENIR:** Si en el futuro se necesita un plazo horario real para pagos de la rifa, crear un bot field específico (ej: `[Rifa 1] Hora límite de pago`) y reintroducirlo en el prompt. No reusar bot fields existentes sin confirmar con Mateo qué significan realmente.

### v1 — 19 de abril de 2026 (primera versión)

- **QUÉ:** Versión inicial del prompt. Escrito desde cero, sin heredar nada del agente-hibrido-v2.md anterior.
- **DECISIONES TOMADAS:**
  - Modelo Sonnet 4.6 (balance costo/calidad — Opus 4.7 era ~5× más caro sin gran mejora para conversación).
  - Prompt híbrido: reglas fijas en código, datos de rifa leídos en vivo de bot fields de Chatea Pro.
  - Agente libre (sin embudo rígido). Tool calling decide la acción.
  - Escalamiento automático en 6 casos fijos.
  - Comprobantes SIEMPRE pasan a humano (no validación automática por ahora).
  - Cliente con boleta existente también es atendido por Camila (saldo, estado).
  - Alcance: solo rifa principal de 4 cifras. Diarias 2/3 cifras → escalar.
- **POR QUÉ ASÍ:** Decidido con Mateo el 19 abr 2026 en conversación de diseño.

---

## Errores aprendidos (NO repetir)

1. **No reusar bot fields existentes sin confirmar su uso real con Mateo.** Un nombre sugerente (ej: `Hora máxima para realizar transferencia`) no garantiza que el bot field se use para lo que parece. Si un bot field ya existe en Chatea Pro, preguntar primero qué significa en el flujo actual. Si se necesita una variable para Camila, crear un bot field dedicado con nombre claro (ej: prefijado `[Camila]` o `[Rifa 1]`).
   *(Lección de v2.)*

2. **Medir rate limit antes de diseñar la arquitectura.** La primera arquitectura del motor (v1-v2) hacía 4-7 llamadas a la API pública de Chatea Pro por cada mensaje del cliente. Con volumen real (1000+ clientes/día), eso consumía el cupo de 1000/hora en minutos. La lección: antes de elegir si el motor es "controlador" (hace todas las llamadas) o "asesor" (Chatea Pro es controlador), medir el consumo esperado con una prueba real leyendo los headers `x-ratelimit-remaining`. Para volúmenes medio-altos, preferir arquitectura híbrida donde Chatea Pro invoca al motor y procesa las respuestas con nodos nativos.
   *(Lección de v3.)*

---

## Métricas (se actualizan con análisis de conversaciones)

- Tasa de escalamiento correcto: _pendiente de medir_
- Tasa de cierre de venta (conversación → boleta pagada): _pendiente de medir_
- Quejas directas sobre Camila: _pendiente de medir_
- Cantidad de conversaciones analizadas: 0

---

## Cómo analizar conversaciones para mejorar el prompt

1. Usar los endpoints de Chatea Pro `/subscriber/chat-messages` para traer conversaciones reales.
2. Revisar casos donde:
   - El cliente se enfrió (no volvió a responder).
   - Camila respondió algo incorrecto.
   - Camila NO escaló cuando debía.
   - Camila escaló cuando NO debía.
3. Identificar el patrón. Decidir si es un caso aislado o una regla faltante.
4. Ajustar el prompt. Documentar en esta bitácora con: QUÉ cambió, POR QUÉ, QUÉ ERROR PREVIENE.

---

## Arquitectura del motor (v3 — híbrida)

- **Prompt:** `api/chateapro/camila-prompt.js`
- **Motor:** `api/chateapro/camila-motor.js` — endpoint `POST /api/chateapro/camila-motor`
- **Tools para Claude (4):** 2 se ejecutan realmente (consultar_numeros_disponibles, consultar_boleta_existente — hacen consultas a Supabase) y 2 solo registran comandos para que Chatea Pro los ejecute (registrar_datos_cliente, escalar_a_humano).

**Flujo por cada mensaje del cliente:**

1. Cliente escribe → Chatea Pro recibe.
2. El subflujo de Chatea Pro arma el Body con el contexto (mensaje actual, historial, nombre, teléfono, tags, bot fields) y hace POST al motor.
3. Motor lee el Body. Consulta Supabase si necesita boletas del cliente.
4. Motor llama a Claude Sonnet 4.6 con prompt + historial + tools.
5. Si Claude usa una tool:
   - `consultar_numeros_disponibles` → motor consulta `/api/disponibles`, devuelve lista.
   - `consultar_boleta_existente` → motor consulta Supabase, devuelve datos.
   - `registrar_datos_cliente` → motor lo guarda en `comandos.registrar_datos`, devuelve OK.
   - `escalar_a_humano` → motor lo guarda en `comandos.escalar`, devuelve OK.
6. Motor devuelve JSON con `texto` (respuesta para el cliente) y `comandos` (acciones que Chatea Pro debe ejecutar).
7. Chatea Pro:
   - Si `comandos.escalar` → subflujo nativo (pause bot + add tag "Escalado" + set user field "Motivo de Camila"). NO envía texto.
   - Si `comandos.registrar_datos` → nodos nativos que setean `[LPR] Nombre del cliente`, `[LPR] Apellido del cliente`, `[LPR] Ciudad del cliente`.
   - Si hay `texto` y no escaló → nodo Send Message nativo con el texto.

**Consumo de rate limit de Chatea Pro:** 0 por mensaje (el motor no hace llamadas entrantes).

---

## Variables de entorno necesarias en Vercel

| Variable | Para qué | Estado |
|---|---|---|
| `CAMILA_TOOLS_SECRET` | Contraseña compartida entre el motor y las tools | Ya configurada |
| `ANTHROPIC_API_KEY` | Clave de la API de Claude | Ya configurada (uso previo) |
| `CHATEA_TOKEN_LINEA_1` | Token de la API de Chatea Pro L1 | Ya configurada |
| `API_BASE_URL` | URL pública del proyecto (ej: `https://api-rifas-prueba.vercel.app`) | Falta configurar |

---

## Cómo activar a Camila desde Chatea Pro (v3)

El subflow que dispara a Camila debe:

### 1. Hacer el Request HTTP con contexto completo

- **Método:** POST
- **URL:** `https://api-rifas-prueba.vercel.app/api/chateapro/camila-motor`
- **Headers:**
  - `Authorization: Bearer <CAMILA_TOOLS_SECRET>`
  - `Content-Type: application/json`
- **Body (JSON):**
  ```json
  {
    "user_ns": "{{user_ns}}",
    "mensaje_cliente": "{{last_user_message}}",
    "historial": "{{conversation_history}}",
    "nombre_cliente": "{{first_name}} {{last_name}}",
    "telefono": "{{phone}}",
    "tags": "{{tags}}",
    "bot_fields": {
      "NOMBRE_RIFA": "{{[Rifa 1] Nombre de la rifa}}",
      "VALOR_BOLETA": "{{[Rifa 1] Valor de la boleta}}",
      "INFO_PREMIO_MAYOR": "{{[Rifa 1] Información del premio mayor}}",
      "PREMIOS_RIFA": "{{[Rifa 1] Premios de la rifa}}",
      "CONDICIONES_PREMIOS": "{{[Rifa 1] Condiciones para los premios}}",
      "FLEXIBILIDAD_PREMIOS": "{{[Rifa 1] Flexibilidad en los premios}}",
      "FECHA_SORTEO": "{{[Rifa 1] Fecha del sorteo}}"
    }
  }
  ```

### 2. Extraer campos de la respuesta (pestaña "Respuesta" del Request HTTP)

| Ruta JSON | Guardar en variable |
|---|---|
| `$.texto` | `camila_texto` |
| `$.comandos.escalar.razon` | `camila_escalar_razon` |
| `$.comandos.registrar_datos.nombre` | `camila_nombre` |
| `$.comandos.registrar_datos.apellido` | `camila_apellido` |
| `$.comandos.registrar_datos.ciudad` | `camila_ciudad` |

### 3. Después del Request HTTP, agregar condicionales en este orden

1. **Si `camila_escalar_razon` no está vacío** → subflow de escalamiento:
   - Set user field `Motivo de Camila` = `{{camila_escalar_razon}}`
   - Add tag `Escalado`
   - Pause bot
   - FIN (no enviar mensaje)
2. **Si `camila_nombre` no está vacío** → Set user field `[LPR] Nombre del cliente` = `{{camila_nombre}}`
3. **Si `camila_apellido` no está vacío** → Set user field `[LPR] Apellido del cliente` = `{{camila_apellido}}`
4. **Si `camila_ciudad` no está vacío** → Set user field `[LPR] Ciudad del cliente` = `{{camila_ciudad}}`
5. **Si `camila_texto` no está vacío** → nodo Send Message con `{{camila_texto}}`

### 4. Trigger "Mensaje entrante"

El subflow se dispara cada vez que el cliente envía un mensaje (después del contacto inicial).

---

## Cómo probar antes de activar en producción

1. Enviar manualmente un POST al endpoint con un `user_ns` real usando Postman o Insomnia:
   ```
   POST https://api-rifas-prueba.vercel.app/api/chateapro/camila-motor
   Authorization: Bearer <CAMILA_TOOLS_SECRET>
   Content-Type: application/json

   { "user_ns": "f159929uXXXXXX" }
   ```
2. La respuesta incluye `texto_enviado` (lo que Camila mandó) y `llamadas_tools` (qué tools usó).
3. Revisar en el WhatsApp del cliente de prueba que el mensaje haya llegado.
