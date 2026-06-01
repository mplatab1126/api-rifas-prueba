# Evaluación: ¿salir de ChateaPro con un CRM/sistema propio?

> **Propósito:** Comparar de forma honesta las opciones para dejar ChateaPro, con esfuerzo, riesgos y costos de cada una. Documento de decisión (Mateo aún está evaluando, no ha decidido).
>
> **Fecha:** 2026-06-01

---

## 0. La idea clave que hay que entender primero

Lo que la gente llama "CRM" (base de datos de clientes, ventas, abonos, métricas, panel de trabajo) **ya lo tienes construido**: es `admin.html` + Supabase + tus endpoints + lectura de comprobantes con IA + llamadas de Twilio. **Eso no es lo difícil y no es lo que te da ChateaPro.**

ChateaPro / Manychat solo te dan **la capa de WhatsApp**:
1. Recibir y enviar mensajes de WhatsApp.
2. Un **constructor visual** de flujos (arrastrar cajitas) para que el bot conteste solo.
3. Una **bandeja de chat** para que los asesores respondan a mano.

Por eso "hacer mi propio sistema" significa de verdad: **ser tu propio proveedor de WhatsApp**, conectándote **directo a la API oficial de Meta (WhatsApp Cloud API)** y programando el bot en tu backend.

> Dato a favor: **ya le hablas directo a Meta** para traer los costos de WhatsApp (`api/admin/sincronizar-whatsapp.js` usa `WABA_ID` y `WABA_TOKEN`). El canal técnico con Meta ya está abierto.

---

## 1. Lo que ya tienes vs. lo que faltaría construir

### ✅ Ya lo tienes (no se rehace)
- Base de datos completa (Supabase): boletas, clientes, abonos, transferencias, gastos, métricas.
- Panel de asesores (`admin.html`): vender, abonar, leer comprobantes con IA.
- Endpoints que el bot consulta en vivo: `api/disponibles.js`, `api/cliente.js` (ya desacoplados, sirven igual para cualquier plataforma).
- IA de comprobantes (Claude visión) y de gastos.
- Llamadas automáticas de cobro (Twilio + ElevenLabs).
- Sincronización de métricas de Facebook y de costos de WhatsApp directo de Meta.

### ☐ Lo genuinamente NUEVO para un sistema propio
| Pieza | Qué es | Dificultad |
|---|---|---|
| **1. Buzón de mensajes (webhook)** | Hoy NO existe. ChateaPro recibe los mensajes; tú nunca recibes "llegó un mensaje". Hay que crear el endpoint que Meta llama cada vez que un cliente escribe. | 🟡 Media |
| **2. Motor de conversación (el bot) en código** | Los flujos hoy viven dibujados dentro de ChateaPro. Hay que rehacer el embudo de 7 pasos como código + IA de enrutamiento (Claude Haiku). **Es el grueso del trabajo.** | 🔴 Media-alta |
| **3. Bandeja de chat para asesores** | Pantalla para que los asesores lean y respondan a mano cuando el bot pasa a humano. ChateaPro la da gratis; en propio se construye. | 🟡 Media (trabajo de pantalla) |
| **4. Plantillas Meta + regla de 24h** | Para difusiones/cobros fuera de 24h, Meta exige plantilla aprobada. Igual en TODAS las opciones. | 🟡 Media (espera aprobación de Meta) |
| **5. Agrupar mensajes (debounce)** | Juntar varios mensajes seguidos del cliente en uno. ChateaPro lo hace nativo; en propio se programa (es más fácil en código propio que en Manychat, que NO lo trae). | 🟢 Fácil en backend |

### Nota sobre el módulo más frágil de hoy
`api/admin/rescate-whatsapp.js` (etiquetas "FALLÓ", embudo, rescate por Twilio) es frágil **porque depende de cómo ChateaPro organiza sus etiquetas**. En un sistema propio **tú eres dueño de las etiquetas** → se vuelve **más estable**, no más difícil.

---

## 2. Las tres opciones

### Opción A — Sistema 100% propio (Meta Cloud API directo)

**Esfuerzo (yo construyo, tú pruebas):**
- Webhook receptor: ~2-3 días.
- Enviar mensajes por Cloud API: ~2 días.
- Motor del embudo (7 pasos + IA de ruta + agrupar mensajes): ~2-3 semanas.
- Bandeja de chat para asesores: ~1-2 semanas (es la pieza "escondida" que más se subestima).
- Plantillas + aprobación de Meta: días de espera de Meta (no de código).
- Pruebas y corte: ~1 semana.
- **Total realista: 5 a 8 semanas de trabajo**, no un cambio de tarde.

