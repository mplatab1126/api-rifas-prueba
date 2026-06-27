# Mapa del Sistema — Los Plata S.A.S.

> **Qué es este archivo:** el "archivador" del proyecto. Aquí está el detalle de
> CADA página y CADA función del sistema, qué hace, qué tablas de la base de
> datos toca y qué servicios externos usa.
>
> **Para los chats de IA:** NO hace falta leer todo este archivo en cada chat.
> Ábrelo solo cuando necesites entender o tocar una parte específica. El manual
> corto (reglas de la casa) está en `CLAUDE.md`.
>
> **Regla de mantenimiento:** cuando termines un cambio que cree, borre o
> modifique de forma importante una página o función, **actualiza este archivo**
> antes de cerrar (la línea correspondiente y, si aplica, la fecha de abajo).
>
> Última actualización: 2026-06-11

---

## 1. Cómo está organizado el proyecto

| Carpeta | Qué contiene |
|---|---|
| `public/` | Todo lo que se ve en el navegador: páginas (`.html`), estilos (`.css`) y código de pantalla (`.js` / `.jsx`). |
| `api/` | El "cerebro" en el servidor: cada archivo `.js` es una función que hace algo (vender, abonar, enviar WhatsApp, etc.). |
| `api/lib/` | **Piezas reutilizables.** Herramientas compartidas que usan muchas funciones. Antes de crear algo nuevo, revisa aquí si ya existe. |
| `sql/` | Definiciones de tablas de la base de datos (Supabase). |
| `scripts/` | Utilidades de construcción (ej: convertir `.jsx` a `.js`). |
| `docs/` | Documentación: este mapa, la `BITACORA-DE-DECISIONES.md` (el porqué de las decisiones), `PENDIENTES.md` (tareas a medias entre chats) y `COMO-TRABAJAR-CON-IA.md` (la guía de Mateo con las frases de inicio/cierre de cada chat). |

**Importante sobre los archivos `.jsx` y `.js` en `public/`:** muchos vienen en
pareja (ej: `house-app.jsx` y `house-app.js`). El `.jsx` es el que se escribe a
mano; el `.js` se genera **solo** con el comando de construcción
(`scripts/build-jsx.mjs`). **Nunca se edita el `.js` a mano** — se edita el
`.jsx` y se reconstruye. Archivos `.js` que NO tienen pareja `.jsx`
(ej: `admin.js`, `ui-modal.js`, `shared-nav.js`) sí se escriben a mano.

---

## 2. Páginas (lo que se ve en el navegador) — `public/`

### Páginas que ven los clientes (públicas, sin clave)

| Página | Para qué sirve |
|---|---|
| `index.html` | Página de entrada / home de la rifa. |
| `comprar-la-plata-house.html` | Flujo de compra/reserva de boleta. |
| `abonar.html` | El cliente paga el saldo pendiente de su boleta. |
| `boleta.html` | El cliente consulta su boleta con el teléfono. |
| `sorteo-en-vivo.html` | **Sorteo final en vivo.** Al cerrar cada rifa, el cliente se registra con su número de boleta para participar por premios sorpresa ($1.000.000 x3) que se anuncian en el en vivo de Facebook. Conecta con `registro-sorteo.js`. Es una **plantilla reutilizable**: el nombre de la rifa, la fecha del en vivo y el link de Facebook se cambian dentro del archivo. *(Antes `home-sorteo-apartamento.html`; rediseñada al estilo de marca el 2026-06-06.)* |
| `canales-oficiales.html` | Lista de canales verificados (redes, WhatsApp, cuentas de pago). **2026-06-10** (H24): incluye la cuenta autorizada de Maria Buitrago (Nequi/Daviplata/Bre-B 3128732266 — la que cobra Liliana) y el aviso anti-estafas de la portada remite aquí. OJO: las páginas cargan los `.js` compilados — tras editar un `.jsx`, correr `npm run build`. |
| `terminos-y-condiciones.html` | Términos y condiciones legales. |

> **Responsive — vista de computador (2026-06-06):** las páginas de cliente
> (`sorteo-en-vivo`, `comprar-la-plata-house`, `abonar`, `boleta`) se ven bien en
> celular y en computador. En pantallas anchas se muestran como columna/tarjeta
> centrada sobre fondo crema (reglas CSS **solo de computador**, `@media min-width:768px`;
> el celular no cambió). Las **páginas internas NO se tocaron** (decisión de Mateo). El
> "hub" (`index`, `canales`, `términos`, vía `hub-styles.css`) ya era responsive.

### Páginas internas (asesores y gerencia, con clave)

