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
- **Ver comprobantes** (fotos/audios) dentro del chat; miniaturas cuadradas; clic = visor grande.
- **Ficha del cliente** (panel derecho): tarjeta del cliente (nombre, ciudad, documento, correo, saldo total) + **una tarjeta por boleta** con su saldo y su **historial de pagos** (fecha · referencia/método · asesor · valor), con **basurero para eliminar abono**.
  - **Muestra al cliente registrado aunque NO tenga boletas en la rifa actual**: si el teléfono existe en la tabla `clientes` (emparejando por los **últimos 10 dígitos**), la primera tarjeta muestra sus datos (nombre, ciudad, documento, correo). La segunda tarjeta dice "Sin boletas en la rifa actual"; solo si no existe en la base dice "Cliente nuevo". El "Saldo total" solo aparece cuando tiene boletas.
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
- **`agente_config`** (config del agente por línea): `(linea_id, estado [apagado|sombra|encendido], nombre_agente, prompt, modelo, actualizado_por, actualizado_at)`.
- **`agente_herramientas`** (qué acciones tiene prendidas cada línea): `(id, linea_id, clave, nombre, descripcion, riesgo, activa, orden)`.
- **`agente_actividad`** (bitácora de lo que hace): `(id, linea_id, telefono, tipo, resumen, created_at)`.
- Nuevas columnas en **`conversaciones_whatsapp`**: `agente_activo` (bool, el botón 🤖 prende el agente en ese chat) y `agente_procesando_at` (timestamp, el candado anti-mensaje-doble).
- Nueva columna en **`mensajes_whatsapp`**: `responde_a` (id/wa del mensaje citado, para mostrar la cita). Las **notas** del agente se guardan aquí mismo con `direccion='nota'`.

Índices pensados para **escala (50k–100k chats por línea)**: por `linea_id`, por `ultimo_at`, parcial de "sin respuesta", etc.

## 4. Arquitectura — Endpoints (carpeta `api/whatsapp/`)
- **`recibir.js`** — webhook (el "timbre"). GET = verificación; POST = mensajes + acuses. Detecta la línea por `value.metadata.phone_number_id`. **Todas las líneas usan la misma URL de webhook.**
- **`enviar.js`** — enviar texto (token/número de esa línea).
- **`conversaciones.js`** — lista de chats de una línea (filtro sin-respuesta + conteo, adjunta etiquetas). Solo trae chats con `ultimo_at` no nulo.
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
- **`agente-responder.js`** — **MOTOR** del agente (el que de verdad responde). Lo dispara el webhook. Conversa con Claude usando las 10 herramientas, con supervisor Opus para las acciones de plata/inventario, transcribe audios con Whisper, deja notas en el chat y tiene candado anti-duplicado. **Es el archivo más importante del agente; todo el detalle en §8.**
- **`recibir.js`** (webhook) ahora, además de guardar el mensaje, **dispara el motor** si el agente está activo (`dispararAgenteSiActivo` → `fetch` al motor con el secreto interno y corte a 1.5s) y captura la **cita** (`m.context.id → responde_a`).
- **libs**: `lib/whatsapp.js` (`resolverLinea`, `enviarTexto`, `enviarImagen`, `enviarImagenPorId`, `enviarDocumento` [PDF de la resolución], `descargarMediaBase64`, `configWhatsapp`), `lib/comprobante.js` (`extraerDatos` — lee comprobante con Claude, solo lectura), `lib/asesores.js` (`esGerencia`, `esMateo` [agente solo-Mateo], `lineasDeAsesor`, `puedeVerLinea`; **GERENCIA = ['mateo','alejo plata']**, editable ahí). El motor reusa además `lib/numeros-disponibles.js`.

Se REUSAN (no se reescriben) endpoints de plata del Admin: `/api/admin/abono` (abonar) y `/api/admin/eliminar-abono` (se **modificó** para que borrar una parte de un pago repartido borre todas y libere la transferencia — también beneficia al Admin).

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
Usa "tool use" de Claude: en vez de inventar, llama funciones reales. Son 10 y cada una se
**prende/apaga** desde la cabina (`agente_herramientas`):
1. **enviar_contacto_inicial** — saludo + fotos de la casa + cierre (precio, legalidad, responde
   su pregunta y "¿Te explico los premios?"). Lo redacta la IA y va en UN solo cierre para no
   duplicar mensajes.