**Costos:**
- Plataforma: **$0/mes** (te ahorras el pago mensual).
- Meta por conversación: lo pagas **en todas las opciones** (las conversaciones de servicio iniciadas por el cliente hoy son gratis o muy baratas; las de marketing/plantilla se pagan por mensaje, ~$0.02-0.05 USD c/u).
- Infra (Vercel, Supabase): ya la pagas, costo extra mínimo.
- IA (Haiku para rutas, visión para comprobantes, Whisper para audios): uso pequeño, ya presente.

**Riesgos:**
- 🔴 **Eres el único responsable.** Si WhatsApp se cae a las 2am, no hay soporte; lo arreglas tú **y solo puedes con IA** (no eres programador).
- 🔴 **No puedes cambiar el bot tú solo.** Cada ajuste es código → dependes 100% de la IA. No hay "arrastrar una cajita".
- 🟡 Calidad del número: si las plantillas se usan mal, Meta puede degradar/bloquear tu línea (esto también pasa con ChateaPro, pero aquí lo gestionas tú).
- 🟡 La bandeja de chat debe quedar muy sólida o los asesores no pueden trabajar.

**Ganas:** control total, nunca más desincronización, sin pago mensual de plataforma, sin que un tercero cambie su API y te rompa todo.

---

### Opción B — Terminar la migración a Manychat (plan ya documentado)

**Esfuerzo:**
- Ya tienes la bitácora `migracion-manychat.md` avanzada.
- Reconstruir el embudo en el constructor visual + conectar tu backend por "Solicitud externa".
- **Total realista: 2 a 4 semanas**, bastante menos que el propio.

**Costos:**
- Plan Avanzado: **USD $139/mes** (~560.000 COP/mes) + Meta por conversación.
- Tope de 25.000 contactos; si creces a cientos de miles → plan Elite (precio a medida con ventas de Manychat).

**Riesgos:**
- 🟡 Límites ya documentados: no agrupa mensajes nativo, la API no construye flujos, no soporta WhatsApp Flows, la "Respuesta predeterminada" puede mandar al cliente a un paso equivocado. **Te obliga igual a mover la lógica pesada a tu backend.**
- 🟡 Sigue siendo un tercero que puede cambiar o fallar (aunque Manychat es más estable que ChateaPro).
- 🟢 Conservas constructor visual y bandeja de chat (puedes ajustar cosas tú mismo).

**Ganas:** salida más rápida y con red de seguridad; soporte y servidores que cuida otro.

---

### Opción C — Híbrido: piloto en la Línea 2 (recomendada para evaluar con datos reales)

**Idea:** construir la capa de WhatsApp propia **solo para la Línea 2** (la de respaldo, `f166221`), sin tocar la Línea 1 principal. Probar con tráfico real pequeño y decidir con datos.

**Esfuerzo:**
- Igual que la Opción A pero **acotado** y sin presión: webhook + envío + un embudo mínimo + bandeja sencilla, solo para una línea.
- **Total realista: 3 a 5 semanas**, pero sin riesgo sobre tu operación principal.

**Costos:** igual que Opción A (casi $0 de plataforma para esa línea).

**Riesgos:**
- 🟢 **Riesgo bajo:** si el piloto falla, la Línea 1 (tu operación real) sigue intacta en ChateaPro/Manychat.
- 🟡 Durante el piloto mantienes dos sistemas a la vez (doble atención un tiempo).

**Ganas:** aprendes lo que de verdad cuesta ser tu propio WhatsApp **sin arriesgar el negocio**, y decides después con evidencia, no con suposiciones.

---

## 3. Resumen para decidir

| | A. Propio | B. Manychat | C. Híbrido (piloto L2) |
|---|---|---|---|
| **Tiempo** | 5-8 semanas | 2-4 semanas | 3-5 semanas (sin riesgo) |
| **Costo mensual plataforma** | $0 | ~$139 USD | ~$0 en la línea piloto |
| **Control / desincronización** | Total ✅ | Parcial | Total en el piloto |
| **¿Puedes cambiar el bot tú solo?** | No ❌ | Sí (visual) ✅ | No en el piloto |
| **Si se cae, ¿quién responde?** | Solo tú + IA ❌ | Manychat ✅ | Solo tú, pero es la línea de respaldo |
| **Riesgo para la operación real** | Alto 🔴 | Bajo 🟢 | **Muy bajo** 🟢 |

