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

- [ ] (2026-06-09) **🔴 RECONECTAR el deploy automático GitHub→Vercel.** Dejó de dispararse (último deploy
  auto ~15h antes del 9-jun mediodía). Mientras siga roto, los push a `main` NO salen al aire solos. Mateo
  debe entrar a Vercel → proyecto `api-rifas-prueba` → Settings → Git y reconectar el repo. **Mientras tanto,
  publicar con `vercel --prod --yes` desde `~/los-platas-rifas`** (ya quedó enlazado con la CLI). Ver bitácora 9-jun.
- [ ] (2026-06-09) **Registrar a mano el abono REAL de la boleta 9290** (clienta Madenys +573213110313): pagó
  $100.000 (Nequi, ref M02384005, quedó LIBRE) pero el abono no se registró (Liliana dijo "pagada" sin abonar
  — ya quedó el candado para que no vuelva a pasar). Abonarlo desde la bandeja (comprobante → Buscar el pago →
  Abonar). Mateo dijo que lo hacía él.
- [ ] (2026-06-09) **Reescribir la descripción de la herramienta `apartar_numero`** (en `agente-responder.js`):
  aún dice cédula/correo "OPCIONALES", la palabra que le prohibimos decir al cliente. Reescribir sin esa palabra
  (cambio de código → desplegar). Pendiente OK de Mateo.
- [ ] (2026-06-09) **Auditoría continua de Liliana:** seguir revisando respuestas por tandas para cazar errores
  nuevos. Hueco aún por mirar: respuestas que quedaron en `null` (sin respuesta) en dudas de saldo/comprobante —
  confirmar si es el agente que no dispara o que la conversación se cerró. Ver bitácora 9-jun.

- [ ] (2026-06-09) **Remarketing para los que NO contestan** — armar un seguimiento automático a las personas
  que escribieron pero dejaron de responder (no contestan), enviándoles el **video de la casa hecho con IA**
  para reengancharlas. Definir con Mateo: a partir de cuántas horas/días sin respuesta se dispara, cuántos
  intentos, y si lo maneja Liliana (recordatorios/plantilla) o una difusión segmentada. Ojo ventana de 24h de
  Meta (fuera de 24h se necesita plantilla aprobada con el video).

- [ ] (2026-06-08) **Enviar la difusión de la GANADORA** — Meta YA APROBÓ las 2 plantillas
  (`resultado_sorteo` y `ganadora_casa_santa_teresita`); falta armar las 2 difusiones y enviarlas.
  Plan: **Clientes (81)** → `resultado_sorteo` (informativa, utilidad);
  **Potenciales (~845)** → `ganadora_casa_santa_teresita` (marketing, breve). Probar antes con un número
  propio y enviar **por tandas** (no todos de golpe; Meta vigila la calidad de la línea). La casilla
  "Liliana atiende las respuestas" va prendida. Se puede **programar a una hora**. Ver bitácora 8-jun.
- [ ] (2026-06-08) **Confirmar que Liliana arranca cuando un potencial responda** a la difusión
  (al enviar quedó `agente_activo=true` en esos chats; el webhook dispara el motor). Verlo en la **prueba
  full de Liliana de mañana**.
- [ ] (2026-06-08) **Opcional: botón "Quiero participar"** en la plantilla de marketing. Primero verificar
  que `recibir.js` capta los mensajes entrantes tipo `button` (para que Liliana no pierda la respuesta);
  por ahora la plantilla pide responder por texto.
- [ ] (2026-06-08) **Confirmar en el panel de Anthropic que el gasto de Liliana sale AISLADO** en la llave nueva
  `ANTHROPIC_API_KEY_LILIANA`. (Ya CONFIRMADO al aire: Liliana responde con esa llave, y `cache_read_tokens` > 0
  en `agente_uso` —caché funcionando, ~11.434 leídos por llamada, ahorra ~la mitad—.) Falta solo mirar el panel.
- [ ] (2026-06-08) **Medir el ahorro de tokens de un día completo** y comparar contra los **$4.89** de hoy
  (con el saludo predefinido sin IA + caché de 1h ya activos). Ver bitácora "Ahorro de tokens".
- [ ] (2026-06-08) **Fases 3 y 5 del ahorro de tokens** (pendientes de hablar con Mateo): (3) cortar el bucle
  cuando una herramienta ya le respondió al cliente; (5) adelgazar el manual (~7.000 tokens). La **Fase 4**
  (más mensajes fijos) ya se hizo: premios, números disponibles y pedir datos (ver "Hecho"). Queda opcional el
  mensaje fijo de "número ya tomado" (hoy lo maneja la IA, por decisión de Mateo). Ver bitácora.
- [ ] (2026-06-08) **Afinar los marcadores del saludo predefinido** (`primerContactoLoResuelveSaludo` en
  `agente-responder.js`) si algún caso se siente robótico, o si manda a la IA algo que el saludo ya resuelve.
