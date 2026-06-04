# Buzón propio de WhatsApp (bandeja) — Contexto y handoff

> **Para Claude en un chat nuevo:** lee este documento ANTES de seguir. Aquí está
> todo lo construido, las decisiones clave, la arquitectura y lo que falta del
> sistema de **bandeja de WhatsApp propia** (reemplazo de ChateaPro). Está
> resumido pero completo. Sigue las reglas de `CLAUDE.md` (responder en español,
> simple; Mateo no es programador; no reescribir lógica de plata; publicar a
> `main` que Vercel despliega en ~1 min en www.losplata.com.co).

## 0. Regla de oro: pensar EN GRANDE (escala)
Todo lo que se construya aquí debe aguantar **escala real**: líneas con **50.000–100.000
contactos**, **5+ líneas** conectadas a la vez, cada una con un flujo enorme. Antes de crear
algo, pregúntate si sirve a ese tamaño. Reglas prácticas:
- **Filtros, conteos, búsquedas y paginación SIEMPRE en el servidor**, apoyados en índices.
  Nunca traer todos los contactos/mensajes al navegador para filtrarlos ahí.
- **Una sola tabla por concepto** con columna `linea_id` + índices (no una tabla por línea).
- Datos **grandes** (contactos, conversaciones, mensajes) → paginar y consultar por índice.
  Datos de **configuración** (etiquetas, respuestas rápidas) son pocos por línea → ahí sí se
  pueden cargar completos sin problema.

**Y que se sienta RÁPIDO, LIGERO y FÁCIL para el asesor.** Concretamente:
- **UI optimista**: mostrar la acción al instante (el mensaje aparece al enviar) sin esperar al servidor.
- **No redibujar pantallas completas si no cambió nada** (guardas de "firma" en lista y chat).
- **Cachear/subir lo pesado UNA vez y reusarlo** (ej: imágenes a Meta por `media_id`, no re-subir en cada envío).
- **Peticiones cortas**, no una sola petición larga que el navegador corte por tiempo (ej: el flujo se envía paso por paso).
- La velocidad casi nunca se arregla pagando más plan de Vercel/Supabase: es **diseño del código**.

## 1. Objetivo
Mateo (gerencia, empresa de rifas "Los Plata") está **saliendo de ChateaPro**
(falla mucho) y probó Manychat (limitado). Decisión: **construir su propio buzón
de WhatsApp** conectándose **directo a la WhatsApp Cloud API de Meta**, con la
lógica (bot/IA, bandeja, etc.) en su propio backend. El "CRM" como tal ya lo
tenía (Supabase + panel admin); lo que faltaba era la **capa de WhatsApp**.

La página de la bandeja es **`/bandeja-whatsapp`** (`public/bandeja-whatsapp.html`),
protegida con contraseña de asesor (las mismas del Admin, `ASESORES_SECRETO`).

## 2. Estado actual: qué YA funciona
- **Recibir y enviar** WhatsApp por la Cloud API, guardando todo en Supabase (sin ChateaPro).
- **Bandeja** estilo WhatsApp/ChateaPro/Manychat con: menú lateral contraíble (Chats / Contactos), lista de chats, conversación, panel derecho de ficha del cliente.
- **Multi-línea**: varias cuentas de WhatsApp en el mismo sistema (ver §5).
- **Filtro "Sin respuesta"** (chats donde el último mensaje lo mandó el cliente), con conteo, calculado en el servidor.
- **Ver comprobantes** (fotos/audios) dentro del chat; miniaturas cuadradas; clic = visor grande. Cuando llegan **varias fotos seguidas** del mismo lado se **agrupan en cuadrícula** (galería estilo WhatsApp, con "+N" para desplegar el resto).
- **Ficha del cliente** (panel derecho): tarjeta del cliente (nombre, ciudad, documento, correo, saldo total) + **una tarjeta por boleta** con su saldo y su **historial de pagos** (fecha · referencia/método · asesor · valor), con **basurero para eliminar abono**.
  - **Registrado vs nuevo**: si el teléfono existe en `clientes` (por los **últimos 10 dígitos**), muestra su tarjeta (nombre, ciudad, documento, correo) y, si no tiene boletas, "Sin boletas en la rifa actual". Si **NO está registrado**, ya **no** repite su nombre/teléfono: solo muestra "Cliente nuevo — no está registrado ni tiene boletas". El "Saldo total" solo aparece cuando tiene boletas.
  - **Botón "Actualizar"** en la cabecera del chat (junto a ver-ficha, etiquetas y eliminar): refresca el chat y la ficha del cliente al instante, **sin recargar toda la página**.
  - **Autocompleta el indicativo**: WhatsApp siempre llega con el número completo; si en la base el teléfono está más corto (sin indicativo) y el cliente no tiene boletas, al abrir el chat se actualiza solo al número de WhatsApp. Es best-effort (si la base lo rechaza no pasa nada, la ficha se muestra igual).