| Página | Quién la usa | Para qué sirve |
|---|---|---|
| `admin.html` | Asesores | Centro principal: buscar boletas, vender, abonar, leer comprobantes con IA, conciliación bancaria, devoluciones, bitácora, vista "Disponibles" (todos los números libres, agrupados por serie y con buscador; usa `/api/disponibles?lista=todas`, solo lectura). |
| `caja.html` | Asesores / gerencia | Cuadre de caja del día, gastos, ingresos, búsqueda de transferencias. Una Salida puede ser "Pasar dinero a la Caja de Papá" (traslado interno: baja Caja Oficina, sube Caja Papá; solo meter, no gastar). Ver bitácora 2026-06-27. |
| `rifas.html` | Solo Mateo | Centro financiero: rifas, premios, recapitalización entre socios, capital. **Sensible.** |
| `rendimiento.html` | Gerencia | Métricas de asesores, Facebook Ads, WhatsApp, embudo de ventas, análisis con IA. |
| `estado-resultados.html` | Gerencia | Estado de resultados financiero (ingresos, gastos, ganancia/pérdida). |
| `llamadas.html` | Asesores | Llamadas automáticas de cobro y rescate de WhatsApp. |
| `sorteo.html` | Asesores autorizados | Sorteo en vivo: selección y anuncio del ganador. |
| `bandeja-whatsapp.html` | Asesores / gerencia | Bandeja de WhatsApp: conversaciones, contactos, plantillas, difusiones, agente IA. |
| `calendario.html` | Asesores | Ver horarios semanales. |
| `admin-horarios.html` | Gerencia | Crear y gestionar horarios de asesores. |
| `permisos.html` | Solo Mateo | Gestión de permisos de cada asesor. |
| `finanzas-alejo.html` | Solo Alejo | Panel personal de finanzas de Alejo (separado del negocio). |
| `rendimiento-contenido/` | Gerencia | Tablero de contenido: anuncios de Meta, Instagram, contenidos top, generador de copy con IA. |

### Grupos de archivos de pantalla (componentes)

Estos `.jsx`/`.js` arman las páginas públicas:

- `house-*` → la app de compra de boleta (landing + pasos + datos).
- `abonar-*` → el flujo de abonar (pasos + datos + íconos).
- `comprar-*` → pasos de compra reutilizados.
- `canales-*` → la página de canales oficiales.
- `hub-*` → el home/landing central.
- `ver-house-*` → la consulta "ver mi boleta".
- `terms-*` → la página de términos.
- `index-page.*` → lógica del home.

Compartidos por varias páginas:
- `nav-menu.*` → menú de navegación (páginas públicas).
- `shared-nav.js` → navegación con login (páginas internas, escrito a mano).
- `shared-footer.*` → pie de página común.
- `tweaks-panel.*` → panel de ajustes/pruebas.
- `ui-modal.js` → ventanas emergentes bonitas (escrito a mano).

---

## 3. El cerebro en el servidor — `api/`

### Piezas reutilizables — `api/lib/` (¡revisa aquí antes de crear algo nuevo!)

| Pieza | Qué hace | Qué tan usada |
|---|---|---|
| `supabase.js` | Conexión a la base de datos. **Desde 8-jun-2026 el backend usa la LLAVE MAESTRA** (`SUPABASE_SERVICE_ROLE_KEY`) en ambos clientes; pasa por encima de RLS, que está PRENDIDO en todas las tablas. **No borrar esa variable en Vercel.** | **Crítica** — la usa todo. |
| `auth.js` | Valida la contraseña del asesor (`ASESORES_SECRETO`). | **Crítica** — 40+ funciones. |
| `cors.js` | Seguridad del navegador: solo deja entrar dominios autorizados. | **Crítica** — 40+ funciones. |
| `whatsapp.js` | Cliente de WhatsApp (Meta): enviar texto/imagen/plantilla/documento, subir y bajar archivos. | **Crítica** — 26+ funciones. |
| `asesores.js` | Permisos: quién es gerencia, quién ve qué línea, quién es independiente. | **Alta** — 20+ funciones. |
| `telefono.js` | Limpia y normaliza teléfonos (agrega 57, detecta duplicados). | **Alta**. |
| `comprobante.js` | Lee comprobantes bancarios con IA (monto, referencia, fecha). **2026-06-09**: modelo actualizado a `claude-sonnet-4-6` (el anterior se retiraba el 15-jun; también en `procesar-ia.js`, `procesar-ia-gasto.js` y `analisis-ia.js`). | **Media**. |
| `abono-agente.js` | Verifica un comprobante contra los pagos reales y abona si hay match sólido (misma lógica probada). La usan el agente y el cron de reintentos de pago. **2026-06-09**: resuelve el actor real (Liliana) ANTES de buscar el pago y se lo pasa a `buscar-pago` (fix del bug que botaba pagos como "sin saldo"; ver bitácora). **2026-06-10** (H30/H44): al abonar marca la foto "✅ pago asignado" (`marcarComprobanteAsignado` vive aquí ahora) y acepta `mediaBase64` opcional para no re-descargar el comprobante de Meta. | **Media**. |
| `secreto-interno.js` | **2026-06-10** (H39): el secreto interno servidor-a-servidor (`AGENTE_INTERNO_SECRET`, comparación a tiempo constante). `secretoInterno()` para los emisores (webhook→motor, crons, motor→reservar) y `esSecretoInternoValido()` para los validadores. Si se rota el secreto: Vercel + los 4 pg_cron JUNTOS (ver bitácora 10-jun). | **Alta** — lo usan 8 archivos. |
| `plantilla-vars.js` | **2026-06-13**: rellena las variables `{{1}} {{2}}…` de las plantillas de WhatsApp. Tokens: `{nombre}` `{apellido}` `{telefono}` `{ciudad}` `{abonado}` `{restante}` `{boleta}`. Los datos de cliente/boletas los trae la función de base `difusion_datos_cliente` EN EL MOMENTO del envío (saldo al día). La usan `difusiones.js`, `difusion-envio.js` y `plantillas.js` (antes cada uno tenía su propia copia de `resolverParametros`). | **Media**. |
| `etiquetas.js` | Pone etiquetas a conversaciones de WhatsApp (sin duplicar). | **Media**. |
| `auth-app.js` | Valida la sesión de la app móvil (token). | **Media**. |
| `configuracion.js` | Interruptores globales del sistema (encender/apagar funciones). | **Baja**. |
| `numeros-disponibles.js` | Escoge ~50 boletas disponibles al azar para mostrar. | **Baja**. |
| `rate-limit.js` | Límite de tasa genérico (cuenta en la base con `rate_limit_check`; FAIL-OPEN: si el contador falla, permite). **2026-06-10** (H20/H40): lo usan `cliente.js`, `abonar/cliente.js` y el disparo del motor en `recibir.js`. | **Media**. |

