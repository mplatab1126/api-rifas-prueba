# Buzón propio de WhatsApp (bandeja) — Contexto y handoff

> **Para Claude en un chat nuevo:** lee este documento ANTES de seguir. Resume todo lo
> construido del sistema de **bandeja de WhatsApp propia** (reemplazo de ChateaPro) y del
> **agente de IA "Liliana"**. Sigue `CLAUDE.md` (responder en español simple; Mateo no es
> programador; no reescribir lógica de plata; publicar a `main` → Vercel despliega en ~1 min
> en www.losplata.com.co).
>
> Este doc se **condensó** (jun-2026) para no llenar la ventana de contexto. El relato
> paso-a-paso de bugs viejos se resumió en "lecciones". Si necesitas un detalle histórico que
> no esté aquí, está en el `git log` o en el código.

## 0. Regla de oro: escala + que se sienta rápido
Todo debe aguantar **escala real** (líneas con 50.000–100.000 contactos, 5+ líneas):
- **Filtros, conteos, búsquedas y paginación SIEMPRE en el servidor**, por índice. Nunca traer
  todo al navegador. Datos de configuración (etiquetas, respuestas rápidas) sí se cargan completos.
- **Una tabla por concepto** con columna `linea_id` + índices (NO una tabla por línea).

Y que sea **rápido y liviano** para el asesor: UI optimista (la acción se ve al instante), no
redibujar si nada cambió, cachear lo pesado (subir imágenes a Meta una vez por `media_id`),
peticiones cortas. La velocidad es **diseño del código**, no plan de Vercel/Supabase.

## 1. Objetivo
Mateo (rifas "Los Plata") salió de ChateaPro (fallaba) y Manychat (limitado). Construyó su
**propio buzón** conectado **directo a la WhatsApp Cloud API de Meta**, con bot/IA y bandeja en
su backend. El CRM ya existía (Supabase + panel admin); faltaba la capa de WhatsApp.
La página es **`/bandeja-whatsapp`** (`public/bandeja-whatsapp.html`), protegida con la
contraseña de asesor (`ASESORES_SECRETO`, las mismas del Admin).

## 2. Qué YA funciona
- **Recibir/enviar** WhatsApp por la Cloud API, todo guardado en Supabase.
- **Bandeja** estilo WhatsApp: menú lateral (Chats/Contactos), lista, conversación, ficha del cliente.
- **Multi-línea** con permisos por línea (§5). **Selector de línea** arriba; gerencia ve "Conectar línea".
- **Filtros en servidor**: "Sin respuesta" (último mensaje del cliente) con conteo, y por **etiqueta**
  (chips, INNER JOIN a `conversacion_etiquetas`). Se combinan con la búsqueda.
- **Buscar chats en servidor** (`q`): busca en TODA la base por nombre o número, no solo lo cargado.
- **Ver comprobantes** (fotos/audios) en el chat; varias fotos seguidas se agrupan en galería.
- **Ficha del cliente** (panel derecho): tarjeta del cliente + una por boleta con saldo, historial de
  pagos y basurero para eliminar abono. Distingue registrado vs nuevo; autocompleta el indicativo;
  botón "Actualizar" sin recargar.
- **Verificar pago** (clic derecho en comprobante → "Buscar el pago"): lee la imagen con IA y la compara
  contra las **transferencias REALES** (no abona por la foto); si está libre → "Abonar" (una boleta o
  repartir, suma exacta). Reusa `/api/admin/abono`.
- **Eliminar abono** desde la bandeja (y arreglado en Admin): si el pago está repartido, borrar una parte
  borra todas y libera la transferencia (avisa antes).
- **Etiquetas** por conversación (ícono+color+nombre). 4 por defecto. **Automáticas de estado de pago**
  (Separada/Abonada/Pagada) vía función `sincronizar_etiquetas_estado()` por pg_cron cada 5 min.
  Dos lugares separados: el **ícono de etiqueta en el chat** SOLO marca/desmarca etiquetas de ese
  cliente; **crear / ordenar (arrastrar) / eliminar** etiquetas se hace en el menú izquierdo **"Etiquetas"**.
- **Contactos**: lista paginada con buscador en servidor, crear e importar CSV (entiende el export de ChateaPro).
- **Difusiones** (menú Difusiones): **Plantillas** (se crean contra Meta, estado en colores, "Actualizar estados")
  y **Campañas** (asistente: plantilla → audiencia → envío **por lotes** con cola `difusion_destinatarios`,
  prueba y barra de progreso). También "Enviar plantilla" a un chat puntual para reabrir +24h.
  **Filtros de audiencia** (8-jun): todos · **clientes** (con boleta; subfiltro estado de pago todos/saldo/pagados
  + ciudad) · **potenciales** (sin boleta) · etiqueta — calculados en la base con `difusion_audiencia`.
  **Programar** el envío a una hora (queda 'programada'; el cron `difusiones-cron.js` lo manda por tandas).
  Casilla **"Liliana atiende las respuestas"** (`activar_agente`, default sí): al enviar pone `agente_activo=true`
  en cada chat, así Liliana sigue el hilo cuando el cliente responde (ve el texto enviado en el historial).
- **Respuestas rápidas (flujos)**: cada una son varios pasos (texto/imágenes). Se usan con ⚡ o `/`.
- **Enviar fotos/PDF** desde el chat (clip 📎; `enviar-archivo.js`, máx 5 MB).
- **Ventana de 24h**: bloquea la caja de texto cuando está cerrada. **Cita de mensajes** (`responde_a`).
- **Avisos de mensaje nuevo**: "ding" + contador en la pestaña + botón silenciar (recuerda en `localStorage`).
- **Campo correo** agregado a clientes/boletas en todo el sistema (factura electrónica).
- **Favicon** (logo) en todas las páginas. **Optimización para celular** (íconos, hojas, zona segura iPhone).
- **Agente de IA "Liliana"**: vendedor automático con la API de Claude, **EN VIVO** con clientes reales
  en la línea "Compra con Lili". Todo el detalle en §8.

## 3. Base de datos (Supabase, proyecto `ikvzmojzgpxuhnbymtxm`)
Tablas del buzón:
- **`lineas_whatsapp`**: config de cada línea — `phone_number_id` (PK), `nombre`, `token` (null = usa env),
  `activa`, `waba_id`, `suscrita`.
