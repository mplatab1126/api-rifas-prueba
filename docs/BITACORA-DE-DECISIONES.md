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