- **Verificar pago (clic derecho en el comprobante → "Buscar el pago")**: lee la imagen con IA, la compara contra las **transferencias REALES** del sistema (no abona por la foto), sugiere la coincidencia, muestra si ya está asignada, compara las 2 fotos lado a lado. Si está LIBRE → botón **"Abonar"** (una boleta o **repartir** entre varias, suma exacta). Reusa `/api/admin/abono`.
- **Eliminar abono** desde la bandeja (y arreglado en Admin): si el pago está **repartido**, borrar una parte **borra todas** y libera la transferencia; avisa antes.
- **Etiquetas** por conversación (estilo Manychat): ícono + color + nombre, pastillas en la lista, menú para asignar/crear/eliminar. 4 por defecto: 🟢 Pagada, 🟡 Abonada, 🔵 Separada, 🔴 Pendiente.
- **Contactos** (módulo): lista paginada con buscador **en servidor**, **crear contacto** e **importar CSV** (parser entiende el export de ChateaPro: columnas `name`, `phone`, `email`).
- **Campo correo** (opcional) agregado a clientes/boletas en todo el sistema (venta, editar, reserva web, búsqueda, abonar, ficha).
- **Permisos por línea**: gerencia ve todas; cada asesor solo las suyas (ver §5).
- **Permisos por grupo en la ficha (solo lectura)**: igual que el Admin, un asesor solo puede **modificar** boletas de su mismo **grupo** (`grupoDeAsesor`: 'independiente' vs 'regular'). Las boletas de otro grupo se **ven** pero con banner "🔒 Esta boleta no es de tu equipo": sin basurero (no borrar abonos) y no aparecen como opción para abonar. El flag `puede_modificar` lo calculan en el servidor `cliente.js` y `buscar-pago.js`; el servidor (`/api/admin/abono`, `eliminar-abono`, `liberar-boleta`) ya bloqueaba la acción, esto es el bloqueo **preventivo** en pantalla.
- **Difusiones (broadcasts)** en el menú **Difusiones**, con dos pestañas: **Plantillas** y **Campañas**.
  - **Plantillas**: se crean de punta a punta contra Meta (`POST /{waba}/message_templates`), se guardan en `plantillas_whatsapp` y se ve su estado en colores (borrador / en revisión / aprobada / rechazada). Botón "Actualizar estados" consulta a Meta (`GET .../message_templates`) y refleja aprobaciones/rechazos. WhatsApp obliga a usar una plantilla aprobada para escribir fuera de la ventana de 24h.
  - **Campañas**: asistente elegir plantilla aprobada → audiencia (todos los contactos de la línea, o filtrados por una etiqueta) → revisar → enviar. Variables de la plantilla ({{1}}, {{2}}…) se llenan con texto fijo o tokens `{nombre}`/`{telefono}`. El envío es **por lotes** (`enviar-lote`, ~25 por llamada) con cola en `difusion_destinatarios` → resistente y retomable; incluye **conteo previo**, **envío de prueba a un número** y barra de progreso. Cada mensaje enviado queda en el chat del cliente.
- **Respuestas rápidas (flujos)** en **Herramientas → Respuestas rápidas**. Cada una es un **flujo de varios mensajes** (texto e imágenes por URL) en el orden que el asesor defina. Se **administran** en esa pantalla (crear/editar/reordenar/borrar) y se **usan** en el chat con el botón **⚡** o escribiendo **`/`** (filtra por título); al elegirla se **envían todos los pasos en orden** al cliente. **Compartidas por línea** (como las etiquetas). Las imágenes se mandan por `link` y se guardan con `media_url` para verse en el historial.
- **Enviar fotos y PDF desde el chat** (botón clip 📎 en la barra): el asesor adjunta un archivo de su computador y se envía al cliente al instante; queda en el historial. Antes solo salían imágenes por URL vía respuestas rápidas. Se bloquea (como el texto) si la ventana de 24h está cerrada. Backend: `enviar-archivo.js`.
- **Buscar chats en el servidor**: el buscador de Chats encuentra en TODA la base (por nombre o número), no solo en los ~300 cargados. Antes "no aparecían" clientes viejos. Con pausa de 300 ms al teclear. (`conversaciones.js` con parámetro `q`.)
- **Avisos de mensaje nuevo**: suena un "ding" cuando sube el total de no leídos (solo por mensajes que llegan, no por los que se envían) y la **pestaña del navegador muestra el contador** `(3) Bandeja…`. Hay un **botón en el menú lateral para silenciar/activar** el sonido, y recuerda la elección (`localStorage`). El sonido se genera con Web Audio (sin archivo) y se desbloquea al primer clic. Falta: marcar qué asesor atiende un chat.
- **Favicon**: el logo de Los Plata (1080×1080) es el ícono de la pestaña en **todas** las páginas del sistema (admin, caja, boleta, etc.), no solo la bandeja.
- **Optimización para celular**: además de lo que ya había (menú a íconos, lista a pantalla completa con "volver", ficha deslizable, modales tipo hoja, texto a 16px anti-zoom), se afinó la cabecera del chat (oculta avatar, nombre con "…", botones siempre visibles), la barra de envío en pantallas angostas y la **zona segura del iPhone** (la barra de enviar no queda tapada por la rayita de inicio).
- **Agente de IA "Liliana"** (vendedor automático con Claude): atiende WhatsApp solo —saluda, muestra la casa, explica premios y legalidad, ofrece números, recoge datos, aparta, envía la boleta, registra abonos verificados, libera boletas y pasa a un humano—. Hoy está **operativo pero en modo PRUEBA**: solo Mateo lo prende, solo en su propio chat. **Todo el detalle está en §8.**
- **Ventana de 24h, cita de mensajes y notas del agente** en el chat (ver §8.10): la caja de texto se bloquea cuando la ventana de WhatsApp está cerrada, se muestra el mensaje citado cuando el cliente responde citando, y las acciones del agente dejan notas grises en el chat.

