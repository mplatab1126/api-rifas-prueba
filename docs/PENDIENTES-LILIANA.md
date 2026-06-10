# Pendientes de Liliana — plan de mejoras (auditoría del 9-jun-2026)

> **Qué es:** la lista de TODAS las mejoras del agente Liliana, para ir tachando una por una.
> Sale de una auditoría multi-agente (101 agentes: 8 auditores —velocidad, costos, dinero,
> seguridad, coherencia, escala, conversación, estrategia— + 1 verificador escéptico por
> hallazgo + un crítico de completitud). De 91 hallazgos, 90 quedaron confirmados contra el
> código y producción.
>
> **Cómo usarla:**
> - Cada ítem tiene su código **Hnn**. El detalle completo (evidencia, archivo:línea, mejora
>   exacta y los AJUSTES del verificador) está en `docs/auditoria-liliana-2026-06-09.md` —
>   abrir SOLO la sección del ítem que se vaya a trabajar (el anexo es enorme).
> - Antes de implementar un ítem, leer SIEMPRE su "nota del verificador" en el anexo: varias
>   mejoras tienen correcciones importantes ahí.
> - Los ítems de DINERO (sección 1) tocan pagos: explicarle a Mateo antes de tocar, como manda
>   el CLAUDE.md.
> - Al completar un ítem: marcar `[x]`, anotar fecha, y si fue importante, bitácora.

---

## ✅ Resuelto ya (el mismo 9-jun, durante la auditoría)

- [x] **H0+H1 · 🔴 CRÍTICO — El modelo que LEE los comprobantes se retiraba el 15-jun.**
  `comprobante.js`, `procesar-ia.js`, `procesar-ia-gasto.js` y `analisis-ia.js` usaban
  `claude-sonnet-4-20250514` (retiro oficial: 15-jun-2026). Se habría roto TODO el abono
  automático y la carga de pagos del banco. Cambiado a `claude-sonnet-4-6` (reemplazo oficial),
  desplegado y probado con 2 comprobantes reales: lectura idéntica. Queda abierto lo accesorio:
  probar Haiku 4.5 (3× más barato) para la lectura → ver H30/H44, y el registro del gasto de
  comprobantes (decisión de Mateo pendiente, ver nota del verificador en H0).
- [x] *(Aparte de la auditoría, mismo día):* bug del abono automático (`buscar-pago.js` +
  grupo de Liliana) arreglado y $110.000 recuperados; candado anti "pago falso" afinado.
  Ver bitácora 9-jun.

---

## 1) 🔴 PRIMERO — Dinero (huecos en los candados; explicar a Mateo antes de tocar)

- [x] (2026-06-10) **H6** · Consumo de la transferencia NO atómico → ARREGLADO: en `abono.js` la
  transferencia se consume con UPDATE condicional (`estado='LIBRE'`, verificando fila afectada)
  ANTES de insertar el abono, con reversión a LIBRE si el insert falla; mismo patrón en
  `venta.js` (ajuste del verificador) y en la auto-asignación por referencia de ambos. Verificado
  al aire. Ver bitácora 10-jun.
- [x] (2026-06-10) **H7** · Cron y turno en vivo sobre el MISMO comprobante → ARREGLADO: claim
  'en_proceso' en `verificaciones_pago` por AMBOS lados (el cron lo marca al reclamar y lo
  devuelve a 'pendiente' al reprogramar; `registrar_abono` no verifica si hay una 'en_proceso'
  fresca y reclama la 'pendiente' antes de verificar), más rescate de filas 'en_proceso'
  huérfanas (>10 min) en el cron. Verificado: el cron corre OK con el código nuevo.
- [x] (2026-06-10) **H8** · Dos clientes con el MISMO número → ARREGLADO: `reservar.js` ocupa con
  update condicional `.is('telefono_cliente', null)` verificando fila afectada; si otro ganó,
  revierte las boletas del MISMO pedido (filtros estrictos: teléfono propio + $0 abonado) y
  responde "se acaba de ocupar". Confirmado en producción: las libres son NULL (187/0 vacías).