- [ ] (2026-06-08) **Opcional: detección de festivos = HECHA**, pero el HORARIO de visita vive en el manual;
  si cambian los horarios de visita, ajustarlos en `agente_config.prompt` (sección "VISITAR LA CASA").
- [ ] (2026-06-07) **BUG recordatorios: un "gracias" cancela el recordatorio a días.** Liliana dice
  "programé un recordatorio" y SÍ lo crea, pero queda en estado `cancelado`, así que el relojito (solo
  muestra `pendiente`) aparece vacío. Causa: `recibir.js` cancela TODO recordatorio pendiente cuando el
  cliente vuelve a escribir (pensado para no molestar si ya retomó), pero cancela incluso con un mensaje
  de cortesía ("Gracias 🙏") y aunque el recordatorio sea para DÍAS después. Caso real: chat
  +573115630300, recordatorio para jue 11-jun 10:00 (motivo "abono boleta 6427"), creado 21:22 y
  cancelado cuando el cliente escribió "Gracias" 21:10... (rev. `recordatorios` id e3fe3b03). **Arreglo a
  pensar:** no cancelar si el recordatorio es a días y el mensaje no reabre la venta (¿o no cancelar los
  de >X horas?, ¿o solo cancelar al volver a interactuar de fondo, no por un "gracias"?). Confirmar con
  Mateo el criterio. (Secundario: el cliente dijo "miércoles" y se agendó "jueves 11"; revisar el
  parseo del día.)
- [ ] (2026-06-07) **Números de remisión que faltan** para los independientes sin número en
  `asesores_config.numero_remision`: **Alejandra Plata, Luisa Papá, Mocho, Nena, Yiny**. Mientras no
  los den, si un cliente con boleta de uno de ellos escribe a Lili, Liliana lo pasa a un asesor.
  Cargar con: `update asesores_config set numero_remision='3XXXXXXXXX' where lower(asesor_nombre)='nena';`
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
- [ ] (2026-06-08) **Seguridad — opcional/menor:** mover la extensión `pg_net` fuera del esquema
  `public` (único WARN que queda; no se hizo por riesgo con los crons que usan `net.http_post`).
  Evaluar con calma si vale la pena. Todo lo grave ya quedó cerrado (ver "Hecho recientemente").
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

- [x] (2026-06-09) **🔒 Candado anti "pago falso" + visibilidad de comprobantes.** (1) Liliana ya NO puede
  decirle al cliente que la boleta quedó "pagada/abonada" si no se registró el abono de verdad (usa el saldo
  real de la base; manda "estoy verificando" + ASESOR + verificación automática). (2) Chip "✅ Pago asignado"
  sobre la foto del comprobante al abonar (Liliana o abono manual). (3) Menú "Comprobantes" en la bandeja
  (lista de las fotos del cliente con ✅ asignado / ⏳ sin asignar, clic → conversación). Archivos:
  `agente-responder.js`, `mensajes.js`, nuevos `comprobantes.js` y `marcar-comprobante.js`, `bandeja-whatsapp.html`.
  Publicado por CLI (deploy auto roto). Ver bitácora 9-jun.
- [x] (2026-06-09) **Afinado el manual de Liliana (4 de 5 patrones de la auditoría):** (1) cédula/correo: nunca
  decir "obligatorios" ni mandar a crear/conseguir un correo; (2) clientes del exterior: participan con el número
  del chat, nunca pedir celular colombiano; (3) remisión más firme (si el sistema indica remitir, no vende ni
  saluda, solo da el número y termina); (4) dudas de saldo: siempre consultar y responder, no dejar sin respuesta.
  Ver bitácora 9-jun.
- [x] (2026-06-09) **Limpiados los residuos del Sueldazo** en el manual (detalles operativos muertos: $1.5M×6,
  mínimo $50.000, horario Manizales, ejemplo "hoy juega el Sueldazo"). Se CONSERVA que ya se jugó y tiene ganadora
  (puede responder si preguntan por el ganador). Ver bitácora 9-jun.
- [x] (2026-06-09) **Permiso venezolano / extranjeros (5º patrón):** Mateo eligió la opción 1 — SÍ participan Y
  reclaman con su documento (cédula de extranjería, PPT/PEP o pasaporte). Regla agregada al manual. Y se corrigió
  una incoherencia: el paso PAGO decía "un supervisor lo revisa" (falso desde que se quitó el supervisor) → quitado.
- [x] (2026-06-09) **Eliminada la etiqueta AGENTE** (y el etiquetado automático al prender el agente, en
  `recibir.js` y `agente.js`) **y el interruptor "ocultarle a Liliana los chats del agente"** (`agente.js`,
  `conversaciones.js`, tarjeta de la bandeja). Borrados de la base: etiqueta AGENTE + sus 523 enlaces +
  config `ocultar_agente_liliana`. Se conserva la etiqueta ASESOR y el auto-encendido del agente. El param
  `p_ocultar_agente` de `bandeja_filtrar` quedó muerto (default false). Ver bitácora 9-jun.
