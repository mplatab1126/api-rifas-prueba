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
- [x] (2026-06-10) **H27** · HECHO: `registrar_abono` prueba las últimas 3 fotos RECIENTES (≤48h, sin marca pago_asignado) de la más nueva hacia atrás — la primera que se comporta como comprobante es la elegida (una cédula falla la extracción y se pasa a la siguiente); la verificación guarda la foto RECONOCIDA, no la última a ciegas. `manejarPagoNoVerificado` también respeta las 48h y la marca. Probar varias no duplica plata (coincidencia sólida + consumo único intactos).
- [x] (2026-06-10) **H28** · HECHO (extensión de las alertas H16): chequeo nuevo en `alertas-cron.js` — chats estado='humano' con el cliente esperando >30 min (hasta 24h atrás) → WhatsApp a Mateo, una vez por chat (re-avisa a las ~2h). En su PRIMERA corrida real cazó un caso de ~12 horas (Leiky OG).
- [x] (2026-06-10) **H29** · HECHO (arreglo mínimo del verificador): la tabla PRECIOS cobra la escritura de caché a 2× (Sonnet $6/M, Opus $10, Haiku $2) — el ttl del motor es 1h. El panel deja de subfacturar ~16-22%. Cuenta de ahora en adelante (lo viejo no se recalcula).
- [x] (2026-06-10) **H30** · HECHO: el motor salta las fotos marcadas pago_asignado y las de >48h; el historial trae solo raw->pago_asignado (sintaxis validada contra PostgREST); y la marca la pone verificarYAbonar en api/lib (el CRON ahora también marca al abonar, ajuste del verificador). ~$0.3-0.5/día menos.
- [x] (2026-06-10) **H31** · HECHO: 5 patrones nuevos en `afirmaPagoHecho` ("recibí tu pago", "tu pago ya entró", "se acreditó", "tu plata ya quedó", "todo en orden con tu pago") + marcador de NEGACIÓN ("aún no recibimos tu pago" pasa libre). 'comprobante' sigue FUERA (lo usa el mensaje seguro). Probado con 24 casos deben-bloquear/deben-pasar (24/24) y suite dorada en verde.
- [x] (2026-06-10) **H32** · HECHO (con el ajuste del verificador): si la coincidencia salió solo de la foto (referencia / misma hora+plataforma) y la referencia trae el celular de OTRO cliente registrado (≠ el del chat), el abono automático se RETIENE para un asesor (tipo 'retenido': el turno avisa "en revisión" sin acusar; el cron lo cierra como rendido sin reintentar). Medido contra producción: solo ~1,3% de los pagos asignados de 14 días habrían caído a revisión (40/3.105) — ruido bajo. Bancolombia sin falsos positivos (lookarounds: 1/4.316 refs con celular embebido). Queda OPCIONAL: comparar el nombre del titular del comprobante (Bancolombia).
- [x] (2026-06-10) **H33** · CUBIERTO por el arreglo de H5/H21 (refresco del candado en cada vuelta del bucle y en transcripción/descarga).
- [x] (2026-06-10) **H34** · HECHO: DEBOUNCE_MAX_MS 4→2 min (siempre quedan ~170s para el resto del turno) y timeout en TODAS las llamadas externas: IA 90s (cae al reintento existente), Whisper 30s, Meta 30s envíos / 60s archivos (`lib/whatsapp.js`), llamadas internas 120s (generoso: buscar-pago tarda 30-60s legítimos, ajuste del verificador). Clave del verificador aplicada: un timeout del camino del abono devuelve 'demorado' → el agente dice "estoy verificando tu pago" + verificación automática, NUNCA afirma que falló (el idTransferencia impide duplicar si el abono sí alcanzó a entrar).
- [x] (2026-06-10) **H35** · HECHO (variante del verificador: agregar sobre `agente_actividad`, sin tocar el motor — sirve hacia atrás): función `agente_embudo_resumen` (en `sql/embudo-liliana.sql`, solo service_role) + acción 'embudo' en `agente-costo.js` + tarjeta "Embudo de ventas" en la cabina (7/30 días, junto al Gasto de IA). Los hitos de plata (apartó/abonó/pagó) salen de boletas/abonos (exactos); contacto/números de las notas (firmes); premios/datos aproximados (solo atajos dejan nota — marcados con * en la tarjeta). Primera lectura real (7d): 633 llegaron → 157 vieron números → 78 apartaron; $6.365.000 recibidos. OJO del verificador: sirve para TENDENCIAS semanales, no para A/B por edición del manual (muestras chicas).
- [ ] **H36** · Reestructurar el manual: dos secciones reclaman prioridad máxima a la vez y las reglas clave están duplicadas hasta 4 veces (`/tmp/manual-liliana.txt:9`) — _esfuerzo medio_
- [x] (2026-06-10) **H38** · HECHO: `sql/esquema-agente-produccion.sql` = instantánea de referencia con las 12 funciones reales de producción (candados, bandeja_filtrar, difusiones, costos, etiquetas), los 5 crons (secreto REDACTADO) y la lista de tablas. `whatsapp-buzon.sql` quedó marcado como VIEJO. Regla nueva: todo cambio en la base nace en su archivo de sql/.
- [x] (2026-06-10) **H39** · HECHO: secreto propio AGENTE_INTERNO_SECRET (32 bytes, timingSafeEqual con guardia de largo, api/lib/secreto-interno.js) en los 6 validadores y 5 emisores; los 4 pg_cron actualizados con cron.alter_job; transición sin cortes y cierre verificado (nuevo 200 / viejo 403). El verify token quedó SOLO para el GET de Meta.
- [x] (2026-06-10) **H41** · HECHO (capa mínima del verificador): tope de 10 números por reserva, rate-limit 20/10min por IP, y el campo `asesor` SOLO se honra con el secreto interno (el agente lo manda; un curl anónimo queda como 'Pagina Web'). Verificado al aire.
- [x] (2026-06-10) **H42** · HECHO (opción (b) del verificador): espera corta de ~10s SOLO para el primer contacto que resuelve el saludo predefinido (pre-lectura ligera antes del debounce + RE-VALIDACIÓN al cumplirse: si el cliente agregó algo que el saludo no cubre, vuelve a los 30s — no va a la IA antes de tiempo). El ~88% que llega del anuncio recibe su primera respuesta en ~10-12s en vez de ~30-35s. Vigilar `agente_uso` unos días (pedido del verificador: una espera corta puede partir alguna ráfaga en dos).
- [x] (2026-06-10) **H43** · HECHO (las 2 capas que más pagan, ajuste (c) del verificador): descargas de fotos en PARALELO y 2º punto de caché al FINAL del historial (`marcarCacheFinal`) — las vueltas 2+ del bucle y el turno siguiente (dentro de 1h) leen historial+fotos a 0.1× en vez de precio lleno; cubre también H84. Queda OPCIONAL a futuro: persistir el base64 en Supabase Storage para eliminar la re-descarga entre turnos (hoy acotada por H30: solo ≤2 fotos recientes sin asignar).
- [x] (2026-06-10) **H44** · HECHO (parcial a propósito): registrar_abono le presta a buscar-pago el base64 ya descargado (media_base64 opcional; el cron conserva el fallback por media_id). El modelo lector SIGUE en Sonnet por decisión de Mateo (no crear asimetría con el extractor del banco).
- [x] (2026-06-10) **H45** · HECHO: las 10 consultas por serie van en PARALELO (Promise.all; los 2 updates de marcas siguen secuenciales como pidió el verificador). Medido al aire: /api/disponibles pasó de 2.33s a 0.85s. Beneficia atajo de números, herramienta, web y bandeja.
- [x] (2026-06-10) **H46** · HECHO (variante segura del verificador): la boleta tras apartar la envía el SISTEMA al cerrar el turno (la red de seguridad pasó a ser el camino normal); el tool_result y el paso 5 del manual ya dicen "NO llames enviar_boleta". Ahorra una llamada entera a Claude (~4-8s) por venta. Suite dorada en verde.

