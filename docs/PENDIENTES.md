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

- [ ] (2026-06-07) **Esperar que Meta apruebe `boleta_cliente_v2`** (la plantilla de boleta con la 1ª
  línea VARIABLE según estado: separada / participando / pagada). Ya creada el 7-jun; mientras Meta la
  aprueba, el botón de la bandeja sigue enviando la vieja `boleta_cliente` (sin caídas). Cuando pase a
  "aprobada", el código la usa sola. La boleta que manda **Liliana** ya quedó corregida. Ver bitácora.
- [ ] (2026-06-07) **Bandeja: ver los mensajes como los ve el CLIENTE.** Hoy la bandeja no muestra
  algunos mensajes igual que como le llegan al cliente. Ejemplo claro: el mensaje de la boleta
  (plantilla) lleva un **botón** ("Ver mi boleta") que el asesor NO ve en la bandeja. Mostrar los
  mensajes salientes tal cual los recibe el cliente (botones de plantilla, encabezado/pie, etc.).
- [ ] (2026-06-07) **Bandeja: mostrar FECHA + HORA en los mensajes del chat.** Hoy un mensaje de HOY
  muestra la hora (ej. 3:53 a. m.), pero uno de días anteriores muestra SOLO la fecha (ej. "6/6") sin
  la hora, y queda confuso. Que los mensajes de días pasados muestren también la hora (fecha + hora).
- [ ] (2026-06-07) **Liliana: que pueda ELEGIR un número al azar si el cliente se lo pide.** Hoy,
  tras mostrarle los números disponibles, si el cliente le dice "no, escógelo tú / dame tu suerte /
  elige cualquiera", Liliana se niega. Debería poder tomar un número LIBRE al azar (de los
  disponibles reales) y proponérselo/apartárselo. Revisar si se hace con una herramienta nueva o
  ampliando `consultar_disponibles`/`apartar_numero`, y reforzar el manual para que no se niegue.
- [ ] (2026-06-06) **Verificar el EFECTO del arreglo de errores de Liliana**: medir en
  los mensajes NUEVOS (de hoy en adelante) que ya NO cuente sábados/semanas, NO diga
  "primer sorteo", NO vosee y NO mencione el Sueldazo. Ver bitácora 2026-06-06.
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

- [x] (2026-06-07) **Etiquetas: nuevo menú de gestión** (izquierda) para crear / ordenar (arrastrar) /
  eliminar. El ícono de etiqueta del chat ahora SOLO marca/desmarca. Acceso directo **"Sin respuesta"**
  junto a "Filtros" (prende/apaga con un clic, sincronizado con el filtro avanzado).
- [x] (2026-06-07) **Liliana: no repetir lo ya dicho + mensajes un poco más cortos en promedio** (pero
  puede alargarse si necesita explicar). Manual ajustado. Ver bitácora.
- [x] (2026-06-07) **Verificación de pagos con reintentos de Liliana** (TOCA DINERO, aprobado por
  Mateo). Si el pago aún no aparece, Liliana dice que está verificando y el sistema reintenta cada
  ~15 min hasta ~1h: si aparece, abona sola; si no, pasa a asesor. Nunca abona por "misma hora" sola;
  una transferencia se consume una vez (no duplica). Cron `verificar-pagos-cada-5min`. Ver bitácora.
- [x] (2026-06-07) **Boleta: dentro de 24h se manda como texto normal (gratis, sin saludo)**; la
  plantilla solo si pasaron +24h. Y **red de seguridad**: si se aparta pero no se envía, se envía sola.
- [x] (2026-06-07) **Plantilla `seguimiento_los_plata` creada** con DOS variables ({{1}} nombre,
  {{2}} motivo de cara al cliente). El reloj de recordatorios ya pasa el motivo como {{2}}.
  FALTA solo que **Meta la apruebe** (pasa a "aprobada" sola; si la rechaza, ajustar y reenviar).
- [x] (2026-06-07) **Filtro avanzado de la bandeja** (botón "Filtros"): condiciones combinables con
  **Y/O**; etiqueta con operador *tiene alguna de / tiene todas de / no tiene ninguna de* y varias
  etiquetas por condición (desplegable con casillas); **recordatorio** (pendiente/enviado, tiene/no
  tiene); **sin respuesta**; **contacto creado** (fecha). Todo en la base con `bandeja_filtrar`.
- [x] (2026-06-07) **Botón de recordatorios en el chat** (relojito): muestra los recordatorios
  pendientes del chat con su motivo (endpoint `recordatorios.js`). Y el botón **actualizar** se
  movió a la esquina de la ficha del cliente.
- [x] (2026-06-07) **Etiquetas: orden propio** (arrastrar ⠿, se respeta en todos lados),
  seleccionar tocando toda la fila, y ancho de la píldora ajustado al nombre. Campo `etiquetas.orden`.
- [x] (2026-06-07) **Liliana: cédula y correo OPCIONALES** al apartar (solo nombre completo, apellido
  y ciudad son obligatorios). Manual + descripción de la herramienta. Ver bitácora.
- [x] (2026-06-07) **Liliana: la boleta se envía por WhatsApp** (no por correo ni mandando a la web).
  Al correo solo va la factura electrónica, y solo cuando la boleta está pagada al 100%. Ver bitácora.
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