## 3. Arquitectura — Base de datos (Supabase, proyecto `ikvzmojzgpxuhnbymtxm`)
Tablas nuevas creadas para el buzón:
- **`lineas_whatsapp`** (config de cada línea): `phone_number_id` (PK), `nombre`, `token` (si null usa el de env), `activa`, `waba_id`, `suscrita` (si su webhook ya está conectado).
- **`lineas_asesores`** (permisos): `(phone_number_id, asesor)`. Qué asesores ven cada línea. Gerencia no necesita fila (ve todas).
- **`conversaciones_whatsapp`**: un chat por (`linea_id`,`telefono`). Campos clave: `nombre_perfil`, `ultimo_mensaje`, `ultimo_at`, `ultimo_entrante` (último msj fue del cliente → "sin respuesta"), `no_leidos`, `estado`, `correo`, `linea_id`. Único `(linea_id, telefono)`. Un contacto importado es una fila aquí con `ultimo_at` null (no aparece en Chats, sí en Contactos).
- **`mensajes_whatsapp`**: `conversacion_id`, `telefono`, `linea_id`, `direccion` (entrante/saliente), `tipo`, `texto`, `media_id`, `wa_message_id` (único, anti-duplicado), `estado_envio`, `timestamp_wa`, `raw`.
- **`etiquetas`**: `(id, linea_id, nombre, icono, color)`. **Por línea.**
- **`conversacion_etiquetas`**: `(conversacion_id, etiqueta_id)`.
- También se agregó columna **`correo`** a `clientes` y `boletas` (feature de email).
- **`plantillas_whatsapp`** (difusiones): `(id, linea_id, nombre, categoria [MARKETING/UTILITY], idioma, encabezado, cuerpo, pie, ejemplo_variables jsonb, meta_template_id, estado, motivo_rechazo)`. Nombre único por línea. El `estado` se sincroniza desde Meta.
- **`difusiones`** (campañas): `(id, linea_id, nombre, plantilla_id→plantillas_whatsapp, variables jsonb, filtros jsonb {tipo:'todos'|'etiqueta', etiqueta_id}, estado [borrador|preparada|enviando|completada|cancelada], total, enviados, fallidos, creada_por, ...)`.
- **`difusion_destinatarios`** (cola de envío, escala 50k–100k): `(id bigint, difusion_id→difusiones [cascade], telefono, nombre, estado [pendiente|enviado|fallido], error, wa_message_id, enviado_at)`. Índice `(difusion_id, estado)` y único `(difusion_id, telefono)`.

Tablas y columnas del **Agente de IA** (ver §8):
- **`agente_config`** (config del agente por línea): `(linea_id, estado [apagado|sombra|encendido], nombre_agente, prompt, modelo, variables jsonb [valores de las variables del libreto: {{nombre}}, {{pagos}}, …], actualizado_por, actualizado_at)`.
- **`agente_herramientas`** (qué acciones tiene prendidas cada línea): `(id, linea_id, clave, nombre, descripcion, riesgo, activa, orden)`.
- **`agente_actividad`** (bitácora de lo que hace): `(id, linea_id, telefono, tipo, resumen, created_at)`.
- **`recordatorios`** (seguimiento automático del agente, <24h — ver §8.12): `(id uuid, linea_id, telefono, conversacion_id uuid→conversaciones_whatsapp [cascade], programado_para, motivo, ultimo_msg_cliente_at, estado [pendiente|enviado|cancelado|fallido], creado_por, intentos, created_at, enviado_at)`. Índice parcial `(programado_para) where estado='pendiente'` (el cron lee SOLO los vencidos, no toda la tabla → escala) y `(linea_id, telefono) where estado='pendiente'` (cancelar al instante cuando el cliente vuelve a escribir). **Tabla ya creada** (jun-2026); falta el cron + la herramienta del agente + el gancho en `recibir.js`.
- Nuevas columnas en **`conversaciones_whatsapp`**: `agente_activo` (bool, el botón 🤖 prende el agente en ese chat) y `agente_procesando_at` (timestamp, el candado anti-mensaje-doble).
- Nueva columna en **`mensajes_whatsapp`**: `responde_a` (id/wa del mensaje citado, para mostrar la cita). Las **notas** del agente se guardan aquí mismo con `direccion='nota'`.

Índices pensados para **escala (50k–100k chats por línea)**: por `linea_id`, por `ultimo_at`, parcial de "sin respuesta", etc.

