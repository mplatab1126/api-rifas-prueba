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
- **libs**: `lib/whatsapp.js` (`resolverLinea`, `enviarTexto`, `descargarMediaBase64`, `configWhatsapp`), `lib/comprobante.js` (`extraerDatos` — lee comprobante con Claude, solo lectura), `lib/asesores.js` (se agregó `esGerencia`, `lineasDeAsesor`, `puedeVerLinea`; **GERENCIA = ['mateo','alejo plata']**, editable ahí).

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

## 8. Pendientes / próximos pasos
- **Agente de IA** (auto-responder con Claude; "agrupar mensajes": juntar varios mensajes seguidos del cliente antes de responder — el gran dolor de ChateaPro/Manychat).
- ~~Difusiones / broadcasts (con plantillas aprobadas por Meta)~~ → **HECHO** (menú Difusiones: Plantillas + Campañas). Pendiente de pulir: más filtros de audiencia, programar envíos (cron), pegar lista propia de números, y para audiencias muy grandes (decenas de miles) mover el "preparar" a un proceso en segundo plano.
- **Enviar fotos/archivos sueltos** desde la barra del chat (hoy el asesor solo escribe texto a mano; las imágenes salientes ya funcionan, pero únicamente vía las **respuestas rápidas** por URL, no subiendo un archivo desde el computador).
- **Búsqueda de chats en servidor** (hoy el buscador de Chats filtra solo sobre los ~300 cargados; el de Contactos ya es server-side).
- **Avisos de mensaje nuevo** (sonido/insignia) y marcar qué asesor atiende.
- **Plantillas** para escribir fuera de la ventana de 24h.
- Migrar las **líneas grandes** (Línea 1, Línea 2) cuando se decida (es el "corte" desde ChateaPro).
- Mover la lógica pesada de venta del Admin a la bandeja si se quiere todo integrado (ya se empezó: verificar/abonar/ficha).

## 9. Cómo trabajar (recordatorio)
- Publicar: `git push origin main` → Vercel despliega ~1 min. Verificar en vivo.
- Build de JSX (esbuild) corre solo en el deploy de Vercel; localmente faltan `node_modules` (instalar esbuild si se necesita compilar para verificar).
- Tocar lógica de plata o esquema → explicar y confirmar con Mateo primero.