### Admin — `api/admin/` (lo que mueve el panel de asesores)

**Ventas, abonos y boletas:** `venta.js`, `abono.js`, `eliminar-abono.js`,
`trasladar-abono.js`, `liberar-boleta.js`, `marcar-devolucion.js`,
`lista-boletas.js`, `historial.js`, `buscar.js`, `rifas-disponibles.js`.

**Dinero y caja:** `caja.js`, `finanzas.js`, `transferencias.js`,
`buscar-transferencia-ia.js`, `buscar-referencia.js`, `conciliar-consolidado.js`,
`plataformas.js`.

**Comprobantes con IA:** `procesar-ia.js` (comprobantes de pago),
`procesar-ia-gasto.js` (comprobantes de gasto).

**Llamadas de cobro (Twilio + ElevenLabs):** `difusion-llamadas.js`,
`llamadas-automaticas.js`, `marcar-llamada.js`, `marcar-cobro.js`,
`grabacion.js`.

**Rendimiento y sincronización:** `estadisticas.js`, `vendedor-metricas.js`,
`analisis-ia.js` (Claude), `sincronizar-agentes.js`, `sincronizar-whatsapp.js`,
`sincronizar-facebook.js`, `estado-facebook.js`, `rescate-whatsapp.js`,
`sin-etiqueta.js`.

**Rifas y sorteo:** `rifas.js` (centro financiero — **sensible**),
`sorteo-ganador.js`.

**Gestión y configuración:** `login.js`, `permisos.js`, `asesores-config.js`,
`configuracion.js`, `horarios.js`, `bitacora.js`, `actualizar-cliente.js`,
`ultimos-movimientos.js`.

### WhatsApp — `api/whatsapp/` (la bandeja y el agente IA)

**Bandeja (mensajes):** `recibir.js` (el "timbre": webhook de Meta que recibe
mensajes), `enviar.js`, `enviar-archivo.js`, `enviar-boleta.js` (**2026-06-07**: manda la boleta
como TEXTO normal dentro de las 24h —gratis, encabezado según estado de pago— y solo usa plantilla
fuera de 24h; plantilla `boleta_cliente_v2` con 1ª línea variable), `mensajes.js`,
`conversaciones.js` (**2026-06-07**: el filtro avanzado de la bandeja corre en la base con la
función `bandeja_filtrar`), `recordatorios.js` (**2026-06-07**: lee los recordatorios pendientes de
un chat para mostrarlos en la bandeja), `marcar-respondido.js` (**2026-06-08**: marca un chat como
respondido sin escribirle —pone `ultimo_entrante=false`, lo saca de "sin respuesta"—; lo usa el menú
**⋮** del chat, que reúne "Marcar como respondido" y "Eliminar contacto" dejando etiqueta/recordatorios/
ficha a primer toque), `media.js`, `comprobantes.js` (**2026-06-09**: lista las fotos de pago que mandan
los clientes con su estado ✅ asignado / ⏳ sin asignar — la usa el menú **Comprobantes**, paginada en
servidor), `marcar-comprobante.js` (**2026-06-09**: marca una foto como "pago asignado" tras un abono manual).