## 4. Arquitectura — Endpoints (carpeta `api/whatsapp/`)
- **`recibir.js`** — webhook (el "timbre"). GET = verificación; POST = mensajes + acuses. Detecta la línea por `value.metadata.phone_number_id`. **Todas las líneas usan la misma URL de webhook.**
- **`enviar.js`** — enviar texto (token/número de esa línea).
- **`enviar-archivo.js`** — enviar una **foto o PDF** que el asesor adjunta desde su computador (botón clip 📎 en la barra del chat). Sube el archivo a Meta (media_id), lo manda al cliente y lo guarda en el historial. Límite 5 MB. Solo imágenes o PDF.
- **`conversaciones.js`** — lista de chats de una línea (filtro sin-respuesta + conteo, adjunta etiquetas). Solo trae chats con `ultimo_at` no nulo. **Acepta `q`**: busca en TODA la base por teléfono (si son dígitos) o por nombre (si son letras), igual que Contactos — el buscador de Chats ya no filtra solo lo cargado.
- **`mensajes.js`** — mensajes de un chat.
- **`media.js`** — descarga foto/audio con el token de la línea.
- **`cliente.js`** — ficha (boletas, deuda, pagos agrupados por boleta). Empareja por **últimos 10 dígitos**. Devuelve también los datos del cliente **registrado aunque no tenga boletas** (`registrado:true`, `boletas:[]`) y **autocompleta el indicativo** del teléfono cuando está corto y el cliente no tiene boletas (best-effort).
- **`buscar-pago.js`** — verificación del comprobante vs transferencias reales (Fase 1) + boletas del cliente (Fase 2 abona con `/api/admin/abono`).
- **`abono-reparto.js`** — dice si un abono es parte de un pago repartido (para el aviso al borrar).
- **`contactos.js` / `contacto-crear.js` / `contactos-importar.js`** — apartado Contactos.
- **`lineas.js`** — lista de líneas que el asesor puede ver (+ flag `esGerencia`).
- **`conectar-linea.js`** — (gerencia) suscribe la app a la WABA (`POST /{waba}/subscribed_apps`) con el token de env. Marca `suscrita=true`.
- **`etiquetas.js`** — acciones: `listar` (siembra 4 por defecto), `crear`, `eliminar`, `conversacion`, `toggle`.
- **`plantillas.js`** — plantillas de WhatsApp. Acciones: `listar`, `crear` (las manda a revisión a Meta), `sincronizar` (trae estados de Meta y actualiza), `eliminar` (borra en Meta + base).
- **`difusiones.js`** — campañas. Acciones: `listar`, `crear`/`editar`, `eliminar`, `preparar` (calcula audiencia y llena la cola), `estado` (progreso), `enviar-lote` (manda un lote y devuelve avance), `cancelar`, `prueba` (un envío a un número). En `lib/whatsapp.js` se agregaron `construirComponentesPlantilla`, `crearPlantillaMeta`, `listarPlantillasMeta`, `eliminarPlantillaMeta`, `enviarPlantilla`; y `resolverLinea` ahora devuelve también `wabaId`.
- **`respuestas-rapidas.js`** — respuestas rápidas (tabla `respuestas_rapidas`, columna `pasos` jsonb). Acciones: `listar`, `crear`, `editar`, `eliminar`, y **`enviar`** (manda todos los pasos del flujo en orden y los guarda en el chat). Reusa `enviarTexto`/`enviarImagen` de `lib/whatsapp.js`.
- **`agente.js`** — **cabina** del agente (SOLO Mateo, `esMateo`). NO conversa con clientes; solo LEE/GUARDA su configuración por línea. Acciones: `config` (siembra config + las 10 herramientas la 1ª vez y trae la actividad), `guardar` (estado/nombre/prompt/modelo), `herramienta` (prende/apaga una acción), `activar_conversacion` (el botón 🤖: `agente_activo`+`estado='bot'`), `probar` (simulador que NO toca WhatsApp; ya casi no se usa).
- **`agente-responder.js`** — **MOTOR** del agente (el que de verdad responde). Lo dispara el webhook. Conversa con Claude usando las 11 herramientas, **VE las imágenes** del cliente, le inyecta el **estado del cliente** y sus **acciones ya hechas**, junta los mensajes en ráfaga (**debounce ~7s**), lee el historial **desde el inicio de la rifa activa**, rellena las **variables** del prompt (`{{nombre}}`/`{{pagos}}` con `aplicarVariables`), transcribe audios con Whisper, deja notas y tiene candado anti-duplicado. El supervisor Opus quedó **desactivado** (§8.5). **Es el archivo más importante del agente; detalle en §8.**
- **`recibir.js`** (webhook) ahora, además de guardar el mensaje, **dispara el motor** si el agente está activo (`dispararAgenteSiActivo` → `fetch` al motor con el secreto interno y corte a 1.5s), **cancela los recordatorios pendientes** del chat cuando el cliente vuelve a escribir (`cancelarRecordatorios`, ver §8.15) y captura la **cita** (`m.context.id → responde_a`).
- **`recordatorios-cron.js`** — el **relojito** de los recordatorios del agente (§8.15). Lo llama `pg_cron` de Supabase cada minuto (con el secreto interno); busca los recordatorios vencidos, los reclama en atómico (sin doble disparo) y despierta el motor del agente para el seguimiento.
- **libs**: `lib/whatsapp.js` (`resolverLinea`, `enviarTexto`, `enviarImagen`, `enviarImagenPorId`, `subirMediaDesdeBuffer` [subir foto/PDF desde bytes, lo usa `enviar-archivo.js`], `enviarDocumento` [PDF de la resolución], `enviarDocumentoPorId`, `descargarMediaBase64`, `configWhatsapp`), `lib/comprobante.js` (`extraerDatos` — lee comprobante con Claude, solo lectura), `lib/asesores.js` (`esGerencia`, `esMateo` [agente solo-Mateo], `lineasDeAsesor`, `puedeVerLinea`; **GERENCIA = ['mateo','alejo plata']**, editable ahí). El motor reusa además `lib/numeros-disponibles.js`.

Se REUSAN (no se reescriben) endpoints de plata del Admin: `/api/admin/abono` (abonar), `/api/admin/eliminar-abono` (se **modificó** para que borrar una parte de un pago repartido borre todas y libere la transferencia — también beneficia al Admin) y `/api/admin/liberar-boleta`. **NUEVO**: `/api/admin/trasladar-abono.js` — mueve abono entre boletas del mismo cliente (todo o un monto parcial; parte el abono y reparte la transferencia); lo usa la herramienta `trasladar_abono`.

## 5. Multi-línea y permisos (importante)
- **Una sola tabla para todas las líneas**, con `linea_id` + índices. NO una tabla por línea. Esto escala bien (Postgres aguanta millones de filas si se filtra por índice).
- Cada chat/mensaje/etiqueta lleva su `linea_id`. Un chat es único por `(linea_id, telefono)` → el mismo cliente puede escribirle a 2 líneas y son chats separados.
- **Permisos por LÍNEA, no por asesor:**
  - **Gerencia** (Mateo, Alejo Plata) ve **todas** las líneas.
  - Un asesor ve solo las líneas en `lineas_asesores`.
  - Una línea con **10 asesores del grupo** → todos ven **la misma línea, mismos chats, mismas etiquetas**.
  - Un **independiente** (ej. Liliana) con su línea → solo él la ve.
- El frontend tiene un **selector de línea** (arriba en el menú). Gerencia ve el botón **"Conectar línea"** (solo en líneas no `suscrita`).
- Los endpoints validan el permiso en el servidor (`puedeVerLinea`), no solo en pantalla.

## 6. Configuración en Meta (lo ya hecho)
- App de Meta **"Buzón Los Plata"** (id `2607182326463882`), Business `6736642543036723`.
- **System User token** permanente "Buzon Los Plata Token" (permisos `whatsapp_business_messaging` + `whatsapp_business_management`). Vive en Vercel como `WHATSAPP_TOKEN`.
- Variables en Vercel: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (= número de prueba `1147348345124937`), `WHATSAPP_VERIFY_TOKEN` (= `losplata-buzon-2026`).
- Webhook de la app: URL `https://www.losplata.com.co/api/whatsapp/recibir`, verify token `losplata-buzon-2026`, suscrito a `messages`.