- [x] (2026-06-09) **Tras agotar los 4 intentos de verificar el pago, Liliana se apaga y pasa a humano EN
  SILENCIO** (ya no manda el segundo "estoy verificando / pasa a asesor", que sonaba repetido). Marca ASESOR,
  apaga el agente (`agente_activo=false, estado='humano'`) y cancela recordatorios. Cuando el pago SÍ aparece,
  igual avisa al cliente. `verificar-pagos-cron.js`. Ver bitácora 9-jun.
- [x] (2026-06-09) **La bandeja marca "📋 Mensaje predefinido"** en los mensajes que salieron de un atajo SIN
  IA (saludo/premios/números/datos), para distinguirlos de los de IA ("🤖 Liliana"). `raw.predefinido` →
  `mensajes.js` → `bandeja-whatsapp.html`. No cambia lo que ve el cliente. Ver bitácora 9-jun.
- [x] (2026-06-08) **Más mensajes predefinidos SIN IA (Fase 4 del ahorro): premios, números y pedir datos.**
  Igual que el contacto inicial: si el cliente SOLO asiente a lo último que se le preguntó (o dice "quiero el
  NNNN" para separar), se manda el mensaje fijo del paso sin llamar a Claude. Ante cualquier pregunta/algo
  distinto → IA (conservador). NO toca plata (apartar/abonos siguen por sus herramientas; solo se ahorra la
  redacción). Cada atajo deja nota "(predefinido, SIN IA — ahorro de tokens)" en la bandeja. Funciones nuevas
  en `agente-responder.js`: `esAsentir`, `intentoSeparar`. Probado a nivel de detección con el chat real
  573203726935. La verificación de un número puntual ("¿tienes el 1121?") la sigue haciendo la IA. Ver bitácora.
- [x] (2026-06-08) **Liliana ya PIDE cédula y correo al tomar los datos** (no solo nombre/apellido/ciudad).
  Manual ajustado (`agente_config.prompt` línea de Lili, bloques "DATOS DE LA RIFA ACTUAL" y paso "3) DATOS"):
  pide los 5 datos juntos al inicio para la factura, y SIN decirle al cliente que la cédula/correo son
  "opcionales" (eso invitaba a saltárselos). Solo los omite si el cliente no los tiene o no los quiere dar
  → aparta igual sin insistir. Lo obligatorio para apartar sigue siendo nombre/apellido/ciudad. Probado con
  el MOTOR real (Sonnet) en 3 conversaciones simuladas: pide los 5, ya no dice "opcionales", y aparta sin
  cédula/correo si el cliente se niega. Ver bitácora 8-jun.
- [x] (2026-06-08) **Los movimientos del agente quedan a nombre de "Liliana"** (apartar/abono/liberar/trasladar),
  vía override `asesorRegistro` (solo gerencia) + `asesor` en reservar. **OJO: Liliana es INDEPENDIENTE** → la
  validación de grupo (`abono.js`/`liberar-boleta.js`) sigue al ACTOR REAL (`asesorReg`) para no bloquear sus
  abonos; sus ventas cuentan como independiente en caja/liquidación. **Reatribuidas 33 boletas + 18 abonos
  ($710k) viejos** de la línea de Lili a Liliana (las que la IA registró). Verificado. Ver bitácora.
- [x] (2026-06-08) **Liliana puede prender/apagar el agente 🤖 por chat** (en su línea), no solo Mateo. La cabina
  (manual/interruptor), los costos y los disparadores siguen SOLO gerencia. Y al prender el agente a mano, **ahora
  responde de inmediato** (lo dispara el servidor, ya no depende del navegador). Verificado. Ver bitácora.
- [x] (2026-06-08) **Bandeja: menú ⋮ en el chat** con "Marcar como respondido" (saca el chat de "sin respuesta"
  sin escribirle, endpoint `marcar-respondido.js`) y "Eliminar contacto". Etiqueta/recordatorios/ficha quedan a
  primer toque. Verificado al aire.
- [x] (2026-06-08) **Ahorro de tokens de Liliana**: (1) **saludo predefinido SIN IA** en el primer contacto
  genérico/básico (precio/legal/cuándo) — el ~88% es el texto del anuncio; quita ~la mitad de las llamadas;
  (2) **caché de prompt a 1 hora**. No cambian lo que responde. Verificado al aire (se envía sin IA, 0 errores).
  Falta medir el ahorro de un día. Ver bitácora.
- [x] (2026-06-08) **Liliana responde lo de VISITAR la casa** (horario L-V 2-8pm, sáb 10am-2pm, domingos/festivos
  no; dirección Mz 5 casa 66, urb. Santa Teresita, al lado de Verdum) — agregado al manual, ya no escala. Y sabe
  los **festivos de Colombia** (calculados) para no decir que abre un festivo. Ver bitácora.
- [x] (2026-06-08) **Difusiones con filtros + programar + "Liliana atiende"**: el módulo de Difusiones ahora
  segmenta por **Clientes** (con saldo / pagados / ciudad) y **Potenciales** (nunca compraron), permite
  **programar** el envío a una hora (lo manda un cron por tandas) y, con una casilla, **Liliana atiende sola**
  a quien responda. Verificado en producción (audiencia: 845 potenciales / 81 clientes). Creadas las plantillas
  `resultado_sorteo` (utilidad) y `ganadora_casa_santa_teresita` (marketing), **YA aprobadas por Meta**. Ver bitácora.
- [x] (2026-06-08) **Caché de prompt activado en Liliana** (`agente-responder.js`): el manual + herramientas se
  cachean (10× más barato en lectura). Baja ~la mitad el gasto de entrada. No cambia la conducta. Falta confirmar
  al aire (arriba). Ver bitácora.
- [x] (2026-06-08) **Eliminados los DOS supervisores Opus de Liliana**: (1) el de movimientos de dinero
  (`verificarConOpus`, ya estaba inactivo) y (2) el supervisor QA de reportes (`qa-agente-cron.js`, ya pausado) con
  todo su ciclo de sugerencias (cron jobid 2, `vercel.json`, `agente.js` y la cabina). La seguridad del dinero NO
  bajó (vive en los candados de cada acción). Sus tablas `agente_sugerencias`/`agente_qa_estado` se borraron. Ver bitácora.
- [x] (2026-06-08) **🔒 SEGURIDAD: RLS prendido en las 56 tablas** y bloqueada la llave anónima.
  De 84 problemas (tokens de WhatsApp/sesión expuestos) → 0 errores. El backend usa la llave maestra
  (cambio en `api/lib/supabase.js`) y pasa por encima de RLS; el frontend/app no tocan Supabase directo.
  Verificado (anónima ve 0; backend y bandeja siguen). Ver `docs/seguridad-rls.md` y bitácora.
  ⚠️ NO borrar `SUPABASE_SERVICE_ROLE_KEY` de Vercel; tabla nueva = prenderle RLS.
- [x] (2026-06-08) **Nombre de la rifa corregido a "Casa Santa Teresita"** (antes "Rica casa santa
  teresita"). Cambiado en `rifas.nombre` (rifa activa) y en el manual de Liliana (`agente_config.prompt`).
  Efecto inmediato. Las categorías contables "Rifa Casa Santa Teresita" (caja/finanzas) NO se tocaron.
- [x] (2026-06-07) **Agente: no se presenta a un cliente que YA tiene boleta.** Antes Liliana mandaba
  el contacto inicial aunque el cliente ya tuviera boleta (no obedecía la instrucción). Ahora es
  determinístico: si tiene boleta(s) o hay que remitirlo, el código le quita la herramienta de contacto
  inicial. Además, las ventas por la WEB ("Pagina Web") cuentan como equipo → remiten al 3107334957.
- [x] (2026-06-07) **Bandeja: el contador verde de "sin leer" se apaga cuando Liliana responde.**
  Antes solo se ponía en 0 si un humano abría el chat; ahora `guardarEnChat` (saliente) pone `no_leidos=0`.
  Se limpiaron de una vez 248 chats viejos de la línea de Lili (último mensaje ya era nuestra respuesta).
- [x] (2026-06-07) **🔴 CRÍTICO arreglado — el acumulado se reinicia tras un ganador.** Liliana decía
  que el próximo sábado iba por $20M cuando ya se había ganado el acumulado (6-jun); ahora vuelve a su
  base ($5M en bonos). Motor: `montoAcumProximo` agrupa por tipo de sorteo y solo arrastra si el último
  del mismo tipo quedó acumulado. Verificado con datos reales. Ver bitácora.
- [x] (2026-06-07) **Gasto de IA arreglado**: se configuró `SUPABASE_SERVICE_ROLE_KEY` en Vercel
  (nueva "Secret key" de Supabase). `agente_uso` ya guarda el costo y el panel lo muestra (verificado).
  El agente siguió normal. Cuenta de ahora en adelante. Ver bitácora. (Queda aparte: endurecer RLS.)
- [x] (2026-06-07) **Liliana remite al punto de venta si la boleta la vendió OTRO** (no la atiende:
  le da el número del asesor que vendió). Aplica aunque esté pagada o quiera otra boleta; varios
  vendedores → el más reciente. Columna `asesores_config.numero_remision`. Ver bitácora.
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