**Contactos y etiquetas:** `contactos.js`, `contacto-crear.js`,
`contacto-eliminar.js`, `contactos-importar.js`, `etiquetas.js`, `cliente.js`.

**Difusiones y plantillas:** `difusiones.js` (**2026-06-08**: filtros de público clientes/potenciales/saldo/
ciudad, acción **programar** a una hora, y casilla **"Liliana atiende"**), `difusiones-cron.js` (**2026-06-08**:
envía las difusiones programadas por tandas), `lib/difusion-envio.js` (núcleo de envío compartido),
`plantillas.js`, `respuestas-rapidas.js`.

**Flujos (constructor visual · solo Mateo · 2026-06-13):** sección "Flujos" en la bandeja para dibujar
conversaciones con cajitas (estilo ManyChat), portada del prototipo del SaaS. Piezas: `flujos.js`
(endpoint: listar/obtener/crear/guardar/duplicar/eliminar), pantalla `public/flujos-bandeja.js` +
`#modFlujos` en `bandeja-whatsapp.html` (usa la librería Drawflow por CDN), tablas `flujos` y
`flujo_sesiones` (ver `sql/flujos.sql`). **FASE 1**: dibuja, guarda y prueba en simulador.
**FASE 2 (motor, hecha):** `api/lib/flujo-motor.js` ejecuta el flujo con clientes reales por WhatsApp,
enganchado en `recibir.js` antes de Liliana (flujo O Liliana, nunca los dos). Botones interactivos vía
`enviarBotones`/`enviarLista` (`api/lib/whatsapp.js`). NO hay interruptor global de motor (se quitó el
13-jun por simplicidad): los flujos corren cuando un **Disparador** los activa. **Candados de seguridad
(22-jun):** solo arranca un flujo en estado `activo` (un borrador sin guardar no sale en vivo); tope de
10 saltos entre flujos (anti-bucle); y **candado anti-duplicado** (`procesando_at` + funciones
`flujo_tomar_lock`/`flujo_soltar_lock`, `sql/flujos-candado.sql`) para que dos copias no manden mensaje
doble. Falta Fase 2b (timeout "no respondió") y revisar el envío fallido (#2). Ver bitácora 22-jun.
El **disparador NO vive en el flujo**: se administra en **Disparadores** (ver abajo). El motor expone
`procesarFlujo` (avanza sesión en curso) e `iniciarFlujoPorId` (arranca un flujo); el despacho central
está en `recibir.js` (`despachar`). Faltan 2 formas de iniciar: manual desde el chat y por difusión.

**Disparadores (reescrito 2026-06-13):** panel con DOS pestañas — **Palabras clave** y **Acciones**
(cliente nuevo, etiqueta aplicada). Cada regla tiene switch y **destino**: arranca un **flujo** (cuál) o
prende el **agente** (Liliana). Piezas: `api/whatsapp/disparadores.js`, sección `#modDisparadores` en
`bandeja-whatsapp.html`, tabla `disparadores` (+`destino`,`flujo_id`,`evento_valor`, ver
`sql/disparadores-destino.sql`). El evento "etiqueta aplicada" lo dispara `api/whatsapp/etiquetas.js`.

**Integraciones (solo Mateo · 2026-06-13):** sección "Integraciones" en la bandeja para conectar
**Google Sheets** (enlace público, lectura) y **Supabase** (URL+llave+tabla, lectura/escritura) y que
los flujos usen esos datos. Piezas: `api/whatsapp/integraciones.js` (listar/guardar/probar/eliminar;
enmascara las llaves), `public/integraciones-bandeja.js` + `#modIntegraciones`, tabla `integraciones`
(ver `sql/integraciones.sql`). **FASE A+B (hechas):** conectar + **mapear columnas a campos estándar**
(`api/lib/integracion-datos.js`, lista `CAMPOS_ESTANDAR`; agrega por_boleta/por_cliente) + **ficha del
chat** (`fichaIntegracion()` muestra los datos en el panel derecho) + los **flujos** cargan esos campos
para usarlos en condiciones. Las llaves viven solo en el backend. Falta Fase C (flujos escriben). Ver bitácora 13-jun.

**Agente de IA (Claude):** `agente.js` (cabina de control; **2026-06-08**: el botón **🤖 por chat** lo
puede usar el **dueño de la línea** (Liliana), no solo Mateo —la cabina/costos/disparadores siguen solo
gerencia—; y al prender el agente **dispara la respuesta desde el SERVIDOR**, ya no depende del navegador),
`agente-responder.js`
(el motor que conversa y ejecuta acciones; **2026-06-08**: **caché de prompt a 1 HORA** + **saludo
predefinido SIN IA** en el primer contacto genérico —ahorro de tokens—, **festivos de Colombia** calculados
para saber cuándo no se puede visitar la casa, **llave propia** `ANTHROPIC_API_KEY_LILIANA`, y se le
**quitó el supervisor Opus** de movimientos —ya estaba inactivo—; ver bitácora),
`agente-costo.js` (cuánto cuesta en dólares), `disparadores.js` (palabras que prenden el agente),
*(el supervisor `qa-agente-cron.js` se **ELIMINÓ** el 2026-06-08, ver bitácora),*
`recordatorios-cron.js` (recordatorios del agente cada minuto; **2026-06-06**: también a
DÍAS — al vencer, si la ventana de 24h ya se cerró, manda la plantilla `seguimiento_los_plata`
para reabrir la conversación; si sigue abierta, texto normal. Ver bitácora),
`verificar-pagos-cron.js` (**2026-06-07**: verificación de pagos con reintentos — cada ~15 min hasta
~1h reintenta buscar el pago; abona solo si aparece de forma sólida; pg_cron `verificar-pagos-cada-5min`.
**2026-06-09: al AGOTAR los intentos, Liliana se apaga y pasa a humano EN SILENCIO —etiqueta ASESOR—, ya
NO manda un 2º aviso al cliente.** Ver bitácora),
`abono-reparto.js`, `buscar-pago.js` (**2026-06-09**: acepta `asesorRegistro` —solo gerencia— y evalúa
`puede_modificar` con el grupo del actor REAL, no del que autentica; fix del abono del agente, ver bitácora).
**Nuevos 2026-06-10 (ver bitácora):**
`alertas-cron.js` (H16: cada 15 min revisa la salud del agente —clientes esperando >15 min, chats en
manos de asesor >30 min, errores nuevos, verificaciones rendidas, gasto anómalo— y avisa al WhatsApp
de Mateo; resumen diario 8 p.m.; pg_cron `alertas-agente-cada-15min` jobid 7; memoria en
`agente_alertas_estado`; respaldo plantilla `alerta_sistema_los_plata`),
`probar-suite.js` (H14: corre la SUITE DORADA —`agente_casos_dorados`— contra el manual de producción
o un candidato sin guardarlo; solo gerencia; correrla SIEMPRE antes de publicar cambios del manual;
desde 2026-06-11 evalúa los regex SIN asteriscos de negrita — "una cosa *o* la otra" cuenta igual
que "una cosa o la otra").

**Novedades (2026-06-10, H35):** tarjeta **"Embudo de ventas"** en la cabina (7/30 días) — función
`agente_embudo_resumen` (`sql/embudo-liliana.sql`, solo service_role) + acción `embudo` en
`agente-costo.js`. Cuenta teléfonos únicos por hito (notas de `agente_actividad`) y plata real
(boletas/abonos del asesor de la línea).

**Novedad (2026-06-11):** H65 — atajo del paso datos cuando el cliente responde SOLO un número
de 4 cifras que estaba en la lista recién mostrada (sin IA; pre-chequeo H60 intacto). H81 ACTIVO
(la clave "Liliana" existe en ASESORES_SECRETO: el agente ya no viaja con la llave de gerencia).

**Novedades (2026-06-10 tanda 12; detalle en la bitácora):** H76 — `verificarYAbonar` devuelve
`boleta_no_coincide` (la IA pregunta el destino; el cron pasa a ASESOR) en vez de abonar a la
boleta de número más bajo; prioriza saldo EXACTO al monto cuando no hay número pedido. H70 —
`esMismoTelefono` (cola mutua, mínimo 10 dígitos) en `api/lib/telefono.js`, aplicada en motor,
buscar-pago y trasladar-abono.

**Novedades (2026-06-10 tanda 11; detalle en la bitácora):** H68 — `liberar-boleta.js` con
liberación ATÓMICA cuando llama el agente (`soloSiSinAbonos`+`telefonoEsperado`) + el motor
cancela verificaciones antes de liberar; H81 — `contrasenaAgente()` en `api/lib/abono-agente.js`
(clave dedicada del agente, respaldo a gerencia; falta agregar la clave "Liliana" en Vercel);
H75 — el simulador 'probar' de la cabina se ELIMINÓ; H74 — debounce a pasos de 6s; H83 —
agente_config leída una vez + lecturas en paralelo. N3 — el historial siempre cierra con mensaje
de usuario (la API rechaza "assistant prefill"); N4 — visor: "✅ Caso CERRADO" si hay abono
posterior a la rendición.

**Novedades (2026-06-10 tanda 10 + N2; detalle en la bitácora):** N2 — endpoint
`api/whatsapp/verificaciones.js` (lectura del relojito de pagos) + tarjeta "💳 Verificación del
pago" en la ficha de la bandeja (todos los perfiles); H54+H73 — recordatorios durables (claim
sin consumir, 'enviado' solo tras enviar, 3 reintentos, maxDuration explícitos); H71 — los
reintentos de Meta (duplicados) ya no re-ejecutan efectos; H49 — el cierre del contacto inicial
pide el próximo sorteo; H72 — rastro cuando una línea sin asesor cae al respaldo "Liliana".