### Líneas registradas hoy
1. **Número de prueba** — phone_number_id `1147348345124937`, WABA `1522272816231368`. Solo gerencia (sin fila en `lineas_asesores`).
2. **Compra con Lili** (Liliana) — phone_number_id `1128258647034751`, WABA `4314997218789282`, asesor `Liliana`, `suscrita=true`, **operativa** (recibe y envía).

### Para conectar una línea NUEVA (proceso)
1. En Meta: conectar el número a la Cloud API bajo la app "Buzón Los Plata"; sacar su **Phone number ID** y su **WABA id**; darle al **token** acceso a esa WABA (Usuarios del sistema → asignar activos).
2. Insertar fila en `lineas_whatsapp` (phone_number_id, nombre, waba_id, token=null si usa el de env) y en `lineas_asesores` (línea ↔ asesor).
3. En la bandeja, seleccionar la línea y darle **"Conectar línea"** (suscribe el webhook). Listo.
4. (Opcional) Quitar de ChateaPro: solo apagar su bot ("Desvincular" gratis); el control real está en Meta.

## 7. Decisiones clave tomadas
- El comprobante del cliente es solo una **afirmación**; la plata se verifica contra **transferencias reales** (cargadas con Carga IA). El sistema **sugiere**, el asesor **confirma**; nunca abona solo por una foto.
- Coincidencia de transferencia: **fecha exacta** + (referencia, o mismo minuto, o teléfono del cliente en la referencia). Mostrar solo las que coinciden de verdad, no todas las del monto.
- Repartir un pago entre boletas: la 1ª llamada consume la transferencia, las demás llevan la referencia (igual que el Admin). Borrar una parte borra todas.
- Escala siempre: filtros, conteos y búsquedas **en el servidor** con índices.
- Reusar la lógica de plata del Admin; no reescribirla.
- Estética = la del sitio (Inter, fondo crema `#FAFAF7`, acento menta `#9BFAB0`, minimalista, sin exceso de emojis).

## 8. Agente de IA — vendedor automático "Liliana"
Es lo más grande que se construyó después de la bandeja: un **vendedor automático** que
atiende WhatsApp solo, con la API de Claude, dentro de la misma bandeja. Reemplaza el bot de
ChateaPro/Manychat. Hoy está **listo y operativo, pero en modo PRUEBA**: Mateo lo prende SOLO
en su propio chat para probarlo; **no está suelto con clientes reales todavía**.

### 8.1 Cómo se prende (y quién puede)
- En cada conversación hay un botón **🤖 Agente ON/OFF** (verde = prendido). Prenderlo pone
  `conversaciones_whatsapp.agente_activo = true` y `estado='bot'`. Desde ahí, cada mensaje que
  entre en ese chat lo responde el agente solo.
- El botón **y todo el menú "Agente"** (la cabina) son **SOLO de Mateo**. Ni Liliana ni Alejo
  los ven ni pueden activarlos — es a propósito, para no soltar el agente por error mientras se
  prueba. El candado está en el servidor (`esMateo`) y también escondido en pantalla (`soyMateo`).

### 8.2 Las dos partes: cabina + motor
- **Cabina** = `api/whatsapp/agente.js` + la pestaña "Agente" de la bandeja. Aquí Mateo
  **configura** al agente de una línea: el `prompt` (su "manual" de cómo vender), el `modelo`,
  el estado, y **prende/apaga cada herramienta**. NO conversa con clientes.
- **Motor** = `api/whatsapp/agente-responder.js`. Es el que **de verdad responde** a los
  clientes. Lo dispara el webhook cuando entra un mensaje en un chat con el agente prendido.

### 8.3 Cómo se dispara (rápido, sin depender del navegador)
Antes el agente dependía de que el navegador de Mateo "viera" el mensaje nuevo, y eso lo volvía
lento (segundos o minutos) y a veces lo disparaba dos veces. Ahora **el webhook `recibir.js`
llama al motor directo** apenas entra el mensaje (`dispararAgenteSiActivo`): le manda el secreto
interno (`WHATSAPP_VERIFY_TOKEN`) y corta a 1.5s sin esperar respuesta — el motor sigue
trabajando en su propia ejecución serverless. Resultado: responde casi al instante. La bandeja
**ya NO** dispara el agente desde el navegador (eso causaba los mensajes dobles).

### 8.4 Las herramientas (lo que sabe hacer)
Usa "tool use" de Claude: en vez de inventar, llama funciones reales. Son **13** y cada una se
**prende/apaga** desde la cabina (`agente_herramientas`):
1. **enviar_contacto_inicial** — saludo + fotos de la casa + cierre (precio, legalidad, responde
   su pregunta y "¿Te explico los premios?"). Lo redacta la IA y va en UN solo cierre para no
   duplicar mensajes.
2. **consultar_disponibles** — trae una MUESTRA de números libres (no son todos; cambia cada vez).
3. **verificar_disponibilidad** — revisa si un número puntual (ej. 1234) está libre u ocupado.
4. **consultar_cliente** — boletas y saldo de un teléfono.
5. **enviar_resolucion** — manda el PDF de EDSA (`/resolucion.pdf`) como prueba legal.
6. **apartar_numero** — reserva una boleta. Pide número + nombre + apellido + ciudad, y también
   **cédula y correo** (para la factura electrónica, que se emite cuando la boleta queda paga al
   100%). Si el cliente ya está registrado, **reusa** sus datos guardados y no los re-pide.
7. **enviar_boleta** — manda la boleta digital con su enlace.
8. **registrar_abono** — registra un pago (solo con comprobante verificado contra el banco).
9. **liberar_boleta** — cancela una boleta si el cliente ya no quiere (y no ha abonado).
10. **trasladar_abono** — mueve el abono (dinero ya pagado) de una boleta a otra **del mismo
    cliente**; puede mover TODO o **una parte** (para dividir, ej. $40.000 a una y $20.000 a otra).
    Candado: ambas boletas deben ser del mismo teléfono; nunca toca la de otra persona.