- [x] (2026-06-10) **H9** · Referencias de 1-4 caracteres → ARREGLADO: largo mínimo 5 para la
  referencia cruda en los DOS sitios (`esCoincidencia` y `elegirSugerida` de `buscar-pago.js`).
  Una referencia corta ya no abona sola: cae a revisión humana (fail-safe).
- [x] (2026-06-10) **H37** · `trasladar_abono` sin transacción → ARREGLADO: TODO el traslado
  (validar mismo cliente + mover/partir abonos + recalcular ambos saldos + reapuntar
  transferencias) vive ahora en la función transaccional `trasladar_abono_atomico` de la base
  (bloquea ambas boletas en orden fijo; o se hace todo o nada). SQL versionado en
  `sql/trasladar-abono-atomico.sql`. Probada con rollback en producción (camino feliz + 5
  validaciones) y verificada al aire. Ver bitácora 10-jun.

## 2) 🔴 PRIMERO — Clientes que quedan COLGADOS en silencio (familia "respuestas en null")

- [x] (2026-06-10) **H5+H21** · ARREGLADO: el candado se refresca en CADA vuelta del bucle de IA
  y en la fase de transcripción/descarga (ya no se vence a los 60s → no más doble respuesta); y
  al cerrar, si el cliente escribió MIENTRAS Liliana redactaba, la corrida se re-dispara a sí
  misma con el flag `redisparo` (que salta la guarda de "último mensaje es nuestro", como pedía
  el verificador). Ver bitácora 10-jun.
- [x] (2026-06-10) **H12** · ARREGLADO: (1) barredor cada minuto (en `recordatorios-cron.js`)
  que re-dispara chats con el agente activo, último mensaje del cliente y 2-60 min sin respuesta
  (excluye humano/apagado/sombra; idempotente por los candados); (2) el claim anti-duplicado
  guarda `agente_claim_at` y permite RE-RECLAMAR un turno muerto a los 5 min si nunca salió
  respuesta (atómico en la RPC, ver `sql/agente-claim-reclaim.sql`). Probado con rollback.
- [x] (2026-06-10) **H4+H11** · ARREGLADO: la llamada a la IA reintenta 1 vez ante errores
  transitorios (429/5xx/no-JSON/red) refrescando el candado en la espera; si persiste → nota +
  etiqueta ASESOR. El catch global ahora suelta el candado, deja el error en `agente_actividad`
  y marca ASESOR (`conv` izada fuera del try). También la rama de despedida de `pasar_a_humano`.
- [x] (2026-06-10) **H10** · ARREGLADO: `decir()` revisa `env.ok` — si WhatsApp rechaza, guarda
  el mensaje como 'fallido' (el chat NO se marca atendido), deja nota y etiqueta ASESOR;
  `enviar_contacto_inicial` y `enviar_boleta` le dicen la verdad a la IA si el envío falló; el
  historial de la IA EXCLUYE los 'fallido' (no "recuerda" lo que el cliente nunca recibió); y el
  cron, si abona pero no puede avisar, deja error + ASESOR.
- [x] (2026-06-10) **H13** · ARREGLADO: `agendarVerificacion` revisa `{ error }` del insert (con
  supabase-js los errores NO lanzan) → si falla, error en actividad + ASESOR (el cliente quedó
  esperando una verificación); el webhook devuelve 500 si NINGÚN mensaje se pudo guardar (Meta
  reintenta; el dedup absorbe) y distingue el corte normal de 1.5s de un fallo real del disparo.

## 3) 🟠 Coherencia con fecha límite (antes de la semana final de la rifa)

- [x] (2026-06-10) **H2** · ARREGLADO (17 días antes del límite): si el próximo sorteo es el
  Premio Mayor (regex `/mayor|casa/i` sobre el título, validado contra el calendario real: caza
  SOLO el 4-jul), el saludo fijo dice "con tu boleta *100% pagada* participas por la casa" en vez
  de "con $20.000 ya entras". Queda pendiente lo OPCIONAL del verificador: una aclaración de una
  línea en el manual (línea ~102, "con $20.000 ya entra") para la ruta CON IA — hacerla junto con
  H3 cuando Mateo dé el OK de editar el manual.
