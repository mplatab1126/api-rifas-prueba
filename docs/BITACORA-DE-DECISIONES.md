# Bitácora de Decisiones — Los Plata S.A.S.

> **Qué es este archivo:** el "diario de decisiones" del proyecto. Aquí NO va el
> detalle de cómo funciona cada cosa (eso está en `docs/MAPA-DEL-SISTEMA.md`).
> Aquí va **el PORQUÉ** de las decisiones importantes: qué se decidió, por qué, y
> qué hay que cuidar para no deshacerlo por error.
>
> **Para los chats de IA:** lee este archivo al empezar. Antes de cambiar o
> eliminar algo, revisa si hay una decisión que lo explique. Si tomas una
> decisión importante (de dinero, seguridad, base de datos, o qué quitar),
> **agrégala aquí** antes de cerrar.
>
> **Cómo escribir una entrada nueva:** se agregan ARRIBA del todo (lo más reciente
> primero). Usa este formato:
>
> ```
> ## AAAA-MM-DD — [Categoría] — Título corto
> **Qué decidimos:** ...
> **Por qué:** ...
> **Cuidado / qué NO hacer:** (opcional, si aplica)
> ```
>
> **Categorías sugeridas (etiquetas):** `[Pagos]` `[WhatsApp]` `[Admin]`
> `[Página clientes]` `[Rifas/Finanzas]` `[Seguridad]` `[Base de datos]`
> `[App móvil]` `[Documentación]` `[General]`

---

## 2026-06-27 — [Seguridad] / [General] — Auditoría de bugs de todo el repo (loop de 5 pasadas)

**Qué hicimos:** un loop auditó TODO el repositorio en 5 pasadas (por área + por tipo de bug),
verificando cada hallazgo de forma adversarial. Se arreglaron, publicaron y verificaron al aire
**35 bugs SEGUROS** (UI, contenido, lógica que NO toca dinero/permisos): crashes (tabla de capital
en rifas), zonas horarias de fechas de abono, recordatorios de Liliana, orden de mensajes del chat,
KPIs de llamadas, validaciones, manejo de errores, etc. Y con aprobación de Mateo se cerraron **3
huecos de SEGURIDAD ALTA**: `buscar.js`, `transferencias.js` e `historial.js` estaban SIN
autenticación y exponían datos de clientes (cédula, correo, saldos, comprobantes) a cualquiera en
internet; ahora exigen contraseña (el panel los llama por POST con la clave). Verificado: sin clave
401, con clave 200.

**Por qué se paró:** tras 5 pasadas la cuenta de bugs nuevos se estancó (~12-13 por pasada) y los
arreglos seguros se agotaron (16→6→1→2); lo que seguía apareciendo era casi todo DELICADO (decisión
de Mateo). Las "dos pasadas limpias" no eran alcanzables a costo razonable, así que Mateo decidió
cerrar y recibir el informe.

**Cuidado / qué NO hacer:** quedan **69 bugs DELICADOS** documentados en
`docs/auditoria-bugs-2026-06-27.md` (10 ALTA, 46 MEDIA, 13 BAJA) que tocan dinero/abonos/permisos/DB
y NO se tocaron. Atacarlos requiere el visto bueno de Mateo, de a uno. Destacan: IDOR entre líneas
(un asesor podría leer chats/contactos/media de otra línea), `abono.js` sin rollback, OTP sin límite
de intentos, y nodos del editor de flujos (Aleatorio/Solicitud/Clasificar) que el motor real no
ejecuta. Commits de los arreglos: 12e3a39, c8663a3, b8b61c0, 84fa659, 6ac9ecd, 0124a9f, 7b6f907, 27e2dca.

---

## 2026-06-27 — [Pagos] / [Base de datos] — Anti-doble de transferencias (ingresos de Carga IA)

**Qué decidimos:** atacar de raíz que el mismo pantallazo de un movimiento bancario se
cargara dos veces. Se agregó una **huella única de la imagen** (`hash_imagen` = SHA-256 de
los bytes del pantallazo) en la tabla `transferencias`, con un **índice único PARCIAL**
(`WHERE hash_imagen IS NOT NULL`). Si llega el MISMO comprobante otra vez, la base lo
rechaza, sin importar cómo lea la IA la hora o la referencia. `procesar-ia.js` calcula la
huella, hace un pre-chequeo (ahorra la llamada de IA) y trata el choque del índice (error
23505) como "duplicado", no como error. En el front (`admin.js`) se agregó un candado
anti doble-procesamiento (`procesandoIA`).

**Por qué:** el "escudo" anterior vivía solo en el código (consulta-y-luego-inserta, sin
candado en la base) y se le colaban duplicados con dos causas comprobadas en producción:
(1) cargas en paralelo (dos pestañas / doble disparo) que pasaban el chequeo antes de que
ninguna insertara; (2) la IA leía la **hora** del mismo movimiento distinta entre dos
cargas, así que el escudo por campos no los reconocía. Un índice único por los 5 campos NO
sirve: con hora se le escapan los de hora distinta (~1.105 filas/180d), y SIN hora es
inseguro (142 grupos de mismo código iban a boletas distintas → bloquearía pagos reales).
La huella de imagen es segura (misma imagen = mismo pago, nunca dos pagos distintos).

**Limpieza:** se borraron **340** duplicados EXACTOS (mismo monto+fecha+plataforma+ref+hora)
que estaban **LIBRES y sin abono**, dejando una copia por grupo. Respaldo en la tabla
`transferencias_backup_dups_20260627`. Total transferencias: 45.151 → 44.811.

**Cuidado / qué NO hacer:** las copias duplicadas **ya asignadas a boletas** (≈158 exactas +
las de hora distinta) NO se tocaron: pueden esconder un **doble-cobro** y hay que revisarlas
a mano (ver PENDIENTES). El índice es PARCIAL a propósito: las filas viejas (huella nula) y
otros caminos sin imagen (`subir-comprobante.js`) NO se ven afectados. Tras crear la columna
hubo que recargar el caché de PostgREST (`NOTIFY pgrst, 'reload schema'`). SQL en
`sql/transferencias-hash-imagen.sql`. Publicado (commit b364a48) y verificado al aire
(índice bloquea, API ve la columna, candado del front activo).

---

## 2026-06-27 — [Admin] — Nueva categoría de egresos: "Rifa Casa Santa Teresita 3" (solo Carga IA)

**Qué decidimos:** agregar la categoría de egresos `rifa_santa_teresita_3` →
nombre en la base **"Rifa Casa Santa Teresita 3"** (sigue el patrón de la 1 y la 2),
con las mismas subcategorías. Se habilita **SOLO en el apartado de Carga IA** (donde
se justifican/distribuyen los egresos del pantallazo del banco).

**Por qué:** lo pidió Mateo, para seguir el orden de las rifas Santa Teresita.

**Cuidado / qué NO hacer:** queda `afecta_er:false` igual que sus hermanas → NO entra al
Estado de Resultados (el P&L en `estadisticas.js` solo cuenta `Gastos Operacionales` y
`Gastos Rifa Apartamento`). NO se habilitó en la caja de la oficina (`caja.html`), ni en
"Gastar desde Caja", ni en el Estado de Resultados (decisión: solo Carga IA). Si algún día
gerencia necesita reclasificar a esta categoría desde el Estado de Resultados, hay que
agregarla también en `public/estado-resultados.html`. Archivos tocados: `api/admin/finanzas.js`
(fuente de verdad, alimenta el menú dinámico) y `public/admin.js` (`SUBCATEGORIAS`, `catOpts`,
`nombresCat`). Publicado a `main` (commit b175fe3) y verificado al aire.

---

## 2026-06-27 — [Pagos] / [Admin] — La Caja Oficina puede METER dinero a la Caja de Papá

**Qué decidimos:** desde la página de caja física (`caja.html`), al registrar una
**Salida** ahora se puede elegir la categoría **"💵 Pasar dinero a la Caja de Papá"**.
Eso hace un **traslado interno**: el efectivo sale de la Caja Oficina (queda como
`salida` en `movimientos_caja`, baja el cuadre del día) y entra a la Caja de Papá
(se guarda un gasto categoría `Movimiento a Caja`, subcategoría `Papá`, que es lo que
cuenta como entrada en el saldo de Caja Papá). El destino se **fuerza a "Papá"** tanto
en el front como en el back (la oficina solo le mete plata; nunca elige otra caja).

**Por qué:** antes el dinero solo entraba a la Caja de Papá desde Carga IA (el asesor
que justifica el pantallazo del banco). Faltaba que la gente que está físicamente en la
oficina pudiera pasarle efectivo de la caja a la caja de Papá.

**Cuidado / qué NO hacer:** la oficina **solo puede METER** plata a la caja de Papá, NO
gastar desde ella (decisión explícita de Mateo: gastar de la Caja de Papá sigue siendo
solo del apartado de Carga IA / egresos-ingresos). NO es un gasto real: **no afecta el
Estado de Resultados** (el P&L en `estadisticas.js` solo cuenta `Gastos Operacionales` y
`Gastos Rifa Apartamento`). Sin doble conteo: el saldo de la Caja Oficina se calcula solo
de `movimientos_caja`, y el de Caja Papá solo de `gastos`. Archivos: `public/caja.html`
(opción + subcategoría fija) y `api/admin/caja.js` (mapa `CATS` + forzar subcat 'Papá').
Publicado a `main` (commit c953c27) y verificado al aire en `/caja`.

---

## 2026-06-22 — [WhatsApp] / [Base de datos] — Motor de flujos: candados de seguridad y anti-duplicado

**Qué decidimos:** tras revisar a fondo el motor de flujos (`api/lib/flujo-motor.js`, Fase 2,
que ya estaba construido y enganchado en `recibir.js`), se cerraron tres huecos:
- **#5** — `iniciarFlujoPorId` ahora solo arranca un flujo en estado `'activo'`. Un flujo en
  borrador (recién creado, sin guardar) o pausado NO sale en vivo aunque un disparador lo apunte.
  Bajo riesgo: la pantalla guarda los flujos como `'activo'` al dar Guardar.
- **#6** — tope de 10 saltos en la cajita "Ir a otro flujo" (`ctx.saltos`). Sin él, dos flujos
  que se llamen en círculo (A→B→A…) colgaban el sistema porque el tope de pasos se reinicia en
  cada salto.
- **#3** — **candado anti-duplicado** (el mismo bug que tuvo Liliana con los saludos): si el
  cliente escribe rápido, dos copias del motor podían avanzar la misma sesión y mandar mensaje
  doble. Se agregó columna `procesando_at` a `flujo_sesiones` + funciones
  `flujo_tomar_lock`/`flujo_soltar_lock` (`sql/flujos-candado.sql`, aplicado en "Rifa prueba").
  El motor toma el candado por turno y lo suelta al terminar (se libera solo a los 30s si una
  copia se cae con él puesto).

**Por qué:** el motor maneja conversaciones con clientes reales y movía mensajes sin estos
candados. La lógica del candado va en FUNCIONES (no escribiendo directo a la columna por la API)
para no chocar con la caché de PostgREST (lección 2026-06-06).

