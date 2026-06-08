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
- **`plantillas_whatsapp`** y **`difusiones`** + **`difusion_destinatarios`** (cola de envío, escala).
- Columna **`correo`** en `clientes` y `boletas`.

Tablas del agente:
- **`agente_config`** (por línea): `estado` (apagado|sombra|encendido), `nombre_agente`, `prompt` (el manual),
  `modelo`, `variables` (jsonb: `{{nombre}}`, `{{pagos}}`…), `resultados` (jsonb: ganadores por fecha),
  `actualizado_por/at`.
- **`agente_herramientas`** `(linea_id, clave, …, activa)`: qué acciones tiene prendidas cada línea.
- **`agente_actividad`** `(linea_id, telefono, tipo, resumen, created_at)`: bitácora de lo que hace + errores.
- **`recordatorios`**: seguimiento automático <24h (§8.6). Índices parciales por `estado='pendiente'`.
- **`agente_qa_estado`** y **`agente_sugerencias`**: supervisor + ciclo de mejora (§8.7).
- **`disparadores`** `(linea_id, palabra, tipo ['palabra'|'nuevo_contacto'], activo)` (§8.8).

Índices pensados para escala: por `linea_id`, `ultimo_at`, parcial de "sin respuesta", etc.

## 4. Endpoints (`api/whatsapp/`)
- **`recibir.js`** — webhook (GET verifica, POST mensajes/acuses). Detecta la línea por `phone_number_id`
  (todas usan la misma URL). Además: **dispara el motor** del agente si está activo (`dispararAgenteSiActivo`,
  corte a 1.5s), **cancela recordatorios** pendientes cuando el cliente vuelve a escribir, **prende el agente
  por disparador** (`activarPorDisparador`) y captura la cita (`m.context.id → responde_a`).
- **`enviar.js`** / **`enviar-archivo.js`** (foto/PDF del computador) / **`media.js`** (descarga con token de la línea).
- **`conversaciones.js`** — lista de chats. Acepta `q` (búsqueda) y **`filtros`** (filtro avanzado del
  botón "Filtros": `{ modo:'y'|'o', condiciones:[etiqueta | sin_respuesta | recordatorio | creado] }`).
  TODO el filtrado lo hace la base con la función **`bandeja_filtrar(...)`** (escala). Le **oculta a
  Liliana** los chats con `agente_activo=true` si el switch `ocultar_agente_liliana` está activo.
- **`recordatorios.js`** — solo lectura: recordatorios PENDIENTES de un chat con su motivo (lo usa el
  botón de relojito de la barra del chat). No confundir con `recordatorios-cron.js` (el reloj que los envía).
- **`mensajes.js`** — mensajes de un chat (expone `por_agente` desde `raw.agente`).
- **`cliente.js`** — ficha (boletas/deuda/pagos por boleta; empareja por últimos 10 dígitos; calcula `puede_modificar`).
- **`buscar-pago.js`** — verifica el comprobante vs transferencias reales (lo usa "verificar pago" y el abono del agente).
- **`contactos*.js`**, **`lineas.js`**, **`conectar-linea.js`** (suscribe la WABA), **`etiquetas.js`**,
  **`plantillas.js`**, **`difusiones.js`**, **`respuestas-rapidas.js`**.
- **Agente**: `agente.js` (cabina, SOLO Mateo), `agente-responder.js` (motor), `recordatorios-cron.js`,
  `verificar-pagos-cron.js` (**7-jun**: verificación de pagos con reintentos; usa `lib/abono-agente.js`),
  `disparadores.js` (SOLO Mateo), `qa-agente-cron.js` (supervisor). Detalle en §8.
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
  (=`losplata-buzon-2026`, es también el **secreto interno** del webhook/cron).
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
todo cliente nuevo). La **cabina y el botón 🤖 son SOLO de Mateo** (candado `esMateo` en servidor y oculto en pantalla).

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
- **liberar_boleta**: solo dueño + $0 abonado. **trasladar_abono**: ambas boletas del mismo teléfono.
- El motor llama estos endpoints con la **contraseña de gerencia** (`ASESORES_SECRETO` → `contrasenaGerencia()`),
  usando la misma lógica probada que un humano.
- **Supervisor Opus DESACTIVADO** (`ACCIONES_SENSIBLES` vacío): no veía las fotos ni los chequeos reales y frenaba
  acciones legítimas en falso. El código sigue por si se reactiva, pero hoy no se usa.

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
- **Debounce 30s**: espera 30s de silencio desde el ÚLTIMO mensaje del cliente (cada mensaje reinicia; tope invisible 4 min;
  `maxDuration`=300s). Junta la ráfaga en UNA respuesta. Refresca el candado cada ≤3s para que no se venza.
- **Candado de proceso** (`agente_procesando_at`): UPDATE condicional; si otra corrida lo tiene, esta se sale. Se recupera a los 60s.
- **Candado por tanda** (`agente_respondido_ms`, bigint): UPDATE atómico "ya tomé hasta el último mensaje" comparando por
  **milisegundos** (no texto de fecha, que rompía la consulta). Solo una corrida gana; las demás se salen. Falla-abierto.

### 8.6 Recordatorios de seguimiento (<24h) — HECHO
`programar_recordatorio(minutos, motivo)` agenda volver a escribir HOY (dentro de las 24h del último mensaje; si pide en días,
no agenda). Un recordatorio activo por chat. El **relojito** `recordatorios-cron.js` lo llama `pg_cron` cada minuto, reclama los
vencidos de forma atómica (sin doble disparo) y despierta el motor. `recibir.js` los **cancela** cuando el cliente vuelve a escribir.

