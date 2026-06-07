# Pendientes — Los Plata S.A.S.

> **Qué es este archivo:** la lista de tareas que quedaron a medias o por hacer.
> Sirve para pasar el hilo de un chat a otro sin perder nada.
>
> **Para los chats de IA:**
> - AL EMPEZAR: lee esta lista para saber qué quedó pendiente de chats anteriores.
> - AL CERRAR: anota aquí lo que quedó sin terminar, y borra (o marca como hecho)
>   lo que ya se completó.
>
> **Formato:** una línea por tarea. `[ ]` = pendiente, `[x]` = hecha.
> Ejemplo: `- [ ] (2026-06-06) Revisar si vendedores.html todavía se usa.`

---

## Tareas pendientes

- [ ] (2026-06-07) **Esperar la APROBACIÓN de Meta de la plantilla `seguimiento_los_plata`**
  (ya creada el 7-jun con DOS variables: {{1}} nombre, {{2}} motivo de cara al cliente).
  Cuando Meta la apruebe, los recordatorios a DÍAS de Liliana quedan activos solos. Si Meta la
  rechaza, ajustar el texto y reenviar. Ver bitácora 2026-06-07.
- [ ] (2026-06-07) **Corregir la plantilla de enviar boleta (`boleta_cliente`)**: su primera línea
  SIEMPRE dice "🎉 ¡Quedaste participando!", pero a veces la boleta se envía con **abonado $0**
  (solo separada, falta pagar todo). En ese caso "quedaste participando" está mal. Hay que ajustar
  el mensaje según el estado de pago. Va junto con el punto de abajo.
