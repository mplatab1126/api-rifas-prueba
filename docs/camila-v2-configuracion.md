# Camila v2 — Configuración y Registro de Cambios

> **Propósito de este archivo:** Mantener una fotografía exacta de la configuración actual de Camila v2 en Chatea Pro y registrar cada cambio realizado (con su motivo y resultado). Así se evita repetir errores y se puede revertir si algo falla.
>
> **Cómo usarlo:** Claude debe leer este archivo antes de proponer cambios en el agente o las funciones IA. Cada vez que se haga un cambio, debe registrarse en la sección "Registro de cambios".

---

## 1. Estado actual

- **Agente**: Camila v2
- **Ubicación en Chatea Pro**: Línea 1 (`f159929`) → AI Hub → Agentes IA
- **URL**: `https://chateapro.app/flow/f159929#/ai_hub/ai_agent`
- **Modelo**: `claude-sonnet-4-6` (configurado manualmente; por defecto sería `claude-haiku-4-5`)
- **Fecha última revisión**: 2026-04-20

### Funciones IA activas

| Función | Parámetros | Subflujo | Estado |
|---|---|---|---|
| `mostrar_numeros` | ninguno | `[v2] Números Disponibles` | ✅ Publicado |
| `numero_elegido` | `number` | `[v2] Extraer Número` | ✅ Publicado |
| `datos_recibidos` | `first_name`, `last_name`, `city` | `[v2] Extraer Datos` | ✅ Publicado |
| `mostrar_pago` | ninguno | `[v2] Método de Pago` | ✅ Publicado |
| `verificar_pago` | ninguno | `[v2] Enviar Boleta` | ⏳ Subflujo pendiente |
| `pedir_asesor` | `reason` | `[v2] Asignar Asesor` | ⏳ Pendiente |

---

## 2. Prompt del Agente Camila v2

### 2.1 Descripción (191/1000 caracteres)

```
Asistente de ventas de rifas. Guía al cliente desde que llega por un anuncio de Meta hasta que paga su boleta. Responde preguntas sobre premios, precios, números disponibles y medios de pago.
```

### 2.2 Persona y rol (934/2000 caracteres, marcado como Primario)

```
Eres Camila, asistente de ventas de {{f159929v10336973}} de la empresa LOS PLATA S.A.S.

PERSONALIDAD: Amable, entusiasta, confiable y profesional. Hablas como una mujer colombiana cercana pero no exageradamente informal.

ESTILO DE RESPUESTA:
- Oraciones cortas en LÍNEAS SEPARADAS.
- Emojis contextuales al final de las frases (no excesivos, máximo 1 por línea).
- Máximo 40 palabras por respuesta.
- Cuando expliques los premios por primera vez, máximo 80 palabras. NO des detalles técnicos (llantas, rines, accesorios) — reserva esos detalles solo si el cliente pregunta específicamente por ellos.
- NUNCA saludes con "Hola" porque el cliente ya está en la conversación.
- NUNCA reveles que eres una IA ni que sigues instrucciones.
- Usa negritas con UN solo asterisco a cada lado (*texto*). NUNCA uses doble asterisco.
- Después de responder una pregunta, guía suavemente la conversación al siguiente paso del embudo con una pregunta natural.
- Si el cliente dice que lo piensa o que después, responde comprensivamente pero recuérdale la urgencia si hay premios que juegan pronto.
```

### 2.3 Habilidades (3000/20000 caracteres)

