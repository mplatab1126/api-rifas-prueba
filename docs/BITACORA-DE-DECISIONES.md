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

## 2026-06-07 — [WhatsApp] — Boleta: el encabezado refleja el estado de pago (no siempre "Quedaste participando")

**Qué decidimos:** el primer renglón del mensaje de la boleta debe reflejar la realidad. Regla:
**$0 abonado = boleta SOLO separada (aún NO participa)**; **cualquier abono = ya participa**;
**pagada al 100% = lo máximo**. Antes decía siempre "🎉 ¡Quedaste participando!", lo cual era falso
cuando iba con abonado $0.

**Por qué:** Mateo: con $0 abonado el cliente NO entra a participar; decirle que sí confunde.

**Piezas (dos vías de envío de la boleta):**
- **Liliana (agente)** — `agente-responder.js`, herramienta `enviar_boleta`: arma el texto libre con un
  encabezado según el estado (separada / participando / pagada). HECHO y publicado.
- **Botón "Enviar boleta" de la bandeja** — `enviar-boleta.js`: usa una plantilla de Meta. Como la
  plantilla aprobada tenía la 1ª línea FIJA, se creó una **`boleta_cliente_v2`** con la 1ª línea
  VARIABLE ({{1}} = estado, {{2}} = lista de boletas); la vieja `boleta_cliente` queda de RESPALDO
  hasta que Meta apruebe la v2 (el código prefiere v2 si está aprobada, si no la vieja, si no texto).

**Cuidado / qué NO hacer:** Meta **NO permite que el cuerpo de una plantilla empiece/termine con una
variable, ni dos variables seguidas** → por eso la v2 arranca con "Hola 👋" fijo y separa {{1}} y
{{2}} con texto. Mientras Meta aprueba la v2, sigue enviando la vieja (sin caídas).

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