2. **consultar_disponibles** — trae una MUESTRA de números libres (no son todos; cambia cada vez).
3. **verificar_disponibilidad** — revisa si un número puntual (ej. 1234) está libre u ocupado.
4. **consultar_cliente** — boletas y saldo de un teléfono.
5. **enviar_resolucion** — manda el PDF de EDSA (`/resolucion.pdf`) como prueba legal.
6. **apartar_numero** — reserva una boleta (pide número+nombre+apellido+ciudad). *Sensible.*
7. **enviar_boleta** — manda la boleta digital con su enlace.
8. **registrar_abono** — registra un pago (solo con comprobante verificado). *Sensible.*
9. **liberar_boleta** — cancela una boleta si el cliente ya no quiere (y no ha abonado). *Sensible.*
10. **pasar_a_humano** — entrega el chat a un asesor y se apaga.

### 8.5 Supervisor Opus para lo que mueve plata o inventario
Las 3 acciones *sensibles* (apartar, abonar, liberar) **NO se ejecutan solas**: antes, un
**supervisor Opus** (`claude-opus-4-8`) revisa la conversación y la decisión y responde
"APRUEBO" o "RECHAZO: motivo". Si rechaza, no se hace y queda nota. La conversación normal corre
en el modelo configurado (Sonnet, más rápido/barato); solo las decisiones de plata suben a Opus
(el modelo más cuidadoso). Si Opus está caído, no bloquea (los otros candados —pago real, dueño
de la boleta— siguen protegiendo). Cambiar de modelo **NO borra la memoria**: el contexto es el
mismo historial del chat; solo cambia "quién" piensa esa decisión puntual.

### 8.6 Abono "anti-fraude" y liberar (reúso de lo ya probado)
- **registrar_abono** NO le cree a la foto del cliente. Reusa la lógica del Admin: toma el último
  comprobante (imagen) del chat → `/api/whatsapp/buscar-pago` lo compara contra las
  **transferencias reales** del banco → solo si hay coincidencia real (`sugerida_id`) abona con
  `/api/admin/abono`. Si no coincide, NO abona y pasa a un asesor. Decisión de Mateo: **solo con
  pago real verificado** (nada de abonar por una foto).
- **liberar_boleta** solo cancela si la boleta es de ese cliente y **no tiene nada abonado**
  (`total_abonado=0`); si ya pagó algo, NO la libera (un asesor gestiona la devolución). Reusa
  `/api/admin/liberar-boleta`.
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
- **Soltarlo con clientes reales** (hoy es solo-Mateo, solo-su-chat) cuando Mateo lo decida.
- **Conectarlo a las líneas grandes** (Línea 1 y Línea 2); hoy solo se prueba en la línea
  "Compra con Lili".
- Afinar el `prompt` (su manual de ventas) con la experiencia real.
- Posible: subir `maxDuration` si el combo abono+Opus+buscar-pago se vuelve lento.
- Quitar el simulador `probar` de la cabina (ya no se usa la tarjeta, pero el código sigue ahí).
- "Agrupar mensajes": juntar varios mensajes seguidos del cliente antes de responder (hoy el
  candado evita pisarse, pero no agrupa a propósito) — el viejo dolor de ChateaPro/Manychat.

## 9. Pendientes / próximos pasos
- **Agente de IA** → **HECHO** (ver §8); pendientes propios del agente en §8.12.
- ~~Difusiones / broadcasts (con plantillas aprobadas por Meta)~~ → **HECHO** (menú Difusiones: Plantillas + Campañas). Pendiente de pulir: más filtros de audiencia, programar envíos (cron), pegar lista propia de números, y para audiencias muy grandes (decenas de miles) mover el "preparar" a un proceso en segundo plano.
- **Enviar fotos/archivos sueltos** desde la barra del chat (hoy el asesor solo escribe texto a mano; las imágenes salientes ya funcionan, pero únicamente vía las **respuestas rápidas** por URL, no subiendo un archivo desde el computador).
- **Búsqueda de chats en servidor** (hoy el buscador de Chats filtra solo sobre los ~300 cargados; el de Contactos ya es server-side).
- **Avisos de mensaje nuevo** (sonido/insignia) y marcar qué asesor atiende.
- **Plantillas** para escribir fuera de la ventana de 24h.
- Migrar las **líneas grandes** (Línea 1, Línea 2) cuando se decida (es el "corte" desde ChateaPro).
- Mover la lógica pesada de venta del Admin a la bandeja si se quiere todo integrado (ya se empezó: verificar/abonar/ficha).

## 10. Cómo trabajar (recordatorio)
- Publicar: `git push origin main` → Vercel despliega ~1 min. Verificar en vivo.
- Build de JSX (esbuild) corre solo en el deploy de Vercel; localmente faltan `node_modules` (instalar esbuild si se necesita compilar para verificar).
- Tocar lógica de plata o esquema → explicar y confirmar con Mateo primero.