- **`lineas_asesores`** `(phone_number_id, asesor)`: qué asesores ven cada línea (gerencia no necesita fila).
- **`conversaciones_whatsapp`**: un chat por `(linea_id, telefono)` (único). Campos: `nombre_perfil`,
  `ultimo_mensaje`, `ultimo_at`, `ultimo_entrante`, `no_leidos`, `estado`, `correo`, `linea_id`.
  Contacto importado = fila con `ultimo_at` null (sale en Contactos, no en Chats).
  Columnas del agente: `agente_activo` (bool, el botón 🤖), `agente_procesando_at` (candado de proceso),
  `agente_respondido_ms` (bigint, candado anti-duplicado por tanda — ver §8.5). *(Existe también
  `agente_respondido_hasta` timestamptz de una versión previa; el código vivo usa `agente_respondido_ms`.)*
- **`mensajes_whatsapp`**: `conversacion_id`, `telefono`, `linea_id`, `direccion` (entrante/saliente/**nota**),
  `tipo`, `texto`, `media_id`, `media_url`, `wa_message_id` (único, anti-duplicado), `estado_envio`,
  `timestamp_wa`, `responde_a` (cita), `raw` (incluye `agente:true` en lo que envía Liliana).
- **`etiquetas`** `(id, linea_id, nombre, icono, color, orden)` y **`conversacion_etiquetas`** `(conversacion_id, etiqueta_id)`.
  `orden` = el orden que eligió Mateo (arrastrando en la ventana de Etiquetas); se respeta en la ventana, el filtro y las píldoras.
- **`plantillas_whatsapp`** y **`difusiones`** (+ columnas `programada_at`, `activar_agente`) + **`difusion_destinatarios`**
  (cola de envío, escala; estado pendiente→enviando→enviado/fallido). Funciones: `difusion_audiencia(linea, filtros)`
  (audiencia con filtros) y `difusion_reclamar_lote(difusion, limite)` (reclamo atómico del lote). Cron jobid 6
  `difusiones-programadas-cada-minuto`.
- Columna **`correo`** en `clientes` y `boletas`.

Tablas del agente:
- **`agente_config`** (por línea): `estado` (apagado|sombra|encendido), `nombre_agente`, `prompt` (el manual),
  `modelo`, `variables` (jsonb: `{{nombre}}`, `{{pagos}}`…), `resultados` (jsonb: ganadores por fecha),
  `actualizado_por/at`.
- **`agente_herramientas`** `(linea_id, clave, …, activa)`: qué acciones tiene prendidas cada línea.
- **`agente_actividad`** `(linea_id, telefono, tipo, resumen, created_at)`: bitácora de lo que hace + errores.
- **`recordatorios`**: seguimiento automático <24h (§8.6). Índices parciales por `estado='pendiente'`.
- *(Las tablas `agente_qa_estado` y `agente_sugerencias` eran del supervisor QA; se **BORRARON** el 2026-06-08 junto con él.)*
- **`disparadores`** `(linea_id, palabra, tipo ['palabra'|'nuevo_contacto'], activo)` (§8.8).

Índices pensados para escala: por `linea_id`, `ultimo_at`, parcial de "sin respuesta", etc.

## 4. Endpoints (`api/whatsapp/`)
- **`recibir.js`** — webhook (GET verifica, POST mensajes/acuses). Detecta la línea por `phone_number_id`
  (todas usan la misma URL). Además: **dispara el motor** del agente si está activo (`dispararAgenteSiActivo`,
  corte a 1.5s), **cancela recordatorios** pendientes cuando el cliente vuelve a escribir, **prende el agente
  por disparador** (`activarPorDisparador`) y captura la cita (`m.context.id → responde_a`).
  *(10-jun: un mensaje de PURA cortesía —"Gracias 🙏", "ok", solo emojis— ya NO cancela los
  recordatorios; `esCortesiaPura()`, lista conservadora: en la duda cancela como siempre. Las
  reacciones y tipos sin contenido tampoco cancelan, H26.)*
- **`enviar.js`** / **`enviar-archivo.js`** (foto/PDF del computador) / **`media.js`** (descarga con token de la línea).
- **`conversaciones.js`** — lista de chats. Acepta `q` (búsqueda) y **`filtros`** (filtro avanzado del
  botón "Filtros": `{ modo:'y'|'o', condiciones:[etiqueta | sin_respuesta | recordatorio | creado] }`).
  TODO el filtrado lo hace la base con la función **`bandeja_filtrar(...)`** (escala). *(9-jun: se eliminó
  el "ocultar a Liliana"; el parámetro `p_ocultar_agente` de la función quedó sin uso, default `false`.)*
- **`recordatorios.js`** — solo lectura: recordatorios PENDIENTES de un chat con su motivo (lo usa el
  botón de relojito de la barra del chat). No confundir con `recordatorios-cron.js` (el reloj que los envía).
- **`comprobantes.js`** — lista las FOTOS de pago que mandan los clientes (imágenes entrantes) de una línea,
  paginado en servidor, con su estado: ✅ asignado (raw.pago_asignado) / ⏳ sin asignar. Lo usa el menú
  **Comprobantes** de la bandeja (clic en uno → abre su conversación). Filtro "solo sin asignar".
- **`marcar-comprobante.js`** — marca una foto de comprobante como "pago asignado a la boleta NNNN"
  (`raw.pago_asignado`). Lo llama la bandeja tras un abono manual desde un comprobante; Liliana hace lo mismo
  en `registrar_abono`. Solo informativo (chip verde encima de la foto); no toca el abono.
- **`marcar-respondido.js`** — pone `ultimo_entrante=false` + `no_leidos=0` en un chat para sacarlo de "sin
  respuesta" sin escribirle (botón "Marcar como respondido" del menú ⋮ del chat). Si el cliente vuelve a
  escribir, reaparece como sin respuesta. La barra del chat tiene a primer toque ficha/recordatorios/etiqueta y
  un menú **⋮** (tres puntitos) con "Marcar como respondido" y "Eliminar contacto".
- **`mensajes.js`** — mensajes de un chat (expone `por_agente` desde `raw.agente`).
- **`cliente.js`** — ficha (boletas/deuda/pagos por boleta; empareja por últimos 10 dígitos; calcula `puede_modificar`).
- **`buscar-pago.js`** — verifica el comprobante vs transferencias reales (lo usa "verificar pago" y el abono del agente).
- **`contactos*.js`**, **`lineas.js`**, **`conectar-linea.js`** (suscribe la WABA), **`etiquetas.js`**,
  **`plantillas.js`**, **`difusiones.js`** (acciones: listar/crear/editar/eliminar/preparar/**programar**/estado/
  enviar-lote/cancelar/prueba), **`difusiones-cron.js`** (envío programado), **`respuestas-rapidas.js`**.
  El núcleo del envío vive en **`lib/difusion-envio.js`** (`procesarLoteDifusion`), compartido por la bandeja y el cron.