- [x] (2026-06-10) **H3** · ARREGLADO (con OK de Mateo): las 6 ocurrencias de "$20.000.000" del
  manual quedaron condicionales ("el monto que te dé el sistema"; sin acumulado indicado → solo
  $5.000.000) y se reconcilió la contradicción "ACLARA SIEMPRE las dos cifras" vs "di solo el
  monto del sistema". De paso, la aclaración opcional de H2 para la ruta CON IA ("con $20.000 ya
  entras" vale para los sábados; el Premio Mayor exige boleta 100% pagada). Efecto inmediato (el
  motor lee el manual en cada respuesta). La versión anterior quedó respaldada por el versionado
  nuevo (H15). Verificado: 0 ocurrencias de $20.000.000 y bloques coherentes.

## 4) 🟠 Seguridad técnica

- [x] (2026-06-10) **H19** · CERRADO Y ACTIVO: `recibir.js` valida la firma HMAC-SHA256 de Meta
  sobre el cuerpo crudo (comparación segura; firma mala → 200 sin procesar). Mateo configuró
  `META_APP_SECRET` en Vercel + redeploy el mismo 10-jun. Verificado por los DOS lados: mensaje
  real de WhatsApp → Liliana respondió normal (firmado pasa); POST falso sin firma → rechazado
  con rastro "FIRMA INVÁLIDA" en el log de Vercel. Si algún día Meta rota el App Secret,
  actualizar la variable (síntoma: TODO mensaje entrante deja "FIRMA INVÁLIDA" en el log).
- [x] (2026-06-10) **H20** · ARREGLADO (capa mínima + recorte de datos): rate-limit por IP en
  `api/abonar/cliente.js` (40/10 min — el endpoint REAL detrás de /boleta, corrección del
  verificador) y en `api/cliente.js` (300/10 min, generoso porque lo consume ChateaPro); y la
  **cédula y el correo salen ENMASCARADOS** ("••• 149", "ma•••@gmail.com") — al dueño le sirven,
  al que enumera ya no. Verificado al aire. Bonus descubierto: el firewall de Vercel además
  desafía ráfagas agresivas por IP (capa extra). Queda OPCIONAL a futuro: token firmado en el
  enlace de /boleta en vez del teléfono crudo.
- [x] (2026-06-10) **H40** · ARREGLADO: tope de 6 arranques del motor por minuto por teléfono
  (`recibir.js`, función `rate_limit_check` en la base, `sql/rate-limit.sql`). Si un chat se
  pasa, no pierde nada: el mensaje queda guardado y el barredor lo retoma en ~2 min (como pidió
  el verificador: degradar, no enmudecer). Probada la lógica del contador (permite 40, bloquea 41).

## 5) 🟠 Capacidades nuevas que NO estabas considerando (estrategia)

- [x] (2026-06-10) **H15** · HECHO: tabla `agente_config_historial` + trigger que guarda la
  versión ANTERIOR del prompt/variables antes de cada cambio (RLS prendido; SQL versionado en
  `sql/versionado-manual-liliana.sql`, con la receta de restauración). Probado en vivo: la
  edición de H3 dejó su respaldo automático (27.706 chars, la versión con el $20M).
- [x] (2026-06-10) **H14** · HECHA Y EN VERDE: suite dorada con **10 casos de incidentes reales**
  (voseo, contar sábados, $20M vencido, pago falso, correo "obligatorio", extranjeros, $300M vs
  amoblado, boleta por WhatsApp, no reventa, mínimos por sorteo) en `agente_casos_dorados` +
  corredor **`api/whatsapp/probar-suite.js`** (solo gerencia): corre cada caso contra el manual
  con las MISMAS herramientas del agente en modo seco y evalúa regex prohibidos/requeridos.
  Acepta un manual CANDIDATO sin guardarlo (flujo seguro: probar → verde → guardar). Primera
  corrida real contra producción: **10/10 en verde** (los 2 rojos iniciales eran defectos de los
  casos, corregidos). Cómo correrla: pedirle a un chat de Claude "corre la suite dorada de
  Liliana" (POST a `/api/whatsapp/probar-suite` con contraseña de gerencia + linea_id). Casos
  nuevos = INSERT en la tabla. Pendiente opcional: botón en la cabina.