**Cuidado / qué NO hacer:** NO revivir el interruptor global `flujos_modo`: se quitó a propósito
el 13-jun. Las funciones del candado deben conservar `EXECUTE` para `anon`, `authenticated` y
`service_role`. FALTA: probar en vivo (mensajes dobles), el timeout "no respondió en X horas" (#4,
necesita cron) y revisar qué pasa cuando el envío a Meta falla (#2: hoy el flujo avanza igual).

---

## 2026-06-13 — [WhatsApp] — Editor de flujos: simplificación de la interfaz (pedido de Mateo)

**Qué cambió (UI del dibujante):** (1) la **paleta** ya no muestra todos los pasos: hay un botón
**"+ Agregar paso"** que despliega la lista (y se colapsa al agregar). (2) Las acciones de cada cajita
(probar desde aquí, duplicar, eliminar) ya NO están en la barra de arriba: aparecen en un **toolbar
flotante encima de la cajita** cuando se selecciona (al Inicio solo "probar desde aquí"). (3) La
**carpeta** del flujo salió del editor y se elige **en la lista** (un selector por flujo; acción nueva
`carpeta` en `flujos.js` que mueve sin tocar el dibujo). (4) **Guardar** se movió a la izquierda y se
**quitó "Eliminar flujo"** (para no borrar por error). (5) El **verde** ya no rodea la cajita
seleccionada: ahora el seleccionado tiene **borde negro** (el verde queda solo para botones).

**Pendiente (lo único que falta de este pedido):** **arrastrar desde la bolita** de una cajita a un
lugar vacío y que ahí salga el menú para crear+conectar un nodo (estilo n8n/ManyChat). Es lo más
delicado de Drawflow; se hará aparte para probarlo bien. Ver PENDIENTES.

---

## 2026-06-13 — [WhatsApp] — Flujos: se quitó el interruptor global de motor y las plantillas listas

**Qué decidimos (Mateo):** simplificar la pantalla de Flujos. Se quitó (1) el control **"Motor de flujos:
Apagado / Modo prueba / En vivo"** y (2) la sección **"Plantillas listas para rifas"** (los 3 ejemplos).
Razón: con los **Disparadores** controlando todo (cada regla con su switch), el interruptor global sobraba;
y las plantillas "no servían". `permitidoCorrer` en `api/lib/flujo-motor.js` ahora siempre devuelve true:
**un flujo corre cuando un Disparador lo activa.** Quedó dead-code inofensivo: las acciones `config-get`/
`config-set` de `flujos.js`, la config `flujos_modo`, los estilos `.fl-modo*` y `crearDesdePlantilla`.

**Cuidado / qué NO hacer:** ya NO hay "modo prueba (solo mi número)". Un flujo queda **en vivo apenas se
le apunta un Disparador**. Para probar antes sin tocar clientes, usar el **simulador** del dibujante. Si se
quiere volver a un modo prueba, está la base (config + endpoint) para reactivarlo.

---

## 2026-06-13 — [WhatsApp] — Disparadores centralizados: a flujo o a agente (saca el disparador del flujo)

**Qué decidimos (modelo de Mateo, copiando ChateaPro):** el panel **Disparadores** ahora separa dos
categorías —**Palabras clave** ("si el mensaje contiene X") y **Acciones/eventos** (cliente nuevo,
**etiqueta aplicada**)— y CADA regla, en cualquier categoría, tiene un switch y elige su **destino**:
arrancar un **flujo** (cuál) o prender el **agente** (Liliana). El disparador **SALIÓ del flujo**: el
flujo es solo las cajitas; lo que lo activa se administra todo en Disparadores (más ordenado).

**Piezas:** tabla `disparadores` + columnas `destino` ('agente'|'flujo'), `flujo_id`, `evento_valor`
(ver `sql/disparadores-destino.sql`); `tipo` ahora admite 'palabra'|'nuevo_contacto'|'etiqueta_aplicada'.
Endpoint `api/whatsapp/disparadores.js` reescrito. Motor `api/lib/flujo-motor.js`: se separó en
`procesarFlujo` (AVANZA una sesión en curso) e `iniciarFlujoPorId` (ARRANCA un flujo). El despacho vive
ahora en `recibir.js` función `despachar`: (1) flujo en curso → avanzar; (2) agente ya activo → Liliana;
(3) primera regla de `disparadores` que coincida → flujo o agente. El evento "etiqueta aplicada" se
engancha en `api/whatsapp/etiquetas.js` (al asignar una etiqueta → `dispararEventoEtiqueta`). En el
dibujante se quitaron el selector de disparador, el campo de palabras y el "Activo" (el flujo ya no se
auto-dispara). Verificado: webhook sano, panel con las 2 pestañas y reglas a flujo/agente funcionando.

**Cuidado / qué NO hacer:** el camino de Liliana se conserva — los disparadores viejos quedaron con
`destino='agente'` (comportamiento intacto). NO volver a meter el disparador dentro del flujo. `recibir.js`
es el camino que recibe TODOS los mensajes: cualquier cambio ahí se verifica que el webhook no dé 500 y que
Liliana siga respondiendo. Faltan las otras 2 formas de iniciar un flujo (manual desde el chat, y por
difusión) — ver PENDIENTES.

---

## 2026-06-13 — [Seguridad] / [WhatsApp] — Integraciones: conectar fuentes de datos externas (Fase A)

**Qué decidimos:** agregar a la bandeja un panel **Integraciones** (solo Mateo) para conectar
**Google Sheets** y **Supabase** — las bases que usan los riferos — y que los flujos puedan
LEER/REGISTRAR datos de la rifa. Se hace en fases: **Fase A (HECHA)** = el panel + guardar la
conexión + probarla (solo lectura). **Fase B** = los flujos LEEN de la conexión. **Fase C** = los
flujos ESCRIBEN.

**Realidad técnica:** con **Supabase** se puede leer Y escribir fácil (API REST limpia). Con
**Google Sheets**, leer es fácil (enlace público → CSV vía `gviz/tq?tqx=out:csv`, sin OAuth), pero
**escribir es difícil** (necesita login de Google / Apps Script). Por eso el camino de escritura
será Supabase-primero; Sheets quedará más para lectura.

**Seguridad (lo importante):** los secretos (llaves) viven en `integraciones.config` (jsonb), RLS
prendido, y **NUNCA se devuelven completos a la pantalla** (el endpoint los enmascara `••••1234`).
Todas las consultas a la fuente externa las hace el BACKEND con la llave guardada. Solo Mateo
(`esMateo`) gestiona integraciones. Piezas: tabla `integraciones` (ver `sql/integraciones.sql`),
endpoint `api/whatsapp/integraciones.js` (listar/guardar/probar/eliminar), pantalla
`public/integraciones-bandeja.js` + sección `#modIntegraciones`. Publicado y verificado (conexión de
prueba real a Supabase respondió OK).

**Cuidado / qué NO hacer:** las llaves NO se cifran en reposo todavía (mejora futura). El "probar"
hace una petición saliente a la URL que se le dé: como es solo-Mateo el riesgo SSRF es bajo, pero en
la versión SaaS (multi-rifero) habrá que limitar a dónde puede apuntar. NO exponer la `config`
completa al navegador en ninguna acción nueva.

**Fase B (HECHA, publicada, verificada con datos reales):** **estandarización por MAPEO de columnas.**
El sistema tiene una lista FIJA de campos (`CAMPOS_ESTANDAR` en `api/lib/integracion-datos.js`:
telefono⭐, nombre, apellido, documento, ciudad, correo, boleta, total_abonado, saldo, estado_pago).
El rifero NO cambia su formato: solo mapea sus columnas a esos campos (`config.mapeo`). Pieza central:
`api/lib/integracion-datos.js` (busca el teléfono en la fuente, mapea y AGREGA). Si hay varias filas
por contacto, el rifero elige (`config.filas`): 'por_boleta' (suma abonos/saldos, lista boletas) o
'por_cliente' (una fila tal cual) — decisión de Mateo: "darle la opción al cliente". Usos: (1) **ficha
del chat** — `fichaIntegracion()` en `bandeja-whatsapp.html` muestra los campos en el panel derecho
(acción 'consultar', que SÍ pueden ver los asesores, no solo Mateo); (2) **flujos** — el motor carga
esos campos en las variables de la sesión al arrancar, así una Condición "total_abonado menor que
80000" funciona (el número va crudo, sin formato, para que compare bien). Verificado: 2 boletas de un
mismo número → total_abonado=70000 (sumado), boleta="1234, 5678", y aparece en la ficha como $70.000.

**Cuidado / qué NO hacer (Fase B):** los numéricos (total_abonado, saldo) viajan como NÚMERO crudo a
las variables del flujo (no formateados) — NO formatearlos antes de las condiciones o `parseFloat` los
rompería (los puntos de mil se leen como decimales). Falta **Fase C (escribir)**: registrar ventas/abonos
en la fuente. El emparejamiento de teléfono en Supabase prueba 3 variantes (con/sin 57); si un rifero
guarda el teléfono con espacios/guiones, no cruzará — habría que normalizar.

---

## 2026-06-13 — [WhatsApp] — Flujos: traer funciones del SaaS a la bandeja (Fase 1 hecha)

**Qué decidimos:** empezar a llevar funciones de la plataforma SaaS (`C:\rifas-saas`,
`rifas-saas-mu.vercel.app`) HACIA la bandeja de Los Plata, **una a la vez y bien hecha**,
conservando el aspecto visual de la bandeja. La primera: **Flujos** (constructor visual de
conversaciones, estilo ManyChat). Mateo lo pidió para mandar difusiones con flujos.

**Hallazgo clave (importante):** la función "Flujos" del SaaS está **incompleta**: es solo el
**dibujante + un simulador** que corre en el navegador. El SaaS NO tiene motor de ejecución, ni
webhook, ni conexión a WhatsApp (su backend son 2 archivos). O sea, "merge" en la práctica =
**reconstruir bien las funciones en la bandeja** (que sí es el sistema real), usando el SaaS como
guía de diseño. Para la difusión urgente de Mateo se usó lo que YA existe: difusión con
"que Liliana atienda" (agente activado).

**Regla de oro (Flujos ↔ Liliana):** un chat lo lleva UN solo cerebro: o un flujo, o Liliana,
nunca los dos. En la Fase 2 el motor se engancha en `recibir.js` ANTES de disparar a Liliana.

**Fase 1 (HECHA, publicada commit fdf2a75, verificada en producción):** constructor dentro de la
bandeja, solo Mateo. Piezas: tablas nuevas `flujos` y `flujo_sesiones` (single-tenant, `linea_id`;
RLS prendido, backend con service_role); endpoint `api/whatsapp/flujos.js` (listar/obtener/crear/
guardar/duplicar/eliminar); pantalla `public/flujos-bandeja.js` + sección `#modFlujos` en
`bandeja-whatsapp.html` (librería Drawflow por CDN). Adaptaciones vs SaaS: campos = texto libre
(no tabla de campos), sin secuencias, "pasar a asesor" = cualquiera del equipo. El dibujante
GUARDA y el SIMULADOR corre; **todavía NO ejecuta con clientes reales** (eso es la Fase 2).

**Decisión de Mateo (13-jun, tarde) — modelo de 5 nodos base:** la paleta tiene SOLO 5 nodos:
**Mensaje, Pregunta, Acción, Condición, Ir a otro flujo**. Todo lo demás "se desprende" de esos 5
(los botones y listas ya viven DENTRO de Mensaje, como modo de respuesta). Se quitaron de la paleta:
Clasificar con IA, Solicitud externa, Aleatorio, Esperar, Pasar a asesor, Comentario (su código
sigue en `flujos-bandeja.js` para compatibilidad, pero no se ofrecen). Las 3 plantillas se
reescribieron para usar solo los 5. **NO re-agregar nodos sueltos a la paleta sin pedírselo a Mateo.**
El `<script>` de `flujos-bandeja.js` va versionado (`?v=...`): al cambiarlo, subir el número para que
el navegador baje la versión nueva sin limpiar caché.

**Fase 2 (HECHA, publicada, motor APAGADO por defecto):** `api/lib/flujo-motor.js` ejecuta un flujo
con clientes reales por WhatsApp. Enganchado en `recibir.js` ANTES de Liliana (regla de oro: si un
flujo tomó el chat, Liliana NO actúa). Ejecuta los 5 nodos (Mensaje texto/botones/lista, Pregunta con
validación y reintentos, Acción etiqueta/campo, Condición, Ir a otro flujo). Se agregó `enviarBotones`
y `enviarLista` a `api/lib/whatsapp.js` (botones interactivos; la respuesta del cliente llega como el
título del botón). **Interruptor de seguridad** (tabla `configuracion`, claves `flujos_modo` =
off|prueba|vivo y `flujos_numeros_prueba`), con control visual en la pantalla de Flujos (solo Mateo).
Por defecto **off** = ningún flujo corre aunque esté "Activo"; en off, `procesarFlujo` devuelve false
de inmediato → cero efecto en clientes reales (verificado: el webhook sigue sano). Cuando un flujo
arranca, pone `agente_activo=false` para que el cron de Liliana no interfiera.

**Cuidado / qué NO hacer (Fase 2):** NO poner el motor "En vivo" sin probar antes en "Modo prueba" con
el número de Mateo. El "no respondió en X horas" de Pregunta (salida 3) NO está implementado aún
(Fase 2b, necesita cron); hoy el flujo espera la respuesta sin límite. El motor manda los mensajes
DENTRO del webhook de Meta; si un flujo se hace largo conviene moverlo a una invocación aparte.

**Cuidado / qué NO hacer:** NO encender un flujo en producción hasta que exista el motor (Fase 2);
hoy un flujo "activo" no hace nada. Cuando se construya el motor, respetar la regla de oro y
probar primero con el número de Mateo (flujo apagado por defecto). NO confundir las dos bases:
la bandeja es `ikvzmojzgpxuhnbymtxm`; el SaaS es `ikbfmttduiagtwfpkkfd`.

---

## 2026-06-13 — [WhatsApp] — Difusiones: variables de plantilla con datos del cliente

**Qué decidimos:** las variables `{{1}} {{2}}…` de las plantillas de difusión ahora se
pueden rellenar con 7 datos del cliente (antes solo nombre y teléfono): `{nombre}`,
`{apellido}`, `{telefono}`, `{ciudad}`, `{abonado}` (total abonado), `{restante}` (total
que debe) y `{boleta}`. En la pantalla aparecen como botones junto a cada variable. El
dinero sale formateado (`$80.000`). Si un cliente tiene VARIAS boletas: abonado/restante se
SUMAN, y `{boleta}` LISTA todas ("0186, 0243, …") — decisión de Mateo.

**Por qué:** Mateo necesitaba mandar cobros personalizados ("Tu número: X, tu saldo: Y") y
el sistema solo sabía poner nombre/teléfono.

**Piezas:** se centralizó todo en `api/lib/plantilla-vars.js` (antes `resolverParametros`
estaba copiado en 3 archivos: difusiones.js, difusion-envio.js, plantillas.js). Los datos los
trae la función de base `difusion_datos_cliente(text[])` (SOLO LECTURA) **al momento del
envío**, para que el saldo esté al día aunque la difusión esté programada. Publicado a `main`
(commit 62ad4bc) y verificado al aire.

**Cuidado / qué NO hacer:** `{boleta}` puede quedar larguísimo (hay clientes con 25+ boletas;
el mensaje crece). Si algún día se vuelve problema, cambiar la regla en `difusion_datos_cliente`
(string_agg). La función NO modifica nada; si se recrea, conservar el GRANT EXECUTE a anon.

---

## 2026-06-12 — [General] — Nace el proyecto "SaaS de rifas": investigación hecha y plan en docs/PLAN-PLATAFORMA-SAAS.md

**Qué decidimos:** explorar convertir la bandeja + Liliana en una plataforma por suscripción para
otros riferos (idea de Mateo, 12-jun). Se hizo la investigación exhaustiva (verificada contra
fuentes oficiales) y el plan completo por etapas quedó en **`docs/PLAN-PLATAFORMA-SAAS.md`**.
Conclusiones clave: (1) el cruce "rifas + WhatsApp API + IA" está VACÍO en el mercado; (2) la ruta
con Meta es el programa **Tech Provider** + Embedded Signup (cada cliente conecta SU número y le
paga sus mensajes directo a Meta; nosotros cobramos solo el software); (3) cobro por **contactos
activos** estilo ManyChat; (4) pasarela recomendada **Wompi** (única con débito automático por
Nequi); (5) arquitectura: Supabase + Vercel + repo NUEVOS y separados de Los Plata, multi-tenant
con `tenant_id` + RLS.

**Cuidado / qué NO hacer:** hallazgo legal serio — la política de WhatsApp lista "raffles" como
GAMBLING (exige permiso escrito de Meta; Colombia sí está entre los 5 países permitidos) y
Coljuegos está sancionando rifas informales en redes (35 procesos, 289 perfiles bloqueados;
el Decreto 1486/2024 creó la vía legal para rifas digitales). NO lanzar el SaaS ni conectar
clientes sin pasar por la Etapa 0 del plan (abogado + trámites de Meta). Nada se construye aún:
esperando las 5 decisiones de Mateo (§9 del plan).

---

## 2026-06-11 — [WhatsApp] — Manual de Liliana consolidado (H36+H47+H48+H64): una sola jerarquía, sin duplicados

**Qué decidimos:** reestructurar el manual (`agente_config.prompt`) en una sola pasada: la ÚNICA
sección suprema es "LO QUE MÁS SE ROMPE" (se eliminó "CORRECCIONES IMPORTANTES" FUSIONANDO su
contenido: la regla del número del chat subió al bloque supremo; horarios se fusionó en
CONDICIONES; "una sola cifra" quedó junto al acumulado). Acumulado 5→1 copia canónica +
recordatorios cortos; tuteo y Sueldazo 2→1; las cuentas en duro de la sección web se
reemplazaron por {{pagos}} (H48); "más breves que antes" quedó con meta absoluta. Se
CONSERVARON los refuerzos deliberados (remisión, cédula/correo x2, "NO REPITAS LOS PREMIOS").
De 28.386 a 26.729 chars. La descripción de `apartar_numero` ya no dice "OPCIONALES".

**Por qué:** el manual tenía DOS secciones reclamando supremacía y reglas repetidas hasta 5
veces con redacciones que divergían — cada parche nuevo aumentaba el riesgo de contradicciones
(auditoría 9-jun, con las notas del verificador aplicadas).

**Cómo se publicó (regla de oro confirmada):** suite dorada 10/10 ANTES de guardar; guardado
por SQL directo verificando md5 contra el archivo probado; el versionado (H15) respaldó la
versión anterior automáticamente. Dos arreglos de la propia suite salieron de paso: (1) el caso
`300M_o_amoblado` aceptaba solo UNA redacción de la respuesta correcta (se amplió el regex, con
OK de Mateo); (2) `probar-suite.js` ahora evalúa los regex SIN asteriscos de negrita ("una cosa
*o* la otra" cuenta igual que "una cosa o la otra").

**Cuidado / qué NO hacer:** NO guardar el manual por la acción `guardar` de `api/whatsapp/agente.js`
desde un script: en un intento el prompt llegó corrupto (quedó de 15 chars, "[object Object]") y
hubo que restaurar del historial (funcionó en ~3 min). Esa acción reemplaza TODOS los campos a la
vez (estado, variables, ganadores): es para la cabina, no para scripts. Para ediciones por fuera
de la cabina: SQL directo con md5 verificado, como aquí. Y la disciplina nueva del manual:
EDITAR la regla existente, NUNCA appendear una corrección al final.

---

## 2026-06-11 — [WhatsApp] — H65 (con OK de Mateo): atajo del número exacto tras la lista

**Qué hicimos:** si el cliente acaba de ver la LISTA de números y responde SOLO un número de 4
cifras que ESTABA en esa lista, el paso de pedir datos sale predefinido SIN gastar IA (~4-10
casos/día ≈ $5-11 USD/mes). Roza la decisión "la verificación de un número puntual la hace la
IA", por eso se hizo con OK explícito de Mateo y con el re-alcance del verificador: solo dispara
si el número estaba en la muestra recién enviada; el pre-chequeo H60 (¿sigue libre?) y la
re-verificación del apartado corren como siempre. H81 quedó ACTIVO el mismo día (Mateo confirmó
que la clave "Liliana" ya existe en ASESORES_SECRETO: la llave maestra ya no viaja).

## 2026-06-10 — [Pagos] / [WhatsApp] — Tanda 12: el abono ya no cae a la boleta equivocada (H76) + teléfonos a prueba de colisiones (H70)

**H76 (toca la ELECCIÓN del destino del abono; los candados de verificación quedan intactos):**
si un cliente con VARIAS boletas con saldo pedía abonar a una boleta que no estaba entre ellas
(typo, boleta ya pagada, número de otra rifa), el abono automático caía EN SILENCIO a la boleta
de número más bajo. Ahora: tipo nuevo `boleta_no_coincide` — en vivo, la IA le pregunta al
cliente a cuál abonar (el pago queda verificado, solo falta destino) y reintenta con el número
confirmado; en el cron (sin diálogo) pasa directo a ASESOR. Con UNA sola candidata se abona
directo aunque el número no coincida (corrige typos, ajuste del verificador); sin número pedido
y varias candidatas, se prefiere la boleta cuyo saldo es EXACTO al monto del pago.

**H70:** `esMismoTelefono` (api/lib/telefono.js): regla de cola MUTUA con mínimo de 10 dígitos
(los números <10 solo casan exactos). Aplicada en los 8 puntos donde se amarran boletas/clientes
por teléfono (motor, buscar-pago, trasladar-abono). Cierra dos huecos del "últimos 10 dígitos":
extranjeros cortos y la cruzada entre países (+1 305xxxxxxx vs 57 305xxxxxxx). Auditado contra
producción ANTES de publicar: 0 clientes reales pierden el amarre con sus boletas.

**Cuidado:** si aparece un cliente legítimo de un país con números <10 dígitos, su boleta debe
guardarse con el número EXACTO de su WhatsApp (wa_id) — con otro formato no le casará.

## 2026-06-10 — [WhatsApp] / [Seguridad] — Tanda 11 (verdes): candado atómico al liberar, credencial propia del agente y limpieza

**Qué hicimos (5 verdes; H68 y H81 rozan pagos — explicado a Mateo; ningún candado se afloja, solo se endurecen):**
- **H68 — liberar boleta a prueba de carreras:** el candado "dueño correcto + $0 abonado" vivía
  SOLO en el agente, y entre su lectura y el borrado el cron de verificación podía abonar (el
  abono recién verificado se borraba en silencio). Ahora: (1) el agente cancela las
  verificaciones pendientes ANTES de liberar; (2) `liberar-boleta.js` recibe
  `soloSiSinAbonos`+`telefonoEsperado` y libera con un UPDATE condicional ATÓMICO — si la boleta
  ya tiene abonos o cambió de dueño, NO borra nada y pide revisión a mano. El Admin humano
  (sin esos parámetros) funciona idéntico.
- **H81 — el agente ya no viaja con la llave maestra:** antes cada operación (abonos, liberar,
  trasladar, actualizar datos, cron) mandaba la contraseña de GERENCIA (Mateo) en el body.
  Nueva `contrasenaAgente(linea)`: usa la clave del asesor dueño de la línea (debe llamarse
  EXACTAMENTE "Liliana" en ASESORES_SECRETO) y cae a la de gerencia mientras no exista.
  **Falta el clic de Mateo: agregar la clave "Liliana" en ASESORES_SECRETO (Vercel) + redeploy.**
- **H75 — simulador 'probar' ELIMINADO** (pendiente documentado): probaba un agente distinto al
  real (sin herramientas/contexto/candados). La validación del manual es la suite dorada.
- **H74 — sondeo del debounce a pasos de 6s** (mitad de viajes; con la RPC de H87 el tráfico del
  debounce quedó en ~1/4 del original). **H83 — config leída 1 vez + lecturas en paralelo.**

**Cuidado:** si la clave "Liliana" se agrega con OTRO nombre, las validaciones de grupo de
abono/liberar BLOQUEARÍAN al agente (el verificador lo advirtió) — debe ser exactamente "Liliana".

## 2026-06-10 — [WhatsApp] — Bug N3: la API rechazaba corridas que terminaban "hablando Liliana"

**Qué pasó (detectado por Mateo, 4 chats):** notas "No pude responder... assistant message
prefill" + etiqueta ASESOR. La API de Claude (Sonnet 4.6) exige que la conversación termine con
un mensaje del CLIENTE. El re-disparo (H5/H21) y el barredor (H12), publicados hoy mismo, pueden
correr un chat cuyo último elemento es un mensaje de Liliana o una nota interna → la API devuelve
400 y el turno muere. Regresión de las mejoras de la mañana, no del modelo.

**Arreglo:** si el historial armado termina con mensaje nuestro, el motor agrega una nota interna
de rol usuario: "el sistema te re-activó: responde lo que quede pendiente; si ya está todo
respondido, una sola línea corta que cierre con naturalidad". Cumple el contrato de la API y le
da a la IA la instrucción correcta para ese escenario. Los 4 chats afectados se recuperaron solos
(en todos la última palabra la tiene Liliana); solo quedó la etiqueta 🆘 por quitar a mano.

**Cuidado:** si algún día se cambia el armado del historial (construirMensajes), conservar este
cierre — vive justo antes de marcarCacheFinal en agente-responder.js.

## 2026-06-10 — [WhatsApp] — Tanda 10 (verdes) + visor del relojito de pagos (N2)

**N2 — Visor "💳 Verificación del pago" (pedido de Mateo):** en la ficha del chat de la bandeja
ahora se ve EN QUÉ VA el relojito de reintentos de un pago: amarillo "🕐 el sistema sigue
verificando solo — intento X de 4, próximo a las HH:MM" / verde "✅ abonado" / rojo "🆘 se
rindió: le toca al ASESOR" / gris "cancelada". Visible para TODOS los perfiles (es información
operativa); solo sale si hay una verificación de las últimas 48h. Endpoint de solo lectura
`api/whatsapp/verificaciones.js`. De paso: la tarjeta de costo de IA de la ficha ya no depende
de que el chat esté en la lista cargada (el servidor resuelve por teléfono); el "no se ve el
gasto" que reportó Mateo resultó ser el perfil (es solo-gerencia a propósito).

**Tanda 10 (5 verdes, con las notas del verificador):**
- **H54+H73 — recordatorios que no se pierden:** el cron ya NO marca 'enviado' ANTES de enviar
  (un crash/fallo perdía la promesa de Liliana en silencio). Claim atómico que reprograma
  +10 min y sube `intentos`; 'enviado' solo tras despachar/enviar; 3 fallos → 'error' con
  rastro. maxDuration explícito para recibir.js (60s) y recordatorios-cron.js (120s).
- **H71 — reintentos de Meta sin efectos:** un mensaje duplicado (reintento tardío del webhook)
  ya no cancela recordatorios, ni infla "sin leer", ni renueva la ventana de 24h, ni dispara el
  motor: los efectos corren SOLO si el mensaje resultó nuevo (.select del upsert dice la verdad).
- **H49 —** la herramienta del contacto inicial pide mencionar el PRÓXIMO sorteo (texto
  estático, fecha copiada del bloque FECHAS — no rompe el caché).
- **H72 —** ya estaba cubierto por H17/H22/H52; lo que faltaba: si una línea sin asesor
  configurado cae al respaldo "Liliana", queda ERROR en actividad (→ alerta H16).

**Cuidado:** los recordatorios ahora pueden reintentarse (tope 3): si la función muere DESPUÉS
de enviar la plantilla pero antes de marcar 'enviado', podría repetirse una plantilla (raro y
aceptable para un seguimiento — diseño "al menos una vez" del verificador).

## 2026-06-10 — [WhatsApp] — Bug N1: la confirmación del abono decía un saldo viejo

**Qué pasó (caso real, reportado por Mateo):** Jorge (573154260513) pagó los $120.000 finales de
la boleta 4950 (ya tenía $30.000 del 4-jun). Liliana registró el abono BIEN, pero al confirmarle
dijo "ya tienes abonados $120.000, te faltan $30.000" — la boleta quedó 100% paga. El cliente
reclamó y Liliana se corrigió sola al re-consultar. La plata nunca estuvo mal; solo el mensaje.

**Causa:** el bloque ESTADO DE ESTE CLIENTE (abonado/saldo) se arma AL INICIO del turno, antes
del abono. El resultado de `registrar_abono` solo decía "registré $X, recuérdale el saldo que le
queda" sin dar el saldo → la IA hacía la resta ella misma con los números viejos y se equivocó.

**Arreglo:** tras un abono exitoso, `registrar_abono` RELEE las boletas de la base y le entrega
a la IA el estado oficial post-abono ("abonado $150.000 de $150.000 — PAGADA AL 100%") con la
orden de usar EXACTAMENTE esos números, no hacer cuentas, y NO pedir más pagos si quedó pagada.
No se tocó ningún candado de dinero (el cambio es de pura lectura). El cron de verificación no
tenía el problema (su mensaje solo confirma el monto). Anotado como N1 en PENDIENTES-LILIANA §8.

## 2026-06-10 — [WhatsApp] — Tanda 9 (verdes): ahorro de tokens y menos viajes a la base

**Qué hicimos (7 verdes de costos/velocidad + 1 ya cubierto; nada de dinero):**
- **H63 — un solo caché de prompt:** quitarle `enviar_contacto_inicial` del array de tools a los
  clientes con boleta partía el caché en DOS variantes (cada una pagaba su reescritura completa
  de ~12k tokens). Ahora el array es SIEMPRE igual y el candado "a un conocido nunca se le manda
  el contacto inicial" vive en la EJECUCIÓN de la herramienta (re-consulta boletas, no envía
  nada y le devuelve la corrección a la IA).
- **H66 — instrucciones fijas al caché:** las frases de estilo idénticas en toda llamada
  (~250 tokens) salieron del bloque volátil (precio lleno) a `INSTRUCCIONES_FIJAS`, un bloque
  estático EN CÓDIGO que ahora lleva el breakpoint (prefijo cacheado = tools+manual+fijas).
- **H67 — memoria de acciones con tope:** fuera notas de solo-lectura, dedupe conservando la
  ÚLTIMA ocurrencia (el estado final de la plata manda) y tope de 12 conservando siempre las
  acciones con estado. Chats viejos con 27 notas re-facturadas → máx 12 útiles.
- **H85 — token de línea con memoria (60s):** el contacto inicial hacía 6+ lecturas idénticas
  de `lineas_whatsapp`; solo se cachean lecturas exitosas y el objeto completo (wabaId incluido).
- **H86 — un disparo del motor por conversación por webhook** (antes uno POR MENSAJE: en ráfaga
  de 3, dos morían en el candado) + `maxDuration: 30` para `recibir.js`.
- **H87 — debounce en una sola ida:** RPC `agente_lock_y_ultimo` (refresca candado + trae el
  último mensaje; `sql/agente-lock-y-ultimo.sql`) con respaldo al camino viejo si falla.
- **H89 — audios en paralelo:** una ráfaga de notas de voz ya no suma 6-18s en serie.
- **H88 — ya estaba cubierto por H34** (la espera máxima bajó a 120s; margen de ~180s).

**Cuidado:** si se cambia el TEXTO de las notas del motor, revisar también los regex de H67
(`ES_NOTA_LECTURA`/`ES_ACCION_CON_ESTADO`) además de los del embudo (H35). El primer deploy
tras esta tanda paga UNA reescritura de caché (el prefijo cambió) — se amortiza el mismo día.
Vigilar `agente_uso` 1-2 días: el costo por llamada debería BAJAR (menos volátil, un solo prefijo).

## 2026-06-10 — [WhatsApp] — Tanda 8 (verdes): los atajos sin IA ya no responden en falso

**Qué hicimos (9 verdes de conversación/atajos; nada de dinero ni manual):**
- **H56 — negaciones:** "ya NO quiero el 1234" / "no el 1234, dame el 5678" disparaban el atajo
  pidiendo datos del número RECHAZADO. Ahora negación o dos números distintos → responde la IA.
- **H57 — números con cifras de más:** un "12345" (typo) se recortaba EN SILENCIO a "2345" y se
  podía verificar/apartar un número que el cliente no pidió. Ahora `numeroBoleta()` en los 4
  ejecutores rechaza 5+ cifras y la IA pide confirmar; "123"→"0123" se mantiene (convención del
  sistema, igual que reservar.js).
- **H60 — no pedir 5 datos en vano:** el atajo "quiero el 7185" verifica en silencio que el
  número siga libre ANTES de pedir nombre/cédula/correo; ocupado o error → la IA ofrece opciones.
- **H50+H59 — conocidos:** un cliente registrado (incluso de la rifa pasada — el corte del
  historial por rifa lo volvía "nuevo") recibía el saludo genérico y el embudo le re-pedía todos
  los datos. Ahora los conocidos van a la IA, que los saluda por su nombre (`!estadoCliente.cli`).
- **H55 — fotos en el primer mensaje:** "hola" + foto disparaba el saludo fijo IGNORANDO la
  imagen (el guard miraba el texto, no el tipo). Ahora multimedia real → IA, que sí la ve.
- **H51 — promesa imposible:** el texto fijo ofrecía verificar "terminaciones" que ninguna
  herramienta puede buscar; ahora pide un número puntual de 4 cifras.
- **H52 — multi-línea:** el respaldo del saludo quedó neutro (sin "Liliana" en duro) y el
  ejemplo del schema dice "preséntate por TU nombre" — el nombre real vive en las variables de
  cada línea (H17). Confirmado: la línea de Lili tiene su saludo con nombre en la base.