- **Agente**: `agente.js` (cabina, SOLO Mateo), `agente-responder.js` (motor), `recordatorios-cron.js`,
  `verificar-pagos-cron.js` (**7-jun**: verificación de pagos con reintentos; usa `lib/abono-agente.js`),
  `disparadores.js` (SOLO Mateo). *(El supervisor `qa-agente-cron.js` se eliminó el 8-jun.)* Detalle en §8.
- **libs**: `lib/whatsapp.js` (resolverLinea, enviarTexto/Imagen/Documento, subir/descargar media…),
  `lib/comprobante.js` (lee comprobante con Claude), `lib/asesores.js` (`esGerencia`, `esMateo`,
  `lineasDeAsesor`, `puedeVerLinea`; **GERENCIA = ['mateo','alejo plata']**), `lib/etiquetas.js` (`ponerEtiqueta`),
  `lib/numeros-disponibles.js`.

Se REUSAN endpoints de plata del Admin (no se reescriben): `/api/admin/abono`, `/api/admin/eliminar-abono`
(modificado: borrar una parte de un pago repartido borra todas y libera la transferencia),
`/api/admin/liberar-boleta`, `/api/admin/trasladar-abono` (mueve abono entre boletas del mismo cliente),
`/api/admin/actualizar-cliente`, `/api/rifa/reservar`.

## 5. Multi-línea y permisos
- Una sola tabla para todas las líneas con `linea_id`. Un chat es único por `(linea_id, telefono)`: el mismo
  cliente en 2 líneas son 2 chats.
- **Permisos por LÍNEA**: gerencia (Mateo, Alejo Plata) ve todas; un asesor ve solo las de `lineas_asesores`.
  Una línea con 10 asesores → todos ven los mismos chats/etiquetas. Un independiente (ej. Liliana) ve solo la suya.
- Los endpoints validan en el servidor (`puedeVerLinea`).

## 6. Configuración en Meta (ya hecho)
- App **"Buzón Los Plata"** (id `2607182326463882`), Business `6736642543036723`.
- **System User token** permanente en Vercel como `WHATSAPP_TOKEN` (permisos `whatsapp_business_messaging` +
  `whatsapp_business_management`). Otras env: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`
  (=`losplata-buzon-2026`, SOLO para el handshake GET de Meta desde el 10-jun).
- **Secreto interno** (10-jun, H39): las llamadas internas (webhook→motor, pg_cron→crons,
  motor→reservar) usan **`AGENTE_INTERNO_SECRET`** (env de Vercel, 32 bytes; pieza
  `api/lib/secreto-interno.js`, comparación a tiempo constante). Rotarlo = Vercel + los 4
  pg_cron JUNTOS (`cron.alter_job`); emergencia: `ACEPTAR_VIEJO=true` y desplegar.
- Webhook: `https://www.losplata.com.co/api/whatsapp/recibir`, suscrito a `messages`.

**Líneas registradas:**
1. **Número de prueba** — phone_number_id `1147348345124937`, WABA `1522272816231368`. Solo gerencia. Agente **apagado**.
2. **Compra con Lili** (Liliana) — phone_number_id `1128258647034751`, WABA `4314997218789282`, asesor `Liliana`,
   operativa. Agente **EN VIVO** (`estado='encendido'`, modelo Sonnet).

**Conectar una línea nueva:** en Meta conectar el número a la Cloud API bajo la app, sacar Phone number ID +
WABA id, dar al token acceso a esa WABA → insertar fila en `lineas_whatsapp` + `lineas_asesores` → en la bandeja
darle "Conectar línea". (Opcional: apagar su bot en ChateaPro.)

## 7. Decisiones clave
- El comprobante del cliente es solo una **afirmación**; la plata se verifica contra **transferencias reales**.
  El sistema sugiere, el asesor confirma; **nunca se abona por una foto**.
- Coincidencia de transferencia: fecha exacta + (referencia, o mismo minuto, o teléfono en la referencia).
  Si la ÚNICA coincidencia es "misma hora" → NO basta para abonar solo (pasa a humano).
- Repartir un pago: la 1ª llamada consume la transferencia; borrar una parte borra todas.
- Reusar la lógica de plata del Admin; no reescribirla.
- Estética = la del sitio (Inter, fondo crema `#FAFAF7`, acento menta `#9BFAB0`, minimalista).

## 8. Agente de IA "Liliana"
Vendedor automático que atiende WhatsApp solo con la API de Claude, dentro de la misma bandeja. **EN VIVO**
con clientes reales en la línea "Compra con Lili", con un disparador `nuevo_contacto` activo (atiende sola a
todo cliente nuevo). **(8-jun) El botón 🤖 por chat lo puede usar el DUEÑO de la línea** (ej. Liliana en la suya):
en `agente.js` la acción `activar_conversacion` y el disparo desde la bandeja (`agente-responder.js`) ahora se
permiten a quien `puedeVerLinea` (gerencia o el asesor de la línea); el botón se muestra si la línea tiene agente
(`lineas.js` devuelve `tiene_agente`). **La cabina (manual, interruptor de la línea, herramientas), el Gasto de IA
y los disparadores siguen SOLO de gerencia/Mateo** (candado `esMateo` + ocultos en pantalla por `soyMateo`).

### 8.0 Ahorro de tokens (8-jun) — saludo predefinido + caché de 1h
- **Saludo predefinido SIN IA:** en el PRIMER contacto, si el mensaje lo resuelve el saludo (genérico, o pregunta de
  precio/abono/legalidad/cuándo juega), `agente-responder.js` manda el contacto inicial FIJO (saludo + fotos + cierre
  con la línea del próximo sorteo) **sin llamar a Claude** (`primerContactoLoResuelveSaludo` + `enviarContactoInicial`).
  La IA entra desde el 2º mensaje o si el 1º pide algo que el saludo NO cubre (número, pago, disponibles, ubicación,
  premios). El ~88% de los primeros mensajes es el texto del anuncio → quita ~la mitad de las llamadas. Ver bitácora.
- **Caché de prompt a 1 HORA** (`ttl:'1h'` + beta `extended-cache-ttl-2025-04-11`): el manual se reescribe mucho menos
  con tráfico espaciado. NO cambia lo que responde. Ver bitácora 8-jun "Ahorro de tokens".
- **Fase 4 — más pasos predefinidos SIN IA (8-jun):** además del contacto inicial, ahora también van sin Claude
  **premios**, **números disponibles** y **pedir datos**, cuando el cliente SOLO asiente a lo último que se le
  preguntó (o dice "quiero el NNNN" para separar). Ante cualquier pregunta/algo distinto → IA (conservador).
  Funciones `esAsentir(texto, paso)` / `intentoSeparar(texto)` en `agente-responder.js`; sabe el paso por el
  último mensaje que mandó Liliana. NO toca plata (apartar/abono siguen por sus herramientas). Cada atajo deja
  nota "(predefinido, SIN IA — ahorro de tokens)". La verificación de un número puntual la sigue haciendo la IA.
  Ver bitácora 8-jun "Más mensajes predefinidos".