### Mi recomendación honesta
La pregunta no es técnica, es operativa: **¿quieres ser el responsable único de tu WhatsApp sabiendo que solo lo arreglas con IA?**
- Si la respuesta es "sí, quiero control total y dejar de pagar plataforma" → el camino sensato **no es saltar de una**, es la **Opción C (piloto en Línea 2)**. Pruebas lo más difícil (ser tu propio WhatsApp) sin arriesgar las ventas reales, y si funciona, mueves la Línea 1 con confianza.
- Si lo que más valoras es **rapidez y red de seguridad** → **Opción B**, terminar Manychat.

---

## 4. Construcción del buzón propio (arrancada)

Mateo decidió **no tocar las dos líneas reales** y montar el buzón propio con un **número de prueba gratis de Meta**. Orden acordado: (1) buzón, (2) agente IA, (3) bandeja de asesores.

### Lo que ya quedó en el código (sin tocar producción)
- `sql/whatsapp-buzon.sql` — crea 2 tablas NUEVAS: `conversaciones_whatsapp` (un chat por cliente) y `mensajes_whatsapp` (un registro por mensaje, entrante o saliente). Additivo, no toca tablas existentes.
- `api/lib/whatsapp.js` — helper para enviar por la Cloud API de Meta (`enviarTexto`). Lee las variables de entorno nuevas.
- `api/whatsapp/recibir.js` — **el timbre (webhook)**. Verifica el webhook (GET) y guarda los mensajes entrantes + acuses de entrega (POST). Responde 200 rápido para que Meta no reintente. Evita duplicados por `wa_message_id`.
- `api/whatsapp/enviar.js` — endpoint protegido para enviar un texto y guardarlo en el buzón (lo usará la bandeja; sirve para pruebas).

### Variables de entorno nuevas (configurar en Vercel cuando la app de Meta esté lista)
- `WHATSAPP_TOKEN` — token de acceso de la app de Meta.
- `WHATSAPP_PHONE_NUMBER_ID` — identificador del número desde el que se envía.
- `WHATSAPP_VERIFY_TOKEN` — palabra secreta que inventa Mateo para el "apretón de manos" del webhook (debe coincidir en Meta y en Vercel).

> Se usan variables NUEVAS, separadas de `WABA_ID`/`WABA_TOKEN` (que ya existen para los costos), para mantener el piloto aislado.

### Pendiente para dejarlo funcionando
- [ ] **Mateo:** crear la app en developers.facebook.com → producto WhatsApp → copiar `token`, `phone number ID`; agregar su WhatsApp como número de prueba.
- [ ] **Correr `sql/whatsapp-buzon.sql`** en Supabase (crea las 2 tablas). Requiere autorización explícita de Mateo (toca la base real, aunque sea additivo).
- [ ] Configurar las 3 variables de entorno en Vercel.
- [ ] En Meta → WhatsApp → Configuración → Webhook: poner la URL `https://<dominio>/api/whatsapp/recibir`, el `verify token`, y suscribirse a `messages`.
- [ ] Prueba: escribir desde el WhatsApp de prueba y ver la fila aparecer en `mensajes_whatsapp`; responder con `enviar`.

## 5. Registro
- **2026-06-01** — Creada esta evaluación. Mateo pidió comparar opciones antes de decidir.
- **2026-06-01** — Mateo eligió construir buzón propio con número de prueba (sin tocar L1 ni L2). Escrito el código base del buzón (timbre + envío + 2 tablas).
- **2026-06-01** — **Buzón conectado y RECIBIENDO ✅.** Creada la app de Meta "Buzón Los Plata" (id 2607182326463882) con número de prueba +1 555 671 2533 (phone_number_id 1147348345124937, WABA de prueba 1522272816231368). Variables `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_VERIFY_TOKEN` puestas en Vercel. Código publicado en producción (main). Webhook configurado en Meta (URL `https://www.losplata.com.co/api/whatsapp/recibir`, suscrito a `messages`). **Prueba end-to-end exitosa:** un WhatsApp real de Mateo llegó a `mensajes_whatsapp` con su nombre de perfil y wamid real, sin ChateaPro. **Bug arreglado:** el índice único de `wa_message_id` era parcial y rompía el upsert; se cambió a índice único normal.
  - Pendiente: probar ENVIAR (bloqueado por seguridad mandar WhatsApp real sin OK explícito), crear **token permanente** (el actual de prueba vence en 24h), luego agente IA y bandeja.