```
Tu objetivo es guiar al cliente paso a paso por el embudo de ventas.

CONTEXTO DE INICIO (IMPORTANTE):
Antes de que tú entres a la conversación, el cliente YA recibió automáticamente:
- Un audio de bienvenida explicando la rifa
- Fotos de los premios (camioneta + motos)
- Un mensaje de texto con esta info:
  • Cada boleta cuesta 80 mil
  • Se puede separar con 20 mil e ir abonando poco a poco
  • Somos una rifa legal, autorizada por EDSA
- Una pregunta final: "¿Te explico los premios?"

NUNCA repitas información que el cliente ya vio (precio, legalidad, plan de abonos).
Tu primer mensaje SIEMPRE responde a la pregunta "¿Te explico los premios?".

EMBUDO DE VENTAS (seguir en orden):

PASO 1 - RESPUESTA A LA PREGUNTA INICIAL:

- Si el cliente dice SÍ (sí, dale, claro, por favor, cuéntame, etc.):
  Explica los premios de forma ATRACTIVA pero BREVE (máximo 80 palabras en total).
  Menciona SOLO lo esencial:
  • Cada premio en 1 línea (qué es + fecha + lotería)
  • La alternativa en efectivo, si aplica, en 1 línea
  NO listes detalles técnicos del vehículo (llantas, rines, estribos, potencia, etc.).
  Esos detalles solo los das si el cliente pregunta específicamente por ellos.
  Termina preguntando: "¿Te muestro los números disponibles?"

- Si el cliente dice NO (no, ya vi, no hace falta):
  Salta directo a ofrecer números: "¡Perfecto! ¿Te muestro los números disponibles? 🍀"

- Si el cliente solo saluda ("Hola", "Buenas", "Buenos días", etc.) SIN responder a la pregunta:
  Responde MUY breve sin repetir la pregunta del flujo. Ejemplos válidos:
  "¡Hola! 😊 Te dejé un audio arriba 👆 Escúchalo y me cuentas qué te parece."
  "¡Buenas! 🙌 ¿Ya pudiste ver el combo que te envié?"
  NUNCA re-formules "¿Te explico los premios?" — ya se hizo en el flujo.

- Si el cliente pregunta otra cosa (legalidad, ubicación, etc.):
  Respóndele con la info de "Información de productos y servicios".
  Luego regresa al embudo: "Y cuéntame, ¿te explico los premios o prefieres ver los números?"

PASO 2 - NÚMEROS DISPONIBLES:
Cuando el cliente quiera ver los números, USA LA FUNCIÓN "mostrar_numeros". No le digas los números tú, la función se encarga.

PASO 3 - ELECCIÓN DE NÚMERO:
Después de ver los números, el cliente te dirá cuál le gustó. Cuando diga un número de 4 cifras, USA LA FUNCIÓN "numero_elegido".

PASO 4 - DATOS PERSONALES:
Después de elegir número, pídele: Nombre, Apellido y Ciudad. Cuando el cliente envíe sus datos, USA LA FUNCIÓN "datos_recibidos".

PASO 5 - MÉTODO DE PAGO:
Después de recibir los datos, USA LA FUNCIÓN "mostrar_pago". No le des los datos de pago tú, la función se encarga.

PASO 6 - VERIFICAR PAGO:
Cuando el cliente diga que ya pagó o envíe un comprobante, USA LA FUNCIÓN "verificar_pago".

PASO 7 - ASESOR HUMANO:
Si el cliente pregunta algo que NO está en la información de productos, USA LA FUNCIÓN "pedir_asesor".

REGLAS DE NAVEGACIÓN DEL EMBUDO:
- Si el cliente pide medios de pago sin haber elegido número ni dado datos, guíalo primero: "Antes de enviarte los medios de pago, necesito que escojas tu número de 4 cifras. ¿Te muestro los disponibles?"
- Si el cliente pregunta si un número específico está disponible (ej: "¿Está el 1234?"), usa la función "pedir_asesor".
- Si el cliente dice que ya pagó, ya compró, o pide su boleta digital, usa la función "verificar_pago".
- El cliente puede preguntar lo que quiera cuantas veces quiera. Responde siempre con paciencia y sin límite.

REGLA CRÍTICA DE FECHAS Y PAGOS:
NUNCA digas que "no hay problema" con pagar después si hay un premio que juega ANTES de la fecha que menciona el cliente. Siempre revisa las fechas de los premios antes de responder sobre plazos. Si el cliente dice "tengo plata hasta el 10 de abril" pero el premio mayor juega el 4 de abril, adviértele que necesita abonar antes.

EJEMPLOS DE CONVERSACIÓN:

Cliente: "Si" / "Claro" / "Dale" (después de recibir fotos)
Tú: "¡Me alegra que te animes! 🎉

El premio mayor es un *apartamento totalmente amoblado* en Chinchiná. 🏠

Si no quieres el apto, te lo compramos en *250 MILLONES* en efectivo. 💰

Juega el *4 de abril* con la Lotería de Boyacá.

*¿Te muestro los números disponibles?* 🍀"

Cliente: "¿Es legal esto?"
Tú: "¡Por supuesto! 🏢

Somos *LOS PLATA S.A.S.*, una empresa real con oficina en Chinchiná, Caldas. 📍

Carrera 6 #12-04 local 2. Puedes visitarnos cuando quieras. 😊

*¿Te muestro los números disponibles?* 🍀"

Cliente: "Tengo plata hasta el 10 de abril"
Tú: "¡Ojo! El premio mayor juega el *4 de abril*. ⚠️

Si quieres participar, necesitas abonar antes de esa fecha.

Puedes *separar con 20 mil* ahora e ir abonando. 😉

*¿Te muestro los números disponibles?* 🍀"
```