- **H61 — pie de imagen neutro:** toda foto sin texto se le presentaba a la IA como "puede ser
  el comprobante de pago" (sesgo a hablar de pagos ante un meme o la captura del anuncio).
  `esContextoPago` quedó INTACTO a propósito (armar el candado con cualquier foto es fail-safe).

**Cuidado:** probada la lógica de `intentoSeparar`/`numeroBoleta` con casos (6/6 y 4/4 OK) y
sintaxis validada; la suite dorada sigue pendiente de correr con contraseña de gerencia. Los
atajos ahora son MÁS conservadores (más casos van a la IA = unos pocos tokens más, filosofía
"en la duda → IA" de la bitácora del 8-jun).

## 2026-06-10 — [WhatsApp] — Tanda 7 (verdes): Liliana nunca cierra muda + saneo anti-inyección

**Qué hicimos (6 verdes de la auditoría, ninguno toca dinero):**
- **H62 — nunca cerrar el turno en silencio:** si el bucle de la IA se agota pidiendo
  herramientas (o nunca emite texto), antes el cliente veía "escribiendo..." y NADA. Ahora una
  bandera `huboTexto` vigila el turno; si quedó mudo, se fuerza un cierre solo-texto
  (`tool_choice:'none'`) y, si también falla, sale un mensaje fijo corto. Pasa por el MISMO
  candado anti "pago falso".
- **H58 — despedida garantizada al pedir un humano:** si la 2ª llamada que redacta la
  despedida falla, sale la fija: "Listo 😊 Te paso con un asesor...". Además esa llamada ya
  manda las tools con `tool_choice:'none'` (la API puede rechazar historiales con tool_use si
  el request no define tools — aplicado también al cierre de H62).
- **H79 — audios que no se pudieron transcribir:** ya no entran mudos a la IA: nota en el chat
  (una vez), instrucción explícita ("NO adivines qué dijo; pídele que lo escriba") y, si falta
  la llave de Whisper (OPENAI_API_KEY), ERROR en actividad → alerta H16 al WhatsApp de Mateo.
  OJO: no se marca el mensaje, para que el reintento automático de transcripción siga vivo.