- [x] (2026-06-10) **H16** · HECHO Y PROBADO: cron `alertas-agente-cada-15min` (jobid 7) →
  `api/whatsapp/alertas-cron.js`. Avisa al WhatsApp de Mateo (573123354789, por la línea de
  Lili): clientes >15 min esperando (con memoria anti-repetición), errores nuevos del agente,
  verificaciones de pago rendidas, gasto de IA >2× el promedio semanal (1 vez/día), y RESUMEN
  diario a las 8 p.m. (abonos, gasto, errores). Probado en vivo: error de prueba sembrado →
  alerta detectada y WhatsApp ENVIADO. Respaldo para ventana de 24h cerrada: plantilla utility
  `alerta_sistema_los_plata` (creada, EN REVISIÓN de Meta — cuando pase a "aprobada" el respaldo
  queda activo solo). Estado/memoria en `agente_alertas_estado`.
- [x] (2026-06-10) **H17** · HECHO: los textos de la rifa (saludo, cierre, premios, pedir datos,
  condiciones de la herramienta) ahora viven en `agente_config.variables` (sembradas en la base,
  editables desde la cabina, versionadas por H15) — los atajos SIN IA y la descripción de
  `enviar_contacto_inicial` las leen con respaldo en el código. **Rotar de rifa ya NO exige
  desplegar código** (salvo `precios.js` y `resolucion.pdf`). Checklist completo de rotación en
  **`docs/CHECKLIST-RIFA-NUEVA.md`** (incluye las convenciones del título "Mayor/casa" y del
  agrupado del acumulado). El fallback del recordatorio quedó neutro ("lo de tu boleta").
  Verificado al aire: motor corre normal; los textos actuales son idénticos a los de antes.
- [ ] **H18** · **Cobro suave automático de saldos.** Hay ~$10.9M en saldos pendientes de
  deudores con chat en la línea (y muchos más sin chat). Campaña recurrente con difusiones +
  "Liliana atiende" (infraestructura YA existe). Paso previo: importar deudores como contactos
  (ver ajustes). Escalar la cadencia hacia el 4-jul. — _esfuerzo medio_

## 6) 🟡 Importancia media (25)