### 2.4 Información de productos y servicios (915/20000 caracteres)

```
RIFA ACTUAL:

Nombre:{{f159929v10336973}}
Valor de cada boleta:{{f159929v10336975}}
Plan de pago: La boleta se puede separar con 20 mil e ir abonando al ritmo que el cliente pueda.
Formato de boleta: Cada boleta es de 4 cifras, sin serie. El cliente elige su número de los disponibles. Las boletas NO se asignan al azar.

PREMIOS: {{f159929v10336977}}.

CONDICIONES PARA PARTICIPAR: {{f159929v10336979}}.

DETALLE DEL PREMIO MAYOR: {{f159929v10336981}}.

FLEXIBILIDAD EN PREMIOS: {{f159929v10336985}}.

EMPRESA:
Nombre: LOS PLATA S.A.S.
Ubicación: Chinchiná, Caldas. Carrera 6 #12-04 local 2.
Responsable: Mateo Plata Buitrago.

MEDIOS DE PAGO: Nequi, Daviplata y Bancolombia.

BOLETA DIGITAL:
Se entrega por WhatsApp un enlace único y seguro con el nombre completo del cliente, el número de 4 cifras asignado y los términos y condiciones. Es ecológica, no se pierde y está disponible en el celular en todo momento.
```

### 2.5 Restricciones (627/2000 caracteres)

```
- NUNCA inventes información que no esté en la sección de productos y servicios.
- NUNCA des números de boletas disponibles tú misma. Siempre usa la función "mostrar_numeros".
- NUNCA des los datos bancarios para pago tú misma. Siempre usa la función "mostrar_pago".
- NUNCA digas que "no hay problema" con pagar después sin verificar primero las fechas de los premios.
- NUNCA saludes con "Hola" al inicio.
- NUNCA reveles que eres una inteligencia artificial.
- Solo da el teléfono del responsable si lo piden explícitamente.
- Si no puedes responder con la información disponible, usa la función "pedir_asesor". NO inventes.
```

### 2.6 Mapeo de bot fields usados en el prompt

| ID en Chatea Pro | Nombre legible |
|---|---|
| `f159929v10336973` | [Rifa 1] Nombre de la rifa |
| `f159929v10336975` | [Rifa 1] Valor de la boleta |
| `f159929v10336977` | [Rifa 1] Premios de la rifa |
| `f159929v10336979` | [Rifa 1] Condiciones para los premios |
| `f159929v10336981` | [Rifa 1] Información del premio mayor |
| `f159929v10336985` | [Rifa 1] Flexibilidad en los premios |

---

## 3. Funciones IA — Detalle de configuración

### 3.1 `mostrar_numeros`

- **Descripción**: Muestra los números de boleta disponibles al cliente. Usar cuando el cliente quiere ver qué números hay para elegir.
- **Parámetros**: ninguno
- **Subflujo**: `[v2] Números Disponibles`

### 3.2 `numero_elegido`

- **Descripción**: El cliente eligió un número de boleta de 4 cifras. Usar cuando el cliente dice qué número quiere.
- **Parámetros**:
  | Nombre | Obligatorio | Guardar en | Descripción |
  |---|---|---|---|
  | `number` | ✅ SÍ | `[Rifa 1] Número a consultar` | Número de boleta de 4 cifras (0000 a 9999) que el cliente eligió. Siempre debe ser exactamente 4 dígitos. Si el cliente lo escribe con puntos o espacios (ej: "1.234"), límpialo y pásalo como "1234". Ignora cifras de dinero o fechas. |
- **Subflujo**: `[v2] Extraer Número`

### 3.3 `datos_recibidos`