**Novedades del motor (2026-06-10 tanda 9, verdes — costos/velocidad; detalle en la bitácora):**
H63 — el array de tools ya no se filtra (un solo prefijo de caché; el candado del contacto
inicial vive en la ejecución); H66 — bloque `INSTRUCCIONES_FIJAS` cacheado (breakpoint movido
ahí); H67 — acciones hechas: sin lecturas, dedupe (última ocurrencia) y tope 12; H85 —
`resolverLinea` memoizada 60s (`api/lib/whatsapp.js`); H86 — un disparo del motor por
conversación por webhook + maxDuration de recibir.js; H87 — RPC `agente_lock_y_ultimo`
(`sql/agente-lock-y-ultimo.sql`) para el debounce en una ida; H89 — audios en paralelo.

**Novedades del motor (2026-06-10 tanda 8, verdes — atajos sin IA más conservadores; detalle en
la bitácora):** H56 — `intentoSeparar` rechaza negaciones y dos números; H57 — `numeroBoleta()`
no recorta 5+ cifras en silencio (4 ejecutores); H60 — el atajo de datos verifica que el número
siga libre antes de pedirlos; H50+H59 — clientes registrados (`estadoCliente.cli`) van a la IA,
no al saludo genérico ni a los atajos del embudo; H55 — multimedia por tipo real → IA; H51 — el
texto de números ya no ofrece "terminaciones"; H52 — saludo de respaldo neutro (sin "Liliana" en
duro); H61 — pie de imagen neutro (sin sesgo a "comprobante").