- [x] (2026-06-10) **H22** · HECHO: el texto de premios tiene `{{acumulado}}` — si hay acumulado vigente agrega "(y el del *próximo sábado* está acumulado en *$X*)" con la MISMA cifra del saludo (una sola cifra por conversación). Variable y respaldo actualizados.
- [x] (2026-06-10) **H23** · HECHO (cubre también H82): se quitó el parámetro `telefono` de la herramienta; la descripción dice claro que SOLO consulta este chat y que rechace consultas de terceros; el resultado dice "Cliente de ESTE chat" (cinturón anti-atribución); etiqueta de la cabina actualizada. Suite dorada en verde tras el cambio.
- [x] (2026-06-10) **H24** · HECHO (con OK de Mateo): la cuenta 3128732266 de Maria Buitrago quedó PUBLICADA en /canales-oficiales (Nequi+Daviplata+Bre-B, grupo "Cuenta autorizada") y el aviso del hub remite a esa lista verificable. Verificado al aire.
- [x] (2026-06-10) **H25** · CUBIERTO por el arreglo de H10 (decir() revisa env.ok, guarda 'fallido', nota + ASESOR).
- [x] (2026-06-10) **H26** · HECHO: las reacciones se ignoran por completo (no suman sin-leer, no cancelan recordatorios, no disparan al agente); los tipos sin contenido ('unsupported'/'ephemeral') SÍ se guardan y suman sin-leer (que los vea un humano) pero no cancelan recordatorios ni disparan al agente de inmediato.
- [ ] **H27** · registrar_abono y el candado de pago usan ciegamente la ÚLTIMA imagen del chat, aunque no sea el comprobante (`api/whatsapp/agente-responder.js:722-727`) — _esfuerzo medio_
- [x] (2026-06-10) **H28** · HECHO (extensión de las alertas H16): chequeo nuevo en `alertas-cron.js` — chats estado='humano' con el cliente esperando >30 min (hasta 24h atrás) → WhatsApp a Mateo, una vez por chat (re-avisa a las ~2h). En su PRIMERA corrida real cazó un caso de ~12 horas (Leiky OG).
- [x] (2026-06-10) **H29** · HECHO (arreglo mínimo del verificador): la tabla PRECIOS cobra la escritura de caché a 2× (Sonnet $6/M, Opus $10, Haiku $2) — el ttl del motor es 1h. El panel deja de subfacturar ~16-22%. Cuenta de ahora en adelante (lo viejo no se recalcula).
- [x] (2026-06-10) **H30** · HECHO: el motor salta las fotos marcadas pago_asignado y las de >48h; el historial trae solo raw->pago_asignado (sintaxis validada contra PostgREST); y la marca la pone verificarYAbonar en api/lib (el CRON ahora también marca al abonar, ajuste del verificador). ~$0.3-0.5/día menos.
- [x] (2026-06-10) **H31** · HECHO: 5 patrones nuevos en `afirmaPagoHecho` ("recibí tu pago", "tu pago ya entró", "se acreditó", "tu plata ya quedó", "todo en orden con tu pago") + marcador de NEGACIÓN ("aún no recibimos tu pago" pasa libre). 'comprobante' sigue FUERA (lo usa el mensaje seguro). Probado con 24 casos deben-bloquear/deben-pasar (24/24) y suite dorada en verde.
- [ ] **H32** · Comprobante ajeno reciclado: la coincidencia por referencia confía 100% en una imagen aportada por el cliente (`api/lib/abono-agente.js:59-86`) — _esfuerzo medio_
- [x] (2026-06-10) **H33** · CUBIERTO por el arreglo de H5/H21 (refresco del candado en cada vuelta del bucle y en transcripción/descarga).
- [ ] **H34** · Presupuesto de tiempo: debounce de hasta 4 min + transcripciones + 6 vueltas de IA dentro de los 300s de maxDuration, y ninguna llamada externa tiene timeout (`api/whatsapp/agente-responder.js:35`) — _esfuerzo medio_
- [ ] **H35** · Métricas de embudo: contacto → premios → números → apartado → abono → pagada (`api/whatsapp/agente-responder.js:60-71`) — _esfuerzo medio_
- [ ] **H36** · Reestructurar el manual: dos secciones reclaman prioridad máxima a la vez y las reglas clave están duplicadas hasta 4 veces (`/tmp/manual-liliana.txt:9`) — _esfuerzo medio_
- [x] (2026-06-10) **H38** · HECHO: `sql/esquema-agente-produccion.sql` = instantánea de referencia con las 12 funciones reales de producción (candados, bandeja_filtrar, difusiones, costos, etiquetas), los 5 crons (secreto REDACTADO) y la lista de tablas. `whatsapp-buzon.sql` quedó marcado como VIEJO. Regla nueva: todo cambio en la base nace en su archivo de sql/.
- [x] (2026-06-10) **H39** · HECHO: secreto propio AGENTE_INTERNO_SECRET (32 bytes, timingSafeEqual con guardia de largo, api/lib/secreto-interno.js) en los 6 validadores y 5 emisores; los 4 pg_cron actualizados con cron.alter_job; transición sin cortes y cierre verificado (nuevo 200 / viejo 403). El verify token quedó SOLO para el GET de Meta.
- [x] (2026-06-10) **H41** · HECHO (capa mínima del verificador): tope de 10 números por reserva, rate-limit 20/10min por IP, y el campo `asesor` SOLO se honra con el secreto interno (el agente lo manda; un curl anónimo queda como 'Pagina Web'). Verificado al aire.
- [ ] **H42** · Debounce fijo de 30s: piso de latencia para TODO mensaje, incluso los atajos sin IA (`api/whatsapp/agente-responder.js:34-35`) — _esfuerzo medio_
- [ ] **H43** · Las imágenes entrantes se RE-descargan de Meta en cada turno y se re-suben en base64 en CADA iteración del bucle (`api/whatsapp/agente-responder.js:1110-1123`) — _esfuerzo medio_
- [x] (2026-06-10) **H44** · HECHO (parcial a propósito): registrar_abono le presta a buscar-pago el base64 ya descargado (media_base64 opcional; el cron conserva el fallback por media_id). El modelo lector SIGUE en Sonnet por decisión de Mateo (no crear asimetría con el extractor del banco).
- [x] (2026-06-10) **H45** · HECHO: las 10 consultas por serie van en PARALELO (Promise.all; los 2 updates de marcas siguen secuenciales como pidió el verificador). Medido al aire: /api/disponibles pasó de 2.33s a 0.85s. Beneficia atajo de números, herramienta, web y bandeja.
- [x] (2026-06-10) **H46** · HECHO (variante segura del verificador): la boleta tras apartar la envía el SISTEMA al cerrar el turno (la red de seguridad pasó a ser el camino normal); el tool_result y el paso 5 del manual ya dicen "NO llames enviar_boleta". Ahorra una llamada entera a Claude (~4-8s) por venta. Suite dorada en verde.