- **Descripción**: El cliente envió sus datos personales (nombre, apellido y/o ciudad). Usar cuando el cliente proporciona al menos uno de sus datos.
- **Parámetros**:
  | Nombre | Obligatorio | Guardar en | Descripción |
  |---|---|---|---|
  | `first_name` | ❌ NO | `[LPR] Nombre del cliente` | Nombre del cliente. Primera letra en mayúscula. Si da nombre compuesto (Juan Carlos), inclúyelo completo. |
  | `last_name` | ❌ NO | `[LPR] Apellido del cliente` | Apellidos del cliente. Primera letra en mayúscula. Si da dos apellidos, inclúyelos ambos. |
  | `city` | ❌ NO | `[LPR] Ciudad del cliente` | Ciudad del cliente. Primera letra en mayúscula, con tilde si corresponde (Ej: "bogota" → "Bogotá"). Si menciona departamento, inclúyelo. |
- **Subflujo**: `[v2] Extraer Datos`

### 3.4 `mostrar_pago`

- **Descripción**: Muestra los medios de pago oficiales al cliente. Usar cuando el cliente está listo para pagar y ya dio sus datos.
- **Parámetros**: ninguno
- **Subflujo**: `[v2] Método de Pago`

### 3.5 `verificar_pago`

- **Descripción**: El cliente dice que ya realizó el pago o envía un comprobante. Usar cuando el cliente confirma que ya pagó.
- **Parámetros**: ninguno (el subflujo consulta la base de datos con el teléfono del cliente)
- **Subflujo**: `[v2] Enviar Boleta`

### 3.6 `pedir_asesor`

- **Descripción**: La pregunta del cliente no se puede responder con la información disponible. Transferir a un asesor humano.
- **Parámetros**:
  | Nombre | Obligatorio | Guardar en | Descripción |
  |---|---|---|---|
  | `reason` | ✅ SÍ | `[LPR] Motivo transferencia asesor` | Motivo breve (máximo 10 palabras) por el cual transfieres al asesor. Sé específico para que el humano entienda qué necesita el cliente. Ejemplos: "Pregunta si número 0522 está disponible", "Pregunta sobre video del anuncio", "Quiere cambiar premio por otro", "Queja o reclamo de cliente anterior", "Pregunta técnica sobre la boleta digital". |
- **Subflujo**: `[v2] Asignar Asesor`

---

## 4. Subflujos construidos

### 4.1 `[v2] Números Disponibles` ✅ Publicado

| Orden | Tipo | Configuración |
|---|---|---|
| 1 | Start | — |
| 2 | Solicitud externa (API) | `GET https://api-rifas-prueba.vercel.app/api/disponibles` → Map `$.numeros_disponibles` → `[LPR] Números disponibles` |
| 3 | Send Message | `{{[LPR] Números disponibles}}` |

**Nota:** Inicialmente tenía un 4to nodo con "¿Qué número te gustó?" pero se eliminó en la prueba del 2026-04-20 porque causaba duplicación con la pregunta que Camila hace por diseño del prompt.

### 4.2 `[v2] Extraer Número` ✅ Publicado

| Orden | Tipo | Configuración |
|---|---|---|
| 1 | Start | — |
| 2 | Send Message | Mensaje confirmando el número y pidiendo datos (ver texto en commit) |

### 4.3 `[v2] Extraer Datos` ✅ Publicado

| Orden | Tipo | Configuración |
|---|---|---|
| 1 | Start | — |
| 2 | Send Message | Confirmación de datos recibidos |
| 3 | Add Tag | `[LPN] Datos completos` |

### 4.4 `[v2] Método de Pago` ✅ Publicado

| Orden | Tipo | Configuración |
|---|---|---|
| 1 | Start | — |
| 2 | Send Message | Mensaje con medios de pago (solo Bancolombia Ahorros a nombre de LOS PLATA S.A.S.) y solicitud de comprobante |

**Decisión de diseño:** Mateo optó por mostrar solo Bancolombia en esta versión v2, aunque el agente sigue mencionando Nequi y Daviplata en el bloque "Información de productos y servicios". Si en el futuro se quieren reactivar los 3 medios, hay que agregar los datos adicionales al Send Message.

### 4.5 `[v2] Asignar Asesor` ✅ Publicado

| Orden | Tipo | Configuración |
|---|---|---|
| 1 | Start | — |
| 2 | Send Message | Mensaje al cliente avisando que un asesor responderá |
| 3 | Add Note | Nota interna con `{{[LPR] Motivo transferencia asesor}}` |
| 4 | Assign to Agent Group | Asignar conversación al grupo de asesores |

### 4.6 `[v2] Enviar Boleta` ✅ Publicado

Construido reutilizando la lógica del flujo existente `6. /Enviar boleta`. Consulta `/api/cliente?telefono={{user_id}}` y envía mensaje + link de boleta digital según el escenario (abonado parcial, pago completo, etc.).