- [ ] (2026-06-07) **Plantillas/mensaje de boleta según el estado de pago**: decidir con Mateo si se
  crean varias plantillas (separada / sin dinero / abono / pagada) o UNA sola con una variable que
  diga el estado. Objetivo: que el primer renglón refleje la realidad (no siempre "quedaste
  participando"). Relacionado con la corrección de `boleta_cliente` de arriba.
- [ ] (2026-06-06) **Verificar el EFECTO del arreglo de errores de Liliana**: medir en
  los mensajes NUEVOS (de hoy en adelante) que ya NO cuente sábados/semanas, NO diga
  "primer sorteo", NO vosee y NO mencione el Sueldazo. Ver bitácora 2026-06-06.
- [ ] (2026-06-06) Construir la **verificación de pagos con reintentos** de Liliana
  (cada ~15 min hasta ~1h con la función "buscar pago"; abona sola si aparece, y si
  no, avisa a un asesor). **TOCA DINERO** — Mateo debe aprobar el diseño primero. Ver bitácora.
- [ ] (2026-06-06) **Afinar el manual de Liliana** — lo que FALTA aclarar con Mateo:
  ¿cuántas fotos al saludar? (hoy 12+); confirmar el mínimo de $50.000/$60.000; revisar
  el framing de los **$300.000.000**. (Ya HECHO el 6-jun: tutear siempre / no contar
  sábados / no mencionar el Sueldazo — ver "Hecho recientemente" y bitácora.)
- [ ] (2026-06-06) Arreglar **"Gasto de IA = $0"**: configurar `SUPABASE_SERVICE_ROLE_KEY`
  en Vercel (y revisar RLS de las tablas). Ver bitácora.
- [ ] (2026-06-07) **Preparar la copia de trabajo en WINDOWS** (Mateo trabaja la mayoría
  de veces en Windows). La primera vez que abra Claude Code allá, clonar fresco de GitHub a
  una carpeta FUERA de Google Drive (ej. `C:\los-platas-rifas`) y trabajar siempre desde ahí.
  La instrucción ya quedó en `CLAUDE.md`, así que el chat de Windows lo hace solo al leerlo.
- [ ] (2026-06-07) Revisar si **"perla roja"** (rifa vieja) en el CÓDIGO es residuo:
  aparece en `public/rendimiento.html`, `api/app/mis-boletas.js`, `api/contenido/copy-gen.js`,
  `public/ver-house-app.jsx`. NO borrar sin confirmar con Mateo.
- [ ] (2026-06-06) Revisar con Mateo si `public/vendedores.html` todavía se usa o
  está duplicado con `rendimiento.html`.
- [ ] (2026-06-06) Opcional / cosmético: limpiar las ~147 filas de error
  "Candado anti-duplicado falló: column ... does not exist" en `agente_actividad`.
  Son del periodo en que la API no veía la columna del candado (ya resuelto con las
  funciones RPC). No afectan nada; solo ensucian la actividad del agente.

## Hecho recientemente

- [x] (2026-06-07) **Copia de trabajo limpia FUERA de Google Drive** (`~/los-platas-rifas` en
  el Mac). La copia del Drive tenía el git corrupto (Drive lo daña). Ahora se trabaja y publica
  desde el clon limpio; GitHub sincroniza Mac y Windows. Quedó escrito en `CLAUDE.md`. Ver bitácora.
- [x] (2026-06-07) **Frases de inicio/cierre mejoradas** (`docs/COMO-TRABAJAR-CON-IA.md`):
  separan lo que se lee SIEMPRE (3 esenciales) de lo que se abre SOLO por tema (mapa, bandeja).
  La de cierre recuerda actualizar también la bitácora de la bandeja/Liliana.
- [x] (2026-06-07) **Limpieza de documentos viejos**: borrados `migracion-manychat.md`,
  `evaluacion-crm-propio.md`, `terminos-y-condiciones-la-perla-roja.md` y la carpeta
  `docs/sync/` (auditorías de abril). Ya no aplicaban; ningún código los usaba.
- [x] (2026-06-06) **Página del sorteo final en vivo: rediseñada + renombrada.**
  `home-sorteo-apartamento.html` NO era residuo de apartamento: es la página que se usa
  al final de cada rifa para anunciar al ganador en vivo y regalar 3 chances de
  $1.000.000. Se rediseñó al estilo de marca (crema/menta/Inter; antes dorada) y se
  renombró a **`sorteo-en-vivo.html`** (`/sorteo-en-vivo`), adaptada a celular y
  computador. Lógica de registro intacta. NO restaurar la vieja. Ver bitácora.
- [x] (2026-06-06) **Páginas de cliente adaptadas al computador** (comprar, abonar,
  boleta): fondo elegante + columna más ancha en pantallas grandes; el celular no
  cambió. Las internas NO se tocaron (decisión de Mateo). Falta que Mateo confirme en
  su computador que comprar/boleta/abonar se ven bien. Ver bitácora.

- [x] (2026-06-06) **Recordatorios a DÍAS de Liliana** (código): puede agendar seguimiento
  para otro día; el reloj manda la plantilla de seguimiento si ya pasaron 24h. Regla nueva:
  canal único WhatsApp, nunca prometer llamadas. Publicado. FALTA crear la plantilla (arriba).
- [x] (2026-06-06) Reforzado el manual: frase modelo "cada sábado $5M / hoy acumulado $20M".
- [x] (2026-06-06) **Arreglados 5 errores de conversación de Liliana** (contaba los
  sábados del acumulado; "cada sábado $20M"; voseo; "primer sorteo"; Sueldazo ya
  pasado). Motor (en FECHAS solo sorteos futuros) + manual (bloque "LO QUE MÁS SE
  ROMPE"). Publicado. Falta confirmar el efecto en mensajes nuevos. Ver bitácora.
- [x] (2026-06-06) Agregada al manual de Liliana la regla **"no reventa / no comisiones"**.
- [x] (2026-06-06) Arreglado el bug de **saludos duplicados de Liliana** (mandaba el
  saludo 2-4 veces a cada cliente nuevo). Causa: caché de esquema de PostgREST; los
  candados se movieron a funciones de la base (RPC). Verificado: 0 duplicados.
- [x] (2026-06-06) **Pausado el supervisor automático** de Liliana (decisión de
  Mateo). Ver bitácora para reactivarlo.