**Novedades del motor (2026-06-10 tanda 7, verdes; detalle en la bitácora):** H62 — bandera
`huboTexto`: un turno nunca cierra sin decirle NADA al cliente (cierre forzado solo-texto +
mensaje fijo de respaldo); H58 — despedida fija si falla la 2ª llamada de `pasar_a_humano`;
H79 — audio sin transcribir deja nota + instrucción "no adivines" (y error si falta
OPENAI_API_KEY); H78 — `limpiarDatoCliente` sanea nombre/apellido/ciudad contra inyección de
instrucciones; H80 — contacto inicial sin fotos deja ERROR en actividad (respuesta rápida
renombrada/borrada/duplicada); H77 — apagar el 🤖 cancela recordatorios pendientes y el cron
de plantilla verifica `agente_activo`.

**Novedades del motor (2026-06-10 tanda 6; detalle en la bitácora):** H27 — `registrar_abono` prueba las
últimas 3 fotos recientes (≤48h, sin pago_asignado) en vez de la última a ciegas, y la verificación guarda
la foto RECONOCIDA; H32 — candado anti "comprobante prestado" en `lib/abono-agente.js`
(`celularDeOtroCliente`): referencia con celular de OTRO cliente registrado → `'retenido'` para asesor
(turno avisa "en revisión"; el cron lo cierra como rendido sin reintentar).

**Novedades del motor (`agente-responder.js`, 2026-06-10 tanda 5; detalle en la bitácora):** debounce
adaptativo (H42: ~10s para el primer contacto que resuelve el saludo fijo, re-validado; tope total 4→2 min),
timeouts en TODAS las llamadas externas (H34: IA 90s con reintento, Whisper 30s, Meta 30-60s en `lib/whatsapp.js`,
internas 120s; el abono con timeout devuelve 'demorado' → verificación automática, nunca "falló"), fotos en
paralelo + 2º punto de caché al final del historial (H43+H84: vueltas 2+ y el turno siguiente leen a 0.1×).

**Novedades del motor (`agente-responder.js`, 2026-06-10; detalle en la bitácora):** robustez completa
(reintento de IA, catch global sano, refresco del candado en el bucle, auto-redisparo, envíos fallidos
visibles, re-claim de turnos muertos + barredor en `recordatorios-cron.js`), textos de la rifa en
`agente_config.variables` (H17, rotar sin deploy), candado anti pago falso v2 (5 patrones nuevos +
negación), boleta tras apartar la envía el SISTEMA (H46), `consultar_cliente` solo del chat (H23),
precios del caché 1h corregidos (H29), `TOOLS` exportadas para la suite dorada.

**Novedades del motor (`agente-responder.js`, 2026-06-09; ver bitácora):**
- **Candado anti "pago falso" v2:** detector `afirmaPagoHecho` preciso (excluye frases condicionales tipo
  "cuando esté pagada al 100%" o "es 100% legal") y `esContextoPago` — el candado SOLO se arma si hay
  comprobante o el cliente dijo que pagó. Arregla los falsos positivos del 9-jun.