- **Afinaciones del manual (9-jun, tras auditar ~115 respuestas reales):** premios sin redundancia (4 cifras +
  opción $300M debajo del premio mayor, sin emojis); $300M/amoblado = una cosa O la otra; cédula/correo nunca
  "obligatorios" ni mandar a crear correo; clientes del exterior se registran con el número del chat (nunca pedir
  celular colombiano); remisión más firme (si el sistema indica remitir, no vende ni saluda, solo da el número);
  dudas de saldo siempre respondidas; **extranjeros (PPT/pasaporte) SÍ participan y reclaman**; limpiados los
  residuos del Sueldazo (se conserva que ya jugó y tiene ganadora); y se quitó el "un supervisor lo revisa" del
  paso de pago (ya no existe el supervisor). El `prompt` vive en `agente_config` (base). Se decidió NO subir a
  Opus 4.8 (los errores eran de manual/lógica, no de capacidad). Ver bitácora 9-jun.

### 8.1 Cabina + motor, y cómo se prende
- **Cabina** = `agente.js` + pestaña "Agente". Mateo configura: `prompt` (manual), `modelo`, `estado`, prende/apaga
  cada herramienta, datos de pago `{{pagos}}`, resultados de sorteos. NO conversa con clientes.
- **Motor** = `agente-responder.js`. El que **de verdad responde**. Lo dispara el webhook al instante (no depende
  del navegador). También lo dispara el cron de recordatorios.
- **Dos interruptores que mandan:** (1) botón **🤖 por chat** (`agente_activo`), (2) **estado de LÍNEA** de la cabina:
  **Apagado** = no responde en toda la línea (kill switch), **Sombra** = piensa y deja notas 🌓 pero NO escribe ni
  ejecuta acciones, **Encendido** = en vivo. Apagar un chat o la línea **frena hasta la respuesta en curso** (`sigueActivo`).
- **Disparadores** (§8.8) prenden el agente por palabra clave o por cliente nuevo.

### 8.2 Las 13 herramientas (tool use; cada una se prende/apaga en la cabina)
1. **enviar_contacto_inicial** — saludo + fotos de la casa + cierre (precio, legalidad, responde su pregunta, "¿Te explico los premios?"). UNA vez.
2. **consultar_disponibles** — muestra parcial de números libres (cambia cada vez).
3. **verificar_disponibilidad** — si un número puntual está libre.
4. **consultar_cliente** — boletas y saldo (forzado al teléfono del chat, por privacidad).
5. **enviar_resolucion** — PDF de EDSA (`/resolucion.pdf`).
6. **apartar_numero** — reserva con número+nombre+apellido+ciudad (+cédula y correo para la factura). Reusa datos si ya está registrado. Registra SIEMPRE con el WhatsApp del chat, de cualquier país.
7. **enviar_boleta** — manda la boleta digital con su enlace (todas las boletas en un mensaje).
8. **registrar_abono** — solo con comprobante verificado contra el banco (§8.3).
9. **liberar_boleta** — cancela si es del cliente y **$0 abonado**; si abonó, pasa a humano.
10. **trasladar_abono** — mueve abono (todo o parte) entre boletas **del mismo cliente**.
11. **actualizar_datos_cliente** — corrige nombre/apellido/ciudad/cédula/correo (mezcla, no borra; no cambia teléfono).
12. **programar_recordatorio** — se agenda volver a escribir HOY (§8.6).
13. **pasar_a_humano** — entrega el chat a un asesor y se apaga.

### 8.3 Abono anti-fraude y candados de plata (cada acción se cuida sola)
- **registrar_abono** NO cree a la foto: toma el último comprobante del chat → `buscar-pago` lo compara contra las
  transferencias reales → solo si hay coincidencia REAL (`sugerida_id`) abona con `/api/admin/abono`. Si solo coincide
  "misma hora" o no hay match → NO abona, etiqueta ASESOR y pasa a humano.
  *(10-jun H44: le presta a buscar-pago el base64 que el motor ya descargó —parámetro `media_base64`—
  para no bajarlo de Meta dos veces; el cron conserva el fallback por media_id. 10-jun H30: al abonar,
  `verificarYAbonar` marca la foto `pago_asignado` —también desde el cron— y el motor deja de adjuntar
  a la IA las fotos ya asignadas o de >48h.)*
- **liberar_boleta**: solo dueño + $0 abonado. **trasladar_abono**: ambas boletas del mismo teléfono.
- El motor llama estos endpoints con la **contraseña de gerencia** (`ASESORES_SECRETO` → `contrasenaGerencia()`),
  usando la misma lógica probada que un humano.
- **Atribución (8-jun):** aunque autentica como gerencia, los movimientos (apartar/abono/liberar/trasladar) se
  GRABAN a nombre del **asesor de la línea** (`asesorDeLinea(linea_id)` → "Liliana"), vía el override
  `asesorRegistro` (lo honra solo gerencia) en abono/liberar/trasladar y el campo `asesor` en `reservar.js`.
  **OJO: "Liliana" es INDEPENDIENTE.** Por eso la validación de grupo de `abono.js`/`liberar-boleta.js` sigue al
  ACTOR REAL (`asesorReg`): con el override valida como Liliana (independiente) y no bloquea sus abonos. Efecto
  contable: las ventas del agente ahora cuentan como **independiente** (antes "Pagina Web"/equipo). Ver bitácora 8-jun.