11. **pasar_a_humano** — entrega el chat a un asesor y se apaga.
12. **programar_recordatorio** — el agente **se agenda a sí mismo** volver a escribirle al cliente
    más tarde HOY (cuando el cliente pide tiempo: "escríbeme en 20 min"). Recibe `minutos` y
    `motivo`. Candado: solo **dentro de las 24h** desde el último mensaje del cliente (ver §8.15).
13. **actualizar_datos_cliente** — corrige/completa **nombre, apellido, ciudad, cédula o correo**
    del cliente (ej. para la factura electrónica). Reusa `/api/admin/actualizar-cliente`. Busca al
    cliente por sus últimos 10 dígitos y **mezcla** lo nuevo con lo que ya tiene (no borra ni
    duplica). Solo cambia datos; **no** cambia el teléfono.

> Las acciones de plata/inventario (apartar, abonar, liberar, trasladar) **ya no pasan por el
> supervisor Opus** (§8.5): cada una tiene su propio candado fuerte.

### 8.5 Supervisor Opus — DESACTIVADO (cada acción se cuida sola)
Existió un **supervisor Opus** (`claude-opus-4-8`) que revisaba las acciones de plata/inventario
antes de ejecutarlas. **Se desactivó** (la lista `ACCIONES_SENSIBLES` quedó vacía) porque, al no
"ver" las fotos ni ejecutar los chequeos reales, **frenaba acciones legítimas en falso** (ej.
confundió el apellido "Plata" con dinero; o no veía el comprobante y bloqueaba un abono real).
Cada acción **ya tiene su propio candado fuerte**: el abono verifica contra el banco; liberar
valida dueño + $0 abonado; trasladar valida que ambas boletas sean del cliente; apartar es
reversible. El código del supervisor sigue en el motor por si se quiere reactivar para alguna
acción puntual, pero hoy no se usa.

### 8.6 Abono "anti-fraude" y liberar (reúso de lo ya probado)
- **registrar_abono** NO le cree a la foto del cliente. Reusa la lógica del Admin: toma el último
  comprobante (imagen) del chat → `/api/whatsapp/buscar-pago` lo compara contra las
  **transferencias reales** del banco → solo si hay coincidencia real (`sugerida_id`) abona con
  `/api/admin/abono`. Si no coincide, NO abona y pasa a un asesor. Decisión de Mateo: **solo con
  pago real verificado** (nada de abonar por una foto).
- **liberar_boleta** solo cancela si la boleta es de ese cliente y **no tiene nada abonado**
  (`total_abonado=0`); si ya pagó algo, NO la libera (un asesor gestiona la devolución). Reusa
  `/api/admin/liberar-boleta`.
- **trasladar_abono** mueve el dinero ya abonado de una boleta a otra **del mismo cliente**
  (`/api/admin/trasladar-abono`): puede mover todo o un monto parcial (parte el abono y reparte la
  transferencia entre las dos boletas), recalcula los saldos desde los abonos y deja bitácora.
  Candado central: ambas boletas deben pertenecer al teléfono del cliente.
- El motor llama estos endpoints internos con la **contraseña de Mateo** (sale de
  `ASESORES_SECRETO` con `contrasenaGerencia()`), para usar exactamente la misma lógica probada
  que un asesor humano.

### 8.7 Entiende audios
Si el cliente manda una nota de voz, el motor la **transcribe con OpenAI Whisper** (`whisper-1`,
`OPENAI_API_KEY`) y la trata como si la hubiera escrito (no dice "no puedo oír audios"). Guarda
la transcripción en el mensaje para no repetir el trabajo. (Claude no "oye"; Whisper convierte
el audio en texto — mismo patrón que `api/contenido/transcribir.js`.)

### 8.8 Deja notas en el chat y "recuerda" lo que hizo
Cada acción deja una **nota gris** ("🤖 Consulté el número 1234", "🤖 Registré un abono de $…").
Sirve para dos cosas: (1) Mateo ve qué hizo el agente, y (2) esas notas se le vuelven a dar a la
IA como memoria ("ya hice esto → …") para que **no repita** acciones (antes ofrecía revisar un
número que ya había revisado).

### 8.9 Sin mensajes dobles, sin pisarse
- **Candado**: antes de responder, el motor marca `agente_procesando_at` con un UPDATE
  condicional; si otra corrida ya lo tiene, esta se sale. Así nunca responden dos a la vez (ni
  hacen doble abono). El candado se toma **antes** de leer el historial.
- ⚠️ **Lección importante para el próximo chat:** el candado falló un tiempo porque PostgREST no
  "veía" la columna nueva (**caché de esquema** con pgbouncer). NO se arregla con `NOTIFY`; se
  arregla **recargando el esquema con `apply_migration`** (Management API de Supabase). Tras
  agregar columnas con `execute_sql`, recarga el esquema o PostgREST seguirá diciendo
  "column … does not exist" y la acción fallará en silencio.

### 8.10 Cosas de la bandeja que se hicieron junto con el agente
- **Ventana de 24h**: WhatsApp solo deja escribir gratis 24h después del último mensaje del
  cliente. La bandeja ahora **bloquea la caja de texto** y avisa cuando la ventana está cerrada
  (antes Mateo escribía y no llegaba nada).
- **Cita de mensajes**: cuando el cliente responde citando un mensaje, la bandeja muestra el
  mensaje citado arriba (como WhatsApp), recortado a 2 líneas con "…". Se guarda en `responde_a`.
- **Resolución PDF**: se subió `public/resolucion.pdf` (resolución de EDSA) para que el agente la
  mande como prueba legal con `enviar_resolucion`.