**Novedades del motor (`agente-responder.js`, 2026-06-08; ver bitácora):**
- **Remisión al punto de venta:** funciones `analizarRemision` / `bloqueRemision`. Si el cliente que
  escribe a la línea de Lili tiene boleta vendida por OTRO (asesor que no es dueño de la línea, según
  `lineas_asesores`), no lo atiende: le da el número del punto donde compró (`asesores_config.numero_remision`).
  Las ventas por la WEB ("Pagina Web") cuentan como equipo → remiten al número del equipo.
- **No se presenta a clientes con boleta:** si el cliente ya tiene boleta(s) o hay que remitirlo, el código
  le QUITA la herramienta `enviar_contacto_inicial` (determinístico, no depende de que el modelo obedezca).
- **Acumulado se reinicia tras ganador:** `montoAcumProximo` agrupa por tipo de sorteo y solo arrastra el
  acumulado si el último del mismo tipo quedó acumulado; si tuvo ganador, el próximo va por su monto base.
- **Contador "sin leer":** `guardarEnChat` (saliente) pone `no_leidos=0` cuando el agente responde.
- **Saludo predefinido SIN IA (ahorro de tokens):** en el PRIMER contacto, si el mensaje lo resuelve el
  saludo (genérico, o pregunta de precio/abono/legalidad/cuándo juega), `enviarContactoInicial` manda el
  contacto inicial FIJO (saludo + fotos + cierre con el próximo sorteo) sin llamar a Claude. Decide
  `primerContactoLoResuelveSaludo` (a la IA solo si piden número, pago, disponibles, ubicación o premios).
  Caché de prompt con TTL de **1 hora** (`cache_control ttl:'1h'` + beta header). Ver bitácora.
- **Festivos de Colombia:** `festivoColombia`/`festivosDeAnio` (fijos + Ley Emiliani + Pascua) inyectan
  "hoy es festivo" para que sepa cuándo la casa NO se puede visitar. El horario/dirección de visita están
  en el manual (`agente_config.prompt`, sección "VISITAR LA CASA"). Hoy 8-jun = Corpus Christi.
- **Respuesta inmediata al prender el agente a mano:** `activar_conversacion` (en `agente.js`) dispara el
  motor desde el servidor si el último mensaje es del cliente (antes dependía del navegador y tardaba/no
  respondía). `lineas.js` devuelve `tiene_agente` por línea para mostrar el botón 🤖 solo donde aplica.