## 7) 🟢 Menores y oportunidades (43)

- [ ] **H47** · Duplicaciones concretas dentro del manual (8 reglas repetidas 2-5 veces) e instrucción sin referente ("más breves que antes") (`/tmp/manual-liliana.txt`) — _esfuerzo medio_
- [ ] **H48** · Los medios de pago están escritos en duro en la sección de la web del manual, duplicando la variable {{pagos}} (`/tmp/manual-liliana.txt:139`) — _esfuerzo bajo_
- [ ] **H49** · El manual exige mencionar el próximo sorteo en el contacto inicial, pero la herramienta (camino IA) no lo pide (`api/whatsapp/agente-responder.js:306-307`) — _esfuerzo bajo_
- [ ] **H50** · El atajo de saludo trata como nuevos a clientes CONOCIDOS sin boletas: saludo genérico en vez de por su nombre (`api/whatsapp/agente-responder.js:1258-1261`) — _esfuerzo bajo_
- [ ] **H51** · El atajo de números promete verificar "terminaciones" que ninguna herramienta puede buscar (`api/whatsapp/agente-responder.js:1313-1315`) — _esfuerzo bajo_
- [ ] **H52** · "Soy Liliana" está escrito en duro en atajos y herramienta, ignorando el diseño multi-línea con nombre_agente (`api/whatsapp/agente-responder.js:307`) — _esfuerzo bajo_
- [x] (2026-06-10) **H53** · CUBIERTO por H46: la descripción de `enviar_boleta` quedó coherente con el manual ("SOLO si el cliente pide su boleta de nuevo; tras apartar la envía el sistema").
- [ ] **H54** · Recordatorios: se marcan 'enviado' ANTES de enviar; cualquier fallo rompe la promesa de Liliana sin reintento (`api/whatsapp/recordatorios-cron.js:132-137`) — _esfuerzo medio_
- [ ] **H55** · primerContactoLoResuelveSaludo no ve multimedia real (solo busca '[audio...' en el texto) ni filtra mensajes hostiles/equivocados (`api/whatsapp/agente-responder.js:533-546`) — _esfuerzo bajo_
- [ ] **H56** · intentoSeparar dispara con negaciones y con dos números: pide datos para el número que el cliente RECHAZÓ (`api/whatsapp/agente-responder.js:592-601`) — _esfuerzo bajo_
- [ ] **H57** · Números con dígitos de más o de menos se truncan en silencio: puede apartar/verificar un número que el cliente no pidió (`api/whatsapp/agente-responder.js:627`) — _esfuerzo bajo_
- [ ] **H58** · pasar_a_humano: la despedida al cliente depende de una 2ª llamada a la IA sin fallback — si falla, el cliente pide un humano y recibe SILENCIO (`api/whatsapp/agente-responder.js:1447-1456`) — _esfuerzo bajo_
- [ ] **H59** · El atajo de saludo trata como desconocidos a clientes de rifas pasadas (el corte de historial por rifa los vuelve 'nuevos') (`api/whatsapp/agente-responder.js:1258-1261`) — _esfuerzo bajo_
- [ ] **H60** · El atajo de pedir datos promete apartar un número sin verificar que siga libre (`api/whatsapp/agente-responder.js:1325-1334`) — _esfuerzo bajo_
- [ ] **H61** · Toda imagen sin caption se le presenta a la IA como posible comprobante ('puede ser el comprobante de pago') (`api/whatsapp/agente-responder.js:906`) — _esfuerzo bajo_
- [ ] **H62** · Si se agotan las 6 iteraciones del bucle sin un bloque de texto final, el turno termina sin decirle nada al cliente (`api/whatsapp/agente-responder.js:1401-1463`) — _esfuerzo bajo_
- [ ] **H63** · Quitar enviar_contacto_inicial del array de tools parte el caché en dos variantes y multiplica las reescrituras completas (~$1.5/día real) (`api/whatsapp/agente-responder.js:1155-1157`) — _esfuerzo medio_
- [ ] **H64** · Manual de 27.7k chars: mapa concreto de duplicados — recortable 25-35% sin perder ninguna regla (profundiza la fase 5 pendiente) (`/tmp/manual-liliana.txt:15-34`) — _esfuerzo medio_
- [ ] **H65** · Más atajos sin IA respaldados por datos: el día 1 de atajos bajó el gasto ~48%, y quedan dos rutas frecuentes y determinísticas que aún van a IA (`api/whatsapp/agente-responder.js:544`) — _esfuerzo medio_
- [ ] **H66** · ~1.400 caracteres de instrucciones FIJAS viajan en el bloque volátil (precio lleno en cada llamada) en vez del manual cacheado (`api/whatsapp/agente-responder.js:1338-1347`) — _esfuerzo bajo_
- [ ] **H67** · El bloque 'ACCIONES QUE YA EJECUTASTE' crece sin tope ni dedupe: hasta 27 notas re-facturadas a precio lleno en cada llamada del chat (`api/whatsapp/agente-responder.js:1162-1165`) — _esfuerzo bajo_
- [ ] **H68** · liberar_boleta: el candado dueño + saldo $0 vive solo en el llamador y no resiste carreras (`api/whatsapp/agente-responder.js:756-773`) — _esfuerzo medio_
- [x] (2026-06-10) **H69** · HECHO: `Number.isFinite(monto)` → 400 limpio (verificado al aire con valorAbono='abc'). El verificador había refutado la corrupción (el NOT NULL de abonos.monto atajaba), pero el endurecimiento queda como defensa en profundidad.
- [ ] **H70** · Identificación del dueño por sufijo last10 falla con teléfonos extranjeros cortos (7-9 dígitos) (`api/rifa/reservar.js:68-71;`) — _esfuerzo medio_
- [ ] **H71** · Reintentos de Meta: el dedup por wa_message_id salva la fila, pero los efectos secundarios se re-ejecutan con el duplicado (`api/whatsapp/recibir.js:79-108`) — _esfuerzo bajo_
- [ ] **H72** · Los atajos sin IA hardcodean 'Liliana', precios y premios: rompen multi-línea y se desincronizan del manual (`api/whatsapp/agente-responder.js:1269`) — _esfuerzo medio_
- [ ] **H73** · recibir.js y recordatorios-cron.js sin maxDuration fijado, y el claim marca 'enviado' ANTES de enviar (`vercel.json:33-61;`) — _esfuerzo bajo_
- [ ] **H74** · Estampida post-difusión: cada respuesta abre una corrida de hasta 300s con polling a Supabase cada ~3s (`api/whatsapp/agente-responder.js:995-1012;`) — _esfuerzo medio_
- [ ] **H75** · El simulador 'probar' de la cabina prueba un agente DISTINTO al de producción (`/Users/mateoplatabuitrago/los-platas-rifas/api/whatsapp/agente.js:246-285`) — _esfuerzo medio_
- [ ] **H76** · verificarYAbonar ignora en silencio la boleta que pidió el cliente y abona a la de número más bajo (`/Users/mateoplatabuitrago/los-platas-rifas/api/lib/abono-agente.js:77-80`) — _esfuerzo bajo_
- [ ] **H77** · El recordatorio por plantilla se envía aunque un humano haya apagado el agente en el chat (`/Users/mateoplatabuitrago/los-platas-rifas/api/whatsapp/recordatorios-cron.js:45-100`) — _esfuerzo bajo_
- [ ] **H78** · Inyección de instrucciones al bloque system vía los datos que el propio cliente dicta (nombre/apellido/ciudad) (`/Users/mateoplatabuitrago/los-platas-rifas/api/whatsapp/agente-responder.js:177-198`) — _esfuerzo bajo_
- [ ] **H79** · Cuando la transcripción de un audio falla, la IA responde a ciegas y nadie se entera (`/Users/mateoplatabuitrago/los-platas-rifas/api/whatsapp/agente-responder.js:255-276`) — _esfuerzo bajo_
- [ ] **H80** · Las fotos del contacto inicial dependen del TÍTULO de una respuesta rápida: si la renombran, el saludo sale sin casa y sin aviso (`/Users/mateoplatabuitrago/los-platas-rifas/api/whatsapp/agente-responder.js:514-520`) — _esfuerzo bajo_
- [ ] **H81** · El agente incrusta la contraseña MAESTRA de gerencia (Mateo) y la envía en cada operación privilegiada (`api/whatsapp/agente-responder.js:280-289`) — _esfuerzo medio_
- [x] (2026-06-10) **H82** · CUBIERTO por el arreglo de H23 (parámetro eliminado + descripción que rechaza consultas de terceros).
- [ ] **H83** · Un turno típico hace ~40 idas a la base; la cadena de contexto pre-IA es secuencial y paralelizable (agente_config se lee 2 veces) (`api/whatsapp/agente-responder.js:961-1149`) — _esfuerzo medio_
- [ ] **H84** · Sin breakpoint de caché en messages: las vueltas 2+ del bucle reprocesan todo el historial a precio y velocidad llenos (`api/whatsapp/agente-responder.js:1367-1370`) — _esfuerzo bajo_
- [ ] **H85** · resolverLinea consulta el token en la base por CADA envío: el contacto inicial hace 6+ lecturas idénticas (`api/lib/whatsapp.js:40-52`) — _esfuerzo bajo_
- [ ] **H86** · recibir.js lee 3 veces la misma fila de conversaciones_whatsapp por mensaje y dispara el motor una vez POR MENSAJE de la ráfaga (`api/whatsapp/recibir.js:50-56`) — _esfuerzo bajo_
- [ ] **H87** · El sondeo del debounce hace 2 idas a la base cada 3s (~20 por turno): unificable en un solo RPC (`api/whatsapp/agente-responder.js:995-1012`) — _esfuerzo bajo_
- [ ] **H88** · DEBOUNCE_MAX_MS (240s) deja solo 60s de margen frente al maxDuration de 300s: riesgo de muerte a mitad de turno (`api/whatsapp/agente-responder.js:35`) — _esfuerzo bajo_
- [ ] **H89** · Transcripción de audios en serie: una ráfaga de notas de voz suma hasta ~20s antes de llamar a la IA (`api/whatsapp/agente-responder.js:1094-1105`) — _esfuerzo bajo_

---

> Generado el 9-jun-2026. Detalle de cada ítem: `docs/auditoria-liliana-2026-06-09.md` (abrir solo la sección Hnn que aplique).