### 8.11 Decisiones clave del agente
- En prueba: **solo Mateo**, solo su chat, con TODAS las herramientas (para probar todo de una).
- Plata/inventario: **doble llave** — verificación real (banco/dueño) + supervisor Opus.
- Abono: **solo con pago real verificado**; nunca por la foto.
- Modelo por acción: conversación en Sonnet, decisiones de plata en Opus (la memoria se conserva).
- El agente se presenta como **Liliana** (no "Camila", el nombre del prompt viejo de ChateaPro).
- El nombre, el `prompt` y las herramientas viven en la **base de datos** y se editan desde la
  cabina, sin tocar código.

### 8.12 Qué falta del agente (pendiente)

> **✅ Recordatorios que el agente se programa a sí mismo (seguimiento automático <24h) → HECHO**
> (jun-2026). El detalle completo está en **§8.15**. Tabla `recordatorios` (§3) + herramienta
> `programar_recordatorio` (§8.4 nº12) + relojito `recordatorios-cron.js` con `pg_cron` cada minuto
> + auto-cancelación en `recibir.js`. **Falta probarlo con un caso real** (Mateo).

- **Ideas de la revisión "qué sabe el asesor que el agente no" (jun-2026):**
  - ✅ **Actualizar datos del cliente** (correo/cédula/nombre/ciudad) → HECHO (herramienta nº13).
  - ⬜ **Pago en línea (Wompi)**: existe el flujo `/abonar` (tarjeta/PSE/Nequi) que **registra el
    abono solo** vía `api/abonar/wompi-webhook.js`. El agente NO lo ofrece (solo pide transferencia
    + foto). Darle una herramienta para enviar el **link de pago en línea** subiría conversión.
    Mateo lo dejó para después (toca plata). Páginas: `public/abonar.html` + `abonar-app.jsx`.
  - ⬜ **Reusar flujos curados** (respuestas rápidas "Información", "Método de pago") en vez de que
    el agente redacte ese texto. Consistencia de marca. Opcional/menor.
  - **Dejar SOLO para humanos** (no dar al agente): devoluciones (`marcar-devolucion`), eliminar
    abonos (`eliminar-abono`) y todo el back-office (caja, finanzas, sorteo, permisos, cobros).
- **Soltarlo con clientes reales** (hoy es solo-Mateo, solo-su-chat) cuando Mateo lo decida.
- **Conectarlo a las líneas grandes** (Línea 1 y Línea 2); hoy solo se prueba en la línea
  "Compra con Lili".
- Seguir afinando el `prompt` con más pruebas (ver §8.13).
- Posible: subir `maxDuration` si la respuesta se vuelve lenta (el debounce ya espera hasta ~20s).
- Posible mejora: botón **"copiar configuración de otra línea"** para replicar sin pegar el manual.
- ~~"Agrupar mensajes"~~ → **HECHO** (debounce, §8.13).
- El simulador `probar` de la cabina **ya no se usa** (Mateo lo confirmó); el código sigue en
  `agente.js`, se puede limpiar.

### 8.13 Cómo conversa: afinado con pruebas reales (sesión jun-2026)
Tras muchas pruebas con Mateo (probando con su propio número en la línea de Lili) se afinó el
comportamiento. Todo vive en `agente-responder.js` (motor) y en el `prompt` (libreto, en la base):
- **VE las fotos**: cuando el cliente manda una imagen (ej. comprobante), el motor le pasa la
  **foto de verdad** a Claude (no solo "[imagen]"). Así reconoce el comprobante en vez de
  ignorarlo. Descarga las últimas imágenes con `descargarMediaBase64` y las adjunta como bloques.
- **Estado del cliente SIEMPRE**: antes de responder, el motor consulta por teléfono los datos y
  boletas del cliente (`resumenCliente`) y se los inyecta al prompt (`bloqueEstadoCliente`). Así,
  desde el PRIMER mensaje, sabe si ya es cliente → lo **saluda por su nombre**, le recuerda sus
  boletas, **no le vende de cero** ni le re-pide datos. Funciona **entre líneas** (las boletas se
  guardan por teléfono). Muestra nombre, apellido, ciudad, cédula, correo y, por boleta, lo
  **abonado** y lo que falta.
- **Memoria de acciones (arreglo clave)**: las notas 🤖 de lo ya hecho **no le llegaban** (a
  `construirMensajes` se le pasaba `reales`, que filtra las notas). Ahora se le inyecta un bloque
  "ACCIONES QUE YA EJECUTASTE" para que no repita ni se contradiga (ej. liberar una boleta y luego
  decir que "no es del cliente"). **Nota de diagnóstico:** un error parecido NO fue falta de
  memoria sino que el modelo no usaba el dato que tenía → se arregló con prompt + dato más claro,
  **sin subir a Opus** (más caro/lento).
- **No narra el proceso**: ya no manda "voy a verificar...", "un momento...". El motor **suprime
  el texto que acompaña a una herramienta** y solo envía el mensaje final con el resultado.
- **No pregunta lo que ya sabe** (regla dura + el estado del cliente le muestra el dato).
- **Juntar mensajes (debounce)**: si el cliente escribe en ráfaga, el motor **espera ~7s de
  silencio desde su ÚLTIMO mensaje** (cada mensaje nuevo reinicia el conteo, tope 20s) y junta
  todo en UNA respuesta. Solo en el disparo del webhook; en prueba manual responde de una. Resuelve
  el viejo dolor de "agrupar mensajes" de ChateaPro/Manychat.
- **Memoria por RIFA, no por nº de mensajes**: lee el historial **desde la `fecha_inicio` de la
  rifa con `estado='activa'`** (tope de seguridad 300). Al marcar otra rifa como activa, el corte
  se mueve solo y no arrastra el contexto de rifas pasadas.
- **No reenvía la presentación**: si activan el agente en un chat con mensajes previos, no manda el
  contacto inicial otra vez; lee todo y continúa el hilo (`yaHuboSalientes`).