## 7) 🟢 Menores y oportunidades (43)

- [ ] **H47** · Duplicaciones concretas dentro del manual (8 reglas repetidas 2-5 veces) e instrucción sin referente ("más breves que antes") (`/tmp/manual-liliana.txt`) — _esfuerzo medio_
- [ ] **H48** · Los medios de pago están escritos en duro en la sección de la web del manual, duplicando la variable {{pagos}} (`/tmp/manual-liliana.txt:139`) — _esfuerzo bajo_
- [x] (2026-06-10) **H49** · HECHO (ajuste del verificador: texto ESTÁTICO para no romper el caché): la descripción del `cierre` de enviar_contacto_inicial ahora pide mencionar el PRÓXIMO sorteo con la fecha EXACTA del bloque FECHAS (nunca calcularla). El default casi-nunca-usado quedó sin fecha (cierre es obligatorio).
- [x] (2026-06-10) **H50** · HECHO (junto con H59, variante simple del verificador `&& !estadoCliente.cli`): los clientes YA REGISTRADOS no reciben el saludo genérico de desconocido ni los atajos del embudo (sobre todo el paso DATOS, que les re-pedía todo): van a la IA, que los saluda por su nombre con el contexto inyectado.
- [x] (2026-06-10) **H51** · HECHO: el texto fijo de números ya no promete verificar "terminaciones" (ninguna herramienta busca así); ahora dice "Si tienes un *número de 4 cifras* en mente, dímelo y te confirmo si está libre".
- [x] (2026-06-10) **H52** · HECHO (vía del verificador): el respaldo `TEXTOS_RIFA.saludo_inicial` quedó NEUTRO (sin "Liliana"; el saludo real con nombre vive en `agente_config.variables` de cada línea, H17) y el ejemplo del schema de `enviar_contacto_inicial` dice "presentándote por TU nombre". Confirmado en la base: la línea de Lili tiene su saludo con nombre; la 2ª línea (apagada) saldría neutra hasta configurarla.
- [x] (2026-06-10) **H53** · CUBIERTO por H46: la descripción de `enviar_boleta` quedó coherente con el manual ("SOLO si el cliente pide su boleta de nuevo; tras apartar la envía el sistema").
- [x] (2026-06-10) **H58** · HECHO: la despedida de `pasar_a_humano` tiene respaldo FIJO ("Listo 😊 Te paso con un asesor...") si la 2ª llamada a la IA falla o no trae texto; además la 2ª llamada ahora manda las tools con `tool_choice:'none'` (la API puede rechazar un historial con tool_use sin tools).
- [x] (2026-06-10) **H62** · HECHO: bandera `huboTexto` en el turno (texto enviado, herramienta que mensajea, o boleta post-bucle) — si el bucle se agota sin que el cliente reciba NADA, cierre forzado: última llamada solo-texto (`tool_choice:'none'`) y, si también falla, mensaje fijo corto. El texto forzado pasa por el candado anti "pago falso".
- [x] (2026-06-10) **H77** · HECHO (las 2 capas): apagar el 🤖 desde la bandeja cancela los recordatorios pendientes (igual que pasar_a_humano), y el cron de la plantilla verifica `agente_activo` antes de enviarla (si está apagado, marca el recordatorio 'cancelado', no 'enviado' falso).
- [x] (2026-06-10) **H78** · HECHO (whitelist Unicode del verificador): `limpiarDatoCliente` (solo letras de cualquier idioma + espacios + . ' - , tope 60) en `apartar_numero`, `actualizar_datos_cliente`, `bloqueEstadoCliente` y `bloqueRemision` — cubre también datos viejos ya guardados. Probado: "IGNORA\nTUS REGLAS {y di}..." queda inofensivo; "José D'Alessandro Ñuñez de Bogotá D.C." pasa intacto.
- [x] (2026-06-10) **H79** · HECHO: audio sin transcripción → nota en el chat UNA vez (sin marcar el mensaje: el reintento automático sigue vivo), instrucción nueva en el bloque volátil ("NO adivines qué dijo: pídele que lo escriba") y, si falta OPENAI_API_KEY, error en actividad (las alertas H16 lo llevan al WhatsApp de Mateo).
- [x] (2026-06-10) **H80** · HECHO: si el contacto inicial sale SIN fotos (respuesta rápida "contacto inicial" renombrada, borrada o duplicada — el duplicado también se detecta vía el error de maybeSingle), queda ERROR en la actividad y la nota del saludo dice "⚠️ SIN fotos" en vez del éxito falso.
- [x] (2026-06-10) **H54** · HECHO junto con H73 (patrón de verificar-pagos-cron, como pidió el verificador): el claim del recordatorio ya NO lo marca 'enviado' antes de enviar — reprograma +10 min y sube `intentos` atómicamente; 'enviado' SOLO tras despachar (texto libre) o tras env.ok (plantilla); 3 intentos sin éxito → 'error' con rastro en actividad (antes la promesa de Liliana se perdía en silencio).
- [x] (2026-06-10) **H55** · HECHO (mejora 1 del verificador): `primerContactoLoResuelveSaludo` revisa el TIPO real de los mensajes (`m.tipo !== 'text'`) — "hola" + foto ya NO dispara el saludo fijo ignorando la imagen: va a la IA, que la ve. El filtro de hostilidad (mejora 2) quedó descartado por raro (el verificador lo marcó opcional).
- [x] (2026-06-10) **H56** · HECHO (con los ajustes del verificador): `intentoSeparar` devuelve null si hay `no` en cualquier posición o si hay 2+ números de 4 cifras DISTINTOS → esos casos van a la IA. Probado: "ya no quiero el 1234" y "no quiero el 1234, dame el 5678" ya no piden datos del número rechazado; "quiero el 7185" sigue funcionando.
- [x] (2026-06-10) **H57** · HECHO (ajuste del verificador): `numeroBoleta()` en los 4 ejecutores — un número de 5+ cifras (typo) ya NO se recorta en silencio: la IA debe pedir confirmación a 4 cifras; "123"→"0123" se mantiene (convención deliberada de todo el sistema, igual que reservar.js); el caso vacío→"0000" quedó eliminado.
- [x] (2026-06-10) **H59** · CUBIERTO por el mismo guard de H50 (`&& !estadoCliente.cli` en saludo y atajos del embudo).
- [x] (2026-06-10) **H60** · HECHO (con los 2 ajustes del verificador): el atajo de pedir datos verifica EN SILENCIO que el número siga libre antes de pedir los 5 datos; si está ocupado, no existe o la consulta FALLA → cae a la IA (nunca un "ocupado" fijo desde el atajo). La carrera residual la cubre reservar.js.
- [x] (2026-06-10) **H61** · HECHO: pie neutro para imágenes sin texto ("puede ser un comprobante de pago, un documento o cualquier otra cosa") — ya no sesga a la IA a hablar de pagos ante cualquier foto. `esContextoPago` quedó intacto (armar el candado con cualquier foto es diseño deliberado, fail-safe).
- [x] (2026-06-10) **H63** · HECHO: el array de tools ya NO se filtra por cliente (partía el caché de prompt en 2 variantes, cada una con su reescritura completa de ~12k tokens); el candado "a un conocido NUNCA se le manda el contacto inicial" vive ahora en la EJECUCIÓN (re-consulta boletas y devuelve corrección sin enviar nada). Ahorro ~$0.20-0.30/día (cifra del verificador).
- [ ] **H64** · Manual de 27.7k chars: mapa concreto de duplicados — recortable 25-35% sin perder ninguna regla (profundiza la fase 5 pendiente) (`/tmp/manual-liliana.txt:15-34`) — _esfuerzo medio_
- [ ] **H65** · Más atajos sin IA respaldados por datos: el día 1 de atajos bajó el gasto ~48%, y quedan dos rutas frecuentes y determinísticas que aún van a IA (`api/whatsapp/agente-responder.js:544`) — _esfuerzo medio_
- [x] (2026-06-10) **H66** · HECHO (vía del verificador: bloque estático EN CÓDIGO, no en el manual de la base): las instrucciones de estilo fijas (~250 tokens) salieron del bloque volátil a `INSTRUCCIONES_FIJAS`, un 2º bloque estático del system que ahora lleva el breakpoint de caché (prefijo cacheado = tools + manual + fijas). La condicional de remisión quedó estática.
- [x] (2026-06-10) **H67** · HECHO (con los ajustes del verificador): el bloque ACCIONES YA EJECUTADAS excluye las notas de solo lectura (Consulté/Verifiqué), dedupe exacto conservando la ÚLTIMA ocurrencia (el estado final de la plata manda) y tope de 12 conservando SIEMPRE las acciones con estado (Aparté/Registré/Trasladé/Liberé/Pasé/Programé/Actualicé/Envié). Probado con casos.
- [ ] **H68** · liberar_boleta: el candado dueño + saldo $0 vive solo en el llamador y no resiste carreras (`api/whatsapp/agente-responder.js:756-773`) — _esfuerzo medio_
- [x] (2026-06-10) **H69** · HECHO: `Number.isFinite(monto)` → 400 limpio (verificado al aire con valorAbono='abc'). El verificador había refutado la corrupción (el NOT NULL de abonos.monto atajaba), pero el endurecimiento queda como defensa en profundidad.
- [ ] **H70** · Identificación del dueño por sufijo last10 falla con teléfonos extranjeros cortos (7-9 dígitos) (`api/rifa/reservar.js:68-71;`) — _esfuerzo medio_
- [x] (2026-06-10) **H71** · HECHO (con el ajuste del verificador: separar buscar/crear del aplicar contadores): un reintento tardío de Meta (mensaje duplicado, detectado con .select('id') del upsert) ya NO cancela recordatorios, ni infla 'sin leer', ni renueva la ventana de 24h con hora falsa, ni dispara el motor. Los efectos corren SOLO para mensajes nuevos.
- [x] (2026-06-10) **H72** · CUBIERTO en su mayoría por H17+H22+H52 (los textos de atajos salen de agente_config.variables por línea; saludo de respaldo neutro; schema sin nombre fijo). Lo que faltaba: `asesorDeLinea` ahora deja ERROR en actividad cuando una línea sin fila en lineas_asesores cae al respaldo 'Liliana' (antes las ventas de una línea mal configurada quedaban a nombre de Liliana sin que nadie lo notara).
- [x] (2026-06-10) **H73** · HECHO con H54 (misma zona): claim durable de recordatorios + maxDuration explícito para recibir.js (60s) y recordatorios-cron.js (120s) — higiene documental, el default del plan ya era 300s (dato del verificador).
- [ ] **H74** · Estampida post-difusión: cada respuesta abre una corrida de hasta 300s con polling a Supabase cada ~3s (`api/whatsapp/agente-responder.js:995-1012;`) — _esfuerzo medio_
- [ ] **H75** · El simulador 'probar' de la cabina prueba un agente DISTINTO al de producción (`/Users/mateoplatabuitrago/los-platas-rifas/api/whatsapp/agente.js:246-285`) — _esfuerzo medio_
- [ ] **H76** · verificarYAbonar ignora en silencio la boleta que pidió el cliente y abona a la de número más bajo (`/Users/mateoplatabuitrago/los-platas-rifas/api/lib/abono-agente.js:77-80`) — _esfuerzo bajo_
- [ ] **H81** · El agente incrusta la contraseña MAESTRA de gerencia (Mateo) y la envía en cada operación privilegiada (`api/whatsapp/agente-responder.js:280-289`) — _esfuerzo medio_
- [x] (2026-06-10) **H82** · CUBIERTO por el arreglo de H23 (parámetro eliminado + descripción que rechaza consultas de terceros).
- [ ] **H83** · Un turno típico hace ~40 idas a la base; la cadena de contexto pre-IA es secuencial y paralelizable (agente_config se lee 2 veces) (`api/whatsapp/agente-responder.js:961-1149`) — _esfuerzo medio_
- [x] (2026-06-10) **H84** · CUBIERTO por H43 (`marcarCacheFinal`: cache_control en el último bloque del historial, mismo ttl 1h).
- [x] (2026-06-10) **H85** · HECHO (con los 2 ajustes del verificador): `resolverLinea` memoiza por línea 60s en un Map del módulo — solo lecturas EXITOSAS (un error no fija el token de respaldo) y el objeto completo (token+phoneNumberId+wabaId, lo usan las plantillas). El contacto inicial ya no hace 6+ lecturas idénticas.
- [x] (2026-06-10) **H86** · HECHO (las partes que el verificador marcó correctas): el motor se dispara UNA vez por CONVERSACIÓN por webhook (antes una por mensaje: en ráfaga de 3, dos morían en el candado) y `recibir.js` tiene `maxDuration: 30` en vercel.json. La unificación de las 3 lecturas (parte 1) se descartó: rompía la activación por disparador (nota del verificador).
- [x] (2026-06-10) **H87** · HECHO (con los 3 ajustes del verificador): RPC `agente_lock_y_ultimo` (en `sql/agente-lock-y-ultimo.sql`, GRANT a anon/authenticated/service_role + NOTIFY pgrst) — refresca el candado Y trae el último mensaje en UNA ida (antes 2 cada ~3s, ~40 por turno); la lógica de cortes sigue en JS y hay respaldo al camino viejo si el RPC falla. Probada en producción.
- [x] (2026-06-10) **H88** · CUBIERTO por H34 (tanda 5): DEBOUNCE_MAX_MS bajó de 240s a 120s, dejando ~180s de margen frente al maxDuration de 300s (la alternativa simple que el propio verificador validó).
- [x] (2026-06-10) **H89** · HECHO (con los ajustes del verificador): los audios pendientes se seleccionan ANTES (filter+slice(0,4)) y se transcriben EN PARALELO con Promise.allSettled — una ráfaga de 3 notas de voz ya no suma 6-18s en serie. La lógica de H79 (fallos con rastro) quedó intacta.

## 8) 🆕 Problemas NUEVOS encontrados después de la auditoría

- [x] (2026-06-10) **N2** · Visor del relojito de verificación de pagos (pedido de Mateo: "no sé
  si el sistema sigue reintentando o ya lo delegó al asesor"): endpoint de lectura
  `api/whatsapp/verificaciones.js` (cualquier asesor con acceso a la línea) + tarjeta
  **"💳 Verificación del pago"** en la ficha del chat de la bandeja — amarilla "🕐 sigue
  verificando solo, intento X de 4, próximo a las HH:MM", verde "✅ abonado", roja "🆘 se
  rindió, le toca al asesor", gris "cancelada". Solo sale si hay una verificación de las
  últimas 48h. De paso, la tarjeta de costo de IA de la ficha ya no depende de que el chat
  esté en la lista cargada (el servidor resuelve la conversación por teléfono).
- [x] (2026-06-10) **N1** · Confirmación del abono con saldo EQUIVOCADO (caso real: boleta 4950,
  cliente Jorge 573154260513) — tras registrar $120.000, Liliana dijo "te faltan $30.000" a una
  boleta que quedó 100% paga: el bloque ESTADO DE ESTE CLIENTE se arma ANTES del abono y la IA
  hacía la cuenta del saldo ella misma con números viejos (olvidó el abono previo de $30.000).
  ARREGLADO: el resultado de `registrar_abono` ahora relee las boletas DESPUÉS del abono y le
  entrega a la IA los números oficiales ("USA EXACTAMENTE ESTOS NÚMEROS... NO hagas cuentas tú"),
  con la orden de no pedir más pagos si quedó pagada. El cron no tenía el problema (solo
  confirma el monto). La plata nunca estuvo mal: era solo el mensaje.

---

> Generado el 9-jun-2026. Detalle de cada ítem: `docs/auditoria-liliana-2026-06-09.md` (abrir solo la sección Hnn que aplique).