**Novedades del motor y la bandeja (2026-06-09; ver bitácora):**
- **Más mensajes predefinidos SIN IA (Fase 4):** además del contacto inicial, ahora también **premios**,
  **números disponibles** y **pedir datos** van sin Claude cuando el cliente SOLO asiente (o dice "quiero el
  NNNN"). Funciones `esAsentir(texto, paso)` / `intentoSeparar(texto)` en `agente-responder.js`. En la bandeja
  esos mensajes se rotulan **"📋 Mensaje predefinido"** (vs "🤖 Liliana"): `raw.predefinido` → `mensajes.js`
  → `bandeja-whatsapp.html`.
- **Eliminada la etiqueta AGENTE** y el etiquetado automático al prender el agente (`recibir.js`, `agente.js`),
  y el interruptor "ocultarle a Liliana los chats del agente" (`agente.js` acción `privacidad_liliana`,
  `conversaciones.js`, y la tarjeta "Privacidad de Liliana" en `bandeja-whatsapp.html`). Borrados de la base:
  la etiqueta AGENTE + sus 523 enlaces + la config `ocultar_agente_liliana`. (El parámetro `p_ocultar_agente`
  de `bandeja_filtrar` quedó sin uso, default `false`.) Se conserva la etiqueta **ASESOR**.
- **Manual de Liliana afinado** (`agente_config.prompt`, vive en la base): premios sin redundancia (4 cifras +
  opción $300M debajo del premio mayor, sin emojis); $300M/amoblado = una cosa O la otra; cédula/correo nunca
  "obligatorios" ni mandar a crear correo; clientes del exterior se registran con el número del chat; remisión
  más firme; dudas de saldo siempre respondidas; **extranjeros (PPT/pasaporte) participan Y reclaman**;
  limpiados los residuos del Sueldazo (se conserva que ya jugó y tiene ganadora). Se quitó el "un supervisor
  lo revisa" del paso de pago (el supervisor ya no existe). Ver bitácora.

**Funciones y tablas EN LA BASE (agente/bandeja, 2026-06-07):**
- Función `bandeja_filtrar(...)` — todo el filtrado avanzado de la bandeja (etiquetas con operador
  tiene/todas/no tiene, sin respuesta, recordatorio por estado, fecha de creación; combina Y/O).
- Tabla `verificaciones_pago` — cola de la verificación de pagos con reintentos.
- Columna `etiquetas.orden` — orden de las etiquetas elegido por Mateo (se respeta en todos lados).
- Funciones `difusion_audiencia(linea, filtros)` (audiencia de una campaña con filtros) y
  `difusion_reclamar_lote(difusion, limite)` (reclamo atómico del lote, sin doble envío) — **2026-06-08**.
- Cron `difusiones-programadas-cada-minuto` (jobid 6) — dispara `difusiones-cron.js`.

**Candados anti-duplicado del agente (funciones EN LA BASE DE DATOS):**
`agente_tomar_lock`, `agente_refrescar_lock`, `agente_claim_respuesta`,
`agente_soltar_lock`. `agente-responder.js` las llama por RPC para que una sola
copia de Liliana responda cada mensaje (antes mandaba el saludo varias veces).
Viven en la base —no en columnas— para no depender de la caché de esquema de
PostgREST. Ver bitácora 2026-06-06. Deben tener permiso `EXECUTE`.

**Líneas y conexión:** `lineas.js`, `conectar-linea.js`.

### Llamadas (Twilio + ElevenLabs) — `api/twiml/`

`cobro.js` (genera la llamada de cobro), `audio-elevenlabs.js` (voz clonada),
`estado-llamada.js` (recibe el resultado de la llamada).

### Página pública / ChateaPro — archivos sueltos en `api/`

`cliente.js`, `disponibles.js`, `buscar-boleta.js`, `verificar-boleta.js`,
`verificar-numero.js`, `subir-comprobante.js`, `registro-sorteo.js`.

### Compra y reserva pública — `api/rifa/`

`numeros.js` (muestra boletas disponibles), `verificar.js` (¿está libre este
número?), `reservar.js` (separa boletas sin pagar).

### Pagos en línea (Wompi) — `api/abonar/`

`iniciar-pago.js`, `wompi-webhook.js`, `transaccion.js`, `cliente.js`.

### App móvil — `api/app/` y `api/auth/`

App: `perfil.js`, `mis-boletas.js`, `historial-sorteos.js`,
`ganadores-principales.js`, `registrar-push-token.js`,
`enviar-notificacion.js` (Expo push).
Login app: `enviar-otp.js`, `verificar-otp.js`, `social-login.js`
(Google/Facebook), `vincular-telefono.js`.

### Contenido y marketing — `api/contenido/`

`copy-gen.js` (genera textos con Claude), `datos.js` (métricas de Meta/Instagram),
`presupuesto.js` (ajusta presupuesto de anuncios), `transcribir.js` (transcribe
audios de videos con Whisper).

### Finanzas personales de Alejo — `api/finanzas-alejo/`

`chat.js` (asesor financiero con Claude), `dashboard.js` (tablero personal).

### Configuración — `api/config/`

`precios.js` (precio de la boleta, centralizado).

---

## 4. Servicios externos que usa el sistema

| Servicio | Para qué |
|---|---|
| **Supabase** | Base de datos (todo se guarda aquí). |
| **Vercel** | Donde vive la app en internet. |
| **Anthropic (Claude)** | Análisis IA, lectura de comprobantes, agente de WhatsApp. |
| **Meta (WhatsApp Cloud API)** | Enviar y recibir mensajes de WhatsApp. |
| **Meta (Facebook/Instagram Ads)** | Métricas de publicidad y contenido. |
| **Twilio** | Llamadas telefónicas de cobro y mensajes OTP. |
| **ElevenLabs** | Voz clonada para las llamadas. |
| **Wompi** | Pagos en línea con tarjeta. |
| **OpenAI (Whisper)** | Transcribir audios de videos de marketing. |
| **Expo** | Notificaciones push de la app móvil. |
| **Google / Facebook OAuth** | Login social en la app móvil. |
| **ChateaPro** | (Integración heredada de WhatsApp; ver `CLAUDE.md`.) |

---

## 5. Candidatos a revisar (NO borrar sin confirmar con Mateo)

Cosas que *parecen* viejas o duplicadas. **No están confirmadas** — hay que
revisarlas una por una con Mateo antes de tocar nada:

- ~~`home-sorteo-apartamento.html`~~ — **RESUELTO (2026-06-06): NO era residuo.** Era la
  página del sorteo final en vivo; se rediseñó y se renombró a `sorteo-en-vivo.html`
  (ver bitácora). NO restaurar la vieja.
- `vendedores.html` — panel de métricas de vendedor que podría estar duplicado
  con `rendimiento.html`. Confirmar si todavía se usa.

> Nota: páginas como `estado-resultados.html`, `llamadas.html`, `calendario.html`,
> `permisos.html` y `finanzas-alejo.html` **SÍ son oficiales** y están en uso
> (ver `CLAUDE.md`). No son residuo.

---

## 6. Cómo mantener este mapa al día

1. Cuando un chat cree o borre una página o función importante, agrega o quita su
   línea aquí.
2. Si se descubre código que ya no se usa, anótalo en la sección 5 (no borrar de
   inmediato; confirmar con Mateo primero).
3. Actualiza la fecha de "Última actualización" arriba.
4. Mantén el `CLAUDE.md` corto: aquí van los detalles, allá solo las reglas.