### 8.7 Supervisor + ciclo de mejora — HECHO, **PAUSADO (5-jun-2026)**
- **Qué hace** (`qa-agente-cron.js`, era `pg_cron` cada 30 min): revisa los chats con etiqueta **AGENTE**, le pasa lo NUEVO a
  **Claude Opus** (más alto que Sonnet) con el manual, detecta errores y manda a Mateo un resumen por WhatsApp (a 573123354789,
  desde la línea de Lili; solo llega si la ventana de 24h está abierta). Marca de agua `agente_qa_estado` para no repetir.
- **Ciclo de mejora**: guarda cada error+regla en `agente_sugerencias`; en la cabina, tarjeta "Mejorar el agente" con
  "Aplicar al manual" (agrega la regla al `prompt`) / "Descartar". Nada cambia sin el visto bueno de Mateo.
- **PAUSADO**: el cron (jobid 2 en `cron.job`) está en `active=false`. Reactivar: `select cron.alter_job(job_id := 2, active := true);`.

### 8.8 Disparadores — HECHO
Menú **Disparadores** (SOLO Mateo). Por **palabra clave** (el mensaje la contiene) o **cliente nuevo** (primer mensaje, uno por línea).
`recibir.js` prende el agente (`agente_activo=true`, `estado='bot'`, etiqueta AGENTE). Candados: no se auto-prende si ya estaba activo,
si un humano tomó el chat, o si la línea está Apagada (Sombra sí se respeta).

### 8.9 Resultados de los sorteos — HECHO
Las casillas salen del **calendario de la rifa** (`rifas.sorteos`, jsonb array de `{titulo, fecha}`); el ganador lo escribe Mateo en
la cabina (`agente_config.resultados`, por fecha: `{fecha, numero, nombre, ciudad, acumulado, acumulado_monto}`). El motor inyecta
"RESULTADOS DE LOS SORTEOS" SOLO para responder "¿qué número ganó?" (ver el arreglo anti-conteo en §8.11).

### 8.10 Etiquetado y privacidad de Liliana
- Al **prender** el agente → etiqueta **AGENTE**; al **pasar a humano** o no encontrar el pago → etiqueta **ASESOR**.
- **Liliana no ve** los chats que atiende el agente (switch `ocultar_agente_liliana` en tabla `configuracion`, default activo);
  cuando el agente le ENTREGA el chat (`pasar_a_humano`), sí lo ve. Las burbujas del agente muestran "🤖 Liliana".

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

### 8.13 Novedades del 7-jun-2026 (Liliana y boleta). Detalle en la bitácora.
- **Verificación de pagos con reintentos** (TOCA DINERO, aprobado): si el pago no aparece, NO pasa a
  asesor de una; dice "estoy verificando" y `verificar-pagos-cron.js` reintenta cada ~15 min hasta ~1h.
  Si aparece (match sólido), abona solo; si no, pasa a asesor. Nunca abona por "misma hora" sola; una
  transferencia se consume una vez (no duplica). Cola `verificaciones_pago`, lógica en `lib/abono-agente.js`.
- **Boleta**: dentro de 24h se manda como TEXTO normal (gratis, sin saludo, encabezado según estado de
  pago: separada / participando / pagada); plantilla solo fuera de 24h (`boleta_cliente_v2`, 1ª línea
  variable). **Red de seguridad**: si se aparta pero no se envía la boleta, el motor la envía solo.
- **Manual**: cédula y correo OPCIONALES al apartar (solo nombre/apellido/ciudad obligatorios); la
  boleta va por WhatsApp (no por correo/web); NO repetir lo ya dicho + mensajes un poco más cortos en
  promedio (pero puede alargarse si hace falta explicar).
- **Remisión al punto de venta** (no toca dinero): si el cliente que escribe a la línea de Lili tiene
  boleta vendida por OTRO (no Liliana), ella NO lo atiende: le da el número del punto donde compró.
  Dueño de la línea = `lineas_asesores`; número por asesor = `asesores_config.numero_remision`
  (editable por SQL). `analizarRemision`/`bloqueRemision` en `agente-responder.js`. Varios vendedores
  → el más reciente; sin número cargado → pasa a un asesor. Ver bitácora 7-jun.

## 9. Pendientes
**Agente:**
- ⬜ **Pago en línea (Wompi)** como herramienta (enviar link de `/abonar`). Subiría conversión. Toca plata; Mateo lo dejó para después.
- ⬜ **Conectar las líneas grandes** (Línea 1 y Línea 2) — el "corte" final desde ChateaPro (cargarles prompt, herramientas, `{{pagos}}`,
  disparadores y calendario de sorteos).
- ⬜ **Reporte del supervisor por PLANTILLA** (hoy depende de que la ventana de 24h esté abierta). **Reactivar el supervisor** cuando Mateo quiera (§8.7).
- ✅ **Costo de IA por chat y del día** → HECHO (§8.12). Pendiente menor: registrar también el costo de Whisper (audios).
- ⬜ **Pantalla para el calendario de sorteos** (hoy se carga por SQL en `rifas.sorteos`).
- ⬜ Limpiar el simulador `probar` de la cabina (ya no se usa). Revisar/descartar sugerencias viejas del supervisor en la cabina.

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