- **Libreto reforzado** con: horarios de las loterías (Boyacá 10:30 / Manizales 11:00), urgencia
  del próximo sorteo, factura electrónica (cédula+correo), confianza/garantía (NIT 902.003.134-4,
  verificar en Gobernación de Caldas o EDSA), pagos a María Buitrago (autorizada), **devoluciones**
  (solo si la boleta NO ha entrado a ningún sorteo), boleta digital como comprobante, no hay boleta
  física, tono para clientes mayores, y reglas de seguridad (no regala/descuenta, no adelanta
  plata, no toca boletas ajenas, no se sale de su rol).

### 8.14 Variables del libreto (para replicar el agente en varias líneas)
El `prompt` (manual) es **igual para todas las líneas**; solo cambian unas **variables** que se
escriben como `{{clave}}` y el motor rellena antes de responder (`aplicarVariables`):
- **`{{nombre}}`** — el nombre del agente (campo "Nombre" de la cabina = `agente_config.nombre_agente`).
- **`{{pagos}}`** — los datos de pago de esa línea (a quién y a qué cuentas paga el cliente). Campo
  nuevo "Datos de pago" en la cabina; se guarda en **`agente_config.variables`** (jsonb).
Para montar el agente en otra cuenta de WhatsApp: se pega el **mismo manual base** y solo se
llenan esos dos campos (ej. la línea oficial usa Bancolombia; Liliana no). Para agregar otra
variable: úsala como `{{otra}}` en el prompt y guárdala en `variables`.

### 8.15 Recordatorios de seguimiento (el agente se vuelve a escribir solo) — HECHO
El agente puede **agendarse a sí mismo** volver a escribirle al cliente más tarde el MISMO día,
cuando el cliente pide tiempo (ej. "estoy ocupado, escríbeme en 20 min"). Cómo funciona:
- **Herramienta `programar_recordatorio(minutos, motivo)`** (§8.4 nº12): el agente la llama, valida
  que el momento quede **dentro de las 24h** del último mensaje del cliente (5 min de colchón) y
  guarda una fila en **`recordatorios`** (§3). Si el cliente pide en DÍAS, NO agenda (se lo dice).
  Solo **un recordatorio activo por chat**: si agenda otro, reemplaza el anterior.
- **El relojito** = `api/whatsapp/recordatorios-cron.js`, llamado por **`pg_cron` de Supabase cada
  minuto** (job `recordatorios-agente-cada-minuto`, usa `pg_net` para hacer `http_post` al endpoint
  con el secreto interno). Busca los vencidos pendientes (índice parcial → instantáneo), los
  **reclama de forma atómica** (`estado`→`enviado` solo si seguía `pendiente`, evita doble disparo)
  y **despierta el motor** del agente (fire-and-forget, como el webhook).
- **El motor** (`agente-responder.js`) acepta un disparo `{ recordatorio: { motivo } }`: se salta el
  debounce y la regla de "el último mensaje debe ser del cliente", e inyecta una **nota interna**
  (que el cliente NO ve) pidiéndole retomar la conversación con un mensaje natural. Reusa TODO el
  motor (herramientas, estado del cliente, candado anti-duplicado).
- **Auto-cancelación**: `recibir.js` cancela (`estado='cancelado'`) los recordatorios pendientes del
  chat **apenas el cliente vuelve a escribir** (ya retomaron solos; no hace falta el seguimiento).
- **Escala**: el cron lee solo los vencidos (índice), reclama en atómico (sin dobles) y procesa por
  lote (40 por corrida). El secreto interno del cron es `WHATSAPP_VERIFY_TOKEN`.

## 9. Pendientes / próximos pasos
- **Agente de IA** → **HECHO** (ver §8); pendientes propios del agente en §8.12.
- ~~Difusiones / broadcasts (con plantillas aprobadas por Meta)~~ → **HECHO** (menú Difusiones: Plantillas + Campañas). Pendiente de pulir: más filtros de audiencia, programar envíos (cron), pegar lista propia de números, y para audiencias muy grandes (decenas de miles) mover el "preparar" a un proceso en segundo plano.
- ~~**Enviar fotos/archivos sueltos** desde la barra del chat~~ → **HECHO** (botón clip 📎; sube foto o PDF desde el computador; `enviar-archivo.js`).
- ~~**Búsqueda de chats en servidor**~~ → **HECHO** (`conversaciones.js` con `q`; busca en toda la base por nombre o número).
- ~~**Avisos de mensaje nuevo**: sonido + contador en la pestaña + botón para silenciar~~ → **HECHO**.
- ~~**Plantillas desde el chat**: mandar una plantilla aprobada a un chat puntual para reabrir conversaciones de +24h~~ → **HECHO** (botón "Enviar plantilla" en el aviso de 24h; `plantillas.js` acción `enviar-chat`). *(La sección de Plantillas y las Campañas masivas ya existían en Difusiones.)*

**Pendientes pequeños de la bandeja:**
- **Marcar qué asesor atiende** un chat (para que en una línea con varios asesores no se pisen; toca cómo se reparten los chats).
- **Pulir difusiones**: más filtros de audiencia, **programar envíos** (cron), pegar lista propia de números, y para audiencias enormes (decenas de miles) mover el "preparar" a un proceso en segundo plano.

**Otros próximos pasos:**
- **Recordatorios del agente** (seguimiento automático <24h) → **en desarrollo**, especificado en §8.12.
- Migrar las **líneas grandes** (Línea 1, Línea 2) cuando se decida (es el "corte" desde ChateaPro).
- Mover la lógica pesada de venta del Admin a la bandeja si se quiere todo integrado (ya se empezó: verificar/abonar/ficha).

## 10. Cómo trabajar (recordatorio)
- Publicar: `git push origin main` → Vercel despliega ~1 min. Verificar en vivo.
- Build de JSX (esbuild) corre solo en el deploy de Vercel; localmente faltan `node_modules` (instalar esbuild si se necesita compilar para verificar).
- Tocar lógica de plata o esquema → explicar y confirmar con Mateo primero.
