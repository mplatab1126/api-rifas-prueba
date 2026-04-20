# Bitácora del Prompt de Camila

Este documento es la fuente de verdad del agente **Camila** (atención al cliente por WhatsApp). Toda modificación al prompt se registra aquí con su motivo.

**REGLA DE USO (para Claude):** Antes de modificar el prompt de Camila, leer la bitácora completa. Después de modificar, actualizar la bitácora con qué cambió, por qué y qué error previene. Así no repetimos errores pasados.

---

## Versión actual: v2 — 19 de abril de 2026

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

- `consultar_numeros_disponibles` → cuando el cliente quiera ver qué boletas hay libres.
- `registrar_datos_cliente(nombre, apellido, ciudad)` → cuando el cliente envíe sus datos.
- `mostrar_medios_pago` → cuando el cliente ya tiene número + datos y está listo para pagar.
- `enviar_boleta_digital` → solo después de que un humano confirme el pago.
- `consultar_boleta_existente(telefono)` → cuando el cliente ya tiene boleta o pregunta su saldo.
- `escalar_a_humano(razón)` → según las reglas de escalamiento.

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

## Arquitectura del motor

- **Archivo del prompt:** `api/chateapro/camila-prompt.js` (exporta `construirSystemPrompt(botFields)`).
- **Motor:** `api/chateapro/camila-motor.js` — endpoint `POST /api/chateapro/camila-motor`.
- **Tools (6):** están como endpoints separados en `api/chateapro/` y en `api/` (disponibles, cliente).

Cada llamada al motor:
1. Lee el historial completo de la conversación en Chatea Pro.
2. Lee los bot fields actuales de la rifa (premio, precio, fecha, etc.).
3. Lee si el cliente ya tiene boleta en Supabase.
4. Llama a Claude Sonnet 4.6 con el prompt + historial + las 6 tools.
5. Si Claude usa una tool, el motor la ejecuta y le devuelve el resultado. Hasta 5 iteraciones.
6. Envía la respuesta final al cliente por WhatsApp (o deja pausado si escaló).

---

## Variables de entorno necesarias en Vercel

| Variable | Para qué | Estado |
|---|---|---|
| `CAMILA_TOOLS_SECRET` | Contraseña compartida entre el motor y las tools | Ya configurada |
| `ANTHROPIC_API_KEY` | Clave de la API de Claude | Ya configurada (uso previo) |
| `CHATEA_TOKEN_LINEA_1` | Token de la API de Chatea Pro L1 | Ya configurada |
| `API_BASE_URL` | URL pública del proyecto (ej: `https://api-rifas-prueba.vercel.app`) | Falta configurar |

---

## Cómo activar a Camila desde Chatea Pro

En el flow de L1, reemplazar el disparador actual del Agente de IA nativo por un Action que llame al motor:

1. **Entrar al flow editor** en Chatea Pro (L1).
2. **En el subflow donde hoy se activa el Agente de IA** (después del audio + las 10 imágenes de contacto inicial), **reemplazar** ese Action por:
   - **Action → Request HTTP**
   - Método: `POST`
   - URL: `https://api-rifas-prueba.vercel.app/api/chateapro/camila-motor`
   - Headers:
     - `Authorization: Bearer <valor de CAMILA_TOOLS_SECRET>`
     - `Content-Type: application/json`
   - Body (JSON): `{ "user_ns": "{{user_ns}}" }`
3. **Agregar un Trigger "Mensaje entrante"** al mismo flow, que dispare el Request HTTP en cada respuesta del cliente (para que Camila responda a cada mensaje, no solo al primero).
4. **Guardar el flow** y activarlo.

Con un cliente de prueba (un número de WhatsApp solo tuyo), escribirle para ver que Camila responda.

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