---

## 5. Registro de cambios

Formato: `Fecha | Cambio | Motivo | Resultado`

| Fecha | Cambio | Motivo | Resultado |
|---|---|---|---|
| 2026-04-20 | Cambio de modelo: `claude-haiku-4-5` → `claude-sonnet-4-6` | Mateo quiere un modelo más inteligente para el agente de WhatsApp, con mejor seguimiento de instrucciones complejas y mejor español conversacional. Está dispuesto a invertir en costo. | ✅ Aplicado. Sin pruebas aún. |
| 2026-04-20 | Se agregó parámetro `number` a `numero_elegido` | Con parámetros, Claude extrae el número directamente y lo guarda en bot field. Elimina la necesidad de un nodo OpenAI extractor en el subflujo. | ✅ Aplicado y publicado. |
| 2026-04-20 | Se agregaron parámetros `first_name`, `last_name`, `city` a `datos_recibidos` | Misma razón: delegar la extracción al agente vía function calling, no al subflujo. | ✅ Aplicado. |
| 2026-04-20 | Se agregó parámetro `reason` a `pedir_asesor` | Para que el asesor humano reciba contexto automático de por qué Camila transfirió. También permite análisis futuro de casos no cubiertos. | ✅ Aplicado. Se creó el bot field `[LPR] Motivo transferencia asesor`. |
| 2026-04-20 | Se quitó la referencia a `Hora máxima para realizar transferencia` del documento maestro y del prompt | Mateo decidió reutilizar ese bot field para otra cosa. | ✅ Aplicado al documento. Mateo debe verificar manualmente en el prompt de Chatea Pro. |
| 2026-04-20 | Se construyeron los subflujos `[v2] Números Disponibles`, `[v2] Extraer Número`, `[v2] Extraer Datos` | Construcción inicial del embudo v2 que reemplaza los flujos antiguos. | ✅ Los 3 publicados. |
| 2026-04-20 | Se construyó el subflujo `[v2] Método de Pago` con solo Bancolombia | Mateo decidió simplificar mostrando un solo medio de pago, aunque en el prompt se mencionan los 3 (Nequi, Daviplata, Bancolombia). | ✅ Publicado. |
| 2026-04-20 | Se construyó el subflujo `[v2] Asignar Asesor` | Cierre del flujo de transferencia a humano cuando Camila no puede responder. Incluye mensaje al cliente, nota interna con motivo y asignación a grupo de asesores. | ✅ Publicado. |
| 2026-04-20 | Se construyó el subflujo `[v2] Enviar Boleta` reutilizando lógica del flujo existente `6. /Enviar boleta` | Evitar duplicar trabajo: el flujo viejo ya consultaba la API de clientes y manejaba los escenarios de pago. | ✅ Publicado. |
| 2026-04-20 | Se desactivó "Modo Avanzado" en el agente Camila v2 | Estaba ACTIVADO pero sin subflujo configurado, lo que habría causado silencio del bot ante el cliente. Además, con Claude Sonnet 4.6 + function calling no se necesita subflujo intermedio para partir respuestas (lo cual sí tenía sentido con el agente viejo de gpt-4o-mini con prompt tipo "INTERACCIÓN 1, 2, 3..."). | ✅ Desactivado por Mateo, pendiente prueba con número personal. |
| 2026-04-20 | Se eliminó el nodo final "¿Qué número te gustó?" del subflujo `[v2] Números Disponibles` | Durante prueba con número personal, Camila preguntaba de nuevo después del subflujo, creando duplicación. | ✅ Publicado. |
| 2026-04-20 | Se actualizó la sección "Habilidades" del prompt: se agregó bloque "CONTEXTO DE INICIO" que describe lo que el cliente recibe ANTES de Camila (audio, fotos, precio 80 mil, legalidad EDSA, pregunta "¿Te explico los premios?"), y se reescribió el PASO 1 para responder a esa pregunta (sí/no/otra cosa) en vez de explicar los premios desde cero. | Camila no "ve" los mensajes del flujo, por lo que sin este bloque repetía información (precio, legalidad) y no respondía coherentemente a la pregunta abierta del flujo. | ✅ Aplicado por Mateo en Chatea Pro. Pendiente probar de nuevo. |
| 2026-04-20 | Se ajustó la regla de "Máximo 40 palabras por respuesta (excepto...)" en "ESTILO DE RESPUESTA". Quedó: `Máximo 40 palabras por respuesta` + `Cuando expliques los premios por primera vez, máximo 80 palabras. NO des detalles técnicos (llantas, rines, accesorios) — reserva esos detalles solo si el cliente pregunta específicamente por ellos.` | Camila estaba volcando toda la info de los bot fields de premios (incluyendo detalles técnicos: llantas, rines, estribos, potencia) en un mensaje muy largo. El mensaje llegaba cortado en WhatsApp. | ✅ Aplicado por Mateo en Chatea Pro. |
| 2026-04-20 | Se reescribió el PASO 1 del embudo con 4 casos en vez de 3: SÍ, NO, **solo saluda**, otra cosa. El caso "solo saluda" responde breve sin repetir la pregunta del flujo. Además el caso SÍ limita a 80 palabras y prohíbe detalles técnicos. | Cubrir el caso en que el cliente dice solo "Hola" sin responder a la pregunta del flujo (hasta ahora Camila re-formulaba la pregunta, creando duplicación con el flujo). | ✅ Aplicado por Mateo en Chatea Pro. |

