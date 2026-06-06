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