- **🔒 CANDADO ANTI "PAGO FALSO" (2026-06-09)**: antes de mandar el texto final al cliente, el motor revisa si
  AFIRMA un pago hecho (`afirmaPagoHecho()`: "pagada al 100%", "quedó pagada", "registré tu abono", "pago
  confirmado", "quedó abonado"). Si lo afirma y NO hubo un abono REAL en ese turno (`huboAbono`) **y** la
  boleta sigue debiendo según `boletas` (verdad del sistema, no se puede engañar) → NO lo manda:
  `manejarPagoNoVerificado()` envía el mensaje seguro ("ya recibí tu comprobante, estoy verificando tu pago"),
  marca ASESOR y agenda verificación automática. Permite la felicitación si el abono SÍ se hizo o si la boleta
  ya estaba paga. Conservador (puede mandar "verificando" de más con 2 boletas una paga y una no) — lado
  seguro. Nació de un caso real: Liliana dijo "pagada al 100%" sin registrar el abono y dejó $100.000 sin
  asignar (ver bitácora 9-jun).
- **🔒 CANDADOS DE CONCURRENCIA (2026-06-10, H6-H9 de la auditoría):** cerradas las carreras de "dos procesos a la
  vez": la transferencia se consume ATÓMICA (update condicional `estado='LIBRE'` antes del insert del abono, con
  reversión si falla) en `abono.js`/`venta.js`; `reservar.js` ocupa el número solo si SIGUE libre (revierte el pedido
  si otro ganó); la referencia del comprobante exige mínimo 5 caracteres para abonar sola; y `verificaciones_pago`
  tiene el estado nuevo **'en_proceso'** como turno entre el cron y `registrar_abono` (el que llega segundo no procesa;
  huérfanas >10 min las rescata el cron). NO quitar las condiciones de esos updates: SON el candado. Además (H37) el
  **traslado de abonos es ATÓMICO**: vive en la función transaccional `trasladar_abono_atomico` de la base (o se hace
  todo o nada; SQL en `sql/trasladar-abono-atomico.sql`) — cambios de lógica del traslado van AHÍ, no en el endpoint.
  Ver bitácora 10-jun.
- **Supervisor Opus de movimientos ELIMINADO (2026-06-08)**: ya estaba inactivo (`ACCIONES_SENSIBLES` vacío); no veía
  las fotos ni los chequeos reales y solo frenaba acciones legítimas en falso. La seguridad del dinero vive en los
  candados de cada acción (abono verificado contra el banco, liberar valida dueño + saldo $0). Se borró del código.

### 8.3-bis Robustez del motor (10-jun-2026 — familia "clientes colgados en silencio")
- **Reintento de IA:** errores transitorios de Anthropic (429/5xx/no-JSON) se reintentan 1 vez; si
  persiste → nota + etiqueta ASESOR. El catch global suelta el candado y deja el error en la actividad.
- **Candado fresco:** se refresca en cada vuelta del bucle y al transcribir/descargar (no más doble
  respuesta por vencerse a los 60s). Si el cliente escribe mientras Liliana redacta, la corrida se
  re-dispara sola al cerrar (flag `redisparo`).
- **Barredor (cada minuto, en `recordatorios-cron.js`):** re-dispara chats con agente activo y 2-60 min
  sin respuesta. El claim anti-duplicado permite re-reclamar turnos MUERTOS a los 5 min
  (`sql/agente-claim-reclaim.sql`, columna `agente_claim_at`).
- **Envíos con verdad:** si WhatsApp rechaza un envío, queda 'fallido' (el chat sigue "sin respuesta",
  nota + ASESOR) y la IA NO lo recuerda como dicho; `enviar_boleta`/contacto inicial reportan el fallo.
- **Webhook:** devuelve 500 SOLO si llegaron mensajes y ninguno se guardó (Meta reintenta, el dedup
  absorbe). Ver bitácora 10-jun.

### 8.4 Cómo conversa (afinado con pruebas reales)
- **VE las fotos** (le pasa la imagen real a Claude, no "[imagen]"). **Transcribe audios** con Whisper (`OPENAI_API_KEY`).
- **Estado del cliente SIEMPRE**: antes de responder consulta por teléfono datos+boletas (`resumenCliente`) y se los
  inyecta. Saluda por su nombre, no le vende de cero, no re-pide datos. Funciona entre líneas (boletas por teléfono).
- **Memoria de acciones**: las notas 🤖 de lo ya hecho se le inyectan como "ACCIONES QUE YA EJECUTASTE" para que no repita.
- **No narra el proceso** ("voy a verificar…"): el motor suprime el texto que acompaña a una herramienta y solo manda el resultado.
- **Memoria por RIFA**: lee el historial desde `fecha_inicio` de la rifa `activa` (tope 300). Al cambiar de rifa, el corte se mueve solo.
- **No reenvía la presentación** si el chat ya tiene mensajes (`yaHuboSalientes`).
- **Fechas por código**: inyecta "FECHAS EXACTAS" con el día de la semana ya calculado (`etiquetaFecha` desde `rifas.sorteos`).
  Los LLM se equivocan con los días; por eso NO se sube a Opus.
- El nombre/`prompt`/herramientas viven en la **base de datos** (cabina), sin tocar código. El `prompt` es igual para
  todas las líneas; solo cambian las **variables** `{{nombre}}` y `{{pagos}}` (`aplicarVariables`).

### 8.5 Sin mensajes dobles (candados anti-duplicado)
La gente escribe en ráfaga → se disparan 2-4 corridas del motor. Tres capas evitan el duplicado:
- **Debounce 30s**: espera 30s de silencio desde el ÚLTIMO mensaje del cliente (cada mensaje reinicia; tope invisible 2 min
  desde el 10-jun (H34) — con 4 min quedaba sin tiempo para el resto del turno; `maxDuration`=300s). Junta la ráfaga en UNA
  respuesta. Refresca el candado cada ≤3s para que no se venza. **Excepción (H42, 10-jun):** si es el PRIMER contacto y el
  saludo predefinido lo resuelve (sin IA), la espera es CORTA (~10s, `DEBOUNCE_CORTO_MS`), con re-validación: si el cliente
  agregó algo que el saludo no cubre, vuelve a la espera normal de 30s.
- **Candado de proceso** (`agente_procesando_at`): UPDATE condicional; si otra corrida lo tiene, esta se sale. Se recupera a los 60s.
- **Candado por tanda** (`agente_respondido_ms`, bigint): UPDATE atómico "ya tomé hasta el último mensaje" comparando por
  **milisegundos** (no texto de fecha, que rompía la consulta). Solo una corrida gana; las demás se salen. Falla-abierto.

### 8.6 Recordatorios de seguimiento (<24h) — HECHO
`programar_recordatorio(minutos, motivo)` agenda volver a escribir HOY (dentro de las 24h del último mensaje; si pide en días,
no agenda). Un recordatorio activo por chat. El **relojito** `recordatorios-cron.js` lo llama `pg_cron` cada minuto, reclama los
vencidos de forma atómica (sin doble disparo) y despierta el motor. `recibir.js` los **cancela** cuando el cliente vuelve a escribir.