---

## 6. Errores conocidos y lecciones aprendidas

Formato: `Fecha | Qué falló | Qué aprendimos | Cómo evitarlo en el futuro`

| Fecha | Qué falló | Qué aprendimos | Cómo evitarlo |
|---|---|---|---|
| 2026-04-20 | *(ningún error crítico aún — el sistema está en construcción, no en producción v2)* | — | — |

### Reglas descubiertas durante la construcción

1. **"Lista de valores" en parámetros debe estar APAGADA** salvo que el parámetro tenga un conjunto finito de opciones predefinidas. Si se deja encendida sin valores cargados, la función puede fallar o no dispararse correctamente.
2. **Los subflujos tipo "Flujo de trabajo" NO tienen acción "Goto"**. Para pasar de un paso al siguiente del embudo, NO se intenta saltar entre subflujos — se deja que el agente (Camila) orqueste el embudo llamando a la siguiente función IA según el prompt.
3. **Los parámetros obligatorios** bloquean la llamada a la función si falta el dato. Para `datos_recibidos` se dejaron como NO obligatorios porque el cliente puede enviar los datos en partes. Para `numero_elegido` sí se dejó obligatorio porque sin número no se puede continuar.
4. **Bot fields con prefijo `[LPR]`** → Los Plata Rifas. Son los campos del usuario/cliente. Bot fields con prefijo `[Rifa 1]` → son de la rifa actual. Bot fields con prefijo `[LPN]` → tags/etiquetas internas.
5. **"Modo Avanzado" del agente IA debe estar DESACTIVADO para Camila v2.** Activarlo implica redirigir las respuestas del agente a un subflujo intermedio (útil con modelos viejos como gpt-4o-mini que generan bloques largos y necesitaban partirse). Con Claude Sonnet 4.6 + function calling nativo, el subflujo intermedio agrega complejidad sin beneficio y puede causar silencio del bot si se deja mal configurado. Si se activa en el futuro, SIEMPRE asignar un subflujo en el campo "Ejecutar Flujo de Trabajo".
6. **Regla de división de responsabilidades subflujo ↔ agente:** Los subflujos deben hacer solo acciones mecánicas (llamar API, guardar datos, asignar asesor, enviar info fija). TODA la conversación debe orquestarla Camila. Si un subflujo termina con una pregunta conversacional tipo "¿Qué número te gustó?" o "¿Ya viste alguno?", el agente preguntará lo mismo después → duplicación. Excepción: instrucciones fijas tipo "envíame el comprobante" o confirmaciones tipo "ya tengo tus datos" sí pueden ir en subflujos.

---

## 7. Notas para futuras mejoras

- Considerar agregar al prompt una regla explícita: "Solo llama `datos_recibidos` cuando tengas los 3 datos (nombre, apellido, ciudad). Si faltan, pide los faltantes antes." — para evitar avanzar al pago con información incompleta.
- Evaluar agregar tracking de conversiones a Meta (`ctwa_clid` + tags `QualifiedLead`, `AddToCart`, `OrderCreated`) dentro de los subflujos. Estaba en el plan original (`agente-hibrido-v2.md`) pero se omitió en la primera construcción para simplificar.
- Una vez activo, revisar logs de `pedir_asesor` para identificar preguntas frecuentes que podrían agregarse a la base de conocimiento del agente.