- **H78 — anti-inyección:** el nombre/apellido/ciudad que dicta el cliente terminan en el
  bloque system de TODOS los turnos; un "nombre" malicioso podía colar instrucciones. Saneo
  silencioso `limpiarDatoCliente` (solo letras Unicode + espacios + . ' - , tope 60 chars) al
  guardar Y al mostrar (cubre datos viejos). "José D'Alessandro Ñuñez de Bogotá D.C." pasa intacto.
- **H80 — fotos del saludo vigiladas:** si la respuesta rápida "contacto inicial" se renombra,
  borra o duplica, el saludo salía SIN las fotos de la casa y la nota decía éxito. Ahora queda
  ERROR en actividad (→ alerta H16) y la nota dice "⚠️ SIN fotos".
- **H77 — recordatorios vs humano:** apagar el 🤖 desde la bandeja ya cancela los recordatorios
  pendientes, y el cron de la plantilla a días verifica `agente_activo` antes de enviar (si está
  apagado → 'cancelado'). Un asesor que toma un chat a mano ya no es pisado por "me dijiste que
  ibas a separar tu boleta" días después.

**Cuidado / pendiente:** la suite dorada NO se corrió en esta tanda (requiere la contraseña de
gerencia; los cambios son redes de seguridad aditivas, no tocan el manual ni los flujos
normales). Si algo suena raro en las despedidas o cierres, correr la suite desde un chat de
Mateo. Los mensajes fijos nuevos ("Listo 😊 Te paso con un asesor...", "Ya estoy revisando lo
tuyo 😊...") viven en `agente-responder.js`.

## 2026-06-10 — [WhatsApp] — H35: el embudo de ventas de Liliana ya se ve en la cabina

**Qué hicimos:** Mateo solo medía el COSTO de la IA, no su RESULTADO. Nueva tarjeta **"Embudo de
ventas"** en la cabina (junto al Gasto de IA, 7/30 días): cuántos clientes llegaron → vieron
premios → vieron números → dieron datos → apartaron → abonaron, más boletas vendidas/pagadas y la
plata recibida. Variante del verificador: NO se tocó el motor — la función `agente_embudo_resumen`
(versionada en `sql/embudo-liliana.sql`, solo service_role) agrega sobre las notas que ya caen en
`agente_actividad`, así que mide también hacia atrás. Los hitos de plata (apartó/abonó/pagó) salen
de `boletas`/`abonos` (exactos); contacto y números, de las notas (firmes); premios y datos son
aproximados (solo los atajos dejan nota — van con * en la tarjeta). Primera lectura real (7 días):
633 llegaron → 157 vieron números → 78 apartaron → $6.365.000 recibidos en 149 abonos.

**Cuidado / qué NO hacer:** si se cambian los TEXTOS de las notas del motor ("Envié el contacto
inicial", "Aparté el número"…), el embudo deja de contar ese hito — revisar los `like` de la
función. "Abonaron" puede superar a "Apartaron" (incluye cobros de boletas vendidas antes de la
ventana): es a propósito. Sirve para TENDENCIAS semanales, no para A/B de cada edición del manual
(muestras chicas, advertencia del verificador).

## 2026-06-10 — [WhatsApp] / [Pagos] — Tanda 6 de los amarillos (H27, H32): el flujo de comprobantes ya no es ingenuo

**Qué hicimos (con OK de Mateo — tocan el flujo de comprobantes, sin aflojar ningún candado):**
- **H27 — Ya no se verifica la foto equivocada:** `registrar_abono` tomaba a ciegas la ÚLTIMA
  imagen del chat; si el cliente mandaba su cédula DESPUÉS del comprobante, se verificaba la
  cédula, fallaba, y el que SÍ pagó quedaba colgado "verificando" hasta 1h. Ahora prueba las
  últimas 3 fotos RECIENTES (≤48h, sin marca "pago asignado") de la más nueva hacia atrás: la
  primera que se comporta como comprobante es la elegida (la cédula falla la extracción y se
  salta), y la verificación con reintentos guarda la foto RECONOCIDA. `manejarPagoNoVerificado`
  (el candado anti pago falso) también respeta 48h y la marca. Probar varias fotos NO puede
  duplicar plata: la coincidencia sólida y el consumo único de la transferencia siguen iguales.
- **H32 — Candado anti "comprobante prestado":** un pantallazo del pago de OTRO cliente (se
  comparten en grupos de WhatsApp al celebrar) coincidía perfecto por referencia y abonaba la
  plata del dueño real a la boleta de quien lo reenvía. Ahora, si la coincidencia salió SOLO de
  los datos de la foto (razones "Coincide la referencia" / "Misma hora y plataforma") y la
  referencia trae el celular de OTRO cliente registrado (≠ el del chat), el abono automático se
  RETIENE para un asesor (resultado nuevo `'retenido'`): el turno le dice al cliente "en
  revisión" SIN acusarlo, y el cron lo cierra sin reintentar (mismo cierre del 'rendido').
  El ajuste del verificador evita falsos positivos de Bancolombia: el celular debe ser un número
  COMPLETO (lookarounds) y de un cliente REAL con boleta.

**Medido contra producción (solo lectura):** en 14 días, solo ~1,3% de los pagos Nequi asignados
(40/3.105) tenían el celular de otro cliente en la referencia — y la mayoría los abonan asesores
humanos, a quienes el candado NO les aplica. Bancolombia: 1 sola referencia de 4.316 con celular
embebido. El ruido esperado es de un puñado de revisiones por semana, justo los casos ambiguos.

**Cuidado / qué NO hacer:** el candado H32 aplica SOLO al camino automático (agente + cron); la
bandeja humana sigue igual (el asesor ve y decide). La razón "El celular del cliente está en la
referencia" NO se retiene (esa prueba identidad). `celularDeOtroCliente` es fail-open a propósito
(un error de consulta no frena abonos legítimos). Si un cliente legítimo paga desde el Nequi de un
familiar que TAMBIÉN es cliente, caerá a revisión humana: es el costo aceptado de frenar el fraude.

## 2026-06-10 — [WhatsApp] — Tanda 5 de los amarillos (H42, H43+H84, H34): más rápido y sin morir a medias

**Qué hicimos (motor `agente-responder.js`, `lib/whatsapp.js`, `lib/abono-agente.js`):**
- **H42 — Primera respuesta en ~10s en vez de ~30s:** el debounce de 30s (juntar la ráfaga) se
  mantiene, PERO si es el PRIMER contacto y lo resuelve el saludo predefinido sin IA (el ~88% que
  llega del anuncio), la espera es de ~10s. Con la doble validación del verificador: pre-lectura
  ligera ANTES de esperar y RE-VALIDACIÓN al cumplirse — si el cliente agregó algo que el saludo no
  cubre, vuelve a esperar los 30s normales (nunca va a la IA antes de tiempo).
- **H43 (+H84) — Fotos e historial ya no se re-cobran a precio lleno:** las fotos se descargan en
  PARALELO, y hay un 2º punto de caché al FINAL del historial (`marcarCacheFinal`, mismo ttl 1h del
  manual): las vueltas 2+ del bucle y el turno siguiente leen historial+fotos a 0.1×. La IA ve
  exactamente lo mismo; solo cambia el precio.
- **H34 — Presupuesto de tiempo:** tope del debounce 4→2 min (con 4 min un turno con ráfaga larga
  podía quedarse sin tiempo y Vercel lo mataba a medias) y timeout en TODAS las llamadas externas
  (IA 90s → cae al reintento que ya existía; Whisper 30s; Meta 30s envíos / 60s archivos; llamadas
  internas 120s — generoso porque buscar-pago lee la imagen con IA y tarda 30-60s legítimos).
  **La regla de oro del verificador:** si la verificación/abono se DEMORA (timeout), es AMBIGUO (el
  abono pudo quedar registrado): el resultado nuevo `'demorado'` hace que Liliana diga "estoy
  verificando tu pago" y se agende la verificación automática — NUNCA le dice al cliente que falló,
  y el candado del `idTransferencia` (una transferencia se consume UNA vez) impide duplicar.

**Cuidado / qué NO hacer:** NO bajar el timeout de `llamarApi`/`post` (120s) a "algo más normal"
tipo 30s: abortaría verificaciones de pago legítimas. NO tratar `'demorado'` como error (el cron lo
reintenta; el ejecutor agenda verificación). El punto de caché del historial debe seguir siendo el
ÚLTIMO bloque (si se agregan bloques después sin moverlo, no pasa nada, solo se cachea menos).
Vigilar `agente_uso` unos días tras H42 (una espera corta puede partir alguna ráfaga en dos
respuestas — costo levemente mayor a cambio de la velocidad; si se dispara, subir DEBOUNCE_CORTO_MS).

## 2026-06-10 — [WhatsApp] / [Seguridad] — Tanda 4 de los amarillos (H24, H30, H44, H39)

**Qué hicimos (todo verificado al aire):**
- **H24 — La web ya no contradice a Liliana:** la portada decía "solo aceptamos pagos a cuentas a
  nombre de LOS PLATA S.A.S." pero Liliana cobra al Nequi/Daviplata/Bre-B 3128732266 de **Maria
  Buitrago** (y esa cuenta no estaba en Canales Oficiales) — el cliente desconfiado que verificara
  concluía que Liliana era la estafa. Con OK de Mateo: la cuenta quedó PUBLICADA en
  `/canales-oficiales` (grupo 4, "Cuenta autorizada", Nequi + Daviplata + llave Bre-B) y el aviso
  del hub ahora remite a esa lista verificable (sin suavizar el ancla anti-estafa, como pidió el
  verificador). OJO: las páginas cargan los `.js` COMPILADOS — tras editar un `.jsx` correr
  `npm run build` (si esbuild falta: `npm install --cache /tmp/npm-cache-losplata`; el caché normal
  de npm tiene un lío de permisos).
- **H30 — Las fotos ya asignadas/viejas no se re-facturan:** el motor adjuntaba las 2 imágenes más
  recientes a CADA llamada de IA aunque el comprobante ya estuviera abonado (~1.1-1.6k tokens por
  imagen, el resto del chat). Ahora salta las marcadas `pago_asignado` y las de >48h; el historial
  trae SOLO esa llave (`pago_asignado:raw->pago_asignado`, sintaxis validada contra PostgREST de
  producción); y la marca la pone `verificarYAbonar` (movida a `api/lib/abono-agente.js`) — así
  el CRON también marca al abonar (antes nunca marcaba y el filtro no habría mordido). Ahorro
  estimado ~$0.3-0.5/día + menos latencia.
- **H44 — Sin segunda descarga del comprobante:** `registrar_abono` le PRESTA a buscar-pago el
  base64 que el motor ya descargó para la IA (parámetro opcional `media_base64`); el cron y la
  bandeja siguen descargando como siempre (fallback intacto). Mateo decidió DEJAR Sonnet como
  lector (no se cambió a Haiku, para no crear asimetría con el extractor del banco).
- **H39 — Secreto interno propio:** las llamadas internas (webhook→motor, pg_cron→crons, motor→
  reservar) ya NO usan el verify token de Meta (baja entropía, conocido en el panel de Meta) sino
  **`AGENTE_INTERNO_SECRET`** (32 bytes aleatorios, comparación a tiempo constante, pieza nueva
  `api/lib/secreto-interno.js`). Transición SIN cortes: deploy que aceptaba ambos → variable en
  Vercel → `cron.alter_job` de los 4 crons HTTP (jobids 1, 5, 6, 7) → verificado (4×200 en
  `net._http_response`) → deploy final que rechaza el viejo. Probado al aire: secreto nuevo 200,
  token viejo "No autorizado", y el motor corre punta a punta con el secreto nuevo.

**Cuidado / qué NO hacer:** si se rota `AGENTE_INTERNO_SECRET`, hay que actualizar JUNTOS la
variable en Vercel (redeploy) y los cuerpos de los 4 pg_cron (`cron.alter_job` con replace) — si
se cambia solo un lado, los crons quedan en 403 (emergencia: `ACEPTAR_VIEJO=true` en
`api/lib/secreto-interno.js` y desplegar). El `WHATSAPP_VERIFY_TOKEN` sigue siendo necesario para
el GET de Meta — NO borrarlo. La marca `pago_asignado` ahora también APAGA el adjunto de la foto a
la IA: no usarla para otra cosa.

## 2026-06-10 — [WhatsApp] — Un "gracias" ya NO cancela los recordatorios del agente

**Qué decidimos:** cuando el cliente escribe, el sistema cancelaba TODOS los recordatorios
pendientes del chat (la idea era "ya retomó la conversación") — pero cancelaba incluso con un
"Gracias 🙏", y un seguimiento agendado a días moría en silencio (caso real 7-jun: recordatorio del
abono de la boleta 6427 para el jueves, cancelado por un "Gracias"; quedó en `recordatorios` id
e3fe3b03). Mateo eligió el criterio "cortesía no cancela": un mensaje de PURA cortesía (solo
palabras tipo gracias/ok/vale/perfecto, o solo emojis 🙏👍❤️) ya no cancela nada; cualquier mensaje
con sustancia cancela como siempre.

**Cómo:** función `esCortesiaPura(tipo, texto)` en `recibir.js`, delante de
`cancelarRecordatorios`. Conservadora a propósito: lista corta de palabras; si trae un número
(boleta/monto), si no es texto (foto/audio), o si hay CUALQUIER palabra fuera de la lista → se
cancela como hoy. NO están en la lista las palabras que reabren la venta ("sí", "dale", "listo" —
puede significar "ya pagué") ni los saludos ("buenas" = está iniciando contacto). Probada con 37
casos (19 cortesías pasan, 18 sustancias cancelan), publicado en `27fd8b4` (deploy auto READY).

**Cuidado / qué NO hacer:** si se agregan palabras a `PALABRAS_CORTESIA`, pensar si esa palabra
puede significar "ya pagué" o "sigamos con la venta" — en la duda, dejarla FUERA (que cancele es el
lado seguro). Esto NO toca el disparo del agente ni los disparadores: a un "gracias" Liliana sigue
respondiendo normal; solo deja de matar el recordatorio. (Secundario aún pendiente: el cliente dijo
"miércoles" y la IA agendó "jueves"; es el cálculo de `dias` que hace el modelo, no este código.)

## 2026-06-10 — [WhatsApp] — Tanda 3 de los amarillos (H46+H53, H41, H28) — y la alerta nueva cazó un caso real

**Qué hicimos (verificado al aire, suite dorada 10/10):**
- **H46+H53 — La boleta tras apartar la envía el SISTEMA (ahorra una llamada a Claude por
  venta):** antes la IA tenía que llamar `enviar_boleta` tras apartar (3 llamadas a Claude por
  venta, ~4-8s extra); ahora la "red de seguridad" post-turno ES el camino normal — el sistema la
  envía solo, UNA vez con todas las boletas, al cerrar el turno. Se actualizaron el tool_result de
  apartar, la descripción de `enviar_boleta` ("SOLO si el cliente la pide de nuevo" — esto cierra
  la contradicción H53) y el paso 5 del manual (versionado automático). OJO: la boleta ahora llega
  DESPUÉS del mensaje final de Liliana (cambio de orden menor y esperado).
- **H41 — `reservar.js` protegido:** tope de 10 números por reserva + rate-limit 20/10min por IP +
  el campo `asesor` SOLO se honra con el secreto interno (el agente lo manda con
  `cuerpo.interno`; un curl anónimo queda como "Pagina Web" — adiós al spoofing de vendedor).
- **H28 — Alerta para chats en manos de asesor:** chequeo nuevo en `alertas-cron.js` (estado
  'humano' + cliente esperando >30 min) → WhatsApp a Mateo. **En su primera corrida real encontró
  un chat esperando ~12 HORAS (Leiky OG)** — el patrón exacto del caso de 15h de la auditoría.

**Cuidado / qué NO hacer:** si algún día se quiere que la IA vuelva a enviar la boleta ella misma,
hay que cambiar TRES sitios juntos (tool_result de apartar, descripción de enviar_boleta y paso 5
del manual) — si se cambia solo uno, o se duplica el envío o no sale. El secreto interno en
reservar es el mismo `WHATSAPP_VERIFY_TOKEN` (H39 sigue pendiente: separarlo algún día).

## 2026-06-10 — [WhatsApp] / [Pagos] — Tanda 2 de los amarillos (H31, H38, H45)

**Qué hicimos (verificado al aire):**
- **H31 — Candado anti "pago falso" v2:** 5 patrones nuevos que la v1 no cubría ("recibí tu pago",
  "tu pago ya entró", "se acreditó tu abono", "tu plata ya quedó en…", "todo en orden con tu
  pago") + un marcador de NEGACIÓN para no bloquear verdades de venta ("aún NO recibimos tu
  pago"). "Comprobante" sigue FUERA de la lista a propósito (el mensaje seguro dice "recibí tu
  comprobante"). Probado con la mini-lista del verificador: 24/24 (12 peligrosas bloquean, 12
  normales pasan), y la suite dorada en verde tras el cambio (sin sobre-bloqueo, la lección del 9-jun).
- **H45 — Números disponibles 3× más rápidos:** las 10 consultas por serie van en PARALELO
  (medido al aire: 2.33s → 0.85s). Es la ruta más caliente de la venta (atajo de números,
  herramienta de Liliana, web y bandeja). Los 2 updates de marcas siguen secuenciales (limpiar
  antes de marcar, como pidió el verificador).
- **H38 — La lógica de la base ya es auditable desde el repo:** `sql/esquema-agente-produccion.sql`
  (instantánea de referencia: las 12 funciones reales —candados, bandeja, difusiones, costos—,
  los 5 crons con el secreto REDACTADO y la lista de tablas). `whatsapp-buzon.sql` marcado VIEJO
  (declaraba unicidad global de teléfono; la real es por línea+teléfono). **Regla nueva:** todo
  cambio en la base nace en su archivo de `sql/` (los del 10-jun ya cumplen).

**Cuidado / qué NO hacer:** la instantánea es REFERENCIA — nunca re-ejecutarla a ciegas contra
producción. Frases nuevas del candado: probarlas SIEMPRE contra la mini-lista (y la suite dorada)
antes de publicar.

## 2026-06-10 — [WhatsApp] / [Pagos] — Tanda 1 de los amarillos (H22, H23+H82, H26, H29, H69; H25/H33 ya cubiertos)

**Qué hicimos (5 arreglos chicos, verificados al aire):**
- **H69:** `abono.js` rechaza con 400 limpio un monto no numérico (`Number.isFinite`) — antes NaN
  pasaba los candados de monto y reventaba en el insert (el NOT NULL atajaba; ahora ni llega).
- **H26:** las **reacciones** (👍/❤️) ya NO cuentan como mensajes: no suman "sin leer", no cancelan
  recordatorios y no disparan al agente (la IA les respondía "¿te explico los premios?" a un
  corazón — pasaba a diario). Los tipos sin contenido ('unsupported') sí se guardan y suman sin
  leer, pero tampoco cancelan recordatorios ni disparan al agente de inmediato.
- **H22:** el mensaje fijo de premios ahora incluye el **acumulado vigente** (placeholder
  `{{acumulado}}` en `texto_premios`, misma cifra del saludo) — antes el saludo anunciaba el
  acumulado y el siguiente mensaje fijo decía solo "$5.000.000": dos cifras seguidas, lo que el
  manual prohíbe.
- **H23 (+H82):** `consultar_cliente` ya no anuncia un parámetro `telefono` que el ejecutor
  ignoraba — la IA "consultaba" el número de un tercero y presentaba como suyas las boletas de
  ESTE chat (información falsa). Ahora la herramienta dice claro que SOLO consulta este chat y que
  rechace consultas de terceros; el resultado dice "Cliente de ESTE chat".
- **H29:** el panel de **Gasto de IA** cobraba la escritura de caché a 1.25× cuando el ttl de 1h
  cuesta 2× → subfacturaba ~16-22% del día. Corregida la tabla PRECIOS (cw: Sonnet $6/M, Opus $10,
  Haiku $2). Cuenta de ahora en adelante. (Dato del verificador: el caché de 1h SÍ es negocio
  igual — ~8 lecturas por escritura; solo la medición estaba mal.)
- **H25 y H33** quedaron cubiertos por los arreglos de H10 y H5 del mismo día.

**Verificación:** abono con monto 'abc' → 400 limpio al aire; y la **suite dorada corrió como
regresión tras los cambios: 10/10 en verde** (primer uso real del gate de H14).

## 2026-06-10 — [WhatsApp] — H14: suite de conversaciones DORADAS (el manual ya se puede probar antes de publicarse)

**Qué hicimos:** el manual se editaba "en caliente" y cada corrección podía revivir un incidente
viejo sin que nadie lo notara hasta verlo con clientes reales (pasó 3+ veces en una semana). Ahora
existe la **suite dorada**: 10 mini-conversaciones de incidentes REALES documentados (voseo, contar
sábados del acumulado, el $20M vencido, pago falso, correo "obligatorio", extranjeros, $300M vs
amoblado, boleta por WhatsApp, no reventa, mínimos por sorteo) guardadas en
**`agente_casos_dorados`**, y el corredor **`api/whatsapp/probar-suite.js`** (solo gerencia) que
las corre contra el manual con las MISMAS herramientas del agente en MODO SECO (nada se ejecuta) y
evalúa con regex qué NO debe decir (y, poco, qué SÍ). Acepta `prompt` candidato para probar un
manual NUEVO **antes** de guardarlo. Primera corrida contra producción: **10/10 en verde**.

**Cómo se usa:** antes de publicar un cambio del manual, correr la suite (un chat de Claude lo hace
con la contraseña de gerencia: POST `/api/whatsapp/probar-suite` `{contrasena, linea_id, prompt?}`).
Rojo = ese manual repetiría un incidente. Caso nuevo tras cada incidente futuro = un INSERT.

**Cuidado / qué NO hacer:** los asserts son mayormente NEGATIVOS (prohibidos) a propósito — los
"requeridos" son frágiles, usarlos poco (la 1ª corrida tuvo 2 falsos rojos: un regex roto y una
herramienta exigida en un caso sin imagen real; ya corregidos). Un regex que no compila cuenta como
fallo (a propósito: mejor falso rojo que prueba muerta). La suite NO reemplaza el modo sombra: es
la primera línea, no la única.

## 2026-06-10 — [WhatsApp] / [General] — H16: el sistema ahora le AVISA a Mateo por WhatsApp (alertas + resumen diario)

**Qué hicimos:** hasta hoy ningún fallo del agente avisaba a nadie (los errores quedaban en la
actividad y solo se veían si Mateo abría la cabina). Nuevo cron **`alertas-agente-cada-15min`**
(pg_cron jobid 7 → `api/whatsapp/alertas-cron.js`, maxDuration 30) que revisa cada 15 min y manda
UN WhatsApp resumido a Mateo (573123354789, por la línea de Lili) cuando hay:
1. **Clientes esperando** >15 min con el agente activo (si el barredor de H12 no pudo destrabarlos,
   algo pasa) — con memoria anti-repetición (no avisa el mismo chat dos veces en 2h).
2. **Errores nuevos** del agente (`agente_actividad` tipo 'error') — excluye los de la propia
   alerta fallida para no hacer bucle.
3. **Verificaciones de pago rendidas** (cliente pagó y no se confirmó en ~1h).
4. **Gasto de IA anómalo** (hoy >2× el promedio diario de la semana y >$2; máx. 1 aviso/día).
Y a las **8 p.m.** el **resumen del día**: abonos ($ y cuántos), gasto de IA y errores.

**Ventana de 24h:** el envío normal es texto libre (Mateo opera la línea a diario → ventana
abierta). Respaldo: plantilla utility **`alerta_sistema_los_plata`** (creada 10-jun, en revisión de
Meta; cuando esté "aprobada", el respaldo funciona solo). Si nada sale, el aviso queda en la
actividad. La memoria del cron vive en **`agente_alertas_estado`** (fila única jsonb).

**Probado en vivo:** corrida limpia → `alertas:0`; con un error de PRUEBA sembrado →
`alertas:1, enviado:true` y el WhatsApp llegó.

**Cuidado / qué NO hacer:** si Mateo cambia de número o de línea, actualizar las constantes
`TEL_MATEO` / `LINEA_ALERTAS` en `alertas-cron.js` (exige deploy). No convertir las alertas en
ruido: los umbrales (15 min, 2×, 1/día) están afinados para avisar solo lo accionable — subir
umbrales antes que silenciar el cron.

## 2026-06-10 — [WhatsApp] — H17: los textos de la rifa salieron del código (rotar rifa ya no exige programador)

**Qué hicimos:** los atajos SIN IA (saludo, premios, pedir datos) y la descripción de la
herramienta del contacto inicial tenían QUEMADOS los textos de ESTA rifa (precio $150 mil, la casa
de Chinchiná, $300M, sábados $5M): al rotar de rifa el 4-jul habrían seguido vendiendo la rifa
vieja a todo cliente nuevo aunque se actualizara el manual, y arreglarlo exigía desplegar código.
Ahora esos textos viven en **`agente_config.variables`** (claves `saludo_inicial`,
`cierre_inicial`, `texto_premios` con `{{fecha_mayor}}`, `texto_pedir_datos` con `{{numero}}`,
`condiciones_venta`): sembradas en la base con los textos actuales (idénticos — la conducta no
cambió), editables desde la cabina y **versionadas por el historial de H15**. El código conserva
los mismos textos como RESPALDO si una variable falta. También quedó neutro el fallback del
recordatorio por plantilla ("lo de tu boleta", sin "de la casa").

**Checklist de rotación NUEVO: `docs/CHECKLIST-RIFA-NUEVA.md`** — todo lo que hay que tocar al
rotar (rifa activa, calendario y sus DOS convenciones: el sorteo principal lleva "Mayor/casa" en el
título y la cadena del acumulado usa títulos idénticos; resultados, variables, manual, fotos del
contacto inicial, plantillas de Meta; y los DOS únicos que exigen deploy: `precios.js` y
`resolucion.pdf`). Regla: línea en modo sombra hasta tachar todo.

**Cuidado / qué NO hacer:** las variables de la base MANDAN sobre el código — si un texto del
atajo se ve raro, revisar primero `agente_config.variables` (y su historial). NO quitar
`{{fecha_mayor}}` ni `{{numero}}` de esos textos: el código les inyecta el valor real. NO renombrar
la respuesta rápida "contacto inicial" (las fotos se buscan por ese título).

## 2026-06-10 — [Seguridad] — Sección 4 de la auditoría: firma del webhook (H19), datos enumerables (H20) y límite de tasa (H40)

**Qué hicimos:**
1. **H19 — Firma del webhook de Meta** (`recibir.js`): el POST del webhook ahora puede validar la
   firma `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo CRUDO, comparación a tiempo constante).
   Firma mala → 200 SIN procesar (Meta no reintenta, el POST falso no tiene efectos). **Diseño en
   dos pasos:** la validación SOLO se activa cuando exista la variable `META_APP_SECRET` en Vercel
   — mientras no esté, el webhook procesa como siempre (deploy seguro). Si el runtime no entrega
   el cuerpo crudo, procesa y deja rastro en el log (fail-open con telemetría, nunca enmudece el
   canal). **FALTA (solo Mateo):** copiar el App Secret (developers.facebook.com → la app →
   Configuración → Básica) a Vercel como `META_APP_SECRET` y redeploy.
2. **H20 — Datos de clientes enumerables**: el endpoint REAL detrás del enlace /boleta es
   `api/abonar/cliente.js` (corrección del verificador) y filtraba cédula + correo completos con
   solo el teléfono. Ahora: **cédula y correo ENMASCARADOS** ("••• 149" / "ma•••@gmail.com" — la
   página los muestra así y al dueño le sirven igual) + **rate-limit por IP** (40/10 min ahí;
   300/10 min en `api/cliente.js` porque lo consume ChateaPro desde pocas IPs — generoso a
   propósito para no frenar ventas). El abonar-app no usa esos campos (verificado).
3. **H40 — Tope de gasto por abuso**: máximo 6 arranques del motor por minuto por teléfono
   (`recibir.js`). Si se pasa, NO se pierde nada: el mensaje queda guardado y el barredor del cron
   lo retoma en ~2 min (degrada, no enmudece — como pidió el verificador).
**Pieza nueva compartida:** `rate_limit_check` en la base + `api/lib/rate-limit.js` (FAIL-OPEN a
propósito: si el contador falla, se permite — nunca tumbar el negocio por el freno). SQL versionado
en `sql/rate-limit.sql`.

**Verificado al aire (commit `dba520f`):** webhook procesa normal con la lectura de cuerpo nuevo;
cédula sale "••• 149" con boletas intactas; la respuesta de `/api/cliente` (ChateaPro) no cambió;
la lógica del contador permite 40 y bloquea la 41 (probada en la base). Descubrimiento: el firewall
de Vercel además DESAFÍA ráfagas agresivas por IP (`x-vercel-mitigated: challenge`) — capa extra
que ya nos protegía en parte.

**Cuidado / qué NO hacer:** cuando se configure `META_APP_SECRET`, probar enviando un mensaje real
de WhatsApp ANTES de dar por cerrado H19 (si la firma no casara por algo del cuerpo crudo, el log
de Vercel lo dice y se puede retirar la variable para volver al estado anterior en segundos). NO
bajar el límite de `api/cliente.js` sin pensar en ChateaPro (muchos clientes legítimos salen por
pocas IPs suyas). El rate-limit es fail-open a propósito — no "arreglarlo" para que bloquee cuando
la base falle.

## 2026-06-10 — [WhatsApp] — H3+H15: el manual ya no ordena un acumulado vencido, y AHORA TIENE RESPALDO automático

**Qué hicimos (OK de Mateo):**
1. **H15 primero (versionado):** tabla `agente_config_historial` + trigger — cada cambio del
   prompt/variables guarda la versión ANTERIOR antes de pisarse. Restaurar = copiar el prompt de la
   fila deseada de vuelta (receta en `sql/versionado-manual-liliana.sql`). Antes, un `replace()` mal
   hecho destruía el manual sin copia.
2. **H3 (con la red puesta):** el manual ordenaba "ACLARA SIEMPRE… el de HOY está acumulado en
   *$20.000.000*" de forma incondicional, pero ese acumulado se GANÓ el 6-jun: instrucción imperativa
   cacheada contra la nota volátil del motor → Liliana podía decir un premio 4× inflado. Se volvieron
   CONDICIONALES las 6 ocurrencias ("el monto que te dé el sistema"; si el sistema no indica
   acumulado → solo $5.000.000, sin mencionar montos viejos) y se reconcilió la contradicción
   interna (línea "ACLARA SIEMPRE las dos cifras" vs "di solo el monto del sistema"). De paso, la
   aclaración opcional de H2 en la ruta CON IA: "con $20.000 ya entras" vale para los SÁBADOS; el
   Premio Mayor exige boleta 100% pagada.

**Verificado:** 0 ocurrencias de "$20.000.000" en el manual nuevo; bloques leen coherentes; el
respaldo automático guardó la versión anterior (27.706 chars). Efecto inmediato sin deploy (el motor
lee `agente_config` en cada respuesta); el caché de Anthropic se reescribe una vez (~8k tokens,
costo despreciable).

**Cuidado / qué NO hacer:** cuando haya un acumulado NUEVO vigente, NO volver a escribir el monto a
mano en el manual: el motor ya lo inyecta solo desde los resultados del calendario. El manual debe
seguir hablando de "el monto que te dé el sistema". Ediciones futuras del manual: hacerlas tranquilo,
el historial respalda cada cambio (restaurar con la receta del SQL).

## 2026-06-10 — [WhatsApp] — H2: el saludo fijo ya no promete entrar al Premio Mayor con $20.000

**Qué:** el atajo SIN IA del contacto inicial pegaba "— con *$20.000* de abono ya entras 🎉" a
CUALQUIER próximo sorteo. Del 28-jun al 4-jul (semana pico) eso prometería entrar al sorteo de LA
CASA con $20.000, cuando el Premio Mayor exige boleta 100% pagada. Ahora, si el título del próximo
sorteo es el Premio Mayor (regex `/mayor|casa/i`, validado contra el calendario real: caza SOLO el
4-jul y ningún sábado), la coletilla cambia a "— con tu boleta *100% pagada* participas por la
casa. 🏡". La viñeta "separar con 20 mil" del cierre se conserva (separar ≠ elegibilidad, sigue
siendo cierta). **Pendiente (con OK de Mateo, junto a H3):** la aclaración opcional en el manual
para la ruta CON IA.

## 2026-06-10 — [WhatsApp] — Cerrada la familia "clientes colgados en silencio" (sección 2 de la auditoría: H4, H5, H10, H11, H12, H13, H21)

**Qué hicimos:** cerramos TODOS los mecanismos conocidos por los que un cliente escribía y Liliana
quedaba callada sin que nadie se enterara (la causa probable de las "respuestas en null"):
1. **Reintento ante errores de la IA + catch global sano (H4/H11):** un blip de Anthropic (429/5xx/
   no-JSON/red) se reintenta 1 vez (refrescando el candado en la espera); si persiste → nota +
   etiqueta ASESOR. El catch global ahora suelta el candado, deja el error en `agente_actividad` y
   marca ASESOR (`conv` izada fuera del try) — antes devolvía un 500 que nadie leía.
2. **Mensajes durante la redacción (H5/H21):** el candado se refresca en cada vuelta del bucle y en
   transcripción/descarga (no más doble respuesta por vencerse a los 60s); al cerrar, si llegó un
   entrante posterior al claim, la corrida se re-dispara a sí misma con el flag `redisparo` (salta
   la guarda de "último mensaje es nuestro").
3. **Red de reenganche (H12):** barredor cada minuto en `recordatorios-cron.js` (chats con agente
   activo + último mensaje del cliente + 2-60 min sin respuesta → re-POST al motor; excluye
   humano/apagado/sombra, tope 8 por tanda) + el claim guarda `agente_claim_at` y PERMITE re-reclamar
   un turno muerto a los 5 min si nunca salió respuesta posterior (atómico en la RPC
   `agente_claim_respuesta`, SQL versionado en `sql/agente-claim-reclaim.sql`; columna nueva
   `conversaciones_whatsapp.agente_claim_at`).
4. **La verdad de los envíos (H10):** `decir()` revisa `env.ok`: si WhatsApp rechaza, el mensaje se
   guarda 'fallido' (el chat NO se marca atendido → sigue en "sin respuesta"), nota + ASESOR;
   `enviar_contacto_inicial`/`enviar_boleta` ya no le dicen "Listo" a la IA si el envío falló; el
   historial de la IA EXCLUYE los 'fallido' (no "recuerda" lo que el cliente nunca recibió); y el
   cron de pagos, si abona pero el aviso falla, deja error + ASESOR.
5. **Errores tragados (H13):** `agendarVerificacion` revisa `{ error }` del insert (supabase-js NO
   lanza) → si falla, error en actividad + ASESOR; el webhook devuelve 500 SOLO si llegaron mensajes
   y NINGUNO se guardó (Meta reintenta; el dedup por wa_message_id absorbe el reintento) — los
   webhooks de solo-acuses siguen en 200; y el disparo del motor distingue el corte normal de 1.5s
   de un fallo real (queda en el log de Vercel).

**Verificado al aire (commit `38d5083`):** el cron de cada minuto ya responde con `barridos:0`
(barredor corriendo limpio; 0 chats trabados en la ventana al desplegar); el motor corre de punta a
punta sobre un chat real ya respondido y sale con el skip esperado sin enviar nada; la RPC del
re-claim probada con rollback (4 casos: reclama/bloquea fresco/re-reclama muerto/rechaza viejo).

**Cuidado / qué NO hacer:** el flag `redisparo` y el parámetro `recordatorio` son los DOS únicos
caminos que saltan la guarda de "último mensaje es del cliente" — no agregar otros sin pensar en el
claim. El barredor depende de `ultimo_entrante=true`: si algún código nuevo marca el chat como
atendido sin responder de verdad, el barredor no lo verá. El estado 'fallido' en `mensajes_whatsapp`
ahora EXCLUYE el mensaje de la memoria de la IA: no usarlo para otra cosa. Si Meta empezara a
reintentar en bucle, revisar que el 500 del webhook solo salga cuando de verdad NO se guardó nada.

## 2026-06-10 — [Pagos] / [Base de datos] — Traslado de abonos ATÓMICO (H37) + cerrada la doble venta en venta.js

**Qué hicimos (cierra la sección de DINERO del plan de Liliana):**
1. **H37 — `trasladar-abono.js`:** antes movía plata en 7 pasos sueltos (mover abonos → recalcular
   saldos → reapuntar transferencias); un crash a mitad dejaba saldos falsos que alimentan otros
   candados ("liberar solo con $0", anti pago falso). Ahora TODO vive en la función transaccional
   **`trasladar_abono_atomico`** en Postgres: o se hace todo o no se hace nada. Bloquea AMBAS boletas
   en orden fijo (dos traslados simultáneos se hacen en fila, sin deadlock), valida DENTRO de la
   transacción (mismo cliente, total disponible, tope del destino — sin TOCTOU) y devuelve códigos
   que el endpoint traduce a los mismos mensajes de siempre. Solo el backend puede ejecutarla
   (revoke a anon/authenticated, grant a service_role). **SQL versionado en
   `sql/trasladar-abono-atomico.sql`** (empieza a pagar H38). La bitácora del movimiento sigue en el
   endpoint (fuera de la transacción, como antes).
2. **Carrera de la boleta en `venta.js`** (hallazgo nuevo del 10-jun, hermano de H8): ocupar la
   boleta ahora exige `.is('telefono_cliente', null)`; si otro asesor/la web ganó en ese segundo, se
   deshace lo ya escrito (borra el abono recién insertado por su id, devuelve la transferencia a
   LIBRE condicional, resta las estadísticas del cliente) y responde "se acaba de vender".

**Cómo se probó (sin tocar datos reales):** la función se probó EN PRODUCCIÓN con un bloque que
termina en excepción a propósito (rollback garantizado): el camino feliz movió/partió $20.000 entre
2 boletas reales del mismo cliente (saldos y abonos quedaron exactos en la previa) y la base deshizo
todo (verificado después: datos intactos). Las 5 validaciones (no existe / otro cliente / excede
total / excede destino / monto inválido) devuelven su código sin escribir. Al aire: el endpoint
responde el 403 de "mismo cliente" desde el mapeo nuevo (commit `07b7533`).

**Cuidado / qué NO hacer:** si se cambia la lógica del traslado, editar la FUNCIÓN
(`sql/trasladar-abono-atomico.sql` + aplicar migración), no resucitar los pasos sueltos en el
endpoint. El endpoint valida solo formato; las reglas de negocio viven en la función. Si una rifa
nueva cambia el precio por defecto, el endpoint ya manda `PRECIOS.RIFA_4_CIFRAS` como
`p_precio_default`.

## 2026-06-10 — [Pagos] / [Seguridad] — Cerrados los 4 huecos de concurrencia en los candados de plata (H6-H9 de la auditoría)

**Qué hicimos:** cerramos las "carreras" donde dos procesos a la vez podían pasar el mismo check y
duplicar plata o pisarse. Patrón común: el check ("¿libre?") y la acción ("ocupar/consumir") eran pasos
separados; ahora la acción lleva la condición DENTRO del update y se verifica la fila afectada.
- **H6 (`abono.js` + `venta.js`):** la transferencia se consume con `update ... eq('estado','LIBRE')`
  verificando fila afectada, ANTES de insertar el abono; si el insert falla se devuelve a LIBRE
  (condicional, para no pisar a otro). Si otro proceso ganó → error claro "se acaba de asignar en otro
  proceso", sin escribir nada. La auto-asignación por referencia también quedó condicional. OJO: en
  `venta.js` un insert de abono fallido antes pasaba EN SILENCIO (la venta seguía sin abono); ahora
  aborta con error — es deliberado.
- **H7 (`verificar-pagos-cron.js` + `agente-responder.js`):** estado nuevo **'en_proceso'** en
  `verificaciones_pago` como "turno": el cron lo marca al reclamar (y devuelve a 'pendiente' al
  reprogramar); `registrar_abono` NO verifica si hay una 'en_proceso' fresca (<10 min) — le dice a la
  IA "ya se está verificando" — y reclama la 'pendiente' antes de verificar (la suelta en los caminos
  sin_saldo/error). El cron rescata filas 'en_proceso' huérfanas (>10 min sin movimiento) por si una
  corrida muere. `cancelarVerificaciones` ahora cubre 'pendiente' Y 'en_proceso'. Verificado: la tabla
  no tiene restricción de estado y el índice único es parcial sobre 'pendiente' (compatible).
- **H8 (`reservar.js`):** ocupar la boleta exige `.is('telefono_cliente', null)` (confirmado en
  producción: las libres son NULL); si otro cliente ganó, se revierten SOLO las boletas del mismo
  pedido (filtros: teléfono propio + $0 abonado) y se responde "ese número se acaba de ocupar".
- **H9 (`buscar-pago.js`):** la coincidencia por referencia exige mínimo 5 caracteres también en la
  referencia cruda (en `esCoincidencia` y `elegirSugerida`); una referencia cortada ya no abona sola,
  cae a revisión humana.

**Verificado al aire (commit `8c72273`, deploy automático source=git):** los 4 endpoints responden
sus validaciones limpias; reservar rechaza un número ocupado; el cron corrió a las 01:35 con el código
nuevo y respondió ok. No había verificaciones activas al publicar.

**Cuidado / qué NO hacer:** NO quitar las condiciones `.eq('estado','LIBRE')` / `.is('telefono_cliente',
null)` de esos updates "porque parecen redundantes con el check de arriba" — el check de arriba solo da
el error temprano; el candado REAL es la condición del update. El estado 'en_proceso' es transitorio:
si algún día se ve uno pegado, el cron lo rescata a los 10 min (no "arreglarlo" a mano salvo emergencia).
**Hallazgo nuevo aparte (anotado en PENDIENTES):** `venta.js` tiene la MISMA carrera de H8 con la
boleta (check "ya fue vendida" y ocupación sin condición) — no estaba en la auditoría; cerrarla luego.

## 2026-06-09 — [WhatsApp] / [General] — Auditoría COMPLETA de Liliana (90 hallazgos) + arreglado el modelo retirable de comprobantes

**Qué se hizo:** auditoría multi-agente exhaustiva del agente Liliana (101 agentes: 8 auditores por
dimensión —velocidad, costos, dinero, seguridad, coherencia, escala, conversación, estrategia—, un
verificador escéptico por hallazgo y un crítico de completitud). 90 hallazgos confirmados contra el
código y producción. El plan para ir tachando quedó en **`docs/PENDIENTES-LILIANA.md`** (resumen
priorizado) y el detalle completo en **`docs/auditoria-liliana-2026-06-09.md`** (anexo, abrir solo
por ítem).

**CRÍTICO resuelto el mismo día:** la lectura de comprobantes (y la carga de pagos del banco, el
procesador de gastos y el análisis IA) usaban el modelo `claude-sonnet-4-20250514`, que Anthropic
retira el **15-jun-2026** — en 6 días todo el abono automático habría muerto con error 404. Se
cambió en los 4 archivos al reemplazo oficial `claude-sonnet-4-6`, publicado y probado con 2
comprobantes reales (lectura idéntica: plataforma, monto y referencia).

**Lo más importante del plan (en orden):** (1) huecos de concurrencia en los candados de plata
(doble abono posible: H6-H9); (2) la familia de "clientes colgados en silencio" — mecanismos
concretos detrás de las "respuestas en null" (H5/H21, H12, H4/H11, H10, H13); (3) dos bombas de
tiempo de coherencia con fecha (saludo fijo prometiendo entrar a la casa con $20.000 en la semana
final H2; manual ordenando afirmar un acumulado de $20M que ya no existe H3); (4) seguridad (webhook
sin firma H19, datos de clientes enumerables H20); (5) capacidades nuevas: versionado del manual,
suite de pruebas doradas, monitoreo con alertas al WhatsApp de Mateo, checklist de rifa nueva y
cobro suave automático (~$10.9M en saldos cobrables ya identificados).

**Cuidado / qué NO hacer:** antes de implementar cualquier ítem, leer su "nota del verificador" en
el anexo (varias mejoras tienen correcciones importantes ahí). Los ítems de dinero se explican a
Mateo ANTES de tocar. No leer el anexo entero (300KB): solo la sección del ítem.

## 2026-06-09 — [Pagos] — BUG del abono automático del agente: buscar-pago no seguía al actor real (ARREGLADO + $110.000 recuperados)

**Qué pasó:** desde el cambio del 8-jun ("los movimientos del agente quedan a nombre de Liliana"), el abono
automático del agente quedó ROTO en silencio. El fix de grupo de ese día se aplicó en `abono.js` y
`liberar-boleta.js` pero NO en `buscar-pago.js`: ahí `puede_modificar` se calculaba con el grupo de quien
AUTENTICA (gerencia = 'regular'), y las boletas del agente ahora son de 'Liliana' ('independiente') → todas
salían `puede_modificar=false` → `verificarYAbonar` (abono-agente.js) las filtraba → devolvía 'sin_saldo'
AUNQUE el pago hubiera coincidido sólido con el banco. En el turno en vivo la IA recibía "no tiene boletas
con saldo"; en el cron la verificación se cerraba 'cancelado' EN SILENCIO y el pago quedaba LIBRE sin asignar.

**Arreglo (mínimo, mismo patrón del 8-jun):** `buscar-pago.js` acepta `asesorRegistro` (honrado SOLO si quien
autentica es gerencia, candado `esGerencia`) y calcula el grupo con ese actor real; `abono-agente.js` resuelve
el actor ANTES de buscar el pago y lo pasa. Sin override todo sigue igual (la bandeja no cambia). Verificado
al aire: sin override `puede_modificar=false`, con override `true`; el mismo pago que se botó coincide
"por referencia".

**Plata recuperada (3 pagos botados el 8-9 jun, rastreados con buscar-pago en modo lectura):** se revivieron
sus verificaciones (estado 'pendiente') y el cron, ya con el arreglo, abonó los 3 amarrados a su transferencia
y les avisó a los clientes: $60.000→boleta 5653, $30.000→3554, $20.000→9744 (total **$110.000**). Otros 3
casos 'sin saldo' ya los había salvado un asesor a mano (9656, 3174, 8671). Verificado en la base (boletas,
transferencias ASIGNADAS, verificaciones 'abonado').

**Cuidado / qué NO hacer:** si algún día otro endpoint del camino del agente valida grupo, debe seguir al
ACTOR REAL (patrón `asesorRegistro` + `esGerencia`), no a quien autentica. El estado 'cancelado' con resultado
"sin saldo (quizá ya estaba pago)" ahora vuelve a ser confiable, pero si reaparece en serie, sospechar.

## 2026-06-09 — [WhatsApp] / [Pagos] — Candado anti "pago falso" AFINADO (bloqueaba respuestas normales)

**Qué pasó (mismo día del candado):** el candado publicado a las ~4pm disparaba EN FALSO: a 3 clientes
(patty —pregunta de estafa—, Bernardo La-Rotta —eligió el 5181—, Nl —"¿quedó debiendo 130?"—) les botó la
respuesta normal de Liliana y les mandó "ya recibí tu comprobante y estoy verificando tu pago" SIN que hubiera
comprobante alguno. Causa (probada con la función real): el detector cazaba "100%" cerca de palabras como
boleta/pago ("es 100% legal" → bloqueada) y la frase "pagada al 100" sin importar el tiempo verbal ("CUANDO
esté pagada al 100% te enviamos la factura" → bloqueada).

**El arreglo (2 capas, publicado y probado con 26 casos):**
1. **Detector preciso** (`afirmaPagoHecho`): solo afirmaciones de pago YA hecho ("quedó pagada", "registré tu
   abono", "pago confirmado", "ya está pagada"). Las frases condicionales/futuras se excluyen mirando si justo
   antes (misma oración) hay un marcador tipo "cuando / para / una vez / apenas / falta / debe estar". Se quitó
   la regla floja del "100%".
2. **Solo en contexto de pago** (`esContextoPago`): el candado SOLO se arma si en los últimos ~12 mensajes el
   cliente mandó una FOTO o dijo que ya pagó/transfirió. Fuera de ese contexto ni se evalúa (la respuesta
   "recibí tu comprobante" no tiene sentido ahí). Y si se bloquea SIN foto, el mensaje seguro ya no menciona
   un comprobante ("estoy verificando tu pago en el sistema").

**Cuidado / qué NO hacer:** el candado SIGUE protegiendo el caso Madenys (todas las frases peligrosas se
siguen bloqueando — probado). Si se agregan frases al detector, probarlas SIEMPRE contra frases condicionales
normales de venta. Los 3 chats afectados quedaron con etiqueta ASESOR de ese rato (revisar/quitar a mano).

## 2026-06-09 — [General] — Deploy automático GitHub→Vercel REPARADO (reconexión por CLI)

**Qué pasó:** el deploy automático seguía sin dispararse (un push de prueba no generó deploy en 4 min), aunque
Vercel decía "ya conectado" y el repo era el mismo (repoId coincidía). Era el aviso (webhook) de GitHub a
Vercel que estaba muerto.

**Cómo se arregló (SIN el panel):** desde `~/los-platas-rifas` con la CLI: `vercel git disconnect --yes` y
`vercel git connect https://github.com/mplatab1126/api-rifas-prueba --yes`. Eso recreó la conexión. Probado con
un push real: el deploy automático disparó (source=git), compiló a READY y el sitio respondió 200.

**Qué cambia:** volvió el flujo normal — `git push origin main` publica solo (~1 min). Ya NO hay que usar
`vercel --prod --yes` (queda como plan B). Si vuelve a pasar: probar PRIMERO la reconexión por CLI antes de
mandar a Mateo al panel. Diagnóstico útil: `vercel api "/v6/deployments?...&limit=8"` — el campo `source`
distingue `git` (automático) de `cli`.

**Mismo día — cerrado el pendiente de la boleta 9290:** se registró el abono real de Madenys (+573213110313):
$100.000 amarrado a la transferencia Nequi M02384005 (consumida → ASIGNADA), a nombre de Liliana, vía
`/api/admin/abono` con `asesorRegistro` (confirmado por Mateo antes de tocar). Boleta pagada al 100% y la foto
del comprobante marcada "✅ Pago asignado". Verificado en la base.

## 2026-06-09 — [WhatsApp] / [Pagos] — Candado anti "pago falso" + visibilidad de comprobantes del cliente

**Qué pasó (caso real):** la clienta Madenys (+573213110313) pagó de verdad $100.000 (Nequi, ref
M02384005, estado LIBRE en `transferencias`) para completar la boleta 9290. Liliana le dijo *"tu boleta
quedó pagada al 100%"* PERO **nunca ejecutó la herramienta de abono** (cero notas en `agente_actividad`):
inventó la confirmación creyéndole al cliente. La boleta quedó debiendo $100.000 y el pago real, sin asignar.
Diagnóstico: el texto que sale al cliente NO estaba atado a una acción verificada; el modelo podía "declarar"
un pago sin que el sistema lo registrara.

**Qué hicimos (3 piezas, publicadas):**
1. **Candado anti pago falso** (`agente-responder.js`): antes de mandar el texto final, si afirma un pago
   hecho ("pagada al 100%", "quedó pagada", "registré tu abono", "pago confirmado", "quedó abonado") y NO
   hubo un abono REAL en ese turno **y** la boleta sigue debiendo según la base → NO lo manda. Envía el
   mensaje seguro ("ya recibí tu comprobante, estoy verificando tu pago"), marca ASESOR y deja el comprobante
   en verificación automática. Usa la VERDAD del sistema (saldo en `boletas`, no se puede engañar). Es
   conservador (puede mandar "verificando" de más si el cliente tiene 2 boletas, una paga y una no) — lado
   seguro. Función `afirmaPagoHecho()` probada: caza 5 frases peligrosas, deja pasar 5 normales (incl. la
   promesa "te registro el abono"). El candado permite la felicitación si el abono SÍ se hizo en el turno o
   si la boleta ya estaba paga de antes.
2. **Etiqueta "✅ Pago asignado" sobre la foto del comprobante** (`mensajes.js` expone `raw.pago_asignado`;
   se escribe al abonar desde un comprobante, tanto por Liliana —`registrar_abono`— como por el abono manual
   de la bandeja —endpoint nuevo `marcar-comprobante.js`—). Solo informativo; no toca la lógica del abono.
3. **Menú "Comprobantes"** en la bandeja (endpoint nuevo `comprobantes.js`, paginado en servidor): lista las
   fotos que mandan los clientes (✅ asignado / ⏳ sin asignar), con clic para ir a la conversación. Filtro
   "solo sin asignar".

**Cuidado / qué NO hacer:** la marca "asignado" y el candado funcionan **de aquí en adelante** (los
comprobantes viejos salen "sin asignar"). NO confundir la idea de Mateo (lista de comprobantes del cliente)
con la tabla `transferencias` (pagos del banco): son cosas distintas; la lista nueva es de las FOTOS del chat.

**Pendiente del caso:** Mateo iba a registrar el abono real de la boleta 9290 a mano (el pago LIBRE M02384005).

## 2026-06-09 — [General] — El deploy automático GitHub→Vercel dejó de dispararse (se publicó por CLI)

**Qué pasó:** al publicar el candado, el push a GitHub (`5efc368`) entró bien, pero **Vercel no creó ningún
deploy nuevo**: el último deploy automático era de hace ~15h (`vercel ls` lo confirmó). Síntoma clásico de
"publiqué pero no se ve": producción seguía sirviendo el build viejo (bandeja con `age` de horas, endpoints
nuevos en 404). **NO era un rollback** (no había deploy nuevo que promover); la conexión GitHub→Vercel no se
disparó (rota desde anoche; hoy solo hubo commits de docs, que no necesitan deploy y por eso no se notó).

**Cómo se resolvió:** se publicó directo con la **CLI de Vercel** desde el clon limpio: `vercel link --yes
--project api-rifas-prueba` y `vercel --prod --yes`. Compiló y quedó aliased a `www.losplata.com.co`.
Verificado al aire (endpoints en 405, menú Comprobantes presente).

**Qué hay que hacer:** revisar en Vercel → proyecto `api-rifas-prueba` → **Settings → Git** que el repo siga
conectado (reconectarlo si aparece desconectado). Solo Mateo puede darlo en el panel. **Mientras tanto, los
push a `main` NO salen solos**: hay que publicar con `vercel --prod --yes` desde `~/los-platas-rifas` (ya
quedó enlazado con la CLI; el `.vercel` está en `.gitignore`).

## 2026-06-09 — [WhatsApp] — Afinaciones del manual tras auditar 48-120h de respuestas de Liliana

**Contexto:** auditamos ~115 respuestas reales de Liliana (preguntas no obvias / capciosas). Salieron patrones de
error que se REPETÍAN. La mayoría son de manual/lógica (no de inteligencia del modelo) → se arreglan en el
manual (`agente_config.prompt`, efecto inmediato). Decidimos NO subir a Opus 4.8 (costaría ~1,67× más y no
arreglaría reglas que faltan; ver más abajo). Arreglos aplicados:

1. **Cédula/correo: nunca "obligatorios" ni mandar a crear un correo.** Caso real: a "no tengo correo" Liliana
   respondió "el correo es OBLIGATORIO, crea un Gmail o pide uno prestado" (contradice la política: son para la
   factura, se aparta igual sin ellos). Ahora el manual prohíbe decir "opcionales" **y** "obligatorios", y
   prohíbe mandar a crear/conseguir un correo. (Bloques "DATOS DE LA RIFA ACTUAL" y paso "3) DATOS".)
2. **Clientes del exterior.** Caso real (Panamá): Liliana le dijo que "necesita un celular colombiano" y le pidió
   el número de un familiar — al revés de la regla (la boleta se registra con el número del chat, cualquier país).
   Se reforzó la regla "REGISTRO DE LA BOLETA": clientes de otros países SÍ participan con el número de este chat;
   nunca pedir celular colombiano ni de un familiar.
3. **Remisión más firme.** Caso real (luis fernando, boleta de Claudia): debía remitir y en vez de eso hizo el
   guion de venta. Se agregó una regla dura en "LO QUE MÁS SE ROMPE": si el sistema indica remisión, NO se
   presenta, NO explica premios, NO muestra números, NO aparta/abona; solo da el número del punto y termina.
4. **Dudas de saldo/abono.** Varios clientes preguntaron su saldo y quedaron sin respuesta clara. Se reforzó:
   SIEMPRE consultar y responder cuánto lleva abonado y cuánto falta; no dejar la pregunta sin respuesta.

5. **Permiso venezolano / extranjeros (DECIDIDO 9-jun — opción 1):** Mateo decidió que los extranjeros SÍ pueden
   participar Y reclamar el premio con su documento (cédula de extranjería, PPT/PEP o pasaporte); se registra
   igual que una cédula. (Se investigó Coljuegos: su página menciona "cédula de ciudadanía de los ganadores" pero
   NO detalla el caso extranjero; la práctica general acepta documento extranjero. Mateo eligió la opción abierta.)
   Regla agregada en "OTRAS CONDICIONES" del manual.

**Otra incoherencia corregida (9-jun):** el paso "6) PAGO" decía "el sistema verifica… y *un supervisor lo
revisa*"; el supervisor Opus se eliminó el 8-jun, así que era FALSO. Se quitó esa frase (ahora: "el sistema
verifica el pago contra el banco; si todo cuadra, queda abonado").

**Hallazgos del análisis de coherencia (manual + 13 herramientas + motor), pendientes de OK de Mateo:**
- **Sueldazo residual → LIMPIADO (9-jun):** se quitaron los detalles operativos muertos (párrafo de $1.5M×6 en
  DATOS, mínimo $50.000 en CONDICIONES, horario Manizales 11pm en HORARIOS, y el ejemplo "hoy juega el Sueldazo"
  en URGENCIA). Se CONSERVA que Liliana sepa que YA SE JUGÓ (3-jun) y tiene ganadora, y que puede responder si un
  cliente pregunta por él o por su ganador (lo pidió Mateo). "Manizales" solo queda como ciudad de ejemplo.
- **Herramienta `apartar_numero` (código) — PENDIENTE:** su descripción aún dice cédula/correo "OPCIONALES", justo la palabra
  que le prohibimos decir al cliente. Es guía interna, pero por coherencia conviene reescribirla (cambio de
  código → desplegar).
- Resto coherente: las 13 herramientas tienen respaldo en el manual; pagos/abonos/remisión/recordatorios/boleta
  coinciden; "7 sábados" es correcto.

**Por qué NO subir a Opus 4.8 (por ahora):** Sonnet 4.6 = $3/$15 por millón (entrada/salida); Opus 4.8 = $5/$25
(~1,67× más; de ~$5/día a ~$8/día). Los errores hallados son de reglas que faltan o de adherencia, no de
capacidad → se arreglan gratis en el manual. Opus además, para un bot de ventas, es más lento, pregunta más y
usa menos las herramientas por defecto. Reevaluar Opus SOLO si tras estos arreglos quedan fallos de razonamiento.

## 2026-06-09 — [WhatsApp] — Eliminada la etiqueta AGENTE y el interruptor de "ocultar a Liliana"

**Qué hicimos:** quitamos por completo la etiqueta **AGENTE** y todo lo asociado, porque ahora Mateo atiende
TODOS los chats con la IA (ya no tiene sentido marcar ni ocultar los que atiende el agente).
- **Etiquetado automático eliminado:** al auto-activarse el agente por disparador (`recibir.js`) y al prenderlo
  con el botón 🤖 (`agente.js`) ya NO se pone la etiqueta AGENTE.
- **Interruptor "Ocultarle a Liliana los chats que atiende el agente" eliminado** (dependía de esa etiqueta):
  se quitó de `agente.js` (acción `privacidad_liliana` + lectura `ocultarLiliana`), de `conversaciones.js` (ya
  no calcula `ocultarAgente` ni pasa `p_ocultar_agente`) y la tarjeta "Privacidad de Liliana" de la bandeja.
- **Base de datos:** se borró la etiqueta AGENTE (1) + sus **523 enlaces** en `conversacion_etiquetas`, y la
  config `ocultar_agente_liliana`.

**Qué NO se tocó:** la etiqueta **ASESOR** (sigue marcando los chats que pasan a un humano), el auto-encendido
del agente con clientes nuevos y los disparadores (solo dejan de etiquetar). El parámetro `p_ocultar_agente` de
`bandeja_filtrar` quedó con default `false` (param muerto, inofensivo; no se reescribió la función para no
arriesgar el filtrado compartido).

**Por qué:** lo pidió Mateo: ahora atiende todo con la IA, así que la etiqueta y el ocultar ya no aplican.

## 2026-06-09 — [WhatsApp] — Mensaje predefinido de PREMIOS: sin redundancia + 4 cifras + opción $300M

**Qué:** ajustamos el texto fijo de premios (atajo SIN IA, en `agente-responder.js`). Antes repetía el precio
($150.000) y el "separar con $20.000", que YA están en el contacto inicial. Ahora ese mensaje: empieza con "Con
una sola boleta de *4 cifras* (de 0000 a 9999) participas por todo esto:", QUITA el precio/abono repetidos, y
pone la opción de los *$300.000.000* (si gana la casa pero prefiere el dinero) JUSTO debajo del Premio Mayor.
Cierra con "¿Te muestro los números?". Tono serio/elegante, casi SIN emojis (decisión de Mateo).

**Por qué:** Mateo notó la redundancia entre el contacto inicial y la explicación de premios (chat
+573123354789).

**Cuidado:** este texto vive en el CÓDIGO (no en el manual de la base); cambiarlo requiere editar
`agente-responder.js` y desplegar. La explicación de premios que da la IA (cuando NO aplica el atajo) sigue
saliendo del manual.

## 2026-06-09 — [WhatsApp] — Aclarado en el manual: los $300M y el amoblado son una cosa O la otra

**Qué:** reforzamos el manual (`agente_config.prompt`, sección "SI EL CLIENTE NO QUIERE LA CASA") para dejar
claro que el ganador NO puede quedarse con los **$300.000.000 Y ADEMÁS** sacar/conservar el amoblado: los $300
millones son el pago por la casa **COMPLETA, amoblada y con todo incluido**. Es el dinero **O** la casa
amoblada, nunca las dos. Y que Liliana responda esto ELLA con seguridad (NO pasar a un asesor por esta duda).

**Por qué:** Mateo probó la pregunta capciosa (chat +573123354789: "¿me dan los 300 millones y yo saco el
amoblado?"). Liliana adivinó bien pero lo dejó como "un asesor te confirma ese detalle". Ahora lo afirma claro.

**Probado:** con el modelo real, dos variantes de la pregunta ("¿300M y saco el amoblado?" y "¿me quedo la
casa y me dan algo de plata?") → responde "es una cosa O la otra", sin pasar a asesor. El manual vive en la
base (efecto inmediato, sin desplegar).

## 2026-06-09 — [WhatsApp] / [Pagos] — Tras agotar los 4 intentos, Liliana se apaga y pasa a humano EN SILENCIO

**Qué cambió:** en `api/whatsapp/verificar-pagos-cron.js`, cuando se agotan los intentos (~1h) sin confirmar el
pago, Liliana YA NO le vuelve a escribir al cliente. Antes mandaba "Estuve verificando tu pago pero todavía no
me aparece confirmado, un asesor lo revisa…" — justo después de haberle dicho un rato antes que estaba
verificando → sonaba repetido. Ahora: marca la verificación 'rendido', **APAGA el agente** en ese chat
(`agente_activo=false, estado='humano'`), cancela recordatorios pendientes, pone la etiqueta **ASESOR** y deja
una nota interna, **sin enviar ningún mensaje al cliente**. Un asesor lo retoma por la etiqueta (mismo apagado
que la herramienta `pasar_a_humano`).

**Por qué:** lo pidió Mateo (chat Jorge Díaz +573137078496): el segundo aviso no aportaba y se sentía robótico.

**Qué NO cambió (importante):** cuando el pago SÍ aparece en un reintento, Liliana SÍ le avisa al cliente
("¡Listo! Confirmé tu pago…"). El primer mensaje "ya recibí tu comprobante, estoy verificando" (al llegar el
comprobante) también se mantiene. Solo se quitó el SEGUNDO aviso del caso fallido. No se tocó la lógica de
plata (una transferencia se sigue consumiendo una sola vez; los reintentos no duplican).

## 2026-06-09 — [WhatsApp] — La bandeja marca "📋 Mensaje predefinido" en los mensajes sin IA

**Qué:** los mensajes que Liliana manda por un atajo SIN IA (saludo, premios, números, pedir datos) ahora se
rotulan **"📋 Mensaje predefinido"** en la bandeja (antes decían "🤖 Liliana", igual que los de IA). Así, de un
vistazo, Mateo distingue qué respondió la IA y qué salió fijo (sin gastar tokens).

**Cómo:** los atajos guardan el mensaje con `raw.predefinido=true` (`guardarEnChat` / `decir` /
`enviarContactoInicial` en `agente-responder.js`); `mensajes.js` expone el flag `predefinido`; la bandeja
(`bandeja-whatsapp.html`) muestra el rótulo según el flag. No cambia NADA de lo que ve el cliente (es solo la
etiqueta interna en la bandeja).

## 2026-06-08 — [WhatsApp] / [General] — Más mensajes predefinidos SIN IA (premios, números, pedir datos) — Fase 4 del ahorro

**Qué hicimos:** extendimos el atajo SIN IA —que ya existía para el contacto inicial— a tres pasos más del
embudo, en `api/whatsapp/agente-responder.js`:
- **Premios:** si Liliana preguntó "¿Te explico los premios?" y el cliente SOLO asiente (sí/dale/explícame…),
  se manda una explicación FIJA (la casa el 4-jul + $5.000.000 cada sábado) sin llamar a Claude.
- **Números:** si preguntó "¿Te muestro los números?" y el cliente solo asiente, trae la muestra de la base y
  la manda con texto fijo (sin IA; la lista igual sale de la base como siempre).
- **Pedir datos:** si el cliente dice claramente que quiere SEPARAR un número puntual ("quiero el 7185"), se
  le piden los datos con un mensaje fijo (nombre, apellido, ciudad, cédula y correo). El APARTAR lo sigue
  haciendo la IA cuando llegan los datos (y ahí se verifica que el número siga libre, como hoy).

**La regla (igual que el saludo):** el atajo solo se usa cuando el cliente SOLO asiente / pide separar, SIN
meter una pregunta nueva ni algo distinto. Ante cualquier señal de que se sale del libreto (una pregunta, un
número que no es de separar, datos, audio/imagen, texto con sustancia) → responde la IA. Conservador a
propósito: en la duda, IA (peor caso: no ahorra ahí; nunca responde en falso).

**Cómo sabe en qué paso va:** mira el último mensaje de texto que mandó Liliana (qué fue lo último que
preguntó) + que el cliente solo haya asentido. Funciones nuevas: `normTxt`, `esAsentir(texto, paso)`,
`intentoSeparar(texto)` (con listas de palabras "asentir/relleno" por paso, conservadoras).

**Seguridad (no toca plata):** apartar, abonos y verificación de pagos siguen pasando por las MISMAS
herramientas verificadas; solo se ahorra la REDACCIÓN de los mensajes de relleno. Mismos candados que el
saludo predefinido: no aplica en modo sombra/apagado, ni a remisión, ni a clientes que ya tienen boleta, y va
DESPUÉS del candado anti-duplicado. En la bandeja, cada atajo deja una nota "(predefinido, SIN IA — ahorro de
tokens)" para poder verlo.

**Probado:** `node --check` OK + pruebas unitarias de la detección con los mensajes reales del chat
573203726935 ("Si por favor"→premios; "Muéstreme los números"→números; "El 7185 quiero separarlo"→datos;
"El 1121 depronto?"→IA, no dispara). Falta verlo en conversaciones reales (prueba full de Liliana).

**Cuidado / qué NO hacer:** la verificación de un número PUNTUAL ("¿tienes el 1121?") la sigue haciendo la IA
(decisión de Mateo). Si Liliana cierra un paso con palabras MUY distintas a las esperadas, el atajo no dispara
y entra la IA (no se rompe nada, solo no ahorra ahí). Los textos fijos de premios/números viven en el CÓDIGO
(no en el manual de la base); si se quiere cambiar su redacción, se edita `agente-responder.js` y se despliega.

## 2026-06-08 — [WhatsApp] — Liliana vuelve a pedir cédula y correo al tomar los datos (sin decir que son "opcionales")

**Qué hicimos:** ajustamos el MANUAL de Liliana (`agente_config.prompt`, línea `1128258647034751`) para que,
al pedir los datos para apartar, SIEMPRE pida los cinco juntos —*nombre, apellido, ciudad, cédula y correo*—
como parte normal del registro para la factura. Después del cambio del 7-jun (que los volvió "opcionales"),
muchas veces solo pedía nombre/apellido/ciudad y ni mencionaba la cédula ni el correo (caso real chat
+573115630300). Se editaron dos bloques ("DATOS DE LA RIFA ACTUAL" y el paso "3) DATOS") con `replace()` puntual.

**Matiz que pidió Mateo:** que NO le diga al cliente en voz alta que la cédula/correo son "opcionales" (eso lo
invita a saltárselos y se pierden datos de la factura). Se los pide con naturalidad; SOLO si el cliente dice que
no los tiene o no los quiere dar, NO insiste y aparta IGUAL sin ellos. Lo OBLIGATORIO para apartar sigue siendo
solo nombre/apellido/ciudad.

**Cómo se probó (sin tocar clientes reales):** se corrió el MOTOR real de Liliana (mismo manual ya editado,
mismas 13 herramientas, modelo Sonnet) contra conversaciones simuladas: (A) al elegir número pide los 5 datos y
ya NO dice "opcionales"; (B) si el cliente se niega a cédula/correo, aparta igual sin insistir; (C) si los da,
aparta con todo.

**Cuidado / qué NO hacer:** el manual vive en la base (efecto inmediato, sin desplegar). La herramienta
`apartar_numero` (en `agente-responder.js`) sigue aceptando cédula/correo como opcionales en el código (NO se
tocó): la reserva nunca se condiciona a ellos, así no se traba la venta.

## 2026-06-08 — [WhatsApp] / [Admin] — Los movimientos del agente quedan a nombre de "Liliana"

**Qué hicimos:** todo movimiento que hace el agente —**apartar, abono, liberar, trasladar**— se registra
con `asesor = el dueño de la línea` (de `lineas_asesores`; en la línea de Lili = **"Liliana"**), no a nombre
de gerencia ni como "Pagina Web". Así las ventas y movimientos de Liliana salen a su nombre en caja,
rendimiento y la bitácora `registro_movimientos`.

**Cómo (sin tocar permisos):** el agente **sigue autenticándose como gerencia** (mismos permisos, NO se cambió
la validación de grupo de los endpoints). Solo se cambió **a nombre de quién queda grabado**: se agregó un
override **`asesorRegistro`** en `/api/admin/abono`, `/api/admin/liberar-boleta` y `/api/admin/trasladar-abono`
(el endpoint solo lo honra si quien autentica es **gerencia**, para que un asesor normal no pueda impersonar);
y `reservar.js` acepta `asesor`. El agente manda el nombre con `asesorDeLinea(linea_id)` (en `lib/abono-agente.js`).
`verificarYAbonar` lo **deduce solo** de la línea cuando no se lo pasan → cubre también el cron de reintentos
(`verificar-pagos-cron.js`).

**Validación de grupo (OJO, Liliana ES independiente):** "Liliana" está marcada como **independiente** en
`asesores_config` (grupo 'independiente'), distinto del equipo ('regular'). Como el agente autentica como
gerencia (Mateo = 'regular'), al abonar/liberar una boleta de "Liliana" la validación de grupo (regular ≠
independiente) la **bloqueaba**. Arreglo: en `abono.js` y `liberar-boleta.js` la validación de grupo ahora
sigue al **actor real** (`asesorReg`): con el override de gerencia valida como "Liliana" (independiente) →
coincide con sus boletas. Para un humano normal NO cambia nada (sin override, `asesorReg = nombreAsesor`).

**Implicación contable (a tener presente):** antes las ventas del agente quedaban como "Pagina Web" (equipo);
ahora quedan como **"Liliana" (independiente)**, así que cuentan en el bucket de **independientes** en caja /
rendimiento / liquidación, no en el equipo. Es lo coherente con atribuirlas a Liliana, pero cambia en qué grupo
se contabilizan. El override `asesorRegistro` solo lo acepta gerencia (candado `esGerencia`).

## 2026-06-08 — [WhatsApp] — Difusiones con filtros de público, programación por hora y "Liliana atiende las respuestas"

**Qué construimos:** ampliamos el módulo de Difusiones de la bandeja (línea "Compra con Lili") para poder
segmentar y enviar campañas sin ayuda técnica:
1. **Filtros de público** (antes solo "todos" o "por etiqueta"): ahora también **Clientes** (los que tienen
   boleta) con subfiltro de **estado de pago** (todos / con saldo pendiente / pagados) y **ciudad** opcional;
   y **Potenciales** (los que escribieron pero NUNCA compraron). El cálculo vive en la base
   (función `difusion_audiencia(linea, filtros jsonb)`), para que aguante líneas enormes.
2. **Programar el envío a una hora**: la difusión queda "programada" y un cron la envía sola, **por tandas**
   (~30 mensajes/min) — ritmo suave para que Meta no marque la línea, y sin dejar la página abierta.
3. **"Liliana atiende las respuestas"** (casilla, prendida por defecto): al enviar, enciende el agente
   (`agente_activo=true`) en cada chat. No manda nada solo; queda en silencio hasta que el cliente responde,
   y ahí Liliana sigue el hilo. Como el texto de la plantilla se guarda en el historial, **Liliana ve qué se
   le envió** y continúa coherente (no se re-presenta).

**Por qué:** Mateo quería lanzar su primera difusión (anunciar la ganadora del acumulado de $20.000.000 del
sábado 6-jun: **Margarita Rosa, Manizales, número 5588**) con un mensaje distinto por público, y de ahí en
adelante manejar difusiones él solo.

**Piezas nuevas:** funciones `difusion_audiencia` y `difusion_reclamar_lote` (reclamo ATÓMICO del lote, así el
navegador y el cron nunca envían dos veces al mismo); `api/lib/difusion-envio.js` (núcleo de envío compartido);
`api/whatsapp/difusiones-cron.js` (envío programado, `maxDuration` 60 en `vercel.json`); columnas
`difusiones.programada_at` y `difusiones.activar_agente`; **pg_cron jobid 6** `difusiones-programadas-cada-minuto`.

**Cuidado / qué NO hacer:** el envío masivo en frío a los ~845 potenciales puede bajar la calidad de la línea
principal en Meta → enviar por tandas y vigilando, NO todos de un golpe. `activar_agente=true` es el
comportamiento por defecto de TODA difusión nueva (Mateo lo pidió: "Liliana contesta absolutamente todo");
se puede apagar por campaña con la casilla. Al programar, la lista de destinatarios se congela en ESE momento.

## 2026-06-08 — [WhatsApp] — Plantillas para anunciar a la ganadora (creadas, en revisión de Meta)

**Qué creamos:** dos plantillas en la línea de Lili, distintas por público:
- **`resultado_sorteo`** (categoría **UTILITY**, con `{{1}}` = nombre real del cliente): informativa para
  CLIENTES, tono serio, sin emojis, amarrada a "la rifa en la que participas". (Meta puede reclasificarla a
  Marketing sola si le ve intención comercial; igual funciona, solo cambia el cobro.)
- **`ganadora_casa_santa_teresita`** (categoría **MARKETING**, sin variables): para POTENCIALES, breve,
  anuncia a la ganadora + invita a participar respondiendo por el chat.

**Por qué así:** de los clientes SÍ tenemos el nombre real (lo dieron al apartar) → en la de utilidad se usa
el **nombre registrado** (no el del perfil de WhatsApp, que son apodos). De los potenciales NO hay nombre
confiable → la de marketing va sin nombre. Quedó pendiente que **Meta las apruebe** antes de poder enviar.

**Cuidado:** el **botón** "Quiero participar" que se había hablado se **dejó para después**: el responder a un
botón de WhatsApp (mensaje entrante tipo `button`) hay que verificar que el webhook lo capte para que Liliana
no pierda la respuesta. Por ahora la plantilla invita a responder por texto (Liliana atiende igual).

## 2026-06-08 — [WhatsApp] — Liliana ya sabe los festivos de Colombia (para las visitas a la casa)

**Qué:** el modelo NO conoce los festivos de Colombia, así que daba el horario de visita aunque el día fuera
festivo (caso real: hoy 8-jun = Corpus Christi, dijo que se podía visitar). Agregamos en `agente-responder.js` el
cálculo de los festivos colombianos (`festivoColombia`/`festivosDeAnio`: fijos + Ley Emiliani al lunes + los de
Pascua —Meeus—) y, si HOY es festivo, se inyecta en el contexto: "HOY es festivo (nombre), la casa no se puede
visitar hoy". Verificado: 2026 da los 18 festivos correctos. El horario de visita vive en el manual (sección
"VISITAR LA CASA"). También se reforzó el manual para que NO repita los premios de los sábados si ya los mencionó.

---

## 2026-06-08 — [WhatsApp] — Al prender el agente a mano, ahora responde de inmediato (lo dispara el servidor)

**Síntoma:** al activar el 🤖 en un chat (con un mensaje del cliente sin responder), tardaba mucho o no respondía
hasta que el cliente volvía a escribir. Pasaba seguido.

**Causa:** `activar_conversacion` (en `agente.js`) solo prendía `agente_activo`; el "responder ya" lo disparaba el
NAVEGADOR (`dispararAgenteSiCorresponde` en la bandeja), que es frágil (a veces no dispara, o el candado/anti-duplicado
lo frena). Sin un disparo confiable, el agente solo arrancaba con el SIGUIENTE mensaje del cliente (webhook).

**Arreglo:** `activar_conversacion`, al prender, ahora **dispara el motor desde el SERVIDOR** (fetch fire-and-forget a
`agente-responder` con el secreto interno, corte 1.5s) si `ultimo_entrante=true` — igual que el webhook. Ya no depende
del navegador. El candado anti-duplicado evita doble respuesta si el navegador también dispara.

---

## 2026-06-08 — [WhatsApp] / [General] — Ahorro de tokens de Liliana (saludo predefinido + caché de 1h)

**Contexto:** con poco tráfico el gasto era alto (~$4.89/día, 231 llamadas/77 clientes). Análisis: el caché SÍ
funciona (sin él habría sido ~$10), pero el 53% del costo era **reescribir el manual al caché** (cada cliente
nuevo, cache de 5 min que se enfría), y **~88% de los primeros mensajes es el texto del anuncio** ("¡Hola! quiero
más información.") — el saludo era ~la mitad de TODAS las llamadas a la IA.

**Fase 1 — Saludo predefinido SIN IA** (`agente-responder.js`): en el PRIMER contacto, si el mensaje lo resuelve
el saludo (genérico, o pregunta de precio/abono/legalidad/cuándo juega), se manda el contacto inicial FIJO
(saludo + fotos + cierre, con la línea del próximo sorteo calculada del calendario) **sin llamar a Claude**. La
IA entra desde el 2º mensaje o si el 1º pide algo que el saludo NO cubre (número puntual, pago/cuenta, números
disponibles, ubicación, lista de premios) — detección por marcadores en `primerContactoLoResuelveSaludo` (función
`enviarContactoInicial` reutilizada por la herramienta y por el atajo). Respeta candados anti-duplicado (va después
del claim atómico) y los frenos (no a clientes con boleta, ni remisión, ni sombra, ni si el chat ya tiene mensajes).
Quita ~la mitad de las llamadas (las más caras, que reescriben el caché). Verificado al aire: se envía sin IA y 0 errores.

**Fase 2 — Caché de prompt a 1 HORA** (`ttl: '1h'` + cabecera `anthropic-beta: extended-cache-ttl-2025-04-11`):
antes 5 min; con tráfico espaciado el manual se reescribía casi por cada cliente. Con 1h, un cliente que llega
dentro de la hora REUSA el caché en vez de reescribirlo. **No cambia NADA de lo que responde** (validé el formato
con Anthropic antes de tocar; 0 errores al aire). Reversible (volver a quitar `ttl`).

**Cuidado / pendiente:** medir el ahorro real con un día completo y comparar con $4.89. La lista de marcadores que
mandan a la IA (`primerContactoLoResuelveSaludo`) es afinable: si algún caso se siente robótico, ahí se ajusta.
Faltan Fases 3-5 (cortar el bucle, más mensajes fijos, adelgazar el manual) — pendientes de hablar con Mateo.

---

## 2026-06-08 — [WhatsApp] — Liliana (dueña de su línea) ya puede prender/apagar el agente por chat

**Qué hicimos:** habilitamos que el **dueño de una línea** use el botón **🤖 por chat** (prender/apagar el agente
en una conversación: pasarle el cliente al agente o recuperarlo). Antes era SOLO de Mateo. Cambios: `agente.js`
permite la acción `activar_conversacion` a quien `puedeVerLinea` (gerencia o el asesor de la línea); el resto de
la cabina sigue exigiendo `esMateo`. `agente-responder.js` permite el disparo desde la bandeja al dueño de la
línea (antes solo Mateo). `lineas.js` devuelve `tiene_agente` por línea y el botón se muestra solo en líneas con
agente (la de Lili). 

**Por qué:** Mateo va a operar desde el perfil de Liliana y necesitaba poder activar el agente en los chats.
Eligió **"operar sin la config delicada"**: NO se le habilitó editar el manual, el interruptor que apaga toda la
línea, el **Gasto de IA** (costos) ni los **disparadores** — todo eso sigue oculto y bloqueado solo para gerencia.

**Aparte (lo maneja Mateo):** el interruptor `ocultar_agente_liliana` (mostrar/ocultar a Liliana los chats con
etiqueta AGENTE) lo activa/desactiva él desde gerencia; lo va a apagar para que ella vea esos chats.

---

## 2026-06-08 — [WhatsApp] / [Rifas/Finanzas] — Ventas de la línea "Compra con Lili" reatribuidas a Liliana

**Qué hicimos:** reasignamos **32 boletas** de `asesor='Pagina Web'` → **`asesor='Liliana'`**. Son las que la
IA (agente de la línea "Compra con Lili", `linea_id=1128258647034751`) apartó, identificadas por su propio
rastro en `agente_actividad` (nota "🤖 Aparté el número NNNN…") cruzando **número + teléfono del cliente** y
filtrando solo las que seguían en "Pagina Web". 14 de ellas tenían abonos ($540.000). Comando: `update boletas
set asesor='Liliana' from (notas de apartado) where numero+tel coinciden and asesor='Pagina Web'` (devolvió 32).

**Por qué:** Mateo quiere que TODA venta hecha por la línea de Lili quede a nombre de la asesora **Liliana**
(independiente), sea de la IA o manual. Efecto contable: esas ventas pasan del bucket equipo ("Pagina Web") al
de **independientes** (caja/rendimiento/liquidación), coherente con que sean de Liliana.

**Qué NO se tocó (importante):** otras **22 boletas** cuyo dueño tiene chat con Lili pero **sin prueba de venta
por Lili** (18 sin nota ni comprobante + 4 con comprobante pero ya a nombre de OTRO vendedor real —Arias, Aleja
Valencia, Saldarriaga—; una incluso del 16-may, antes de existir la IA). Esas se quedan con su vendedor real y
**Liliana las remite** a ese vendedor (la remisión ya funciona: todos esos vendedores tienen `numero_remision`).
Regla: un comprobante en el chat NO prueba que la venta se hizo por Lili; solo se reatribuye con prueba (nota de
apartado de la IA). De las 4 con comprobante, Mateo decidió pasar **1 a Liliana** (boleta 3681, tel ...3052152722,
antes "Arias", $0 abonado) y dejar las otras 3 con su vendedor. **Total reatribuido a Liliana: 33 boletas.**

**Abonos viejos:** además se reasignaron los **18 abonos** de esas 33 boletas (rifa activa, `fecha_pago >=
2026-05-11`) de `asesor='Mateo'` → **`Liliana`** ($710.000). Eran abonos que el agente registró como gerencia
ANTES de activar la atribución. Se acotó por fecha de la rifa activa para no tocar abonos de rifas pasadas con
el mismo número.

**Confirmado a futuro (verificado en código):** TODO lo que hace el agente ya queda a nombre de Liliana —
apartar (`reservar.js`, `cuerpo.asesor=asesorDeLinea`), abonar (`abono.js` graba abono+caja+bitácora con
`asesorReg`; el agente envía `asesorRegistro` vía `verificarYAbonar`), liberar y trasladar (envían
`asesorRegistro`). `asesorDeLinea` = dueño de la línea en `lineas_asesores` = "Liliana".

---

## 2026-06-08 — [WhatsApp] — Liliana usa su PROPIA llave de Claude + se reinició su contador de gasto

**Qué hicimos:** Liliana ahora se autentica con Claude usando una llave dedicada,
`ANTHROPIC_API_KEY_LILIANA` (variable de entorno en Vercel, creada por Mateo), para poder medir su gasto
por separado en el panel de Anthropic de esa llave. El cambio está en `api/whatsapp/agente-responder.js`:
`const apiKey = process.env.ANTHROPIC_API_KEY_LILIANA || process.env.ANTHROPIC_API_KEY;` — usa la suya y,
si falta, cae a la general para no dejar de responder. Además se **reinició el contador interno** de la
tarjeta "Gasto de IA" (`truncate table agente_uso`) para empezar de cero.

**Por qué:** Mateo quería saber exactamente cuánto gasta Liliana, sin mezclarla con las otras 7 funciones
que comparten `ANTHROPIC_API_KEY` (comprobantes, análisis, copy, chat de Alejo, etc.).

**Cuidado / qué NO hacer:** **NO borrar `ANTHROPIC_API_KEY`** (la usan las otras 7 funciones y es el
respaldo de Liliana). Si se pega mal la llave nueva, Liliana fallaría (el respaldo solo cubre si la
variable está VACÍA, no si la llave es inválida); para revertir, borrar `ANTHROPIC_API_KEY_LILIANA` y
redeploy. La tabla `agente_uso` solo la escribe Liliana y solo la lee la tarjeta "Gasto de IA"
(`agente-costo.js`); NO alimenta el estado de resultados, por eso truncarla no afecta la contabilidad.

---

## 2026-06-08 — [WhatsApp] / [General] — Caché de prompt en Liliana (baja ~la mitad el gasto de entrada)

**Qué hicimos:** activamos el *prompt caching* de Anthropic en el motor de Liliana
(`api/whatsapp/agente-responder.js`). El `system` pasó de ser un texto único a un array de dos
bloques: `[{ manual (prompt), cache_control: ephemeral }, { contexto volátil }]`. El breakpoint en el
manual cachea **herramientas + manual** juntos (orden de render: tools → system → messages).

**Por qué:** el gasto de IA era altísimo en ENTRADA (junio: ~22.8M tokens entrada vs 449k salida;
~14.100 tokens de entrada por respuesta). Causa: el manual (~24.351 chars ≈ ~7.000 tokens) + las 13
herramientas (~2.000 tokens) se reenviaban a precio lleno en CADA llamada y CADA vuelta del bucle
(MAX_ITER=6). Ese bloque fijo es >50% de cada llamada. El caché lo cobra 10× más barato (lectura 0.1×).

**Cuidado / qué NO hacer:** NO cambia la conducta de Liliana (ve el mismo prompt, solo más barato) y es
reversible. La infraestructura de medición ya existía (`registrarUso` guarda `cache_write_tokens`/
`cache_read_tokens`; `PRECIOS`/`costoUSD` los cobran). El manual debe seguir siendo lo PRIMERO del
system (todo lo volátil va en el 2º bloque) o se rompe el caché. `toolsActivas` varía (se quita
`enviar_contacto_inicial` a clientes con boleta) → habrá 2 variantes de caché; ambas funcionan. FALTA
confirmar al aire que `cache_read_tokens` > 0 en `agente_uso` cuando haya tráfico.

---

## 2026-06-08 — [WhatsApp] / [Seguridad] — Eliminados los DOS supervisores Opus de Liliana

**Qué decidimos:** quitar por completo los dos usos de Opus como "supervisor" del agente:
1. **Supervisor de movimientos de dinero** (`verificarConOpus` en `agente-responder.js`): revisaba cada
   acción sensible antes de ejecutarla. **Ya estaba INACTIVO** (`ACCIONES_SENSIBLES` vacío) — era código
   muerto. Se borró la función, las constantes `OPUS`/`ACCIONES_SENSIBLES`, el `contextoOpus` y el bloque
   del bucle.
2. **Supervisor QA / reportes** (`qa-agente-cron.js`): cada 30 min revisaba los chats con Opus, mandaba un
   reporte a Mateo por WhatsApp (573123354789) y guardaba errores como "sugerencias de mejora" en la
   cabina. Estaba PAUSADO desde el 6-jun. Se borró: el archivo, su entrada en `vercel.json`, el cron de
   la base (`cron.unschedule('supervisor-agente-cada-5min')`, era el jobid 2), y el ciclo de sugerencias
   de la cabina (acciones `sugerencias`/`aplicar_sugerencia`/`descartar_sugerencia` en `agente.js` y la
   tarjeta "Mejorar el agente" + sus funciones/CSS en `bandeja-whatsapp.html`).

**Por qué:** lo pidió Mateo. El de dinero solo frenaba ventas legítimas en falso (no veía las fotos de
los comprobantes ni hacía los chequeos reales) y NO aportaba seguridad: cada acción ya tiene su propio
candado fuerte —el abono se verifica contra el banco y una transferencia se consume una sola vez; liberar
valida dueño + saldo $0; apartar es reversible—. El de reportes generaba ruido y ya estaba apagado.

**Cuidado / qué NO hacer:** la seguridad del dinero NO bajó (vive en los candados de cada acción, intactos).
Las tablas **`agente_sugerencias`** (22 filas viejas) y **`agente_qa_estado`** (1 fila) quedaron sin uso y se
**borraron el mismo 8-jun** (`drop table`, autorizado por Mateo; no tenían FKs ni vistas). El etiquetado **AGENTE** se conservó
(sirve para filtrar la bandeja, no solo para el supervisor). Si algún día se quiere un supervisor, habrá
que reconstruirlo (ya no está en el código).

---

## 2026-06-07 — [WhatsApp] — Acumulado: se REINICIA tras un ganador (Liliana decía monto viejo)

**Qué arreglamos (CRÍTICO):** Liliana le decía a los clientes que el próximo sábado jugaba por
**$20.000.000** cuando en realidad volvía a su base de **$5.000.000 en bonos**. El acumulado de los
sábados (Lotería de Boyacá) ya se había GANADO el 6-jun (5588 · Margarita Rosa), así que se reinició;
pero el motor seguía arrastrando el monto acumulado viejo.

**Por qué pasaba:** en `agente-responder.js`, `montoAcumProximo` se calculaba tomando el ÚLTIMO sorteo
PASADO marcado `acumulado` con monto, SIN mirar si DESPUÉS hubo un ganador que reiniciara la cadena.

**Cómo quedó:** el acumulado solo se arrastra al próximo si el ÚLTIMO sorteo pasado **del mismo tipo**
(mismo título; se agrupa por título para no mezclar el Sueldazo con los sábados) quedó acumulado. Si ese
último ya tuvo ganador → `acumuladoReiniciado=true`, `montoAcumProximo=''` y el próximo va por el monto
de su TÍTULO ($5M). Se le inyecta además una nota explícita para que NO mencione montos acumulados
viejos. Verificado con los datos reales: hoy (acumulado ganado 6-jun) el próximo 13-jun sale SIN
acumulado; antes del 6-jun sí arrastraba $20M (no se rompió el caso normal); con la casa de próximo, sin
monto pegado.

**Cuidado / qué NO hacer:** el texto del premio ("$5.000.000 en bonos, Lotería de Boyacá") ya estaba
bien en el manual y en los títulos del calendario (`rifas.sorteos`); NO se tocaron. La cadena de
acumulado son los SÁBADOS; el Sueldazo es un sorteo aparte (no la reinicia ni cuenta en ella) gracias al
agrupado por título. Si algún día cambian los títulos de los sábados, mantenerlos IGUALES entre sí para
que el agrupado siga funcionando.

---

## 2026-06-08 — [Seguridad] — Prendido RLS en TODAS las tablas (la base ya no depende de la llave anónima)

**Qué hicimos:** prendimos Row Level Security (RLS) en las 56 tablas y bloqueamos el acceso de la
llave **anónima** (la semipública). Antes todo dependía de que esa llave no se filtrara; ahora, aunque
se filtre, no puede leer ni escribir nada. El chequeo oficial de Supabase pasó de **84 problemas**
(incluyendo **tokens de WhatsApp y de sesión expuestos**) a **0 errores**.

**Cómo, sin romper nada (clave):** primero verificamos que NI el frontend web NI la app móvil le pegan
directo a Supabase (solo el backend lo hace). Entonces hicimos que **todo el backend use la llave
maestra** (`api/lib/supabase.js`: el cliente `supabase` ahora usa `SERVICE_ROLE_KEY`), que pasa por
encima de RLS. Así pudimos prender RLS en todas las tablas sin tocar 80+ archivos. Luego: se borraron
14 reglas "deja pasar a todos", se cerró `bandeja_filtrar` (security definer) a la llave anónima y se
fijó `search_path` en 8 funciones. Detalle completo en `docs/seguridad-rls.md`.

**Verificado:** anónima ve 0 filas (boletas, clientes, tokens, sesiones); backend sigue leyendo
(disponibles, cliente, bandeja=300 chats). Quedaron 56 avisos INFO "RLS sin política" (es lo deseado:
solo el backend entra) y 1 WARN menor (`pg_net` en public).

**Cuidado / qué NO hacer:** **NO borrar `SUPABASE_SERVICE_ROLE_KEY` de Vercel** — si falta, el backend
cae a la llave anónima y, con RLS prendido, dejaría de leer TODO. Toda **tabla nueva** debe nacer con
`enable row level security`. Si algún día una página/app necesita leer Supabase directo (sin backend),
hay que crearle una política RLS específica.

---

## 2026-06-07 — [Seguridad] — Configurada la llave maestra (SERVICE_ROLE_KEY): el Gasto de IA ya funciona

**Qué hicimos:** Mateo configuró `SUPABASE_SERVICE_ROLE_KEY` en Vercel (usó la **nueva "Secret key"**
de Supabase, `sb_secret_...`, equivalente moderno al service_role; bypassa RLS) e hizo redeploy. Con
eso, `supabaseAdmin` ya NO cae a la llave anónima: ahora escribe en tablas con RLS. **Resultado: la
tarjeta "Gasto de IA" ya guarda y muestra el costo** (verificado: `agente_uso` pasó de 0 a registros
reales, ej. 2 filas / $0.072 USD a los pocos minutos). El agente siguió respondiendo normal (no rompió
nada).

**Por qué:** la tabla `agente_uso` tiene RLS activado sin políticas → solo el rol de servicio puede
escribir. Como faltaba la llave, el agente corría como `anon` y el insert se bloqueaba en silencio
(panel en $0). Era el pendiente "Gasto de IA = $0 / el agente corre como anon".

**Cuidado / qué NO hacer:** el costo cuenta **de ahora en adelante** (lo viejo quedó en $0, no se
recupera). La llave es secreta (solo en Vercel; nunca en el repo ni en chats). El nombre EXACTO de la
variable es `SUPABASE_SERVICE_ROLE_KEY`. **Sigue pendiente** (mejora futura, NO automática) endurecer la
seguridad: volver a ACTIVAR RLS con políticas en tablas sensibles (ej. `conversaciones_whatsapp`), que
hoy dependen de tener RLS apagado. Hacerlo con calma, tabla por tabla, confirmando que el agente y la
bandeja sigan funcionando.

---

## 2026-06-07 — [WhatsApp] — Liliana: remite al punto de venta si la boleta la vendió OTRO

**Qué decidimos:** si un cliente le escribe a la línea de Liliana pero su boleta la **vendió otro
punto de venta** (el equipo Los Plata u otro independiente, no Liliana), Liliana **NO lo atiende**:
no vende, no aparta, no abona. Lo saluda por su nombre y le da el **número directo** del punto donde
compró, para que continúe ahí (pagar lo que falta, dudas o comprar otra). Aplica **siempre**: aunque
la boleta esté pagada al 100% y aunque quiera una boleta nueva. Si el cliente tiene boletas de varios
vendedores, remite al de la **más reciente**. Si el cliente es **nuevo** (sin boletas de nadie) o la
boleta es **de Liliana**, ella atiende normal (sin cambios).

**Por qué:** clientes que ya compraron por otro asesor (anuncios) a veces escriben a la línea de Lili
para terminar de pagar. Esa venta/cobro es del asesor original; Liliana no debe quedarse con clientes
ajenos. Lo pidió Mateo (ejemplo real: cel 573216904915, boleta 3171 vendida por "Aleja Valencia").

**Piezas:**
- Columna nueva **`asesores_config.numero_remision`** (text): el WhatsApp a donde remitir según el asesor
  que vendió. Cargado: todo el equipo regular (11) → **3107334957**; **Claudia** 3232880292;
  **Joaquin** 3215343788; **Luisa** 3207168489. Pendientes (sin número aún): Alejandra Plata, Luisa
  Papá, Mocho, Nena, Yiny. **Editable por SQL sin desplegar código.**
- `agente-responder.js`: `resumenCliente` ahora trae también `asesor` y `fecha_venta` de cada boleta.
  Nueva función `analizarRemision(boletas, lineaId)` (dueño de la línea = `lineas_asesores`; boleta
  "ajena" = asesor que no es dueño; busca `numero_remision`). Nueva `bloqueRemision(...)` que
  REEMPLAZA al bloque normal de estado del cliente e instruye remitir (y no presentarse/vender).
- Si la boleta es de un independiente **sin número cargado**, Liliana se disculpa y **pasa a un asesor**
  (caso raro hasta que Mateo dé esos números).

**Añadido (mismo día):** (1) **Ventas por la WEB** ("Pagina Web", 2.626 boletas; y residuo
"web-perla-roja") cuentan como **equipo Los Plata** → se les cargó `numero_remision = 3107334957`
(decisión de Mateo: la web es como un asesor de su equipo). Quedaron como filas en `asesores_config`
(`es_independiente=false`). (2) **Arreglo determinístico**: si el cliente YA tiene boleta(s) o hay que
remitirlo, el código le **quita** a Liliana la herramienta `enviar_contacto_inicial` (antes dependía de
que el modelo obedeciera la instrucción y a veces se presentaba igual a un cliente que ya tenía boleta).

**Cuidado / qué NO hacer:** el dueño de cada línea sale de `lineas_asesores` (la de Lili =
`1128258647034751` → "Liliana"); esto generaliza solo cuando se conecten las líneas grandes (el
equipo regular como dueño). No toca dinero (solo a quién atiende y qué mensaje da). Cualquier valor de
`boletas.asesor` que NO esté en `asesores_config` con número (o que no sea dueño de la línea) cae a
"pasar a un asesor": al aparecer un canal/asesor nuevo, agregarlo a `asesores_config` con su número. Tras agregar la
columna se recargó el esquema con `apply_migration` (lección de la caché de PostgREST).

---

## 2026-06-07 — [WhatsApp] — Liliana: no repetir lo ya dicho + respuestas un poco más cortas

**Qué decidimos:** Liliana no debe **repetir** información que ya dio en la misma conversación (ej.
el precio de la boleta o que se separa con $20.000, que repetía en el contacto inicial y otra vez al
explicar premios). Y bajar un POCO el largo: ~30-35 palabras en promedio (antes "máximo 40"), tope
~40 y hasta ~70 al explicar premios por primera vez. Reducción **leve**, no drástica.

**Por qué:** Mateo notó redundancia (repetía precio/condiciones en mensajes seguidos) y quería
respuestas un poquito más resumidas, sin volverse cortante.

**Piezas:** edición del MANUAL (`agente_config.prompt`, línea `1128258647034751`), sección
"# CÓMO ESCRIBES", por SQL con `replace()` puntual. Efecto inmediato.

---

## 2026-06-07 — [Pagos] / [WhatsApp] — Verificación de pagos con reintentos (CONSTRUIDA)

**Qué hicimos:** cuando el cliente manda el comprobante y el pago aún NO aparece (el asesor lo sube
con retraso), Liliana ya NO pasa a un asesor de una: dice que está *verificando el pago* y el sistema
**reintenta cada ~15 min, hasta ~1 hora**. Si el pago aparece y coincide de forma sólida, **abona
solo** y le avisa al cliente; si tras ~1h no aparece, recién ahí pasa a un asesor.

**Por qué:** los pagos del banco se suben a mano y con retraso, así que muchas veces el pago no está
cargado cuando el cliente manda la foto. Antes Liliana se rendía al primer intento (un cliente esperó
~15h). Mateo aprobó el diseño.

**Piezas:**
- Tabla **`verificaciones_pago`** (cola: media_id, intentos, max_intentos=4, proximo_intento_at, estado).
- Lib **`api/lib/abono-agente.js`** (`verificarYAbonar`): MISMA lógica probada (buscar-pago →
  /api/admin/abono amarrado a la transferencia). La comparten el agente y el cron.
- **`registrar_abono`** (en `agente-responder.js`): si el pago no aparece o solo coincide por "misma
  hora", **agenda** la verificación en vez de rendirse.
- **`verificar-pagos-cron.js`** + **pg_cron jobid 5** (`verificar-pagos-cada-5min`, cada 5 min):
  reintenta; abona y avisa, o reprograma, o tras agotar intentos pasa a asesor.
- Manual ajustado (paso "6) PAGO" y "CUÁNDO PASAR A UN ASESOR") para que NO pase a asesor mientras se
  verifica.

**Seguridad del dinero:** NUNCA abona por "misma hora" sola (referencia / celular en la referencia /
Bancolombia+minuto sí valen). El abono va por `/api/admin/abono` con `idTransferencia`: una
transferencia se **consume una sola vez** → los reintentos NO pueden duplicar abonos.

**Cuidado / qué NO hacer:** para APAGAR el reintento:
`select cron.unschedule('verificar-pagos-cada-5min');`. No bajar la regla de "misma hora". El cron usa
la contraseña de gerencia (`ASESORES_SECRETO`) — no depende de `SERVICE_ROLE_KEY`.

---

## 2026-06-07 — [WhatsApp] — Liliana: SIEMPRE envía la boleta tras apartar (red de seguridad)

**Qué decidimos:** cuando Liliana aparta un número, el cliente DEBE recibir su boleta (con el enlace).
Antes dependía de que la IA llamara `enviar_boleta`, y a veces no lo hacía (boletas apartadas sin
enviar el link). Ahora hay una **red de seguridad determinística**: si en un turno se apartó número(s)
pero NO se envió la boleta, el código la envía solo al cerrar el turno.

**Por qué:** Mateo vio varios chats con la boleta apartada pero sin enviarle el link al cliente.

**Piezas:** en `agente-responder.js`, el bucle marca `apartoNumero`/`envioBoleta` por turno; al
terminar, si apartó y no envió (y el agente sigue activo, no apagado), llama `enviar_boleta` una vez
(muestra TODAS las boletas). Además se reforzó el resultado de `apartar_numero` para que la IA la
mande ella misma en el mismo turno (así la red casi nunca actúa y no se duplica el envío). Como el
envío de la boleta es texto libre dentro de las 24h, es gratis.

---

## 2026-06-07 — [WhatsApp] — Boleta: el encabezado refleja el estado de pago (no siempre "Quedaste participando")

**Qué decidimos:** el primer renglón del mensaje de la boleta debe reflejar la realidad. Regla:
**$0 abonado = boleta SOLO separada (aún NO participa)**; **cualquier abono = ya participa**;
**pagada al 100% = lo máximo**. Antes decía siempre "🎉 ¡Quedaste participando!", lo cual era falso
cuando iba con abonado $0.

**Por qué:** Mateo: con $0 abonado el cliente NO entra a participar; decirle que sí confunde.

**Piezas (dos vías de envío de la boleta):**
- **Liliana (agente)** — `agente-responder.js`, herramienta `enviar_boleta`: arma el texto libre con un
  encabezado según el estado (separada / participando / pagada). HECHO y publicado.
- **Botón "Enviar boleta" de la bandeja** — `enviar-boleta.js`: ahora elige según la **ventana de 24h**
  (`conversaciones.ventana_vence_at`):
  - **Dentro de 24h** (el cliente escribió hace poco): se manda como **TEXTO normal** → gratis, al
    instante, SIN saludo, con encabezado según el estado. Es el caso casi siempre.
  - **Fuera de 24h**: se usa una **plantilla** para reabrir (cuesta). Se creó **`boleta_cliente_v2`**
    con la 1ª línea VARIABLE ({{1}} = estado, {{2}} = lista); la vieja `boleta_cliente` queda de
    RESPALDO hasta que Meta apruebe la v2.

**Por qué la lógica de ventana:** una plantilla solo hace falta pasadas 24h (WhatsApp bloquea texto
libre); usarla dentro de la ventana es innecesario y **cuesta dinero**. Dentro de 24h el texto libre
es gratis y más natural (sin saludo de más).

**Cuidado / qué NO hacer:** Meta **NO permite que el cuerpo de una plantilla empiece/termine con una
variable, ni dos variables seguidas** → por eso la v2 arranca con "Hola 👋" fijo (que además tiene
sentido al reabrir tras +24h) y separa {{1}} y {{2}} con texto. Mientras Meta aprueba la v2, la vía
fuera-de-ventana usa la vieja (sin caídas).

---

## 2026-06-07 — [WhatsApp] — Liliana: la boleta se envía por WhatsApp (no por correo ni mandando a la web)

**Qué decidimos:** Liliana debe enviar la **boleta digital por WhatsApp ahí mismo** (con su enlace).
NO debe decir que la boleta "llega al correo" ni mandar al cliente a la página web / botón "Ver mi
boleta" para consultarla. Si el cliente quiere ver sus pagos, Liliana los **consulta ella** y se los
dice por WhatsApp (o le reenvía el enlace de su boleta). Al **correo** solo va la **factura
electrónica**, y solo cuando la boleta está **pagada al 100%**.

**Por qué:** no hacer que el cliente se salga de WhatsApp para ver su boleta (baja conversión y
confunde a clientes mayores). Liliana confundía boleta ↔ factura y mandaba a la web.

**Piezas:** edición del MANUAL (`agente_config.prompt`, línea `1128258647034751`) por SQL con
`replace()` puntual en dos bloques: paso "5) BOLETA" (aclara boleta por WhatsApp, correo = factura
al 100%) y "CERTIFICAR QUE YA PAGÓ / ver sus pagos" (Liliana resuelve por WhatsApp, ya no guía a
*Ver mi boleta*). Efecto inmediato. La sección reactiva "# LA PÁGINA WEB…" se dejó (solo aplica si
el cliente pregunta por la web).

---

## 2026-06-07 — [WhatsApp] — Liliana: cédula y correo OPCIONALES al apartar (solo nombre, apellido y ciudad obligatorios)

**Qué decidimos:** para apartar una boleta, lo ÚNICO obligatorio es **nombre completo, apellido y
ciudad**. La **cédula** y el **correo** quedan **opcionales**: Liliana los pide UNA vez (sirven para
la factura electrónica), pero si el cliente no los tiene o no los quiere dar, **aparta la boleta
igual** sin insistir.

**Por qué:** Liliana estaba exigiendo cédula y correo como si fueran obligatorios y eso frenaba
ventas (clientes que no quieren dar la cédula). El código nunca los exigió (la herramienta
`apartar_numero` ya pedía solo `numero, nombre, apellido, ciudad`); la "exigencia" venía del MANUAL.

**Piezas:** se editó el MANUAL (`agente_config.prompt` de la línea `1128258647034751`) por SQL con
`replace()` puntual en dos bloques ("Para apartar la boleta…" y "3) DATOS:") — efecto inmediato. Y
se ajustó la descripción de la herramienta `apartar_numero` en `agente-responder.js` para dejar
explícito que cédula/correo son opcionales. La factura electrónica se sigue emitiendo solo cuando la
boleta queda pagada al 100%; sin cédula/correo no se podrá emitir, pero la venta no se frena.

**Cuidado / qué NO hacer:** el manual vive en la base (no en el código); se edita por SQL/cabina con
`replace()` puntual, sin reescribirlo entero.

---

## 2026-06-07 — [WhatsApp] / [Base de datos] — Etiquetas: orden propio, clic en toda la fila, ancho ajustado

**Qué decidimos:** las etiquetas ahora tienen un **orden** que elige Mateo (arrastrando ⠿ en la
ventana de Etiquetas) y ese orden se respeta **en todos lados** (la ventana, el desplegable del
filtro y las píldoras de cada chat). Además, en la ventana de Etiquetas se **marca tocando toda la
fila** (no solo la casilla) y la píldora de color **se ajusta al nombre** (antes ocupaba todo el
ancho de la fila, se veía enorme).

**Por qué:** Mateo quería un orden estable y consistente, una selección más cómoda y una vista más
limpia/minimalista.

**Piezas:** columna nueva `etiquetas.orden` (int, rellenada con el orden por `created_at`).
`etiquetas.js`: `listar` ordena por `orden`; al `crear` queda de última; acción nueva `reordenar`
(`{ ids:[...] }` → `orden` = posición). `conversaciones.js` ordena las píldoras de cada chat por
`orden`. Frontend: la ventana de Etiquetas se reordena con arrastrar (HTML5 drag), guarda con
`reordenar` y refresca el filtro y la lista. Verificado: `listar` devuelve por orden, `reordenar` ok.

**Cuidado / qué NO hacer:** el arrastre usa drag-and-drop (pensado para computador); en celular se
usa el orden que se haya dejado desde el computador. El orden es metadato (no toca dinero).

---

## 2026-06-07 — [WhatsApp] / [Base de datos] — Bandeja: filtro avanzado (Y/O) con función de base de datos

**Qué decidimos:** reemplazar los chips de etiqueta sueltos por un solo botón **"Filtros"**
(estilo Manychat/ChateaPro) que abre una ventanita donde se arman condiciones combinadas con
**Y** (todas) u **O** (cualquiera). Cada condición tiene su **operador tiene / no tiene**:
- **etiqueta**: *tiene alguna de* (cualquiera) / *tiene todas de* (todas, obligatorio) /
  *no tiene ninguna de* (negación) + **varias** etiquetas por condición (chips). Así se expresan
  casos como "(Pagada **o** Separada **o** Abonada) **y NO** AGENTE" (tiene alguna de [P,S,A] +
  no tiene ninguna de [AGENTE]) o "AGENTE **obligatorio y** alguna de [P,S,A]" (tiene todas de
  [AGENTE] + tiene alguna de [P,S,A]), todo en modo Y.
- **sin respuesta**, **recordatorio** (*tiene/no tiene* + estado *pendiente* o *enviado/exitoso*),
  **contacto creado** (últimos N días / antes / después de una fecha).
También se agregó un **botón de relojito** en la barra del chat que muestra los recordatorios
pendientes de ese chat con su motivo (endpoint `recordatorios.js`).

**Por qué:** Mateo necesitaba combinar criterios con Y/O y, sobre todo, **negar** (ej. los de
P/S/A pero SIN la etiqueta AGENTE), cosa que los chips de una sola etiqueta no permitían.

**Piezas:** TODO el filtrado corre EN LA BASE (regla de escala), con la función
**`bandeja_filtrar(p_linea_id, p_modo, p_condiciones jsonb, p_q, p_ocultar_agente, p_limite)`**
(`plpgsql`, `security definer`, devuelve `setof conversaciones_whatsapp`, `EXECUTE` a
`anon/authenticated/service_role`). Recibe las condiciones como **JSONB** (cada una con su
operador y, para etiquetas, su lista) y arma el WHERE con SQL dinámico SEGURO (uuids validados por
regex + `format %L`; estados/días/fechas acotados). `conversaciones.js` solo normaliza y reenvía
las condiciones (`normalizarCondiciones`). El frontend manda
`{ filtros:{ modo, condiciones:[{tipo, op, etiquetas|estado|dias|fecha}] } }`. Verificado con datos
reales: (P∨S∨A)∧¬AGENTE=35, AGENTE∧Abonada=12, etc. Publicado a `main`.

**Cuidado / qué NO hacer:** la función es de SOLO LECTURA (no cambia datos). Si se le agregan
columnas/condiciones nuevas, recordar recargar el esquema (ver lección de la caché de PostgREST) y
mantener el `grant execute` a `anon` (el endpoint llama con la llave anónima). El límite es 300
chats por carga (como antes); a escala real conviene paginar.

---

## 2026-06-07 — [WhatsApp] — Plantilla de seguimiento de Liliana con DOS variables (nombre + motivo)

**Qué decidimos:** crear la plantilla `seguimiento_los_plata` (la que reabre conversaciones de
+24h cuando Liliana agenda un recordatorio a días) con **dos** variables en vez de una:
`{{1}}` = nombre del cliente; `{{2}}` = el **motivo**, redactado de cara al cliente (ej. "me
dijiste que hoy ibas a separar tu boleta"). Cuerpo aprobado por Mateo: *"Hola {{1}} 👋 Te
escribimos de Los Plata. {{2}} ¿Seguimos por aquí? Con gusto te ayudamos. 🏡"*. Categoría
MARKETING, idioma `es`. Creada en Meta el 7-jun (estado "pendiente" de aprobación).

**Por qué:** una sola variable (el nombre) daba un mensaje genérico. Con el motivo, el cliente
recuerda POR QUÉ Liliana le vuelve a escribir y la reapertura se siente personal, no spam.

**Piezas:** el `{{2}}` reusa el `motivo` que el agente YA guardaba en `recordatorios` (no se
agregó columna). Se ajustó la instrucción del tool `programar_recordatorio`
(`agente-responder.js`) para que el motivo se escriba en 2ª persona (sirve igual para la
plantilla y para el texto libre cuando la ventana sigue abierta). `recordatorios-cron.js` ahora
arma `params = [nombre, motivo]`, limpia saltos de línea/espacios (Meta los rechaza) y, si no hay
motivo, usa un respaldo ("Queríamos retomar lo de tu boleta de la casa."). Publicado a `main`.

**Cuidado / qué NO hacer:** `{{2}}` NUNCA puede ir vacío (Meta rechaza el envío) → por eso el
respaldo. Si Meta rechaza la plantilla (texto libre en `{{2}}`), ajustar y reenviar. La plantilla
solo "toca la puerta": Liliana sigue la venta solo si el cliente RESPONDE. Cada envío cuesta.

---

## 2026-06-07 — [General] — Carpeta de trabajo FUERA de Google Drive (clon limpio); Drive ya no se usa para el código

**Qué decidimos:** dejar de trabajar/publicar desde la carpeta del proyecto en Google
Drive y usar en su lugar un **clon limpio fuera de Drive** (en el Mac: `~/los-platas-rifas`;
en Windows: una carpeta tipo `C:\los-platas-rifas`). **GitHub** es el punto central que
sincroniza las máquinas de Mateo (Mac y Windows): al empezar se hace `git pull`, al
terminar se publica a `main`. Google Drive ya NO se usa para el código.

**Por qué:** la copia de Drive tenía el git **corrupto** (git local sin commits,
`origin/main` "gone", 258 archivos en staging sueltos). Google Drive y git no se llevan:
Drive sincroniza a su manera y daña el control de versiones. Publicar desde ahí podía
fallar o pisar producción con una versión vieja (era la causa de "publiqué pero no se ve").

**Cuidado / qué NO hacer:** NO trabajar ni publicar desde una carpeta dentro de Drive
(`.../Mi unidad/...` o `.../CloudStorage/GoogleDrive-...`). Si un chat abre ahí, debe clonar
fresco de GitHub a una carpeta fuera de Drive y trabajar desde esa. La regla quedó escrita en
`CLAUDE.md` (sección "Dónde está el código"). La carpeta vieja de Drive se dejó quieta (no se
borró).

---

## 2026-06-06 — [Página clientes] — Página del sorteo final: rediseño, renombrado y vista de computador

**Qué decidimos:** la página `home-sorteo-apartamento.html` NO era residuo de una
rifa vieja de apartamento (como se había anotado): es la página del **sorteo final
en vivo** que se usa al cerrar cada rifa para anunciar al ganador y regalarle a los
clientes registrados **3 oportunidades de $1.000.000**. Se decidió conservarla,
**rediseñarla al estilo de marca actual** (fondo crema, acento verde menta, fuentes
Inter + Cormorant; antes era oscura/dorada con Playfair) y **renombrarla a
`sorteo-en-vivo.html`** (URL `/sorteo-en-vivo`; el nombre viejo no estaba enlazado en
ningún lado). También se le agregó **vista de computador** (tarjeta centrada premium).
La fecha del en vivo se configura en el `<script>` (`FECHA_EN_VIVO`); hoy quedó el
4-jul-2026 22:30. Toda la lógica de registro (`/api/registro-sorteo`) quedó intacta.

**Por qué:** la página estaba totalmente desalineada con la marca oficial (que
evolucionó a crema/menta/Inter, ver `comprar-styles.css`). Es una plantilla que se
reutiliza en cada sorteo: solo se cambia el nombre de la rifa, la fecha y el link de
Facebook (comentado dentro del archivo).

**Cuidado / qué NO hacer:** NO "recuperar" ni restaurar `home-sorteo-apartamento.html`
pensando que es residuo borrado — su contenido vive ahora en `sorteo-en-vivo.html`.
Restaurarlo duplicaría/revertiría el trabajo.

---

## 2026-06-06 — [Página clientes] — Páginas de cliente adaptadas al computador (no las internas)

**Qué decidimos:** que las páginas **que ve el cliente** (sorteo en vivo, comprar,
abonar, ver boleta) se vean bien tanto en celular como en computador. Se hizo con
reglas CSS **solo para pantallas anchas** (`@media (min-width: 768px)`): fondo crema
con un sutil resplandor menta y la columna un poco más ancha/centrada, para que no se
vean como una "tira" perdida en un fondo vacío. El celular NO cambió.

**Por qué:** decisión de Mateo. En el computador las páginas mobile-first se veían
como una columna angosta con los lados vacíos.

**Cuidado / qué NO hacer:** las **herramientas internas** (admin, caja, rifas,
rendimiento, estado-resultados, llamadas, bandeja, permisos, etc.) **NO se tocan**
(decisión explícita de Mateo). Las páginas del "hub" (index, canales, términos) ya
eran responsive (escalan hasta 1080px); no se modificaron.

---

## 2026-06-06 — [WhatsApp] — Liliana: recordatorios a DÍAS por plantilla (reabrir conversaciones de +24h)

**Qué decidimos:** que Liliana pueda agendar volver a escribirle al cliente DÍAS después
(antes solo el mismo día, dentro de la ventana de 24h de WhatsApp). Como pasadas 24h Meta NO
deja texto libre, al vencer el recordatorio el reloj revisa la ventana: si sigue abierta,
escribe texto normal (como antes); si ya se cerró, envía la PLANTILLA de seguimiento aprobada
por Meta (`seguimiento_los_plata`, con el nombre del cliente como variable {{1}}) para reabrir;
cuando el cliente responde, el motor retoma la venta. Además: el ÚNICO canal es WhatsApp —
Liliana NO promete llamadas ni "un asesor te contacta", siempre resuelve por aquí (manual).

**Por qué:** un cliente real (3215605048) pidió que lo contactaran el martes y Liliana
respondió que no podía, y de paso prometió una llamada (que no se hace). Eso pierde ventas.

**Piezas:** `programar_recordatorio` acepta `dias` (tope 30; cae a las 10 a.m. Colombia de ese
día); `recordatorios-cron.js` decide texto-libre vs plantilla según la ventana de 24h y envía
la plantilla reusando `enviarPlantilla`. Publicado a `main` (commit 21ac3ba).

**Cuidado / qué NO hacer:** FALTA crear y APROBAR la plantilla `seguimiento_los_plata` en la
línea de Lili (Difusiones → Plantillas; el código no la pudo crear porque el token bueno solo
vive en Vercel). Mientras no esté aprobada, un recordatorio a días NO reabre (queda como error
en `agente_actividad`). La plantilla solo "toca la puerta": Liliana sigue solo si el cliente
RESPONDE. Cada plantilla enviada tiene costo Meta.

---

## 2026-06-06 — [WhatsApp] — Liliana: arreglo de errores de conversación (acumulado, "primer sorteo", voseo, Sueldazo)

**Qué decidimos:** corregir 5 errores recurrentes detectados al revisar 629 respuestas
reales de Liliana (últimos 8 días). (1) Contaba los sábados/semanas del acumulado
("lleva 3 sábados", ~34 veces — prohibido). (2) Presentaba el acumulado como si "cada
sábado" valiera $20M (es $5M; solo el PRÓXIMO está acumulado). (3) Voseo paisa
("podés", "entrás", ~17 veces) en vez de tutear. (4) Decía "el primer sorteo" (5
veces). (5) Ofreció el Sueldazo cuando ya pasó (3-jun). Lo bueno: nunca se delató como
IA, los montos/fechas eran correctos y pasa a humano cuando debe.

Arreglo en dos frentes:
- **MOTOR** (`api/whatsapp/agente-responder.js`, `bloqueFechas`): ahora solo se le
  muestran los sorteos de HOY en adelante (antes veía los sábados ya jugados y de ahí
  "contaba"); al PRÓXIMO sorteo se le pega el monto acumulado para que no choque con el
  título "$5.000.000". Publicado a `main` (commit 52307f0).
- **MANUAL** (cabina, `agente_config.prompt` de la línea de Lili `1128258647034751`):
  bloque nuevo arriba "LO QUE MÁS SE ROMPE" con lista de voseo prohibido
  (podés→puedes, etc.), regla $5M-cada-sábado / $20M-solo-el-próximo, prohibición de
  contar sábados y de "primer sorteo", y "el Sueldazo ya jugó: no mencionarlo".

**Por qué:** los montos y fechas eran correctos, pero la forma confundía a clientes
(personas mayores) y sonaba inventada. El intento previo (mismo 6-jun) de reforzar solo
el manual no bastó porque el motor le seguía dando la "materia prima" (los sábados
pasados) para contar.

**Cuidado / qué NO hacer:** el `prompt` se editó por SQL con `replace()` puntual (NO se
reescribió entero); el resto del manual quedó intacto. El manual tiene efecto
inmediato; el motor depende del deploy de Vercel. Falta confirmar el efecto observando
los mensajes NUEVOS de Liliana.

---

## 2026-06-06 — [Pagos] — Verificación de pagos con reintentos (DECISIÓN DE DISEÑO, falta construir)

**Qué decidimos:** cuando el cliente manda el comprobante, Liliana le dirá "Listo, voy a verificar tu pago" y reintentará buscarlo cada ~15 min (con la MISMA lógica de la función "buscar pago" de la bandeja) hasta ~1 hora; si el pago aparece, abona sola; si tras ~1 hora no aparece, recién ahí avisa a un asesor.

**Por qué:** los pagos del banco los sube un asesor a mano y con retraso, así que verificar en el instante en que el cliente paga es imposible. Hoy Liliana no lo encuentra al toque y pasa a un asesor de una; un cliente llegó a esperar ~15 horas. Con reintentos, la mayoría se abonarían solos.

**Cuidado / qué NO hacer:** toca DINERO — no construir sin el visto bueno de Mateo. El agente YA usa la misma función "buscar pago" (`api/whatsapp/buscar-pago.js`); el cambio es solo reintentar en vez de rendirse al primer intento.

---

## 2026-06-06 — [Seguridad] / [WhatsApp] — El agente corre como "anon" (falta SERVICE_ROLE_KEY en Vercel)

**Qué decidimos (hallazgo):** `supabaseAdmin` (`api/lib/supabase.js`) cae a la llave anónima porque `SUPABASE_SERVICE_ROLE_KEY` no está configurada en Vercel. Consecuencias: (1) el conteo de costo de IA (`agente_uso`) lo bloquea RLS → el panel "Gasto de IA" muestra **$0**; (2) la seguridad depende de que RLS esté apagado en tablas como `conversaciones_whatsapp`; (3) toda función RPC que llame el agente necesita permiso `EXECUTE` para `anon`.

**Por qué:** se descubrió arreglando el candado (el RPC daba "permission denied for function" porque el agente llamaba como `anon`).

**Cuidado / qué NO hacer:** el arreglo de fondo (poner `SERVICE_ROLE_KEY` y revisar RLS) es delicado y puede romper cosas; hacerlo con calma y confirmando con Mateo. Mientras tanto, las funciones del agente deben dar `EXECUTE` a `anon`.

---

## 2026-06-06 — [WhatsApp] — Liliana: regla "no reventa / no comisiones"

**Qué decidimos:** se agregó al manual de Liliana (en la base, `agente_config.prompt`) una regla: si un cliente quiere revender boletas, ser vendedor/distribuidor o ganar comisión, Liliana responde con amabilidad que Los Plata NO tiene vendedores, revendedores ni comisiones; las boletas se venden directo, y lo invita a comprar la suya.

**Por qué:** lo pidió Mateo.

**Cuidado / qué NO hacer:** el manual de Liliana vive en la base de datos (`agente_config.prompt`), NO en el código; se edita desde la cabina o por SQL.

---

## 2026-06-06 — [WhatsApp] / [Base de datos] — Liliana: candados anti-duplicado en funciones de la base (RPC)

**Qué decidimos:** los "candados" que evitan que Liliana responda dos veces el
mismo mensaje (el de proceso y el anti-duplicado por tanda) ahora viven en
**funciones de la base de datos** (`agente_tomar_lock`, `agente_refrescar_lock`,
`agente_claim_respuesta`, `agente_soltar_lock`), y `agente-responder.js` las llama
por RPC, en vez de escribir directo en columnas de `conversaciones_whatsapp`.

**Por qué:** durante semanas Liliana mandaba el saludo 2 a 4 veces a cada cliente
nuevo. La causa NO era la IA: las columnas de los candados (`agente_procesando_at`,
`agente_respondido_ms`) se habían agregado **después** de la última recarga de la
API de Supabase (PostgREST), y la API **no las "veía"** (error `column ... does
not exist`). Como el candado fallaba en silencio, corrían varias copias de Liliana
a la vez y cada una mandaba su saludo. Metiendo la lógica en funciones de la base,
el candado deja de depender de esa caché y queda inmune. Verificado: 0 duplicados
desde el arreglo.

**Cuidado / qué NO hacer:** NO volver a hacer el candado escribiendo directo a una
columna NUEVA de `conversaciones_whatsapp`. Si agregas una columna que la API va a
usar y sale `column ... does not exist`, es la caché de PostgREST: hay que
**reiniciar la API desde el panel de Supabase** (un NOTIFY/ALTER por SQL no bastó).
Las 4 funciones deben conservar permiso `EXECUTE` para `service_role`,
`authenticated` y `anon`.

---

## 2026-06-06 — [WhatsApp] — Supervisor automático de Liliana PAUSADO

**Qué decidimos:** apagar el supervisor que revisaba a Liliana y le mandaba a
Mateo reportes de errores por WhatsApp. Se pausó su tarea programada en Supabase
(`cron.job` id 2, `supervisor-agente-cada-5min` → `active=false`). El código
(`api/whatsapp/qa-agente-cron.js`) queda intacto; solo no se ejecuta.

**Por qué:** decisión de Mateo. Generaba muchas sugerencias repetidas y varias
trataban como "error de Liliana" cosas que en realidad eran un bug del sistema
(los saludos duplicados), no de la IA.

**Cuidado / qué NO hacer:** para reactivarlo, en Supabase:
`select cron.alter_job(job_id := 2, active := true);`. No hace falta tocar código.

---

## 2026-06-06 — [Documentación] — Memoria del proyecto en tres niveles

**Qué decidimos:** crear un sistema de memoria escrita en tres archivos:
`CLAUDE.md` (reglas cortas), `docs/MAPA-DEL-SISTEMA.md` (detalle de páginas y
funciones) y este `docs/BITACORA-DE-DECISIONES.md` (el porqué de las decisiones).

**Por qué:** cada chat nuevo de IA arrancaba sin contexto, y Mateo tenía que
explicar todo cada vez. Eso bajaba la calidad y hacía fácil duplicar o romper
cosas sin saberlo. Con esta memoria, cualquier chat futuro entiende el sistema
sin que Mateo repita el contexto.

**Cuidado / qué NO hacer:** no meter detalles largos en `CLAUDE.md` (se llena la
memoria del chat). Los detalles van en el mapa; los porqués, aquí.

---

## 2026-06-06 — [Documentación] — Lista de pendientes para pasar el hilo entre chats

**Qué decidimos:** crear `docs/PENDIENTES.md` y agregar al protocolo de cierre que
cada chat, antes de cerrar, publique todo a `main`, anote las tareas a medias y
borre las ya terminadas.

**Por qué:** Mateo cierra un chat y abre otro nuevo seguido. Sin una lista de
pendientes, las tareas a medias se perdían al cambiar de chat.

**Cuidado / qué NO hacer:** publicar siempre directo a `main`, sin crear
solicitudes/PR.

---

## 2026-06-06 — [Documentación] — Una sola bitácora, no una por sistema

**Qué decidimos:** mantener UN solo archivo de bitácora de decisiones, con una
etiqueta de categoría en cada entrada (ej: `[Pagos]`, `[WhatsApp]`), en vez de
crear una bitácora separada por cada parte del sistema.

**Por qué:** muchas decisiones se cruzan entre varios sistemas (ej: una regla de
pagos toca la página del cliente, el admin y la base de datos), así que no
cabrían bien en una sola bitácora separada. Además, varios archivos serían más
difíciles de mantener al día para una sola persona. Las etiquetas permiten
filtrar por sistema sin partir el archivo.

**Cuidado / qué NO hacer:** no crear bitácoras separadas por sistema. Si algún
día esta crece demasiado, se parte; pero por ahora, una sola.

---

## (histórica) — [Rifas/Finanzas] — Solo existe la rifa principal de 4 cifras

**Qué decidimos:** eliminar del sistema las rifas diarias de 2 y 3 cifras
(páginas públicas, endpoints, columnas y categorías de gasto). Solo queda la
rifa principal de 4 cifras (0000–9999).

**Por qué:** las rifas de 2 y 3 cifras son **ilegales en Colombia**.

**Cuidado / qué NO hacer:** NO volver a crear lógica de rifas de 2 o 3 cifras. Si
aparecen referencias en código viejo, son residuo no operativo.

---

## (histórica) — [WhatsApp] — Se quitaron las difusiones de cobro por ChateaPro

**Qué decidimos:** retirar el clasificador de difusiones y las difusiones de
cobro que se hacían por ChateaPro.

**Por qué:** ya no se usa ese mecanismo de cobro por ese medio.

**Cuidado / qué NO hacer:** las difusiones actuales (`api/whatsapp/difusiones.js`)
son solo envíos de plantillas aprobadas por Meta, no el viejo cobro masivo.

---

<!-- Agrega nuevas decisiones ARRIBA de esta línea, justo debajo del encabezado. -->
