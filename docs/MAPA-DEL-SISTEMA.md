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
> Última actualización: 2026-06-06

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
| `canales-oficiales.html` | Lista de canales verificados (redes, WhatsApp, cuentas de pago). |
| `terminos-y-condiciones.html` | Términos y condiciones legales. |

### Páginas internas (asesores y gerencia, con clave)

| Página | Quién la usa | Para qué sirve |
|---|---|---|
| `admin.html` | Asesores | Centro principal: buscar boletas, vender, abonar, leer comprobantes con IA, conciliación bancaria, devoluciones, bitácora. |
| `caja.html` | Asesores / gerencia | Cuadre de caja del día, gastos, ingresos, búsqueda de transferencias. |
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
| `supabase.js` | Conexión a la base de datos. | **Crítica** — la usa todo. |
| `auth.js` | Valida la contraseña del asesor (`ASESORES_SECRETO`). | **Crítica** — 40+ funciones. |
| `cors.js` | Seguridad del navegador: solo deja entrar dominios autorizados. | **Crítica** — 40+ funciones. |
| `whatsapp.js` | Cliente de WhatsApp (Meta): enviar texto/imagen/plantilla/documento, subir y bajar archivos. | **Crítica** — 26+ funciones. |
| `asesores.js` | Permisos: quién es gerencia, quién ve qué línea, quién es independiente. | **Alta** — 20+ funciones. |
| `telefono.js` | Limpia y normaliza teléfonos (agrega 57, detecta duplicados). | **Alta**. |
| `comprobante.js` | Lee comprobantes bancarios con IA (monto, referencia, fecha). | **Media**. |
| `etiquetas.js` | Pone etiquetas a conversaciones de WhatsApp (sin duplicar). | **Media**. |
| `auth-app.js` | Valida la sesión de la app móvil (token). | **Media**. |
| `configuracion.js` | Interruptores globales del sistema (encender/apagar funciones). | **Baja**. |
| `numeros-disponibles.js` | Escoge ~50 boletas disponibles al azar para mostrar. | **Baja**. |

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
mensajes), `enviar.js`, `enviar-archivo.js`, `enviar-boleta.js`, `mensajes.js`,
`conversaciones.js`, `media.js`.

**Contactos y etiquetas:** `contactos.js`, `contacto-crear.js`,
`contacto-eliminar.js`, `contactos-importar.js`, `etiquetas.js`, `cliente.js`.

**Difusiones y plantillas:** `difusiones.js`, `plantillas.js`,
`respuestas-rapidas.js`.

**Agente de IA (Claude):** `agente.js` (cabina de control), `agente-responder.js`
(el motor que conversa y ejecuta acciones), `agente-costo.js` (cuánto cuesta en
dólares), `disparadores.js` (palabras que prenden el agente),
`qa-agente-cron.js` (supervisor automático — **PAUSADO** desde 2026-06-06, ver
bitácora; código intacto pero no corre),
`recordatorios-cron.js` (recordatorios del agente cada minuto),
`abono-reparto.js`, `buscar-pago.js`.

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

- `home-sorteo-apartamento.html` — parece de una rifa vieja (apartamento, 2024).
  Probable residuo, pero confirmar antes de borrar.
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