### 8.7 Supervisor + ciclo de mejora — **ELIMINADO (8-jun-2026)**
- Existió un supervisor QA (`qa-agente-cron.js`, `pg_cron` cada 30 min) que revisaba los chats con etiqueta **AGENTE** con
  **Claude Opus**, mandaba a Mateo un resumen por WhatsApp y guardaba errores+regla en `agente_sugerencias` (tarjeta "Mejorar
  el agente" en la cabina, con "Aplicar al manual" / "Descartar"). Estuvo PAUSADO desde el 5-jun y se **eliminó del todo** el
  8-jun (lo pidió Mateo): se borró el archivo, su entrada en `vercel.json`, el cron de la base (jobid 2,
  `cron.unschedule('supervisor-agente-cada-5min')`), las acciones del backend (`agente.js`) y la tarjeta + funciones en
  `bandeja-whatsapp.html`. Las tablas `agente_qa_estado` y `agente_sugerencias` se **borraron** el mismo día. Ver bitácora.

### 8.8 Disparadores — HECHO
Menú **Disparadores** (SOLO Mateo). Por **palabra clave** (el mensaje la contiene) o **cliente nuevo** (primer mensaje, uno por línea).
`recibir.js` prende el agente (`agente_activo=true`, `estado='bot'`). Candados: no se auto-prende si ya estaba activo,
si un humano tomó el chat, o si la línea está Apagada (Sombra sí se respeta). *(9-jun: ya NO pone etiqueta AGENTE.)*

### 8.9 Resultados de los sorteos — HECHO
Las casillas salen del **calendario de la rifa** (`rifas.sorteos`, jsonb array de `{titulo, fecha}`); el ganador lo escribe Mateo en
la cabina (`agente_config.resultados`, por fecha: `{fecha, numero, nombre, ciudad, acumulado, acumulado_monto}`). El motor inyecta
"RESULTADOS DE LOS SORTEOS" SOLO para responder "¿qué número ganó?" (ver el arreglo anti-conteo en §8.11).

### 8.10 Etiquetado de Liliana
- Al **pasar a humano** o no encontrar el pago tras los reintentos → etiqueta **ASESOR**. Las burbujas del agente
  muestran "🤖 Liliana" (o "📋 Mensaje predefinido" si salió de un atajo sin IA).
- *(9-jun) ELIMINADA la etiqueta **AGENTE*** y el etiquetado automático al prender el agente, **y** el interruptor
  "ocultarle a Liliana los chats que atiende el agente" (ahora Mateo atiende TODO con la IA, ya no se ocultan).
  Se borraron de la base la etiqueta AGENTE + sus 523 enlaces y la config `ocultar_agente_liliana`. Ver bitácora 9-jun.

### 8.11 Arreglos recientes (6-jun-2026)
- **Caché de esquema de Supabase trabada (LECCIÓN CRÍTICA, ya pasó 3 veces).** PostgREST guarda en memoria la lista de columnas
  y NO "ve" las columnas nuevas agregadas con `execute_sql` → el código falla en silencio con "column … does not exist". Pasó con
  `agente_respondido_ms`: el candado anti-duplicado quedó muerto y Liliana mandaba saludos dobles/triples (confirmado en chats
  reales: 107 errores en `agente_actividad`). **NO se arregla con `NOTIFY`, `COMMENT` ni `ALTER` vía SQL.** Se arregla
  **recargando el esquema con `apply_migration`** (Management API de Supabase) — corriendo cualquier DDL idempotente (ej.
  `add column if not exists …`). Verificado: tras la migración, la API REST ya devuelve las columnas (HTTP 200) y los errores
  pararon. **Regla:** después de agregar columnas con `execute_sql`, SIEMPRE recarga con `apply_migration`.
- **Liliana contaba los sábados acumulados** ("lleva 3 sábados sin ganador", prohibido) y decía "el primer sorteo". La regla ya
  existía en el manual pero la rompía porque el bloque de RESULTADOS le mostraba los sábados acumulados uno por uno → los contaba.
  **Arreglo doble:** (1) motor (`agente-responder.js`) — el bloque de resultados ya NO enumera los sábados acumulados; muestra los
  sorteos CON ganador y resume el acumulado en UNA línea con solo el monto del próximo; (2) prompt — bloque "REGLAS DURAS DEL PREMIO
  ACUMULADO" al inicio del manual (di solo el monto; nunca cuántos sábados/semanas; nunca "el primer sorteo").
- **Tuteo consistente:** Liliana mezclaba *tú*, *usted* y *vos* ("podés", "ganás") en la misma conversación. Regla nueva en
  "# CÓMO ESCRIBES": tratar SIEMPRE de *tú* en toda la conversación, sin mezclar ni cambiar entre mensajes.

### 8.12 Costo de IA por chat y panel del día — HECHO (6-jun-2026)
Mide cuánto cuesta la IA que responde (los tokens que devuelve Claude en cada respuesta).
- **Tabla `agente_uso`** (§3): una fila por respuesta de la IA (`linea_id`, `telefono`, `conversacion_id`, `modelo`,
  tokens de entrada/salida/caché, `costo_usd`, `origen`). RLS activado → solo el rol de servicio la lee/escribe.
- **Motor** (`agente-responder.js`): tras cada llamada a Claude, `registrarUso()` convierte el `usage` a dólares con la
  tabla `PRECIOS` (Sonnet $3/$15 por millón; caché 1.25×/0.1×) e inserta la fila. Best-effort (nunca frena al agente).
- **Suma en la base** (escala): funciones `agente_costo_resumen(linea)` (hoy/mes/total, hora de Colombia) y
  `agente_costo_chat(conv)` (acumulado de un chat). No se traen miles de filas al navegador.
- **Endpoint** `agente-costo.js` (SOLO Mateo): acciones `resumen` y `chat`.
- **Interfaz**: tarjeta **"Gasto de IA"** en la cabina (hoy/mes/total) y, en la **ficha de cada chat**, el costo acumulado
  de ese cliente (solo lo ve Mateo). Se muestra en USD (lo que de verdad factura Anthropic) + pesos aproximados de
  referencia (tasa fija `USD_COP` editable en `bandeja-whatsapp.html`).
- **Pendiente menor**: el costo de Whisper (audios) aún no se registra (es mínimo); la tabla ya tiene la columna `origen`.
- **Embudo de ventas (H35, 10-jun-2026)**: mismo patrón — función `agente_embudo_resumen(linea, dias)`
  (`sql/embudo-liliana.sql`, agrega sobre las notas de `agente_actividad` + boletas/abonos del asesor de la
  línea), acción `embudo` en `agente-costo.js` y tarjeta **"Embudo de ventas"** (7/30 días) en la cabina.
  OJO: cuenta los hitos por el TEXTO de las notas del motor — si se cambian esos textos, ajustar los `like`.

### 8.12b Visor "💳 Verificación del pago" en la ficha — HECHO (10-jun-2026, pedido de Mateo)
Responde "¿el sistema sigue verificando este pago solo, o ya se rindió y le toca al asesor?".
- **Endpoint** `api/whatsapp/verificaciones.js` (POST, cualquier asesor con acceso a la línea):
  lee `verificaciones_pago` por teléfono+línea (las 3 más recientes).
- **Interfaz**: tarjeta en la FICHA del chat (todos los perfiles), solo si hay una verificación
  de las últimas 48h: 🕐 amarilla "sigue verificando — intento X de 4, próximo a las HH:MM" /
  ✅ verde "abonado" / 🆘 roja "se rindió, le toca al asesor (chat etiquetado)" / gris "cancelada".
- La tarjeta de costo de IA (§8.12) además ya no exige que el chat esté en la lista cargada:
  el endpoint resuelve la conversación por teléfono (chats abiertos desde el buscador).

- **N4 (10-jun)**: si hay un abono POSTERIOR a una verificación 'rendido', la tarjeta sale
  "✅ Caso CERRADO" en vez del 🆘 rojo (la rendición queda enlazada al abono pendiente).

### 8.12c Tandas 7-12 del motor + H65 (10/11-jun-2026) — detalle en BITACORA-DE-DECISIONES
Resumen: turnos que nunca cierran mudos (H58/H62), anti-inyección de datos (H78), audios sin
transcribir con rastro (H79), recordatorios durables (H54/H73/H77), reintentos de Meta sin
efectos (H71), un solo prefijo de caché (H63/H66), liberar atómico (H68), credencial propia del
agente (H81, ACTIVA), abono ya no cae a boleta equivocada (H76), teléfonos con cola mutua (H70),
atajo del número tras la lista (H65), y los bugs N1 (saldo viejo), N3 (prefill) y N4 (caso
cerrado del visor). El simulador 'probar' se ELIMINÓ (H75).

### 8.13 Novedades del 7-jun-2026 (Liliana y boleta). Detalle en la bitácora.
- **Verificación de pagos con reintentos** (TOCA DINERO, aprobado): si el pago no aparece, NO pasa a
  asesor de una; dice "estoy verificando" y `verificar-pagos-cron.js` reintenta cada ~15 min hasta ~1h.
  Si aparece (match sólido), abona solo y avisa al cliente. Nunca abona por "misma hora" sola; una
  transferencia se consume una vez (no duplica). Cola `verificaciones_pago`, lógica en `lib/abono-agente.js`.
  **(9-jun) Al AGOTAR los intentos** sin confirmar, Liliana se APAGA y pasa a humano EN SILENCIO (etiqueta
  ASESOR + `agente_activo=false, estado='humano'`); ya NO manda un segundo aviso al cliente (sonaba repetido).
- **Boleta**: dentro de 24h se manda como TEXTO normal (gratis, sin saludo, encabezado según estado de
  pago: separada / participando / pagada); plantilla solo fuera de 24h (`boleta_cliente_v2`, 1ª línea
  variable). **Red de seguridad**: si se aparta pero no se envía la boleta, el motor la envía solo.
- **Manual**: cédula y correo OPCIONALES al apartar (solo nombre/apellido/ciudad obligatorios); la
  boleta va por WhatsApp (no por correo/web); NO repetir lo ya dicho + mensajes un poco más cortos en
  promedio (pero puede alargarse si hace falta explicar). **(8-jun) Afinado:** ahora SIEMPRE pide los 5
  datos juntos al inicio (nombre, apellido, ciudad, cédula y correo) para la factura, SIN decirle al
  cliente que la cédula/correo son "opcionales"; solo los omite si el cliente no los tiene o no los
  quiere dar → aparta igual sin insistir. Lo obligatorio para apartar sigue siendo nombre/apellido/ciudad.
- **Contador "sin leer" (`no_leidos`)**: se apaga cuando el agente responde, no solo cuando un humano
  abre el chat. Se resetea en `guardarEnChat` (mensaje saliente del agente). Antes quedaban numeritos
  verdes en chats que Liliana ya había contestado.
- **Remisión al punto de venta** (no toca dinero): si el cliente que escribe a la línea de Lili tiene
  boleta vendida por OTRO (no Liliana), ella NO lo atiende: le da el número del punto donde compró.
  Dueño de la línea = `lineas_asesores`; número por asesor = `asesores_config.numero_remision`
  (editable por SQL). `analizarRemision`/`bloqueRemision` en `agente-responder.js`. Varios vendedores
  → el más reciente; sin número cargado → pasa a un asesor. Ver bitácora 7-jun.

### 8.14 Novedades del 8-jun-2026 (ver bitácora)
- **Ventas WEB = equipo:** "Pagina Web" (2.626 boletas) cuenta como el equipo → remite al número del
  equipo (`asesores_config.numero_remision`). Cualquier `asesor` que no esté en `asesores_config` con
  número cae a "pasar a un asesor".
- **No se presenta a clientes con boleta** (determinístico): si el cliente ya tiene boleta(s) o hay que
  remitirlo, el código le QUITA `enviar_contacto_inicial` (antes dependía de que el modelo obedeciera).
- **Acumulado se reinicia tras un ganador:** el motor agrupa los sorteos por tipo (título) y solo arrastra
  el monto acumulado al próximo si el último del mismo tipo quedó acumulado; si tuvo ganador, va por su base.
- **Nombre de la rifa:** corregido de "Rica casa santa teresita" a **"Casa Santa Teresita"** (en
  `rifas.nombre` y en el manual `agente_config.prompt`).
- **🔒 Seguridad (RLS):** se prendió RLS en todas las tablas y el backend pasó a usar la LLAVE MAESTRA;
  la llave anónima quedó bloqueada. Ver `docs/seguridad-rls.md`. NO borrar `SUPABASE_SERVICE_ROLE_KEY`.
- **💰 Caché de prompt activado** en `agente-responder.js`: el `system` es ahora un array
  `[{manual, cache_control:ephemeral}, {contexto volátil}]`. El manual + herramientas se cachean (lectura
  0.1×) → baja ~la mitad el gasto de ENTRADA. El manual debe ir SIEMPRE primero (lo volátil en el 2º
  bloque) o se rompe el caché. FALTA confirmar al aire (`cache_read_tokens` > 0). Ver bitácora.
- **🔑 Liliana con llave propia de Claude:** usa `ANTHROPIC_API_KEY_LILIANA` (Vercel) y cae a
  `ANTHROPIC_API_KEY` si falta. Sirve para medir su gasto aparte. NO borrar la general. Se reinició el
  contador (`truncate agente_uso`) para empezar de cero. Ver bitácora.
- **🗑️ Supervisores Opus ELIMINADOS:** (1) el de movimientos de dinero (`verificarConOpus`, ya inactivo) y
  (2) el supervisor QA de reportes (`qa-agente-cron.js`, ya pausado) con su ciclo de sugerencias (cron,
  `vercel.json`, backend y cabina). Tablas `agente_sugerencias`/`agente_qa_estado` borradas. La seguridad
  del dinero NO bajó (vive en los candados de cada acción). Ver bitácora.

### 8.15-bis Novedades del 10-jun-2026 — JORNADA GRANDE (detalle en la bitácora; ~49 hallazgos de la auditoría cerrados)
- **Dinero (H6-H9, H37 + extra):** candados de concurrencia cerrados (consumo atómico de
  transferencias, reserva condicional de boletas, referencia mínima 5 chars, claim 'en_proceso' de
  verificaciones, traslado de abonos transaccional `trasladar_abono_atomico`, anti doble venta en venta.js).
- **Silencios (H4-H13, H21):** reintento de IA, catch global sano, refresco del candado, auto-redisparo,
  envíos fallidos visibles ('fallido' + 🆘), barredor cada minuto + re-claim de turnos muertos.
- **Seguridad (H19, H20, H40, H41):** firma del webhook de Meta ACTIVA (`META_APP_SECRET`), cédula/correo
  enmascarados + rate-limit en endpoints públicos, tope de disparos del motor, reservar protegido.
- **Operables por Mateo:** H15 versionado del manual (`agente_config_historial`), H17 textos de la rifa en
  `agente_config.variables` + `docs/CHECKLIST-RIFA-NUEVA.md`, H16 ALERTAS al WhatsApp de Mateo
  (`alertas-cron.js`, cada 15 min + resumen 8 p.m.; cazó un caso real de ~12h el primer día), H14 SUITE
  DORADA (`probar-suite.js` + `agente_casos_dorados`, 10 casos 10/10 — correrla ANTES de cambiar el manual).
- **Afinaciones (H22-H31, H45, H46…):** premios con acumulado vigente, reacciones 👍 ya no disparan al
  agente, consultar_cliente solo del chat, gasto de caché bien medido, candado anti pago falso v2,
  números disponibles 3× más rápidos, y la boleta tras apartar la envía el SISTEMA (una llamada menos
  a Claude por venta — la boleta llega después del texto final de Liliana).
- **Manual editado (con OK de Mateo):** H3 (acumulado condicional al sistema, sin "$20.000.000" fijo) y
  paso 5 (la boleta la envía el sistema). Todo versionado y con la suite en verde.

### 8.15 Novedades del 9-jun-2026 (ver bitácora para el detalle)
- **💰 Bug del abono automático ARREGLADO (+$110.000 recuperados):** desde el 8-jun, `buscar-pago.js`
  evaluaba `puede_modificar` con el grupo de gerencia y filtraba las boletas de Liliana → pagos que SÍ
  coincidían con el banco se botaban como 'sin_saldo' EN SILENCIO. Fix: `asesorRegistro` (solo gerencia)
  en `buscar-pago.js` + `abono-agente.js` lo pasa. Se recuperaron 3 pagos botados (boletas 5653, 3554, 9744).
- **Candado anti "pago falso" v2:** el del mismo día disparaba en falso (bloqueaba "es 100% legal" y
  "cuando esté pagada al 100%"). Ahora: detector preciso + solo se arma con comprobante o "ya pagué"
  (`afirmaPagoHecho` + `esContextoPago` en `agente-responder.js`).
- **Modelo de lectura de comprobantes actualizado** a `claude-sonnet-4-6` (el viejo se retiraba el
  15-jun y habría matado el abono automático y la carga de pagos).
- **AUDITORÍA COMPLETA del agente (90 hallazgos verificados):** plan en `docs/PENDIENTES-LILIANA.md`,
  detalle en `docs/auditoria-liliana-2026-06-09.md`. Ahí está el mapa de TODO lo que falta mejorar
  (dinero, silencios, coherencia, seguridad, velocidad, costos, estrategia).

## 9. Pendientes
> **(9-jun-2026)** Se hizo una AUDITORÍA COMPLETA del agente (90 hallazgos verificados). El plan
> de mejoras para ir tachando está en **`docs/PENDIENTES-LILIANA.md`** (detalle por ítem en
> `docs/auditoria-liliana-2026-06-09.md`). Lo de abajo se mantiene como pendientes generales.

**Agente:**
- ⬜ **Pago en línea (Wompi)** como herramienta (enviar link de `/abonar`). Subiría conversión. Toca plata; Mateo lo dejó para después.
- ⬜ **Conectar las líneas grandes** (Línea 1 y Línea 2) — el "corte" final desde ChateaPro (cargarles prompt, herramientas, `{{pagos}}`,
  disparadores y calendario de sorteos).
- ✅ **Costo de IA por chat y del día** → HECHO (§8.12). Pendiente menor: registrar también el costo de Whisper (audios).
- ⬜ **Pantalla para el calendario de sorteos** (hoy se carga por SQL en `rifas.sorteos`).
- ⬜ Limpiar el simulador `probar` de la cabina (ya no se usa).

**Para cuando ESCALE (no urgente):**
- Identificación por **últimos 10 dígitos** puede mezclar 2 clientes; a futuro comparar por teléfono COMPLETO.
- Carrera de la reserva (`reservar.js`: SELECT+UPDATE sin candado atómico) → UPDATE condicional.
- Proteger el link público de boleta (`/boleta?telefono=`).
- El cron de recordatorios marca 'enviado' ANTES de confirmar el envío.
- Whisper/descarga de media fallan en silencio → respuestas "a ciegas". Vigilar.
- Costo: el debounce de 30s deja la función abierta más tiempo (más GB-seg). Aceptable hoy.

**Bandeja:**
- Marcar qué asesor atiende un chat (para líneas con varios asesores).
- Pulir difusiones (más filtros, programar envíos, pegar lista propia, "preparar" en segundo plano para audiencias enormes).
- Enviar video y audios salientes desde la barra (hoy solo foto/PDF).

**Dejar SOLO para humanos** (no dar al agente): devoluciones, eliminar abonos, y el back-office (caja, finanzas, sorteo, permisos, cobros).

## 10. Cómo trabajar
- Publicar: `git push origin main` → Vercel despliega ~1 min. **Verificar en vivo** (curl o Ctrl+Shift+R). Si "no se ve",
  revisar PRIMERO si hay **rollback activo** en Vercel (Overview → "Promote to Production"/"Undo Rollback").
- El `prompt` y la config del agente están en la **base de datos** → editarlos tiene efecto **inmediato** (sin desplegar).
- Tocar lógica de plata o esquema → explicar y confirmar con Mateo primero. Tras agregar columnas, recargar el esquema (§8.11).
- Build de JSX (esbuild) corre solo en el deploy de Vercel.
