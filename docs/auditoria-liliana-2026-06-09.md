# Auditoría del agente Liliana — 9 de junio de 2026 (ANEXO TÉCNICO)

> **Qué es:** el detalle completo de los 90 hallazgos confirmados de la auditoría multi-agente
> (101 agentes: 8 auditores por dimensión + 1 verificador escéptico por hallazgo + crítico de
> completitud). Cada hallazgo fue verificado contra el código real y/o producción.
>
> **Cómo usarlo:** este archivo es GRANDE a propósito. NO lo leas entero: abre SOLO la sección
> del hallazgo (Hnn) que vayas a trabajar, desde la lista de `docs/PENDIENTES-LILIANA.md`.
> La "nota del verificador" trae correcciones/ajustes a la mejora propuesta — léela SIEMPRE
> antes de implementar.

## H0 — Lectura de comprobantes usa un modelo que se RETIRA el 15-jun (en 6 días) y 3x más caro de lo necesario

**Severidad:** critico · **Dimensión:** Costos/tokens · **Esfuerzo:** bajo

**Archivo:** `api/lib/comprobante.js:37 (también api/admin/procesar-ia.js:51, api/admin/procesar-ia-gasto.js:48, api/admin/analisis-ia.js:54)`

**Evidencia:** comprobante.js:37 → model: 'claude-sonnet-4-20250514'. Tabla oficial de Anthropic: claude-sonnet-4-20250514 = deprecado, retiro June 15, 2026, reemplazo claude-sonnet-4-6. comprobante.js:33 usa ANTHROPIC_API_KEY (no la de Liliana) y no llama a registrarUso. Hoy es 9-jun-2026.

**Problema:** comprobante.js (y otros 3 endpoints) llaman a 'claude-sonnet-4-20250514', modelo DEPRECADO cuya retirada está anunciada para el 15 de junio de 2026 — en 6 días. Cuando se retire, la API devolverá 404 y se rompe la verificación de pagos del agente (registrar_abono → verificarYAbonar → extraerDatos) y del cron de reintentos: Liliana no podrá abonar ningún pago. Además: (a) es una tarea de extracción simple de campos que no necesita Sonnet — con Haiku 4.5 ($1/$5 por M vs $3/$15) cada lectura baja de ~$0.012 a ~$0.004, y un pago en verificación automática hace hasta 5 lecturas (1 + 4 reintentos del cron); (b) usa ANTHROPIC_API_KEY general y NO registra en agente_uso, así que ese gasto es invisible en el panel 'Gasto de IA' y en la llave de Liliana.

**Mejora propuesta:** Cambiar el modelo en los 4 archivos a 'claude-haiku-4-5' (extracción estructurada simple, 3x más barata; validar con 3-5 comprobantes reales de Nequi/Bancolombia/Daviplata antes de publicar) o, si se prefiere cero riesgo de calidad, 'claude-sonnet-4-6'. De paso, en comprobante.js registrar el uso en agente_uso (origen 'comprobante') para que el gasto deje de ser invisible.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código real: comprobante.js:37, procesar-ia.js:51, procesar-ia-gasto.js:48 y analisis-ia.js:54 usan 'claude-sonnet-4-20250514', cuyo retiro oficial es el 15-jun-2026 (en 6 días; los modelos retirados devuelven 404 — verificado contra la tabla oficial de Anthropic). La cadena de ruptura es real: registrar_abono (agente-responder.js:731) → verificarYAbonar (abono-agente.js:61) → buscar-pago.js:39 → extraerDatos; el cron de reintentos pasa por la misma cadena, y max_intentos:4 (agente-responder.js:1494) confirma hasta 5 lecturas IA por pago. Si el modelo se retira, Liliana no abona NINGÚN pago (todo cae a 'rendido' → asesor humano) y además se rompe el procesamiento IA de la bandeja admin (procesar-ia). Severidad critico justa: fecha dura, flujo central de dinero, 4 endpoints. La mejora del modelo es segura (la extracción solo lee datos; los candados de match/abono — coincidencia sólida + transferencia de un solo consumo — quedan intactos y fallan cerrado ante una mala lectura); válida la condición de probar con comprobantes reales, o usar claude-sonnet-4-6 como opción cero-riesgo. AJUSTE a la parte (b): el uso de ANTHROPIC_API_KEY general en comprobantes NO es un descuido sino decisión deliberada de la bitácora (8-jun: llave dedicada de Liliana creada justo para NO mezclarla con 'las otras 7 funciones... comprobantes, análisis, copy'; y 'la tabla agente_uso solo la escribe Liliana'). Registrar comprobantes en agente_uso cambiaría el significado documentado de la tarjeta 'Gasto de IA' — esa sub-mejora debe consultarse con Mateo o descartarse; el cambio de modelo en los 4 archivos sí es urgente y correcto.

---

## H1 — Lectura de comprobantes con modelo viejo quemado, llave general y gasto invisible

**Severidad:** critico · **Dimensión:** Estrategia · **Esfuerzo:** bajo

**Archivo:** `api/lib/comprobante.js:33-37`

**Evidencia:** comprobante.js:33 (ANTHROPIC_API_KEY general), comprobante.js:37 (model: 'claude-sonnet-4-20250514' quemado, mientras el agente usa claude-sonnet-4-6); en comprobante.js, abono-agente.js y verificar-pagos-cron.js no hay ningún registro en agente_uso (grep sin resultados). La tabla agente_uso ya tiene columna 'origen' pensada para esto (docs §8.12).

**Problema:** La pieza que LEE el dinero (extrae monto/fecha del comprobante para verificar abonos) usa un modelo de mayo de 2025 quemado en el código: cuando Anthropic lo retire, TODOS los abonos del agente y del cron de reintentos fallarán de golpe y en silencio (el flujo cae a 'no pude verificar' → pasa a asesor). Además usa la llave general (no la de Liliana, rompiendo la medición de gasto por la que se creó la llave dedicada) y sus llamadas no se registran en agente_uso, así que el panel 'Gasto de IA' subestima el gasto real y una futura alerta de gasto anómalo quedaría ciega a este consumo.

**Mejora propuesta:** Tres cambios chicos en comprobante.js: (1) modelo desde env/config con fallback al Sonnet vigente; (2) aceptar la llave como parámetro y pasar la de Liliana cuando lo invoca su flujo; (3) insertar el usage devuelto en agente_uso con origen='comprobante' (replicando el registrarUso del motor). Probar con 2-3 comprobantes reales en sombra antes de publicar.

**Nota del verificador (leer antes de implementar):** Confirmado contra el código, y es PEOR de lo que dice la propuesta: claude-sonnet-4-20250514 se retira oficialmente el 15 de junio de 2026 — en 6 DÍAS. Cuando devuelva 404, caen en silencio TODOS los abonos del agente y del cron (cadena verificada: verificar-pagos-cron.js:88 → abono-agente.js:65 → buscar-pago.js:43 → comprobante.js:37) Y además el mismo modelo quemado rompe api/admin/procesar-ia.js:51 (ingesta de transferencias bancarias, la fuente del matching), procesar-ia-gasto.js:48 y analisis-ia.js:54 — la propuesta solo citó comprobante.js. También confirmé la llave general en comprobante.js:33 (vs LILIANA en agente-responder.js:956) y que solo agente-responder.js:63 registra en agente_uso (columna origen ya existe, docs línea 330). Ajustes a la mejora: (1) el cambio de modelo NO es 'cuando lo retiren' sino YA, antes del 15-jun, a claude-sonnet-4-6 (reemplazo oficial) en los 4 archivos, no solo comprobante.js; env/config con fallback está bien pero el valor por defecto debe ser el vigente; (2) llave por parámetro y registro con origen='comprobante' son correctos y baratos (replicar registrarUso, agente-responder.js:57-71); (3) la prueba en sombra con 2-3 comprobantes reales es imprescindible: el formato de extracción (monto/referencia/hora) alimenta el candado anti-fraude y un cambio de modelo puede variar la salida. Esfuerzo sigue siendo bajo; la urgencia es lo que sube la severidad.

---

## H2 — El saludo fijo dirá "con $20.000 ya entras" al Premio Mayor en la semana final (28-jun a 4-jul)

**Severidad:** alto · **Dimensión:** Coherencia · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1262-1265`

**Evidencia:** agente-responder.js:1262-1265 construye lineaProx con `*${proximo.titulo}*` + texto fijo "con *$20.000* de abono ya entras" sin condición por tipo de sorteo. El manual (/tmp/manual-liliana.txt:80) dice: "Premio Mayor (la casa): la boleta debe estar *100% pagada ($150.000)* al momento del sorteo del 4 de julio". Calendario real (tabla rifas, rifa activa): último sábado 2026-06-27, Premio Mayor 2026-07-04.

**Problema:** El atajo SIN IA del contacto inicial pega la coletilla "— con *$20.000* de abono ya entras. 🎉" a CUALQUIER próximo sorteo, sin mirar su tipo. Hoy el próximo es un sábado de $5M y la frase es cierta; pero después del 27-jun (último sábado, según el calendario real de la rifa en la base) el próximo sorteo es "Premio Mayor (la casa)" del 4-jul, que según el manual exige boleta 100% pagada ($150.000), no $20.000. En la semana pico de ventas, TODOS los clientes nuevos recibirían un mensaje fijo (sin IA que lo corrija) prometiendo entrar al sorteo de la casa con $20.000: promesa falsa de elegibilidad con dinero real y riesgo de reclamos.

**Mejora propuesta:** Condicionar la coletilla al tipo del próximo sorteo: si el título es de los sábados ($5M), mantener "con $20.000 ya entras"; si es el Premio Mayor, cambiar a algo como "— y con tu boleta *100% pagada* participas por la casa". Es un if de una línea sobre proximo.titulo en agente-responder.js:1262-1265.

**Nota del verificador (leer antes de implementar):** CONFIRMADO con evidencia: (1) agente-responder.js:1262-1265 pega la coletilla fija "con *$20.000* de abono ya entras" a proximo.titulo sin condición por tipo (proximo = primer sorteo futuro, línea 1205). (2) Calendario verificado en producción (tabla rifas, rifa activa): último sábado 2026-06-27 y "Premio Mayor (la casa)" 2026-07-04 → del 28-jun al 4-jul el atajo prometería entrar a la casa con $20.000. (3) Manual línea 80: Premio Mayor exige boleta 100% pagada ($150.000) → promesa falsa. (4) NO mitigado: el mensaje es predefinido SIN IA, sin condición de fecha; la bitácora (entrada 8-jun del saludo predefinido) no registra decisión deliberada sobre la coletilla. Severidad ALTO es justa: determinístico para ~88% de clientes nuevos en la semana pico, rifa regulada (EDSA), pero no crítico porque no mueve dinero mal y hay ~3 semanas para corregir. Ajustes a la mejora (segura, no toca candados): usar el regex que ya existe en la línea 1294 (/mayor|casa/i) sobre proximo.titulo; mantener la viñeta "separar con 20 mil" del cierre (sigue siendo cierta: separar ≠ elegibilidad); y opcional: el manual línea 102 también dice genéricamente "con $20.000 ya entra" — agregar ahí una aclaración de una línea para que la ruta CON IA tampoco lo repita en la semana final.

---

## H3 — El manual ordena afirmar un acumulado de $20.000.000 que YA NO existe (se ganó el 6-jun) y contradice al motor

**Severidad:** alto · **Dimensión:** Coherencia · **Esfuerzo:** bajo

**Archivo:** `/tmp/manual-liliana.txt:16-18,33,202-205 (agente_config.prompt) y api/whatsapp/agente-responder.js:1244-1247`

**Evidencia:** Manual (/tmp/manual-liliana.txt): líneas 16-17 (plantilla "está acumulado en *$20.000.000*"), 33, 202 y 204 (ejemplos "$20.000.000"), 18 y 205 (reglas que chocan con la 17). Motor: agente-responder.js:1244-1247 inyecta acumuladoReiniciado ("el acumulado ANTERIOR ya tuvo ganador… YA NO está acumulado"). Base: agente_config.resultados fecha 2026-06-06 con ganador. La bitácora (BITACORA-DE-DECISIONES.md:546-561) arregló el MOTOR el 7-jun pero el manual quedó con la plantilla vieja.

**Problema:** El acumulado se reinició: agente_config.resultados registra ganadora el 2026-06-06 (Margarita Rosa, 5588), así que el próximo sábado 13-jun juega por la base de $5.000.000 y el motor inyecta la advertencia "NUNCA menciones montos acumulados viejos como si siguieran vigentes". Pero el manual cacheado ordena lo contrario, de forma incondicional y con el monto vencido como plantilla literal: "ACLARA SIEMPRE las dos cosas, así: 'Cada sábado normalmente se juega $5.000.000; y el de HOY está acumulado en $20.000.000'". El bloque entero presume que siempre hay acumulado vigente y repite "$20.000.000" como ejemplo en 4 sitios: el modelo tiene una instrucción imperativa (manual, cacheado, arriba del contexto) contra una nota volátil del motor, y puede lorear el $20M vencido. Además el manual se contradice solo: la línea 17 exige decir SIEMPRE dos cifras, mientras la 18 dice "di SOLO el monto que te da el sistema" y la 205 prohíbe mezclar $5.000.000 con el acumulado en una misma conversación.

**Mejora propuesta:** Editar el manual en la base (efecto inmediato, sin desplegar): volver condicionales las reglas del acumulado ("SI el sistema te indica que el próximo sorteo está acumulado, aclara las dos cifras: base $5.000.000 y el monto que te dé el sistema; si NO te indica acumulado, di solo $5.000.000"), reemplazar los "$20.000.000" literales por un marcador neutro ("el monto que te dé el sistema") y reconciliar 17 vs 18/205 en una sola regla.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra producción y código actual. (1) agente_config en vivo: prompt de 27.706 chars contiene la plantilla literal "está acumulado en *$20.000.000*" y "$20.000.000" aparece 6 veces (líneas 16, 17, 33, 34, 202, 204 — el hallazgo contó 4, omitió la línea 34: «ej. "hoy juega el premio de *$20.000.000*"»); resultados registra ganadora 2026-06-06 (Margarita Rosa, 5588, acumulado:false) tras cadena $10M→$15M→$20M, así que el 13-jun el motor calcula acumuladoReiniciado=true e inyecta la advertencia (agente-responder.js:1216-1223 y 1247). (2) El conflicto de jerarquía es real: system = [manual cacheado 1h, contexto volátil] (agente-responder.js:1367-1370); la orden imperativa con el monto vencido va en la sección "CÚMPLELO SIEMPRE (por encima de todo lo demás)" del bloque cacheado. Bitácora 546-568 confirma que el 7-jun se arregló SOLO el motor (su "el manual ya estaba bien" refiere al texto del premio base, no a la plantilla). Mitigación parcial que NO cierra el hueco: el atajo de saludo sin IA (1262-1265) usa montoAcumProximo bien, y las líneas 18/204 anclan al monto del sistema; pero toda respuesta con IA sobre premios carga el conflicto. No es decisión deliberada ni hay candado que lo tape. (3) Mejora segura y correcta (no toca candados de dinero; el acumulado es mensajería, no pagos) con 3 ajustes: editar agente_config.prompt es ESCRITURA en producción → pedir confirmación de Mateo antes; cubrir las 6 ocurrencias incluida la línea 34; la edición invalida el caché de prompt una vez (~8k tokens reescritos, costo despreciable) y el efecto sí es inmediato sin deploy (el motor lee cfg en cada request, línea 1127, y el caché de Anthropic es por contenido). Conservar el propósito anti-confusión de 16/202 ("nunca digas que cada sábado vale el acumulado") al volverlo condicional. (4) Severidad "alto" justa: la versión determinística en el motor fue clasificada CRÍTICO el 7-jun; esta versión es probabilística pero recurrente (reaparece tras cada ganador que reinicia la cadena), con clientes reales y un premio 4× inflado.

---

## H4 — Error de la IA o excepción global = cliente colgado sin reintento, sin etiqueta y sin soltar el candado

**Severidad:** alto · **Dimensión:** Conversación · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1411, 1467-1469`

**Evidencia:** data.error → nota + return sin retry ni etiqueta (agente-responder.js:1411); catch global solo hace res.status(500) sin soltarLock, sin nota, sin etiqueta (1467-1469). Compárese con pasar_a_humano que sí etiqueta ASESOR (885) y con registrar_abono en error (744).

**Problema:** Dos caminos de silencio total: (1) si la API de Anthropic devuelve error (sobrecarga 529, límite de rate), se deja una nota gris y se retorna — sin reintento, sin etiqueta ASESOR, el mensaje del cliente queda sin respuesta y nada lo re-dispara; (2) si CUALQUIER excepción salta dentro del try (fetch que lanza, Supabase caído), el catch global devuelve un 500 que nadie lee (el webhook disparó y cortó a 1.5s), NO suelta el lock (bloquea corridas nuevas hasta 60s), NO deja nota ni rastro en agente_actividad. El cliente escribe, Liliana calla, y nadie se entera.

**Mejora propuesta:** (1) Ante data.error de la IA: reintentar 1 vez tras 2-3s; si persiste, poner etiqueta ASESOR para que un humano lo vea. (2) En el catch global: await soltarLock(conv) (guardando conv en variable accesible), insertar fila en agente_actividad tipo 'error' y poner etiqueta ASESOR. Son ~10 líneas sin tocar candados.

**Nota del verificador (leer antes de implementar):** Confirmado contra el código real. (1) agente-responder.js:1411: data.error → nota gris + soltarLock + return, sin reintento ni etiqueta ASESOR; nada lo re-dispara salvo un mensaje NUEVO del cliente (el motor relee el historial pendiente, ahí se sana). Precisión: en este camino el lock SÍ se suelta y SÍ queda rastro (nota + agente_actividad tipo 'nota'); el "sin soltar candado y sin rastro" aplica solo al camino 2. (2) catch global 1467-1469: solo res.status(500); conv se declara dentro del try (línea 961) así que hoy es IMPOSIBLE soltar el lock ahí; el 500 nadie lo lee (recibir.js:168 corta a 1.5s con AbortSignal.timeout); el lock se autorepara a los 60s (comentario línea 983). Además resp.json() (1410) puede lanzar con respuestas no-JSON de Anthropic y cae en ese mismo catch. Comparaciones válidas: ASESOR en pasar_a_humano (885) y registrar_abono error (744). No hay mitigación: bitácora no lo declara deliberado, el cron etiquetas-estado es sincronizar_etiquetas_estado() (Separada/Abonada/Pagada, irrelevante), y el auditor que reportaba errores a Mateo fue pausado. Solapa parcial con el pendiente "respuestas en null" pero aporta especificidad nueva (no duplicado). Mejora segura (no toca candados de dinero; el reintento no re-ejecuta herramientas y maxDuration=300s da holgura) con 3 ajustes: (a) reintentar SOLO errores 429/500/529, no invalid_request; (b) hoistear `let conv = null` antes del try y guardar con `if (conv)` en el catch (el fallo puede ocurrir antes de cargar conv), cada acción del catch en su propio try/catch; (c) mismo patrón en la rama apagado (1453: d2.error tragado), aunque ahí ya hay ASESOR previo. Severidad alto justa: silencio total al cliente justo en turnos de pago, sin canal de alerta activo, en producción con dinero real; los atenuantes (lock 60s, bandeja pasiva, autosana si el cliente insiste) no la bajan a medio.

---

## H5 — Mensaje que llega mientras Liliana redacta: o queda sin respuesta para siempre, o produce doble respuesta

**Severidad:** alto · **Dimensión:** Conversación · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:986-988, 1009, 1401-1457`

**Evidencia:** Skip por lock sin re-encolar (agente-responder.js:986-988); refresco del lock solo dentro del while del debounce (1009); historial leído una sola vez (1032-1040); el bucle 1401-1457 no refresca lock ni re-chequea entrantes nuevos; tras el bucle solo existe la red de la boleta (1459-1463). El comentario 983-985 confirma que el lock se vence solo a los 60s.

**Problema:** El historial se lee DESPUÉS del debounce y ANTES del bucle de IA. Si el cliente manda M3 mientras la corrida A está en el bucle: la corrida B (disparada por M3) choca con el lock y hace skip silencioso; A termina respondiendo solo M1-M2 y nunca re-verifica si llegó algo nuevo → M3 queda SIN RESPUESTA hasta que el cliente vuelva a escribir (cliente colgado, caso frecuente: el cliente agrega un dato justo cuando Liliana 'está escribiendo'). Peor: el lock solo se refresca durante el debounce, no durante el bucle de IA; con 6 iteraciones + descarga de imágenes + Whisper la corrida puede superar los 60s de auto-recuperación del lock → B entra, responde TODO (M1-M3) y luego A manda su respuesta vieja: respuestas dobles/contradictorias entrelazadas.

**Mejora propuesta:** (1) Refrescar el lock al inicio de cada iteración del bucle (misma RPC agente_refrescar_lock). (2) Al terminar la corrida, consultar si hay un entrante posterior al claim (hasta_ms); si lo hay, auto-redispararse con un fetch interno a agente-responder (igual que hace el webhook) en vez de depender de que el cliente insista.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra código real y base de producción. (a) Skip silencioso sin re-encolar: agente-responder.js:986-988; refresco solo en el debounce (1009); bucle 1401-1457 sin refresco ni re-chequeo; tras el bucle solo la red de boleta (1459-1463). (b) Los 60s verificados en la RPC real: agente_tomar_lock (proyecto ikvzmojzgpxuhnbymtxm) roba el lock si agente_procesando_at < now()-60s; con maxDuration=300, Whisper+imágenes+6 iteraciones, superar 60s es plausible → doble respuesta posible. (c) Sin mitigación en otra parte: recibir.js dispara fire-and-forget sin reintento; y una vez A responde, la guarda de la línea 1045 (último mensaje = saliente) bloquea CUALQUIER re-disparo posterior para M3. La bitácora no lo declara deliberado; la entrada 2026-06-08 arregló este mismo síntoma en otra ruta con el mismo patrón de re-disparo propuesto. AJUSTES A LA MEJORA: (1) el re-disparo tal como está escrito moriría en la guarda 1045 — necesita un flag tipo recordatorio/forzar o cambiar la guarda a "existe entrante posterior al último saliente", y debe ejecutarse DESPUÉS de soltarLock (1465) para que la nueva corrida pueda tomar el candado; (2) el refresco del lock debería cubrir también la fase de transcripción/descarga (3b, ~1092+), que corre sin refresco antes del bucle. La mejora no debilita candados de dinero (la corrida re-disparada pasa por claim anti-duplicado y candado anti pago falso). Severidad alto justa: clientes reales, 250-400 corridas/día, y el pendiente "respuestas en null" sugiere que ya ocurre en producción.

---

## H6 — Consumo de la transferencia NO atómico: doble abono posible con la misma plata

**Severidad:** alto · **Dimensión:** Dinero · **Esfuerzo:** medio

**Archivo:** `api/admin/abono.js:35-44 y 163-164`

**Evidencia:** El check de que la transferencia está LIBRE es un SELECT aparte (líneas 36-43) y el consumo es un UPDATE sin condición de estado: `update({ estado: estadoTransferencia }).eq('id', idTransferencia)` (línea 164), ejecutado DESPUÉS de insertar el abono (línea 109). Entre el check y el consumo hay varias llamadas a la base (insert abono, update cliente, update boleta). La promesa de api/lib/abono-agente.js:12-13 ('una transferencia solo se consume UNA vez') depende de este check no atómico. La ruta de auto-asignación por referencia (líneas 165-179) tiene la misma carrera: dos corridas pueden ver '1 sola LIBRE' a la vez.

**Problema:** Dos procesos concurrentes (cron de reintentos + turno en vivo sobre el mismo comprobante; el mismo comprobante mandado a dos líneas/conversaciones; o un asesor en el Admin y Liliana a la vez) pueden pasar AMBOS el check LIBRE y AMBOS insertar abono contra la MISMA transferencia: el cliente queda con dos abonos pagando uno solo (pérdida directa de plata). Además el segundo UPDATE pisa el estado del primero, borrando el rastro de a qué boleta se asignó primero.

**Mejora propuesta:** Consumir la transferencia con un UPDATE condicional ANTES de insertar el abono: `update({ estado: ... }).eq('id', idTransferencia).eq('estado','LIBRE').select('id')` y abortar con error si no afectó ninguna fila (otro proceso ganó). Aplicar el mismo patrón a la auto-asignación por referencia (update condicional con .eq('estado','LIBRE') y verificar fila afectada). Ideal a futuro: mover insert-abono + consumo a una función RPC transaccional en Postgres, como ya se hizo con el candado del agente.

**Nota del verificador (leer antes de implementar):** CONFIRMADO en el código actual: check LIBRE (abono.js:36-43) y consumo sin condición de estado (164, tras el insert en 109, ~6 viajes a la base entre medio); misma carrera en la auto-asignación (170-179). Verificado en producción: abonos solo tiene PK+FK, sin UNIQUE/trigger/RPC que proteja el 1-a-1 (incluso ya existe 1 transferencia con 2 abonos, 0061ac39…, boletas 9564/1582 — 20h aparte, no fue esta carrera sino una liberación manual, pero prueba que la base no blinda el invariante). No es decisión deliberada: la bitácora DEPENDE de "se consume UNA vez". Severidad ajustada de crítico a ALTO porque las mitigaciones existentes acotan los escenarios: lock por conversación elimina el doble turno, el cron reclama cada verificación atómicamente (verificar-pagos-cron.js:75-84) y su primer reintento va a +15 min del turno en vivo, así que "cron + turno en vivo" casi no se solapa; el caso realista que queda (asesor en Admin + Liliana/cron en el mismo segundo) exige coincidencia de ~1-2 s, pérdida acotada a una transferencia y detectable en conciliación. Mejora correcta y refuerza el candado, con 3 ajustes: (1) si se consume ANTES del insert, revertir a LIBRE best-effort si el insert falla (o variante: UPDATE condicional en su sitio actual verificando filas afectadas y borrar el abono recién insertado si 0) — sin compensación nace el modo de falla "transferencia consumida sin abono"; (2) aplicar el mismo patrón a api/admin/venta.js (check :73, consumo ~:171), carrera idéntica que el hallazgo omite; (3) no rompe el reparto: solo la primera llamada lleva idTransferencia (public/admin.js:1129-1136, bandeja-whatsapp.html:2048). RPC transaccional sigue siendo el cierre ideal.

---

## H7 — El cron de reintentos y el turno en vivo pueden procesar el MISMO comprobante a la vez

**Severidad:** alto · **Dimensión:** Dinero · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:719-754 y api/whatsapp/verificar-pagos-cron.js:72-101`

**Evidencia:** El claim atómico del cron (verificar-pagos-cron.js:75-84, compare-and-set por intentos) solo protege cron-vs-cron. La herramienta registrar_abono (agente-responder.js:719) NO mira ni reclama la verificación pendiente antes de llamar verificarYAbonar; cancelarVerificaciones solo corre DESPUÉS de un abono exitoso (línea 734). El candado de conversación (agente_tomar_lock) no lo toma el cron. verificarYAbonar tarda varios segundos (descarga de imagen + lectura con IA), ventana real de solape.

**Problema:** Si el cron reclama una verificación y, en esos mismos segundos, el cliente escribe y la IA llama registrar_abono con el mismo media_id, ambos verifican la misma transferencia en paralelo: combinado con el check LIBRE no atómico de abono.js, es la vía más probable de DOBLE ABONO real. Aun arreglando abono.js, produce doble mensaje al cliente contradictorio ('confirmé tu pago' del cron + 'un asesor lo revisa' del turno) y etiquetas ASESOR innecesarias.

**Mejora propuesta:** En registrar_abono, ANTES de verificar: marcar la verificación pendiente de esa conversación como tomada (update condicional estado 'pendiente' → 'en_proceso' verificando fila afectada; si otro la tiene, responder a la IA 'ya se está verificando, dile al cliente que estás confirmando'). Simétricamente, el cron puede saltarse verificaciones de conversaciones con el lock del agente tomado.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra código y base viva. (1) El claim del cron (verificar-pagos-cron.js:75-84) es compare-and-set sobre intentos y solo protege cron-vs-cron; el cron no toma agente_tomar_lock (cero referencias a locks en ese archivo). (2) registrar_abono (agente-responder.js:719-754) llama verificarYAbonar sin mirar verificaciones_pago; cancelarVerificaciones solo tras éxito (l.734). (3) abono.js:35-44 chequea LIBRE con SELECT y recién marca ASIGNADA en l.163-164, tras varias escrituras intermedias — no atómico. (4) Verifiqué la BD viva: abonos.id_transferencia solo tiene FK, SIN unique ni triggers → no hay respaldo en ninguna capa contra el doble abono. (5) No es decisión deliberada: la bitácora (07-jun) afirma que los reintentos "no pueden duplicar abonos", lo cual solo vale secuencialmente. (6) El daño de mensajes contradictorios también es real: el perdedor recibe tipo:'error' → etiqueta ASESOR + "un asesor lo revisa" (l.742-745) mientras el cron dice "Confirmé tu pago" (cron l.98). Severidad alto se sostiene: dinero real, sin protección en ninguna capa, y el disparador (cliente escribiendo "¿ya quedó?" durante la espera de verificación) está CORRELACIONADO con la ventana del cron, no es azar. CORRECCIÓN A LA MEJORA: tal como está escrita NO funciona — el claim del cron no cambia estado (queda 'pendiente'), así que el update condicional 'pendiente'→'en_proceso' del turno vivo tendría éxito aun con el cron a mitad de verificación. El fix requiere que el cron TAMBIÉN pase la fila a 'en_proceso' al reclamarla (revirtiendo a 'pendiente' al reprogramar) + rescate de filas 'en_proceso' huérfanas (>N min) para no dejar al cliente colgado si un proceso muere; ojo: el índice ux_verif_pago_activa es parcial sobre estado='pendiente', mover a 'en_proceso' lo libera (compatible). El salto del cron por lock del agente es complemento seguro pero con TOCTOU; no basta solo. Nada de esto debilita candados de dinero (solo agrega un claim). Mejora complementaria más robusta (probablemente el hallazgo hermano de abono.js): consumir la transferencia con UPDATE condicional estado='LIBRE'→'ASIGNADA' verificando fila afectada ANTES de insertar el abono, y/o unique parcial sobre abonos(id_transferencia); con eso hecho, este hallazgo bajaría a medio (quedaría solo el doble mensaje y la etiqueta ASESOR innecesaria).

---

## H8 — reservar.js: dos clientes pueden quedarse con el MISMO número (check y update no atómicos)

**Severidad:** alto · **Dimensión:** Dinero · **Esfuerzo:** bajo

**Archivo:** `api/rifa/reservar.js:104-110 y 174-179`

**Evidencia:** Se verifica que la boleta esté libre con un SELECT (`ocupados = checkData.filter(b => b.telefono_cliente)`, línea 104) y luego se ocupa con `update(boletaPayload).eq('numero', b.numero)` SIN la condición de que siga libre (líneas 174-177). Entre el check y el update hay un upsert de cliente y la búsqueda anti-duplicado de teléfono (varias llamadas de latencia).

**Problema:** Es un endpoint público (página web) que también usa Liliana (apartar_numero, agente-responder.js:683). Dos clientes simultáneos (web vs web, o web vs agente) pasan ambos el check y el último UPDATE pisa al primero: ambos reciben 'reservado con éxito' y el link de pago, pero la boleta queda a nombre de uno solo. El otro puede transferir plata por un número que no es suyo — lío de devolución y reclamo con dinero real.

**Mejora propuesta:** Update condicional: `.update(boletaPayload).eq('numero', b.numero).is('telefono_cliente', null).select('numero')` y, si no afectó fila, responder 'ese número se acaba de ocupar' (y revertir las boletas del mismo pedido que sí alcanzaron a ocuparse).

**Nota del verificador (leer antes de implementar):** Confirmado contra el código actual y producción. (1) El check (api/rifa/reservar.js:104-110) y el update sin condición (174-177) existen tal cual, con 3+ roundtrips de DB entre medio (líneas 120, 123-127, 141); doble entrada confirmada: web (public/comprar-steps.js) y Liliana (agente-responder.js:683) pegan al mismo endpoint. (2) Sin mitigación: los locks RPC del agente son por conversación, no por boleta; consulté pg_trigger en producción y la tabla boletas NO tiene triggers; la bitácora no registra ninguna decisión deliberada al respecto. (3) La mejora es correcta y REFUERZA el candado: verifiqué en producción que las libres son NULL (0 con '', 204 NULL de 10.000) y liberar-boleta.js:86 libera con null, así que .is('telefono_cliente', null) calza exacto. Dos ajustes: la reversión de boletas del mismo pedido debe filtrar .eq('telefono_cliente', telefonoCliente).eq('total_abonado', 0).in('numero', ...) para jamás soltar una boleta ajena, y la bitácora (línea 189) debe registrar solo las boletas realmente ocupadas. (4) Severidad alto es justa: solo quedan 204/10.000 números libres (todos los clientes navegan el mismo pool chico) y las difusiones generan ráfagas; impacto = plata real con ambos clientes recibiendo "éxito". No crítico porque exige solape sub-segundo y es recuperable con devolución.

---

## H9 — Coincidencia 'sólida' por referencia acepta referencias de 1-4 caracteres con .includes()

**Severidad:** alto · **Dimensión:** Dinero · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/buscar-pago.js:161-165 y 178-184`

**Evidencia:** En esCoincidencia: `if (refBD.includes(referencia) || (refLimpia.length > 4 && refBD.includes(refLimpia))) return true;` — el guard de longitud (>4) solo aplica a la variante limpia (refLimpia); la referencia CRUDA extraída por la IA se compara con .includes() sin longitud mínima. elegirSugerida (líneas 178-184) repite el mismo patrón y devuelve razón 'Coincide la referencia', que verificarYAbonar trata como sólida y ABONA AUTOMÁTICAMENTE (abono-agente.js:64-66 solo veta 'Misma hora').

**Problema:** Si la IA de lectura de comprobantes extrae una referencia parcial o ruidosa de 1-4 dígitos (ej. '12' de una referencia cortada en la foto), hace match con casi cualquier transferencia del mismo monto y fecha, y el sistema la consume y abona SOLO, sin humano. Es exactamente el tipo de amarre débil que la regla 'misma hora sola no basta' quiere evitar, pero entra disfrazado de 'coincide la referencia'.

**Mejora propuesta:** Exigir longitud mínima (≥5 caracteres) también para la referencia cruda en esCoincidencia y elegirSugerida antes de usar .includes(). Es un cambio de 2 líneas que solo ENDURECE el candado.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra código real. (1) buscar-pago.js:164 y 182: el guard de longitud solo cubre refLimpia; y como las referencias bancarias son casi siempre numéricas, refLimpia===referencia, o sea la cláusula cruda sin guard dispara primero y el guard >4 es código muerto en el caso común — evidencia de bug, no de decisión deliberada (la bitácora dice 'referencia sí vale' asumiendo que es señal sólida; nada cubre refs cortas). (2) No hay mitigación: comprobante.js:87-91 solo sustituye por un token ≥4 SI existe (una ref '12' de la IA pasa intacta); abono-agente.js:64 solo veta 'Misma hora' y abona solo vía /api/admin/abono; ruta viva en agente-responder.js:731 y verificar-pagos-cron.js:88. El amarre idTransferencia evita doble consumo de la MISMA transferencia, no consumir la EQUIVOCADA. Atenuante parcial ya reconocido en el hallazgo: prefiltro por monto+fecha exactos. (3) Mejora segura (solo endurece; fallo degrada a 'Misma hora' → reintentos → humano) con DOS ajustes: aplicarla en AMBOS sitios (líneas 164 y 182, no solo una) como `String(referencia).length > 4 && refBD.includes(referencia)`; y saber que refs Bre-B 'pago llave' son nombres de remitente (comprobante.js:93-101) — un nombre <5 chars dejaría de matchear por referencia, cayendo fail-safe a revisión humana (aceptable). Opcional: mismo endurecimiento en api/admin/buscar-transferencia-ia.js (mismo patrón, pero ahí confirma un humano). (4) Severidad 'alto' justa: dinero real, ruta desatendida, precondición plausible (foto recortada + montos estándar repetidos el mismo día); no crítico porque exige coincidencia de condiciones y el monto abonado sigue siendo el del cliente.

---

## H10 — decir() marca como 'enviado' mensajes que WhatsApp rechazó; varias herramientas reportan éxito falso a la IA

**Severidad:** alto · **Dimensión:** Escala/robustez · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:501-502 (también 650-653 y 713-716; api/whatsapp/verificar-pagos-cron.js:98)`

**Evidencia:** decir() hace `const env = await enviarTexto(...)` y llama guardarEnChat con estado_envio='enviado' SIN mirar env.ok (agente-responder.js:501-502). El ejecutor de enviar_contacto_inicial devuelve 'Listo: envié el saludo...' incondicionalmente aunque todos los envíos fallen (650-653), y enviar_boleta devuelve 'Listo, le envié su boleta' aunque env.ok sea false (716). En el cron, avisarCliente devuelve false si el envío falla, pero la línea 98 ignora el retorno y la verificación igual queda 'abonado'.

**Problema:** Si Meta falla a mitad de un turno de varios mensajes (token vencido, rate limit, número bloqueado), el cliente queda en SILENCIO pero el historial guarda los textos como enviados: en turnos futuros la IA 'recuerda' haber dicho cosas que el cliente nunca recibió y no las repite (la boleta, la confirmación del abono, la presentación). En el cron, el abono queda registrado y el cliente nunca se entera de que su pago se confirmó. Nadie (nota, etiqueta, actividad) se entera del fallo.

**Mejora propuesta:** En decir(): si !env.ok, guardar con estado_envio='fallido', dejar nota 🤖 y etiqueta ASESOR, y devolver el fallo. Que enviar_contacto_inicial y enviar_boleta devuelvan a la IA 'NO se pudo enviar, no afirmes que lo recibió' cuando el envío falle (enviar_resolucion ya lo hace bien en 794-795, copiar ese patrón). En verificar-pagos-cron, si avisarCliente devuelve false → nota tipo 'error' + etiqueta ASESOR.

**Nota del verificador (leer antes de implementar):** CONFIRMADO en el código actual, línea por línea: decir() (agente-responder.js:501-502) ignora env.ok y guardarEnChat (387) hardcodea estado_envio='enviado' con wa_message_id null; enviarTexto (lib/whatsapp.js:61-91) devuelve {ok:false} sin lanzar, así que un token vencido/rate limit deja al cliente en silencio con el historial como 'enviado'. enviar_contacto_inicial (650-653) y enviar_boleta (713-716) devuelven 'Listo...' incondicional (matiz: en contacto inicial el historial NO se contamina porque enviarContactoInicial sí chequea env.ok antes de guardar; el éxito falso es solo hacia la IA, que además recibe la orden de quedarse callada). verificar-pagos-cron.js:98 ignora el false de avisarCliente (línea 29) con la verificación ya marcada 'abonado' (95-97); el abono en sí es real y correcto — el daño es solo de notificación. Mitigación PARCIAL que no refuta: recibir.js:173-184 marca 'fallido' vía webhook de estados de Meta, pero solo casa por wa_message_id (los rechazos síncronos citados nunca se corrigen), la consulta de historial de la IA (1032-1041) ni siquiera selecciona estado_envio (mensajes 'fallido' igual 'se recuerdan'), y ningún fallo genera nota/etiqueta. Sin decisión deliberada en la bitácora que lo cubra. Severidad 'alto' justa: sistema en vivo con dinero real, fallo silencioso sin observabilidad (un token vencido apaga TODO el canal mientras todo se registra como enviado); no 'critico' porque ningún candado de dinero se compromete ni se pierde plata. Mejora segura y correcta (el patrón modelo de enviar_resolucion existe en 794-795), con 2 ajustes: (1) enviarContactoInicial hoy no retorna nada — hay que hacerla devolver éxito/fallo para que el ejecutor en 650 pueda reportar la verdad; (2) complementar excluyendo estado_envio='fallido' del query de historial de la IA (1032-1041) para cubrir también los fallos detectados por webhook. Esfuerzo sigue siendo bajo.

---

## H11 — Error de la API de Claude = cliente en silencio sin reintento; y el catch externo no suelta el lock ni deja rastro

**Severidad:** alto · **Dimensión:** Escala/robustez · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1410-1411 y 1467-1469`

**Evidencia:** Si la respuesta trae data.error (429 rate limit, 529 overloaded — frecuentes bajo carga), se deja una nota interna y se retorna sin reintentar, sin etiqueta ASESOR (1411). Si el fetch lanza excepción (red caída, respuesta no-JSON), cae al catch externo (1467-1469) que devuelve 500 SIN soltarLock, SIN nota y SIN registro en agente_actividad — y el webhook que lo disparó ya cortó a 1.5s, así que nadie ve ese 500.

**Problema:** Cada error transitorio de Anthropic deja al cliente sin respuesta hasta que él vuelva a escribir (puede ser nunca: es una venta perdida en silencio). En el caso del catch externo ni siquiera queda rastro de que pasó, y el candado queda colgado 60s bloqueando un reintento inmediato.

**Mejora propuesta:** Reintentar 1-2 veces con espera (2-5s) cuando el status HTTP sea 429/529/5xx antes de rendirse; si falla definitivo, poner etiqueta ASESOR (no solo nota) para que un humano retome. En el catch externo: soltarLock(conv) + insertar el error en agente_actividad.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código real. (1) agente-responder.js:1411: ante data.error deja nota y retorna sin reintento ni etiqueta ASESOR — exacto; matiz: esa ruta SÍ suelta el lock y SÍ deja rastro en agente_actividad (nota() → guardarEnChat inserta ahí, líneas 399-403); el "sin rastro" es solo del catch externo. (2) Catch externo 1467-1469: confirmado — 500 sin soltarLock, sin nota, sin agente_actividad; recibir.js:168 corta a 1.5s (fire-and-forget), nadie ve el 500; además atrapa CUALQUIER excepción tras tomar el candado (DB, bugs), no solo fallas de la API. Lock se auto-recupera a 60s (comentario línea 983), como decía el hallazgo. (3) No hay mitigación en otra parte ni decisión deliberada en la bitácora; el pendiente conocido "respuestas en null sin investigar" encaja como síntoma de esta causa. Severidad ALTO justa: clientes reales sin respuesta = ventas perdidas en silencio. (4) Mejora segura (reintentar el fetch no tiene efectos secundarios; las herramientas solo corren tras respuesta exitosa; no debilita candados de dinero; maxDuration=300s da margen) pero necesita 2 AJUSTES: (a) conv se declara DENTRO del try (línea 961) — para soltarLock(conv) en el catch hay que izar `let conv` fuera del try; (b) refrescar el candado (agente_refrescar_lock, patrón existente línea 1009) durante las esperas de reintento para que no venza a los 60s y cause doble respuesta. Para la etiqueta ASESOR reutilizar ponerEtiqueta(conv.id, conv.linea_id, 'ASESOR', ...) como en líneas 472/744/885.

---

## H12 — Disparo fire-and-forget (corte 1.5s) sin red de reenganche, y el claim hace IRRECUPERABLE un turno muerto

**Severidad:** alto · **Dimensión:** Escala/robustez · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/recibir.js:156-171; api/whatsapp/recordatorios-cron.js:146-156; api/whatsapp/agente-responder.js:1058-1090`

**Evidencia:** El único disparo del motor es un fetch a la URL pública con AbortSignal.timeout(1500) y catch vacío (recibir.js:164-170; recordatorios-cron.js:147-156). Ningún cron re-dispara chats pendientes (verificado en cron.job: jobs 1, 3, 5, 6; el job 3 solo sincroniza etiquetas). Además, agente_claim_respuesta persiste agente_respondido_ms ANTES de responder (1062-1063); la función en la base (verificada) no tiene vencimiento: si la corrida muere después del claim, cualquier re-disparo del MISMO mensaje —incluido el botón manual de la cabina— sale con 'Otra corrida ya respondió' (1084-1088).

**Problema:** Si el disparo se pierde (arranque/edge >1.5s bajo carga, blip de red hacia www.losplata.com.co) el turno no existe y el cliente queda sin respuesta. Peor: si la corrida muere tras reclamar (timeout, deploy, crash), ese mensaje queda SIN RESPUESTA PARA SIEMPRE — solo un mensaje NUEVO del cliente (hasta_ms mayor) destraba el chat. En recordatorios, el registro ya quedó 'enviado' aunque el disparo se haya perdido.

**Mejora propuesta:** Cron barredor cada 1-2 min: conversaciones con agente_activo=true, ultimo_entrante=true y ultimo_at entre 2 y 60 min atrás sin mensaje saliente posterior → re-POST a agente-responder (idempotente gracias al candado). Para que el barredor funcione, guardar también un claimed_at en el claim y permitir re-reclamar si pasaron >5 min sin saliente posterior.

**Nota del verificador (leer antes de implementar):** CONFIRMADO con código y producción. (1) recibir.js:156-171 y recordatorios-cron.js:132-156: único disparo es fetch con timeout 1.5s y catch vacío (ni se revisa el status HTTP); el recordatorio queda 'enviado' antes del fetch. (2) RPC agente_claim_respuesta verificada en la base: sin vencimiento ni claimed_at; agente_respondido_ms no se resetea en ningún punto del JS y agente_soltar_lock solo limpia agente_procesando_at. cron.job verificado: jobs 1,3,5,6, sin barredor. Botón manual de la cabina (agente.js:232-241) choca contra el mismo claim. (3) EVIDENCIA VIVA: chat 573213110313 hoy 12:13 — claim tomado para el último mensaje del cliente, lock liberado, última salida ANTERIOR al mensaje: turno muerto real. Ajustes: (a) 'deploy' no mata corridas en Vercel (terminan en el deployment viejo); las causas reales son maxDuration=300s (alcanzable: debounce 240s + 6 vueltas IA), crash, y —peor que lo descrito— salidas LIMPIAS post-claim sin responder (error de IA en agente-responder.js:1411 hace soltarLock y retorna SIN resetear el claim; probable causa del pendiente 'respuestas en null'). (b) 'Para siempre' es para el agente: humano puede contestar y un recordatorio salta el claim (línea 1058). (c) Mejora segura: el claim no es candado de dinero (abono/transferencia tienen idempotencia propia, agente_tomar_lock 60s intacto). Correcciones a la mejora: el re-claim (>5 min sin saliente posterior a hasta_ms) debe ser atómico DENTRO del RPC; el barredor debe excluir estado='humano', línea apagada y remisión; riesgo residual aceptable: texto duplicado si la corrida murió entre enviar a WhatsApp e insertar el mensaje. Severidad 'alto' es justa: clientes reales quedan en silencio de forma invisible, pero no hay pérdida/duplicación de dinero y un mensaje nuevo del cliente destraba.

---

## H13 — agendarVerificacion traga errores en la ruta del dinero (inventario de catch vacíos: cuáles son graves y cuáles razonables)

**Severidad:** alto · **Dimensión:** Escala/robustez · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1486-1499 (y 472, 475, 1462; api/whatsapp/recibir.js:42-61, 139, 170)`

**Evidencia:** GRAVES: (1) agendarVerificacion tiene try/catch vacío (1489-1498): si el INSERT en verificaciones_pago falla, no hay nota, etiqueta ni log — y ya se le prometió al cliente 'estoy verificando tu pago' (469-470, 753); (2) el catch vacío de ponerEtiqueta dentro del bloqueo de pago falso (472) puede dejar sin alerta humana un chat marcado para revisión; (3) la red de seguridad de enviar_boleta traga el fallo sin nota (1462); (4) activarPorDisparador falla sin ni un console.error (recibir.js:139) — el cliente que escribió la palabra clave jamás recibe agente; (5) en dispararAgenteSiActivo (recibir.js:170) el abort esperado de 1.5s es INDISTINGUIBLE de un fallo real de disparo; (6) el catch global del webhook (recibir.js:58-61) devuelve 200 aunque Supabase esté caído → mensajes entrantes PERDIDOS sin reintento de Meta. RAZONABLES (documentados, no tocar): registrarUso (70), candado fail-open (987), marcarComprobanteAsignado (491), cancelarRecordatorios (149), guardado de transcripción (1102).

**Problema:** El peor caso es dinero: cliente pagó, mandó comprobante, se le prometió verificación... y nadie verificará nunca ni nadie se enterará. Los demás esconden la causa cuando 'el agente no contestó' o 'no se prendió', haciendo el sistema indiagnosticable en producción.

**Mejora propuesta:** En agendarVerificacion: si falla el insert → etiqueta ASESOR + fila tipo 'error' en agente_actividad (el cliente ya quedó esperando, ALGUIEN debe saber). En recibir.js: distinguir e.name==='AbortError' (esperado) de otros errores y loguear estos últimos; console.error en activarPorDisparador. En el catch global del webhook: si NINGÚN mensaje se pudo guardar, devolver 5xx para que Meta reintente con backoff (el dedup por wa_message_id absorbe el reintento sin duplicar).

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual y producción. Todas las líneas citadas existen tal cual: agendarVerificacion con catch vacío (agente-responder.js:1488-1499) en la ruta del dinero tras prometer verificación (469-470, 751-753); 1462; recibir.js:139, 170 y 58-63. Detalle agravante: la nota de la línea 752 afirma "lo dejé en verificación automática" aunque el insert falle. CORRECCIÓN ESENCIAL A LA MEJORA: con supabase-js ^2.39.0 los errores PostgREST NO lanzan excepción — .insert() devuelve { error } que nadie revisa, así que poblar el catch sería un NO-OP para los fallos más probables (RLS/grants/caché de esquema, exactamente los 2 incidentes silenciosos ya documentados en la bitácora). La mejora debe leer `const { error } = await ...insert(...)` y reaccionar a ese error (etiqueta ASESOR + fila 'error' en agente_actividad, tabla que ya existe y se usa). Verificado en prod (lecturas): los inserts a verificaciones_pago funcionan HOY (fila pendiente 20:32 de hoy; anon tiene INSERT) → fallo LATENTE, no activo; pero el agente corre como anon y un "arreglo" de privilegios sin política RLS lo rompería en silencio, por eso severidad alto se sostiene. AJUSTES: el punto del catch en 472 está sobredimensionado (ponerEtiqueta ya traga internamente en lib/etiquetas.js:29 y la nota de 471 sí deja rastro en chat + agente_actividad → hay alerta, solo falta la etiqueta visible); el 200-siempre del webhook es deliberado por comentario en código (recibir.js:12-14,59) aunque no está en bitácora — la mejora 5xx-si-NINGÚN-mensaje-se-guardó es válida (dedup wa_message_id existe en recibir.js:79-97) pero debe excluir webhooks de solo-statuses y considerar que Meta desactiva el webhook tras fallos sostenidos. Distinguir AbortError en recibir.js:170 es correcto (el corte a 1.5s es la ruta normal; loguear solo lo demás). La mejora no debilita ningún candado de dinero. Esfuerzo bajo: correcto.

---

## H14 — Suite de conversaciones doradas (golden tests) antes de publicar cada cambio del manual

**Severidad:** alto · **Dimensión:** Estrategia · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente.js:160-198`

**Evidencia:** agente.js:160-198 (guardar → UPDATE directo del prompt, sin gate); agente.js:246-258 (simulador 'probar' infrautilizado); docs/bandeja-whatsapp-buzon.md:397 (pendiente: 'Limpiar el simulador probar... ya no se usa'). El modo sombra (agente-responder.js:969-975) solo prueba con tráfico vivo, no reproduce casos pasados.

**Problema:** El manual (27.7k chars, el verdadero 'producto') se edita en caliente y entra a producción al instante: la acción 'guardar' pisa agente_config.prompt sin ninguna prueba previa, y la única validación hoy es mirar chats reales después. Cada corrección nueva puede romper una regla vieja (ya pasó: el voseo, el conteo de sábados y el 'pagada al 100%' nacieron de regresiones detectadas con clientes reales). El simulador 'probar' existe pero es manual, de una sola conversación, y está marcado como 'ya no se usa' para borrarlo.

**Mejora propuesta:** En vez de borrar 'probar', convertirlo en el corredor de una suite de 15-30 conversaciones doradas (transcripts reales que ya causaron incidentes: voseo, contar sábados acumulados, afirmar pago sin abono, remisión, extranjeros, pedir los 5 datos juntos). Verificación automática barata: (1) asserts con regex reutilizando lógica que YA existe en el código (afirmaPagoHecho de agente-responder.js:418, patrones de voseo del propio manual líneas 11-13, 'lleva \d+ sábados'); (2) opcional, un juez Haiku para criterios blandos. Correr la suite por la API Batch (50% de descuento; es el único trabajo no urgente real del sistema). Flujo para Mateo: editar manual → botón 'probar contra los casos' → ver rojo/verde → guardar. Esto además habilita con seguridad los pendientes ya conocidos (adelgazar el manual, routing a Haiku).

**Nota del verificador (leer antes de implementar):** Confirmado contra el código real: guardar pisa agente_config.prompt sin gate (agente.js:160-198), el simulador 'probar' existe pero corre sin herramientas ni contexto y está marcado para borrar (agente.js:246-285, bandeja-whatsapp-buzon.md:397), afirmaPagoHecho ofrece 7 regex reutilizables como asserts (agente-responder.js:~412-445), y la bitácora documenta 3+ regresiones reales en una semana detectadas con clientes ('lleva 3 sábados' dicho ~34 veces; 'pagada al 100%' sin abono el 9-jun; el candado nuevo bloqueando 'es 100% legal'). No existe nada parecido en el repo (cero tests) y la suite es el habilitador real de los pendientes de ahorro (adelgazar manual, routing Haiku). Dos ajustes: (1) descartar la API Batch — un gate interactivo pre-guardado necesita resultado en segundos y 25 casos cuestan <$1 con llamadas estándar paralelas + caché; (2) el corredor debe inyectar las definiciones de TOOLS en modo seco (sin ejecutar) para que los casos de 'pago sin abono' se reproduzcan fielmente — los de texto puro (voseo, sábados) funcionan con el 'probar' actual tal cual. Mantenerla es realista si se queda pequeña (15-30 casos) y dominada por asserts negativos de regex (poco flaky), con el juez Haiku solo como opcional. Alto, no crítico: el sistema funciona hoy y el modo sombra mitiga parcialmente, pero esto convierte el ciclo 'el cliente sufre la regresión' en 'el botón la atrapa'.

---

## H15 — Versionado del manual con rollback (hoy un replace() SQL lo puede dañar sin copia)

**Severidad:** alto · **Dimensión:** Estrategia · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente.js:189-194`

**Evidencia:** agente.js:189-194 (UPDATE de prompt pisa el valor sin historial); sql/agente.sql:13-24 (agente_config no tiene tabla de historial asociada; las únicas tablas del agente son config, herramientas y actividad).

**Problema:** agente_config.prompt se sobreescribe sin guardar la versión anterior, tanto desde la cabina como con los replace() por SQL que se usan para afinarlo. Un replace() que matchee de más, un guardado accidental desde la cabina o un error de edición destruyen el activo más valioso del agente sin forma de volver atrás, y nadie se enteraría hasta ver respuestas raras con clientes reales.

**Mejora propuesta:** Puro SQL, sin tocar código ni desplegar: tabla agente_config_historial (linea_id, prompt, actualizado_por, created_at) + trigger AFTER UPDATE OF prompt ON agente_config que inserte la versión VIEJA cuando cambie. Rollback = un UPDATE copiando desde el historial. Aplicar con apply_migration (regla ya conocida de la caché de PostgREST). Opcional después: lista de versiones con botón 'restaurar' en la cabina. Es además prerequisito sano para la reestructuración del manual.

**Nota del verificador (leer antes de implementar):** Confirmado contra código y producción: agente.js:189-194 pisa el prompt sin historial; en el proyecto ikvzmojzgpxuhnbymtxm NO existe tabla de historial (solo historial_rifas, ajena al agente) y pg_trigger muestra CERO triggers sobre agente_config. El activo es real: prompt de 27.706 chars en la línea viva, editado hoy mismo, sin copia durable (el repo no lo contiene; /tmp es efímero). Riesgo adicional encontrado: agente.js:163 hace String(req.body.prompt || ''), así que un 'guardar' que omita el campo prompt BORRA el manual a vacío — el trigger de historial también cubriría ese caso. Ajustes a la mejora: (1) trigger con WHEN (OLD.prompt IS DISTINCT FROM NEW.prompt) para no guardar filas en cada toque de variables/resultados; (2) prender RLS en la tabla nueva (convención del proyecto: todo con RLS, backend pasa con SERVICE_ROLE); (3) opcional barato: guardar también nombre_agente y variables en el historial ya que el mismo UPDATE los pisa. Esfuerzo bajo real (puro SQL vía apply_migration, cero deploy, cero mantenimiento). Severidad alto, no crítico: es un seguro contra pérdida irreversible, no transforma la operación diaria, pero el daño que evita (perder 6 días de afinación acumulada sin enterarse hasta ver respuestas raras con clientes reales) lo justifica de sobra en una operación de 1 persona no-programadora.

---

## H16 — Monitoreo con alertas a Mateo por WhatsApp (errores, silencios, gasto anómalo)

**Severidad:** alto · **Dimensión:** Estrategia · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:1070-1075`

**Evidencia:** agente-responder.js:1411 (error de la IA → solo nota en el chat) y 1070-1075 (fallo del candado → solo fila en agente_actividad); recordatorios-cron.js:60-64 y 76-80 (fallos de plantilla → solo agente_actividad); agente.js:151-157 (la cabina lee actividad solo al abrirla). grep de mecanismos de aviso a Mateo en api/: cero resultados.

**Problema:** Hoy ningún fallo del agente avisa a nadie: los errores quedan en agente_actividad y la cabina solo muestra los últimos 50 cuando Mateo la abre. Un cliente que quedó sin respuesta (las 'respuestas en null' ya detectadas), una caída de la API de Anthropic, una racha de errores del candado, o un día de gasto anómalo solo se descubren si Mateo revisa la bandeja por iniciativa propia. Para una operación de UNA persona con dinero real, el costo de no enterarse a tiempo es perder ventas y pagos sin saberlo.

**Mejora propuesta:** Un cron nuevo (mismo patrón pg_cron→Vercel ya usado 4 veces) cada 15 min que revise: (1) chats con agente_activo=true y ultimo_entrante=true hace >10 min (cliente esperando = silencio); (2) errores nuevos en agente_actividad tipo='error'; (3) gasto de hoy en agente_uso > 2× el promedio de 7 días; (4) verificaciones_pago que agotaron intentos. Si hay algo, manda UN WhatsApp resumido al número de Mateo usando enviarTexto/lib/whatsapp.js que ya existe (más un resumen diario fijo a las 8 p.m. con ventas, gasto y errores del día). Sin paneles nuevos: el celular de Mateo es el panel.

**Nota del verificador (leer antes de implementar):** Confirmado contra el código real: no existe NINGÚN mecanismo de aviso a Mateo. Las 4 citas son exactas (agente-responder.js:1411 error de IA → solo nota en chat; 1070-1075 fallo del candado RPC → solo agente_actividad; recordatorios-cron.js:58-64 y 74-80 fallos de plantilla → solo agente_actividad; agente.js:151-157 la cabina lee actividad solo al abrirla). Incluso pasar_a_humano (línea 875-888) solo pone etiqueta y apaga el agente sin avisar a nadie. La viabilidad también se confirmó: enviarTexto existe (lib/whatsapp.js:61), el patrón pg_cron→Vercel ya corre 4 veces, y todas las fuentes de datos existen (agente_actividad.tipo='error', agente_uso, conversaciones_whatsapp.ultimo_entrante+agente_activo, verificaciones_pago.intentos/max_intentos). Vale la pena: operación de 1 persona con dinero real y fallas silenciosas ya comprobadas (respuestas en null). Dos ajustes obligatorios a la mejora: (1) la ventana de 24h de Meta hará fallar enviarTexto libre hacia Mateo cuando no tenga sesión abierta con la línea — las alertas y el resumen de 8 p.m. necesitan una plantilla utility aprobada (el repo ya envía plantillas en recordatorios-cron.js) o que Mateo le escriba a la línea a diario; (2) el cron debe recordar qué ya alertó (marcador de última corrida) para no repetir la misma alerta cada 15 min, y el umbral de silencio mejor 15 min que 10 para evitar falsos positivos por el debounce y los skips del anti-duplicado. Severidad alto (no crítico): previene pérdidas silenciosas pero no transforma el negocio.

---

## H17 — Checklist de 'rifa nueva' + sacar del código los textos quemados de la rifa actual

**Severidad:** alto · **Dimensión:** Estrategia · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:1296-1301`

**Evidencia:** Textos de la rifa quemados en agente-responder.js: 306-307 (descripción del tool con '$150 mil... $20 mil... EDSA'), 510-511 (defaults del contacto inicial con precios), 1267-1268 (cierre predefinido), 1296-1301 (premiosTxt: 'casa de dos plantas... Chinchiná... $300.000.000... Cada sábado $5.000.000'), 1294 (regex /mayor|casa/i sobre el título del sorteo), 1328-1329 (pedir datos); recordatorios-cron.js:70 ('tu boleta de la casa'); 793-794 (resolucion.pdf de ESTA rifa). El manual sí se auto-marca ('ACTUALIZA ESTOS RENGLONES', manual línea 55), el código no.

**Problema:** Al rotar de rifa (la actual sortea el 4 de julio, es decir, en semanas) hay textos de la rifa ACTUAL quemados en el código que NO cambian al editar el manual. Lo más grave: los atajos SIN IA no pasan por el manual, así que aunque Mateo actualice el manual perfecto, el saludo predefinido y el paso de premios seguirían vendiendo la casa de Chinchiná con $150 mil/$20 mil/$300M/sábados de $5M de la rifa vieja a todo cliente nuevo, y arreglarlo exige editar código y desplegar (cosa que Mateo no hace solo). Hoy no existe ninguna lista de TODO lo que hay que tocar al rotar.

**Mejora propuesta:** Dos pasos: (1) mover esos textos a la base usando el mecanismo que YA existe — agente_config.variables + aplicarVariables (agente-responder.js:141-147) ya soporta {{clave}} por línea; los atajos leerían {{precio_boleta}}, {{texto_premios}}, {{cierre_inicial}} en vez de constantes — así rotar la rifa nunca exige desplegar código; (2) escribir el checklist de rotación en docs/ (manual, variables, calendario rifas.sorteos, resultados, plantilla de seguimiento, fotos del 'contacto inicial' en respuestas_rapidas, resolucion.pdf, textos fijos) y validar la rotación con la suite dorada.

**Nota del verificador (leer antes de implementar):** Confirmado contra el código real: todos los textos quemados citados existen (agente-responder.js:306-307, 510-511, 1267-1268, 1294, 1296-1301, 1328-1329; recordatorios-cron.js:70; public/resolucion.pdf), los atajos SIN IA retornan antes de llamar a la IA (no pasan por el manual), ~88% de primeros contactos usan el saludo predefinido según el propio código, y NO existe checklist de rotación en docs/ ni nada equivalente. El mecanismo propuesto ya existe y está infrautilizado: aplicarVariables (141-148) + agente_config.variables (cargadas en 1127-1134) hoy solo se aplican al prompt. Vale la pena: el sorteo es el 4 de julio (semanas), la rotación es segura, y sin esto cada cliente nuevo recibiría la oferta vieja hasta que un programador despliegue (Mateo no puede solo; auto-deploy roto). Severidad alto, no crítico: hoy no está roto y una rotación asistida puntual también lo resolvería, pero el cambio hace la rotación auto-operable por el dueño para siempre. Ajustes a la mejora: (a) la implementación es MÁS fácil de lo dicho — cfg.variables ya está en scope antes de los atajos (carga en 1127, atajos en 1255+); para la descripción del tool basta aplicar aplicarVariables a toolsActivas tras la línea 1142 (TOOLS es const de módulo, no templear la constante); (b) la "suite dorada" NO existe en el repo (grep solo encuentra colores de UI) — reemplazar ese paso por prueba manual en modo sombra, que sí existe; (c) recordatorios-cron.js:70 se arregla con redacción neutra ("lo de tu boleta"), sin variable; (d) resolucion.pdf es archivo estático del repo: o queda como ítem del checklist (exige deploy) o se mueve a una URL en Storage dentro de una variable para que tampoco exija deploy; (e) documentar en el checklist la convención del regex /mayor|casa/i (titular el sorteo principal con "Mayor") o volverlo variable.

---

## H18 — Cobro suave automático de saldos pendientes (la infraestructura ya existe, solo falta conectarla)

**Severidad:** alto · **Dimensión:** Estrategia · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/difusiones.js:49`

**Evidencia:** El único origen de recordatorios es la herramienta programar_recordatorio cuando el cliente lo pide (agente-responder.js:837-873). Las piezas para cobrar YA existen pero desconectadas: difusiones con filtro de audiencia estado_pago (difusiones.js:49), difusiones programadas (cron jobid 6), plantillas aprobadas, y el flag activar_agente en difusiones (difusiones.js:98) que prende a Liliana para atender las respuestas.

**Problema:** Para ganar la casa la boleta debe estar 100% pagada al 4 de julio, pero hoy NADIE cobra sistemáticamente los saldos: los recordatorios solo se crean si el cliente pide tiempo en el chat, y no existe ningún proceso que busque boletas con saldo_restante>0 y les escriba. Cada boleta separada con $20.000 que nunca se termina de pagar es ingreso perdido (~$130.000 por boleta) y un cliente que no competirá por el premio mayor. Con la fecha límite acercándose, es la palanca de ingresos más directa que el dueño no está usando.

**Mejora propuesta:** Campaña recurrente de cobro suave reutilizando difusiones programadas: audiencia 'clientes con saldo pendiente' (verificar/extender el RPC difusion_audiencia para filtrar por saldo_restante>0), plantilla cálida con el saldo y el próximo sorteo como gancho, activar_agente=true para que Liliana cierre el cobro en el chat (ella ya sabe consultar saldo y registrar abonos). Cadencia: semanal ahora, y escalada los últimos 10 días antes del 4 de julio. Casi cero código nuevo; es configuración + posiblemente un filtro SQL.

**Nota del verificador (leer antes de implementar):** Confirmado contra código y producción: no existe cobro sistemático (único origen de recordatorios es programar_recordatorio en agente-responder.js:864) y el dinero en juego es enorme y vigente: 7.665 boletas de la rifa activa con saldo pendiente = $769M COP por cobrar antes del 4 de julio. La infraestructura existe tal como dice la propuesta, y mejor: el RPC difusion_audiencia YA filtra estado_pago='saldo' (saldo_restante>0), no hay que extenderlo; activar_agente sí prende a Liliana (difusion-envio.js:112); difusiones programadas operativas. AJUSTES NECESARIOS a la mejora: (1) hoy solo 87 de 7.076 deudores (~$10.9M) tienen conversación en la línea y por tanto entran a la audiencia — paso previo obligatorio: importar los teléfonos deudores con contactos-importar.js (crea las conversaciones, línea 50), sigue siendo cero código pero no es "solo configuración"; (2) la plantilla NO puede incluir el saldo personalizado (resolverParametros solo soporta {nombre}/{telefono}, difusiones.js:38-47) — plantilla genérica y Liliana da el saldo exacto al responder con consultar_cliente; (3) no hay recurrencia: la cadencia semanal es duplicar la difusión a mano (~5 min/semana, viable para 1 persona); (4) ~7.000 envíos de plantilla chocan con los tiers de Meta — enviar por tandas/días y prever el pico de gasto de Liliana atendiendo respuestas. Severidad alto y no crítico solo por esos pasos operativos previos; el beneficio (recuperar incluso una fracción de $769M) aplasta el esfuerzo.

---

## H19 — El webhook de Meta NO valida la firma X-Hub-Signature-256: acepta cualquier POST

**Severidad:** alto · **Dimensión:** Seguridad · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/recibir.js:37-64`

**Evidencia:** recibir.js:37-64 no contiene ninguna comprobación de cabecera de firma; grep de X-Hub-Signature/APP_SECRET/createHmac en api/ solo encuentra el webhook de Wompi, nunca el de WhatsApp.

**Problema:** recibir.js procesa el POST entrante sin verificar la firma HMAC de Meta. Solo el GET de verificación usa un token (recibir.js:25-35); el POST (recibir.js:37-64) no comprueba nada. La URL del webhook es pública y predecible (https://www.losplata.com.co/api/whatsapp/recibir). Un atacante que conozca la URL puede POSTear un payload falso de Meta y: (1) inyectar mensajes 'entrantes' arbitrarios con telefono, nombre de perfil y texto a elección, que se guardan tal cual incluyendo el objeto crudo (recibir.js:79-97, raw: m); (2) suplantar a CUALQUIER cliente eligiendo su 'from' y caer en una conversación ya activa; (3) cancelar todos los recordatorios pendientes de un chat (recibir.js:101); (4) auto-encender el agente vía palabras clave de disparadores (recibir.js:105,115-140); (5) disparar el motor de IA (recibir.js:108,156-171) gastando API real y ejecutando herramientas; (6) falsear estados de entrega de NUESTROS mensajes a 'leido'/'fallido' (recibir.js:54,174-184). Es la puerta de entrada de TODO el sistema y está sin autenticar.

**Mejora propuesta:** Validar X-Hub-Signature-256 antes de procesar: calcular HMAC-SHA256 del cuerpo CRUDO de la petición con el App Secret de la app de Meta (variable nueva, ej. META_APP_SECRET) y comparar con la cabecera usando crypto.timingSafeEqual; si no coincide, responder 200 vacío SIN procesar (200 para que Meta no reintente, pero sin efectos). En Vercel hay que acceder al body crudo (desactivar el parseo automático o reconstruir el raw) porque la firma se calcula sobre los bytes exactos.

**Nota del verificador (leer antes de implementar):** CONFIRMADO en codigo actual. recibir.js: el GET valida WHATSAPP_VERIFY_TOKEN (lineas 25-35) pero el POST (lineas 37-64) procesa req.body sin ninguna verificacion de firma. grep de X-Hub-Signature/createHmac/timingSafeEqual en api/ no encuentra nada para WhatsApp; solo el webhook de Wompi valida firma (api/abonar/wompi-webhook.js:12-38). No hay middleware.* ni regla en vercel.json que proteja la ruta. Los 6 vectores listados son alcanzables: guardarEntrante guarda el entrante crudo (raw:m, lineas 79-97), se puede elegir el 'from' para suplantar, cancelarRecordatorios borra pendientes (101/143-150), activarPorDisparador auto-prende el agente (105/115-140), dispararAgenteSiActivo lanza el motor de IA gastando API real (108/156-171) y actualizarEstado falsea estados de NUESTROS mensajes (54/174-184).

NO esta mitigado: docs/BITACORA-DE-DECISIONES.md no tiene ninguna entrada sobre firma del webhook de Meta; la decision de auth-por-contrasena del contexto es del backend de asesores, no del HMAC de Meta.

La mejora es SEGURA y CORRECTA: validar X-Hub-Signature-256 con HMAC-SHA256 sobre el cuerpo CRUDO + crypto.timingSafeEqual y responder 200 vacio si no coincide. Es la practica estandar de Meta, NO debilita ningun candado de dinero (solo agrega una puerta de autenticacion en la entrada). El apunte de que en Vercel hay que acceder al body crudo (desactivar el parseo automatico o reconstruir los bytes) es tecnicamente correcto, porque la firma se calcula sobre los bytes exactos.

AJUSTE DE SEVERIDAD: critico -> alto. El candado de dinero NO es burlable por esta via: verificarYAbonar (api/lib/abono-agente.js) solo abona contra una transferencia REAL del banco consumida una sola vez, y el candado anti-pago-falso (afinado 9-jun) impide que el agente afirme un pago sin abono real. Por tanto un POST falso de WhatsApp NO permite marcar boletas pagadas ni extraer plata. El dano real es: quemar presupuesto real de la API de Claude (DoS financiero), contaminar la base de produccion con mensajes/conversaciones falsas de clientes reales, falsear estados de entrega, y -via suplantacion + ingenieria social al LLM- potencialmente alcanzar liberar_boleta/trasladar_abono (agente-responder.js:756/776, que corren con la contrasena de gerencia) y afectar reservas reales. Es una falla de auth seria en LA puerta de entrada del sistema, hay que cerrarla pronto, pero no es una ruta directa a robar el dinero de las rifas, asi que "critico" esta inflado.

---

## H20 — Endpoint público devuelve nombre, deuda y boletas de cualquier cliente solo con su teléfono (IDOR/fuga PII)

**Severidad:** alto · **Dimensión:** Seguridad · **Esfuerzo:** medio

**Archivo:** `api/cliente.js:6-9`

**Evidencia:** api/cliente.js:6-9 lee req.query.telefono sin auth y retorna boletas/deuda/nombre; agente-responder.js:696 y enviar-boleta.js:76 reparten el enlace /boleta?telefono=; mis-boletas.js:21-24 SÍ valida sesión (patrón seguro existente).

**Problema:** api/cliente.js es un GET sin autenticación que, recibiendo solo ?telefono=, devuelve el nombre del cliente, su deuda total, lo abonado y sus boletas (api/cliente.js:6-...). El propio agente reparte enlaces públicos hacia esa información: agente-responder.js:696 y enviar-boleta.js:76 generan https://www.losplata.com.co/boleta?telefono=<10digitos>. Cualquiera puede enumerar números de celular colombianos (rango acotado, empiezan en 3) y cosechar nombre + saldo + boletas de clientes reales sin ninguna credencial. El CORS no protege: las peticiones sin cabecera Origin (curl/servidor) pasan por diseño (cors.js:54). Ya existe el patrón seguro (api/app/mis-boletas.js exige sesión validada), pero esta vía lo elude.

**Mejora propuesta:** No exponer datos por teléfono crudo. Opciones: (a) servir la consulta de boletas solo tras sesión autenticada (OTP del app, como mis-boletas.js); o (b) si el enlace debe ser sin login, firmar un token opaco y con expiración en lugar del teléfono (ej. /boleta?t=<token-firmado>), y que cliente.js exija ese token. Mínimo: rate-limit por IP para frenar la enumeración. Verificar en producción con la contraseña de gerencia antes de tocar, porque ChateaPro y la web consumen cliente.js.

**Nota del verificador (leer antes de implementar):** CONFIRMADO en código actual. api/cliente.js es un GET sin auth (no importa nada de auth/sesión; cliente.js:1-9) que con solo ?telefono= devuelve nombre, deuda total, abonado y boletas (cliente.js:22-30 hace .like('telefono_cliente','%'+last10) y cliente.js:86-94 retorna el paquete). cors.js:54 deja pasar las peticiones sin header Origin (curl/servidor), así que el IDOR es alcanzable. La suffix-match con los últimos 10 dígitos habilita enumeración. mis-boletas.js:21-24 SÍ exige validarSesionApp (el patrón seguro existe). No hay rate-limit en estos GET (el único 429 está en api/auth/enviar-otp.js:54-62). NADA en docs/BITACORA-DE-DECISIONES.md justifica exponer PII por teléfono crudo; la "contraseña simple sin sesiones" del contexto es para auth del sistema/admin, no para lookup público de clientes, así que NO es una decisión deliberada documentada.

CORRECCIÓN IMPORTANTE a la evidencia (no baja la severidad, la sube): el enlace que reparte el agente (agente-responder.js:696 y enviar-boleta.js:76 → https://www.losplata.com.co/boleta?telefono=<10>) NO consume api/cliente.js. La página /boleta carga ver-house-app.js, cuyo fuente ver-house-app.jsx:42 hace fetch('/api/abonar/cliente?telefono='+...). Es decir, el endpoint público real detrás del enlace es api/abonar/cliente.js, que TAMBIÉN es GET sin auth y filtra MÁS PII: nombre, apellido, ciudad, documento_tipo, documento_numero (CÉDULA), correo (email) e historial de abonos (abonar/cliente.js:18-46, 104-117). El hallazgo subestimó la superficie: el peor agujero es abonar/cliente.js, no cliente.js.

Severidad 'alto' es justa (la fuga de cédula+email por teléfono podría argumentarse crítico, pero alto es defendible). La mejora (a: sesión/OTP como mis-boletas; b: token opaco firmado con expiración; mínimo: rate-limit por IP) es correcta y NO debilita ningún candado de dinero (son endpoints de solo lectura). AJUSTE OBLIGATORIO a la mejora: aplicar la misma protección a api/abonar/cliente.js (es el que realmente está detrás del /boleta del agente y filtra cédula+correo); corregir solo api/cliente.js dejaría abierto el hueco peor.

---

## H21 — Mensajes que llegan durante la fase de IA quedan SIN responder hasta que el cliente vuelva a escribir

**Severidad:** alto · **Dimensión:** Velocidad · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:984-988,1058-1090,1459-1466`

**Evidencia:** El lock bloquea a B (988: return skip); el refresco del lock solo ocurre dentro del debounce (1009), nunca en la fase de IA; y el cierre del handler (1459-1466) hace red de seguridad de boleta + soltarLock + return, sin re-chequear entrantes nuevos ni re-dispararse.

**Problema:** Tras el debounce, la corrida A toma el claim y entra al bucle de IA (5-45s típicos con herramientas). Si el cliente escribe en esa ventana, el webhook dispara una corrida B que choca con el candado (agente_tomar_lock devuelve false, se recupera a los 60s) y B se sale con skip (línea 988). A, al terminar, suelta el lock y retorna SIN revisar si entró un mensaje más nuevo que su claim (líneas 1459-1466). Resultado: ese mensaje queda en visto indefinidamente — nada lo reintenta hasta que el cliente escriba otra vez. El mismo hueco aplica si una corrida muere (deploy, crash, maxDuration): el lock expira a los 60s pero ningún mecanismo re-dispara la respuesta pendiente. Esto es un mecanismo concreto y verificable detrás del pendiente conocido de 'respuestas en null sin investigar'.

**Mejora propuesta:** Al final del handler, justo antes de soltarLock: consultar si existe un mensaje 'entrante' con timestamp_wa mayor al hasta_ms del claim; si sí, tras soltar el lock auto-redispararse (fetch fire-and-forget a sí mismo con el secreto interno, mismo patrón de recibir.js:164-170). Complemento barato contra corridas muertas: un barrido en el cron de cada minuto (recordatorios-agente-cada-minuto) que detecte conversaciones con agente_activo=true, ultimo_entrante=true y >N minutos sin saliente, y las re-dispare.

**Nota del verificador (leer antes de implementar):** CONFIRMADO línea por línea en agente-responder.js: B se sale en 988 sin reintento; el refresco del lock solo existe en el debounce (1009), nunca en la fase de IA (1401-1457); el cierre 1459-1466 no re-chequea entrantes ni se re-dispara; recibir.js:164-170 es fire-and-forget sin retry; recordatorios-cron.js solo despierta recordatorios programados (no barre conversaciones sin responder); la bitácora no lo registra como decisión deliberada y el pendiente "respuestas en null" es el síntoma documentado de este mecanismo (profundización válida, no repetición). Severidad alta justa: clientes reales con dinero real quedan en visto sin ningún mecanismo de recuperación salvo que vuelvan a escribir. AJUSTE A LA MEJORA: tal como está propuesta, el auto-redisparo "plano" falla en el sub-caso principal — guardarEnChat pone timestamp_wa=ahora al saliente (línea 387), así que si A respondió DESPUÉS del msg2 el último mensaje real queda saliente y la corrida redisparada se sale en el guard de la línea 1045; además ese mismo saliente pone ultimo_entrante=false (línea 394), por lo que el barrido del cron con ultimo_entrante=true tampoco ve ese caso (sí sirve para corridas muertas que no enviaron nada). Corrección: el redisparo debe llevar un flag que salte el guard 1045, o cambiar ese guard a "existe entrante con timestamp_wa > hasta_ms del último claim". En seguridad la mejora es sana: la corrida redisparada pasa por agente_tomar_lock + agente_claim_respuesta, no debilita candados de dinero ni duplica respuestas.

---

## H22 — El atajo fijo de premios omite el acumulado vigente: mezclará cifras que el propio manual prohíbe mezclar

**Severidad:** medio · **Dimensión:** Coherencia · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1296-1301`

**Evidencia:** agente-responder.js:1296-1301 (texto fijo de premios, sin montoAcumProximo) vs agente-responder.js:1262-1265 (saludo fijo que sí incluye montoAcumProximo). Manual /tmp/manual-liliana.txt:205 ("UNA SOLA CIFRA POR CONVERSACIÓN") y 17. Historial real de acumulados en agente_config.resultados (16-may $10M, 23-may $15M, 30-may $20M).

**Problema:** Cuando vuelva a haber acumulado (pasa cada pocas semanas: la base registra cadenas de $10M→$15M→$20M en mayo), el flujo sin IA queda incoherente: el saludo predefinido SÍ anuncia "(premio acumulado en *$X*)", pero el siguiente mensaje fijo de premios dice siempre "*Cada sábado:* *$5.000.000* en bonos" sin mencionar el acumulado del próximo. El cliente recibe dos cifras distintas en mensajes consecutivos, exactamente lo que el manual prohíbe ("UNA SOLA CIFRA POR CONVERSACIÓN… NUNCA mezcles $5.000.000 en un mensaje y el monto acumulado en otro") y sin que la IA intervenga para arreglarlo. La decisión del 9-jun sobre este texto (bitácora) solo trató la redundancia precio/abono, no el caso acumulado.

**Mejora propuesta:** En el texto fijo de premios, usar la variable montoAcumProximo ya calculada: si hay acumulado, añadir "y el del próximo sábado está acumulado en $X" (la misma cifra del saludo); si no, dejarlo como está.

**Nota del verificador (leer antes de implementar):** CONFIRMADO con evidencia. (1) Código actual: agente-responder.js:1262-1265 (saludo fijo SÍ incluye montoAcumProximo) vs 1296-1301 (premios fijo siempre dice "$5.000.000" sin acumulado y sin guard que salte el atajo cuando montoAcumProximo está activo). (2) No mitigado: manual línea 205 prohíbe exactamente esta mezcla (y línea 17 manda aclarar ambas cifras juntas); las entradas de bitácora del 9-jun (premios sin redundancia) y 8-jun (Fase 4 atajos) NO tratan el caso acumulado — no es decisión deliberada. Aplica también cuando el saludo lo redactó la IA (anuncia el acumulado por bloqueFechas) y luego dispara el atajo fijo. (3) Datos reales verificados en agente_config.resultados: cadena 16-may $10M → 23-may $15M → 30-may $20M, ganadores 3-jun y 6-jun → hoy LATENTE (sin acumulado vigente), pero recurrente. (4) Mejora segura: solo texto, no toca candados de dinero; montoAcumProximo está en scope y ya viene formateado ("$15.000.000"), misma cifra del saludo → cumple "una sola cifra". Ajustes a la mejora: redactarla siguiendo el patrón del propio manual (línea 17), ej. tras la línea de los sábados añadir si hay acumulado: " (y el del *próximo sábado* está acumulado en *$X*)"; si acumuladoReiniciado o sin acumulado, dejar el texto como está. Recordar que el texto vive en el código: editar, `node --check`, y publicar con `vercel --prod --yes` (auto-deploy roto). Severidad medio es justa: sin riesgo de plata, pero contradicción cara al cliente en mensajes consecutivos que viola una "REGLA DURA" nacida de ~34 errores documentados (bitácora 6-jun).

---

## H23 — consultar_cliente anuncia un parámetro 'telefono' que el ejecutor ignora a propósito: la IA puede atribuir boletas a otro número

**Severidad:** medio · **Dimensión:** Coherencia · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:319-327 y 635-637`

**Evidencia:** agente-responder.js:319-327 (descripción y schema con `telefono: 'Teléfono a consultar (opcional). Por defecto el de este chat.'") vs agente-responder.js:635-637 (ejecutor: "SIEMPRE el teléfono del chat (privacidad…)" usando conv.telefono e ignorando input.telefono).

**Problema:** La descripción de la herramienta promete "Consulta si un teléfono ya tiene boletas… Si no pasas teléfono, usa el del cliente de este chat" y el schema acepta `telefono`. Pero el ejecutor SIEMPRE usa el teléfono del chat (decisión correcta de privacidad). La incoherencia es peligrosa al revés de lo que protege: si un cliente pregunta "¿qué boletas tiene el 3001234567 de mi esposa?", la IA pasará ese número creyendo que lo consulta, recibirá las boletas del PROPIO chat y se las presentará con confianza como si fueran del otro número: información falsa sobre dinero y boletas.

**Mejora propuesta:** Quitar el parámetro `telefono` del input_schema y reescribir la descripción: "Consulta las boletas y el saldo del cliente de ESTE chat (no puede consultar otros números; si piden datos de otra persona, no se puede)". Así la IA además sabe rechazar la consulta de terceros en vez de simularla.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual. (1) Las líneas citadas son exactas: api/whatsapp/agente-responder.js:319-327 anuncia `telefono` opcional ("Si no pasas teléfono, usa el del cliente de este chat") y el ejecutor en 635-648 nunca lee `input.telefono` (grep: cero usos fuera de la definición de TOOLS); usa siempre conv.telefono. Peor aún, el retorno al modelo es solo "Cliente: X. Boletas: ..." SIN decir qué teléfono se consultó, así que la IA no tiene cómo detectar que recibió los datos del chat y no los del número pedido; y si el chat es de un cliente nuevo, devuelve "Ese teléfono NO tiene boletas" — un falso negativo atribuible al tercero (ej. "tu mamá no tiene boletas" cuando sí las tiene). (2) Mitigaciones: git muestra que el endurecimiento del ejecutor fue deliberado (commit b62ff3f "arreglos auditoria", documentado en docs/bandeja-whatsapp-buzon.md:223 "forzado al teléfono del chat, por privacidad") — el hallazgo lo reconoce correctamente; pero NADA mitiga el vector de desinformación: el manual (líneas 118 y 174) prohíbe TOCAR/cambiar boletas ajenas, no CONSULTAR otros números, y la descripción de la herramienta invita activamente a pasarlos. No está en la lista de decisiones deliberadas ni en pendientes conocidos (el pendiente similar es de apartar_numero, distinto). (3) La mejora es segura: la herramienta es de solo lectura, quitar un parámetro ignorado y reescribir la descripción no debilita ningún candado de dinero. Dos ajustes para completarla: (a) cambiar también el retorno del ejecutor (línea 647) a algo como "Cliente de ESTE chat: X. Boletas: ..." como cinturón extra contra la mala atribución; (b) actualizar la etiqueta en api/whatsapp/agente.js:33 que aún dice "Consulta las boletas... de un cliente por su teléfono" para coherencia en la cabina. (4) Severidad medio es justa: no es alto (solo lectura, sin fuga de datos —la privacidad sí está protegida—, sin movimiento de dinero automático) pero tampoco bajo, porque es información falsa sobre saldos dicha con confianza a clientes reales en un escenario plausible (familias que compran por un solo WhatsApp), con riesgo de decisiones de pago erradas y pérdida de confianza.

---

## H24 — La web oficial dice "solo aceptamos pagos a cuentas a nombre de LOS PLATA S.A.S." pero Liliana cobra a Nequi/Daviplata de "Maria Buitrago"

**Severidad:** medio · **Dimensión:** Coherencia · **Esfuerzo:** bajo

**Archivo:** `public/hub-app.jsx:103`

**Evidencia:** public/hub-app.jsx:103: "Solo aceptamos pagos a cuentas a nombre de LOS PLATA S.A.S. Si tiene dudas, escríbanos al WhatsApp oficial +57 310 733 4957". Variable real en la base: agente_config.variables.pagos = "*Nequi, Daviplata o llave Bre-B 3128732266* (a nombre de *Maria Buitrago*)". Manual /tmp/manual-liliana.txt:66, 137, 150-155 (manda a la web y defiende que la cuenta de una "persona autorizada" es legítima).

**Problema:** El manual usa la web como prueba de confianza (manda al cliente desconfiado a www.losplata.com.co y a verificar la legalidad), pero el hub público advierte contra estafas diciendo que SOLO se aceptan pagos a cuentas a nombre de LOS PLATA S.A.S. — y Liliana instruye pagar a "*Nequi, Daviplata o llave Bre-B 3128732266* (a nombre de *Maria Buitrago*)". Un cliente que siga el consejo anti-estafa de la propia web concluirá que Liliana es la estafa: contradicción directa entre dos canales oficiales que golpea la conversión justo en el perfil desconfiado que el manual intenta convencer.

**Mejora propuesta:** Alinear el aviso del hub con la realidad: cambiar a "Solo acepte pagos a las cuentas autorizadas que le indiquen nuestros canales oficiales" (o publicar en la web la lista de cuentas autorizadas, incluida la llave 3128732266 de Maria Buitrago). Alternativa: migrar los cobros de la línea de Lili a una cuenta a nombre de la empresa.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra código y producción. (1) hub-app.jsx:103 dice textual "Solo aceptamos pagos a cuentas a nombre de LOS PLATA S.A.S." y se renderiza en index.html (portada). (2) Verificado EN VIVO en la base (agente_config, línea 1128258647034751): pagos = "*Nequi, Daviplata o llave Bre-B 3128732266* (a nombre de *Maria Buitrago*)"; el manual además lo hardcodea en la línea 139. (3) Agravante que el hallazgo no vio: la página Canales Oficiales (public/canales-data.jsx:64) lista 5 cuentas autorizadas (LOS PLATA S.A.S., Mateo Plata, Alejandro Plata) y la cuenta 3128732266/Maria Buitrago NO está — el cliente diligente que verifique ahí concluye que la cuenta de Liliana no es oficial; y el aviso del hub contradice incluso a su propia página de canales (canales-page.jsx:112 admite Nequi/Daviplata de "socios"). (4) NO es decisión deliberada: nada en la bitácora ni en la lista de decisiones lo cubre; el hub es rediseño reciente (commit 8623f b1). Matiz de evidencia: el manual NO manda al desconfiado explícitamente a la web (lo manda a Gobernación/EDSA/redes), pero la contradicción igual aplica porque todo comprador recibe el enlace losplata.com.co/boleta y la portada es pública. AJUSTES A LA MEJORA: (a) no suavizar el aviso a algo vago ("cuentas que le indiquen los canales") porque debilita el ancla anti-estafa — mejor agregar la cuenta 3128732266/Maria Buitrago a CANALES_CUENTAS en canales-data.jsx y que el aviso del hub remita a la página de Canales Oficiales como fuente verificable; (b) ojo: las páginas cargan los .js compilados (hub-app.js, canales-data.js), no los .jsx — hay que actualizar/recompilar ambos o el cambio no sale al aire. Severidad "medio" es justa: daño real de confianza/conversión en el segmento desconfiado, pero sin plata en riesgo ni candados tocados.

---

## H25 — Fallos de envío a WhatsApp invisibles: decir() registra como 'enviado' mensajes que nunca salieron

**Severidad:** medio · **Dimensión:** Conversación · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:501-502, 713-716, 512-523`

**Evidencia:** decir() hace `const env = await enviarTexto(...)` y llama guardarEnChat sin mirar env.ok (agente-responder.js:501-502); guardarEnChat pone estado_envio:'enviado' y no_leidos:0 (380-395). enviar_boleta solo guarda si env.ok pero retorna 'Listo, le envié su boleta...' siempre (713-716). enviarContactoInicial no corta si e1 falla (512-523) y su ejecutor devuelve 'Listo' incondicional (650-653). enviarTexto sí devuelve {ok:false, error} (api/lib/whatsapp.js:84-90).

**Problema:** Si la Cloud API de Meta falla (token vencido, rate limit, ventana 24h cerrada, error de red), el cliente NO recibe nada pero el sistema cree que sí: el chat queda marcado como respondido (no_leidos=0, ultimo_entrante=false), así que ni siquiera aparece pendiente en la bandeja. Nadie se entera de que el cliente quedó colgado. Lo mismo en enviar_boleta: aunque env.ok sea false, el tool result le dice a la IA 'Listo, le envié su boleta digital', y la IA le confirma al cliente un envío que no ocurrió. enviarContactoInicial igual: si falla el saludo, sigue con fotos y cierre y devuelve 'Listo' incondicional.

**Mejora propuesta:** En decir(): si !env.ok, guardar el mensaje con estado_envio:'fallido' (no 'enviado'), NO poner no_leidos=0, reintentar 1 vez y, si vuelve a fallar, poner etiqueta ASESOR + nota de error. En enviar_boleta y enviar_contacto_inicial: devolver a la IA un resultado de error ('NO se pudo enviar, no se lo confirmes al cliente') cuando env.ok sea false.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra HEAD f064b8e: decir() (agente-responder.js:496-503) ignora env.ok y guardarEnChat marca estado_envio:'enviado' + no_leidos:0/ultimo_entrante:false (387, 394) — en fallo síncrono la fila queda con wa_message_id:null y el acuse de Meta nunca la corrige; enviar_boleta devuelve 'Listo, le envié...' y nota 'Envié la boleta' aunque env.ok sea false (713-716); enviarContactoInicial no corta si falla el saludo y su ejecutor devuelve 'Listo' incondicional (509-524, 650-653). Nada en la bitácora lo declara deliberado. SEVERIDAD AJUSTADA alto→medio por tres atenuantes que el hallazgo omite: (1) los fallos ASÍNCRONOS (incl. ventana 24h/131047) SÍ quedan marcados: recibir.js:174-184 procesa el acuse 'failed' de Meta → estado_envio:'fallido' + error, y la bandeja lo pinta 'no enviado' (bandeja-whatsapp.html:1688) — invisible en la cola, pero no en el chat; (2) ningún candado de dinero se ve afectado y los caminos de pago ya escalan a humano independiente del envío (manejarPagoNoVerificado pone etiqueta ASESOR en 472 aunque el decir falle; registrar_abono tipo 'error' también, 744) — lo peor es una venta estancada que se recupera sola si el cliente vuelve a escribir (re-dispara el agente); (3) en el flujo normal el agente responde con la ventana 24h recién abierta, así que el modo 'ventana cerrada' casi no aplica a decir(). MEJORA: correcta y segura (no toca candados), pero incompleta — agregar: (a) corregir también la nota incondicional de la línea 715; (b) marcar envioBoleta=true (línea 1441) SOLO si el envío salió bien, porque hoy la red de seguridad del 7-jun (línea 1461) no reenvía tras un fallo (se activa con solo llamar la herramienta); (c) usar estado_envio:'fallido', que la bandeja ya renderiza. El patrón correcto ya existe en el mismo archivo: enviar_resolucion (793-798) verifica env.ok y devuelve error a la IA — replicarlo. Esfuerzo 'bajo' es realista.

---

## H26 — Las reacciones (👍/❤️) y tipos desconocidos de Meta disparan al agente y cancelan recordatorios

**Severidad:** medio · **Dimensión:** Conversación · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/recibir.js:254-255, 99-108`

**Evidencia:** interpretarMensaje cae al default {tipo: m.type, texto: null} para 'reaction'/'unsupported' (recibir.js:254-255); guardarEntrante llama cancelarRecordatorios (101) y dispararAgenteSiActivo (108) para TODO tipo sin filtro; el motor lo convierte en '[el cliente envió un reaction]' (agente-responder.js:913) y responde.

**Problema:** Cuando el cliente solo REACCIONA a un mensaje (type 'reaction' de Meta) o llega un tipo no soportado ('unsupported'), recibir.js lo guarda como entrante normal: suma no_leidos, marca el chat sin responder, CANCELA todos los recordatorios pendientes (agrava el bug conocido del 'gracias': aquí ni siquiera hubo mensaje) y dispara al agente. El motor construye '[el cliente envió un reaction]' y la IA responde algo fuera de lugar a alguien que solo puso un corazón a su boleta — gasto de tokens incluido, y el recordatorio a días que Liliana prometió desaparece.

**Mejora propuesta:** En guardarEntrante, si m.type es 'reaction' (o 'unsupported'/'ephemeral'): guardar el evento si se quiere, pero NO incrementar no_leidos, NO cancelar recordatorios y NO disparar al agente (early return antes de las líneas 99-108).

**Nota del verificador (leer antes de implementar):** CONFIRMADO en código y en producción. Código: recibir.js:254-255 (default sin filtro para 'reaction'/'unsupported'), guardarEntrante incondicional (upsert línea 76 → no_leidos+1, ultimo_entrante, renueva ventana 24h falsa; cancelarRecordatorios:101; dispararAgenteSiActivo:108); el motor no filtra (agente-responder.js:1045 solo pide entrante; 913 arma '[el cliente envió un reaction]'; los atajos sin IA exigen tipo='text' en 1288, así que siempre va a la IA). Producción: 21 reacciones guardadas como entrantes (última HOY 9-jun 15:49) y las 10 más recientes recibieron TODAS respuesta del agente en <3 min a clientes reales ('¿Cuál número te gustó? 😊', '¿Te explico los premios? 😊'...). Sin decisión deliberada en bitácora. Severidad medio justa (pega en recordatorios/ventas y respuestas fuera de lugar diarias, pero sin riesgo de plata). AJUSTES A LA MEJORA: (1) el early return debe ir al INICIO de guardarEntrante (tras interpretarMensaje, línea 69), no 'antes de 99-108' — el no_leidos, el marcado sin-responder y la renovación falsa de ventana_vence_at ocurren en upsertConversacion (línea 76); (2) si se guarda la fila como entrante, una corrida posterior (manual/recordatorio) aún podría responderle — mejor no guardarla o pasar esEntrante=false; (3) para 'unsupported' conviene SÍ sumar no_leidos (el cliente intentó enviar algo; que lo vea un humano) pero sin cancelar recordatorios ni disparar al agente. La mejora no toca candados de dinero: segura.

---

## H27 — registrar_abono y el candado de pago usan ciegamente la ÚLTIMA imagen del chat, aunque no sea el comprobante

**Severidad:** medio · **Dimensión:** Conversación · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:722-727, 467, 1488-1498`

**Evidencia:** Selección .eq('tipo','image').order('timestamp_wa',{ascending:false}).limit(1) (agente-responder.js:722-726); agendarVerificacion guarda ese media_id fijo para todos los reintentos (1488-1498); verificar-pagos-cron reintenta siempre con v.media_id (verificar-pagos-cron.js:88-91); manejarPagoNoVerificado toma la última imagen (agente-responder.js:467).

**Problema:** El flujo de venta pide cédula, y muchos clientes mandan FOTO de la cédula (o cualquier otra imagen) después del comprobante. registrar_abono toma solo la última imagen entrante: la verificación corre contra la foto equivocada, falla, y se agenda 1 hora de reintentos sobre esa misma imagen equivocada; al agotarse, pasa a humano en silencio. Un cliente que SÍ pagó y mandó bien su comprobante queda colgado 'verificando' por culpa de una segunda foto. manejarPagoNoVerificado tiene el mismo sesgo ('Ya recibí tu comprobante' sobre la última imagen, sea lo que sea).

**Mejora propuesta:** Probar las últimas 2-3 imágenes entrantes (de la más reciente hacia atrás) contra buscar-pago hasta que una sea reconocida como comprobante, o agregar a la herramienta registrar_abono un parámetro opcional para que la IA (que SÍ ve las imágenes) indique cuál es el comprobante. Guardar en verificaciones_pago la imagen que el lector reconoció, no la última a ciegas.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código real: registrar_abono toma la última imagen entrante sin filtro alguno (agente-responder.js:723-726, además SIN ventana de tiempo: sirve una imagen de hace días), agendarVerificacion fija ese media_id (1491-1497), el cron reintenta siempre con él (verificar-pagos-cron.js:88-91) y manejarPagoNoVerificado agenda cualquier última imagen como "comprobante" (467, 475). No hay mitigación en otra parte ni decisión deliberada en la bitácora. MATIZ a la narrativa: con una cédula (ilegible como comprobante) registrar_abono NO entra a la hora de reintentos — extraerDatos falla → tipo 'error' → escala a asesor DE INMEDIATO con etiqueta ASESOR (742-746); la ruta "1h colgado + pase silencioso" ocurre (a) si la imagen equivocada sí extrae monto+fecha (no_encontrado→reintentos) o (b) vía manejarPagoNoVerificado, donde incluso una cédula consume los 4 reintentos en 'error' hasta 'rendido'. El efecto neto se sostiene: el cliente que pagó bien pierde el abono automático. MEJORA segura (no debilita candados: coincidencia sólida en abono-agente.js:69 y consumo único de transferencia en api/admin/abono.js:35-43 impiden duplicar abonos al probar varias imágenes), con 2 ajustes: (1) la variante "que la IA señale la imagen" exige etiquetar las imágenes que se le pasan — hoy van sin identificador (construirMensajes:906) y solo ve las últimas 2 (MAX_IMAGENES=2) — y mapear esa etiqueta a media_id; (2) añadir ventana de recencia (24-48h) a la consulta de 723-726. Severidad medio justa: sin riesgo de dinero y con humano siempre alertado, pero reintroduce la espera de horas que los reintentos se construyeron para evitar.

---

## H28 — Todo traspaso a humano depende de que alguien mire la bandeja: no hay aviso activo ni escalamiento si el chat 🆘 envejece

**Severidad:** medio · **Dimensión:** Conversación · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:875-887; api/whatsapp/verificar-pagos-cron.js:121-129`

**Evidencia:** pasar_a_humano: solo update + ponerEtiqueta + nota (agente-responder.js:875-887); mismo patrón en error de abono (744) y en el rendido del cron (verificar-pagos-cron.js:121-129). Ningún archivo del flujo notifica a un humano por un canal activo. (El silencio HACIA EL CLIENTE tras 'rendido' es deliberado — bitácora 9-jun — esto es sobre avisarle al EQUIPO.)

**Problema:** pasar_a_humano, los errores de abono y el 'rendido' del cron solo ponen la etiqueta ASESOR y una nota. Si ningún asesor abre la bandeja (noche, fin de semana, día ocupado), el cliente al que se le dijo 'un asesor te responde por aquí mismo' —o que mandó plata y espera confirmación— puede quedar colgado horas o días sin que nadie del equipo se entere. No existe en el código ningún mecanismo de aviso (mensaje a la línea interna, push, ni cron que detecte chats ASESOR sin respuesta humana tras X minutos). El caso real de la bitácora (cliente esperando ~15 horas) muestra que pasa.

**Mejora propuesta:** Cron ligero (o ampliar etiquetas-estado-cada-5min): detectar conversaciones con etiqueta ASESOR/estado 'humano' cuyo último mensaje siga siendo entrante tras 30-60 min, y mandar UN aviso por WhatsApp a la línea/número interno de Mateo con teléfono y motivo. No es revivir el supervisor LLM: es una consulta SQL + un enviarTexto.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código real. (1) pasar_a_humano (agente-responder.js:875-887), el error de abono (~742-746) y el rendido del cron (verificar-pagos-cron.js:~116-134) solo hacen update+etiqueta ASESOR+nota; ningún archivo del flujo avisa al equipo por un canal activo. Agravante no citado: recibir.js:121 — con estado='humano' el agente ya no se dispara, así que los mensajes siguientes del cliente caen en silencio total. (2) NO está mitigado: el único aviso existente es un ding WebAudio + contador en el título de la pestaña (public/bandeja-whatsapp.html:1068+), que solo funciona con la bandeja ABIERTA y tras un clic previo; el push de api/app/ es para clientes de la app, no para el equipo. La decisión de bitácora del 9-jun (líneas 216-231) cubre SOLO el silencio hacia el cliente, no el aviso al equipo; el caso de ~15 horas es real (BITACORA línea 1003). (3) La mejora es segura (consulta de solo lectura + enviarTexto; no toca candados de dinero) pero necesita DOS ajustes: (a) NO se puede "ampliar etiquetas-estado-cada-5min" — ese cron es una función SQL pura sincronizar_etiquetas_estado() en pg_cron (docs/bandeja-whatsapp-buzon.md:47), no un endpoint Vercel; lo correcto es un endpoint Vercel ligero nuevo llamado por pg_cron con el secreto interno (patrón de verificar-pagos-cron.js); (b) ojo a la ventana de 24h de la Cloud API: un texto libre al número interno de Mateo puede fallar si ese número no le ha escrito a la línea en 24h (mantener sesión viva o usar plantilla), y hace falta un flag de idempotencia para mandar UN solo aviso por chat, no uno cada 5 min. (4) Severidad medio es justa: hay plata real y un caso documentado de 15h, pero los reintentos automáticos ya resuelven el caso más común y la bandeja sí suena cuando está abierta.

---

## H29 — El panel de gasto subfactura la escritura de caché 1h: cobra 1.25x cuando el precio real es 2x (~$0.5-0.8/día sin contar)

**Severidad:** medio · **Dimensión:** Costos/tokens · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:42-46 (PRECIOS), 49-56 (costoUSD), 1368 (ttl '1h'), 1407 (cabecera beta)`

**Evidencia:** PRECIOS: 'claude-sonnet-4-6': { in: 3, out: 15, cw: 3.75, cr: 0.3 } con comentario 'Caché de escritura = 1.25x entrada'. Precio oficial Anthropic: cache write 5m = 1.25x, cache write 1h = 2x. El system usa cache_control { type: 'ephemeral', ttl: '1h' }. 9-jun: 344.463 tok escritos → panel $1.29, real hasta $2.07.

**Problema:** La tabla PRECIOS usa cw: 3.75 (1.25x la entrada) para Sonnet, pero ese multiplicador es SOLO para TTL de 5 minutos. El código pide ttl: '1h' (línea 1368 + cabecera beta extended-cache-ttl), y la escritura de caché a 1 hora cuesta 2x la entrada base: $6/M para Sonnet, no $3.75/M (Opus: $10, Haiku: $2, no $6.25/$1.25). Con 344.463 tokens escritos el 9-jun, el panel mostró $4.02 cuando el gasto real fue ~$4.60-4.80 (subreporte del 13-19%). Todas las decisiones de ahorro (qué fase priorizar, si el caché 'sale gratis') se están tomando con la escritura de caché — la 2ª línea de costo más grande, 32% del día — contada un 37.5% por debajo.

**Mejora propuesta:** Dos pasos: (1) en costoUSD, dejar de usar el total usage.cache_creation_input_tokens con un solo precio y leer el desglose usage.cache_creation.ephemeral_1h_input_tokens (a 2x) y .ephemeral_5m_input_tokens (a 1.25x) cuando venga en la respuesta, con fallback a 2x si solo hay total (es lo conservador, dado el ttl '1h' del breakpoint); (2) guardar ambos campos en agente_uso para poder auditar. Bonus de la misma revisión: con tráfico continuo de día, evaluar si el TTL 1h de verdad gana — a 2x de escritura el 1h necesita ≥3 lecturas por escritura para pagarse vs sin caché, y los datos actuales (11.8k leídos vs 1.4k escritos por llamada) muestran que sí gana, pero hay que medirlo con los precios correctos.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código real y los precios oficiales: agente-responder.js:42-46 cobra cache write a 1.25x (cw:3.75 Sonnet) pero la línea 1368 usa ttl:'1h', cuyo precio oficial es 2x ($6/M Sonnet, $10 Opus, $2 Haiku — verificado en docs de Anthropic). costoUSD (49-56) aplica el precio único a todo cache_creation_input_tokens y el panel (agente-costo.js → RPCs que suman costo_usd guardado) hereda el error. Matemática verificada: 9-jun $1.29 vs $2.07 real (~$0.78/día, panel $4.02 vs ~$4.80, 16%); 8-jun fue peor ($2.19, ~22%). A precios correctos el cache write es la línea MÁS grande del 9-jun (43%), no la 2ª. La bitácora documenta el cambio a 1h (8-jun) sin ajustar el precio — descuido, no decisión deliberada. La mejora es correcta y segura: usage.cache_creation.ephemeral_1h/5m_input_tokens existen (confirmado en docs, el total es la suma) y no toca ningún candado de dinero. AJUSTES: (1) severidad medio, no alto — es solo medición/reporte: Anthropic factura bien igual, no hay plata en riesgo ni impacto a clientes, magnitud <$1/día; (2) existe arreglo mínimo sin migración: como el único breakpoint es 1h, basta cambiar cw a 6/10/2 (una línea); la versión con desglose es mejor a futuro pero agregar columnas a agente_uso exige recarga de PostgREST y confirmación de escritura en prod; (3) bonus validado: a 2x el 1h necesita ~3 lecturas/escritura y el ratio real es ~8.4 (2.9M leídos/344k escritos) — la decisión de 1h sí gana, solo la medición está mal; (4) limpieza opcional: la cabecera beta extended-cache-ttl-2025-04-11 (líneas 1407/1450) ya no es necesaria, el ttl 1h es GA.

---

## H30 — Las 2 imágenes recientes se re-descargan y re-facturan a precio lleno en cada llamada, incluso después de asignado el pago

**Severidad:** medio · **Dimensión:** Costos/tokens · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:38 (MAX_IMAGENES), 1110-1123 (carga), 896-911 (adjunto en construirMensajes), 481-492 (raw.pago_asignado ya disponible)`

**Evidencia:** El filtro de 1112-1123 solo mira dirección/tipo/media_id, sin fecha ni estado de asignación. agente_uso 3 días: p95 input 4.720 tok y máx 7.559 vs mediana 1.643 — la cola coincide con turnos con imágenes.

**Problema:** construirMensajes adjunta en base64 las 2 imágenes entrantes más recientes (MAX_IMAGENES=2) en CADA llamada y CADA vuelta del bucle, sin caducidad ni filtro: un comprobante ya verificado y marcado con raw.pago_asignado se sigue mandando (~1.1-1.6k tokens por imagen a $3/M, en messages, nunca cacheado) en todos los turnos siguientes de la conversación mientras siga entre las 2 más recientes — que puede ser el resto de la rifa si el cliente no manda más fotos. Es la principal explicación de la cola de entradas caras (p95 de input 4.7k vs mediana 1.6k). Además se re-descarga de Meta en cada corrida (latencia).

**Mejora propuesta:** En el bucle de carga (1112-1123), saltar imágenes que: (a) ya tienen raw.pago_asignado en el mensaje (la marca ya existe, la pone marcarComprobanteAsignado:481-492), o (b) son más viejas que ~48h. El texto '[el cliente envió un image]' queda como rastro en el historial, y si de verdad se necesita re-ver una foto vieja, el flujo de registrar_abono usa media_id directo de la base (723-727), no la visión del modelo. Ahorro: ~1.2-3k tokens a precio lleno por llamada en todos los turnos posteriores al pago de cada cliente que pagó.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra código y producción. Código: el bucle 1112-1123 solo filtra direccion/tipo/media_id (sin fecha ni pago_asignado) y re-descarga de Meta en cada corrida; construirMensajes 896-911 adjunta el base64; el bucle de IA re-envía messages completo por vuelta y el único cache_control está en el system (línea 1368), así que las imágenes van a $3/M siempre. Datos (agente_uso 3 días, solo lectura): 674 llamadas, p50 1.643 / p95 4.710 / máx 7.559 (idéntico a la evidencia); llamadas en conversaciones con imagen previa: p50 4.503 / p95 6.551 (96 llamadas) vs p50 1.611 / p95 2.890 (578 sin imagen) — la cola cara ES la de imágenes; 38 de 96 tenían la última foto con >2h (~150k tok en 3 días). No hay mitigación en otra parte ni decisión deliberada en la bitácora (el chip pago_asignado se describe como "solo informativo"). Mejora segura (no toca candados: esContextoPago y manejarPagoNoVerificado leen metadatos de reales, y registrar_abono usa media_id de la base, 723-727), PERO con 2 ajustes: (1) el select del historial (línea 1034) NO trae raw — añadirlo para poder filtrar por pago_asignado; (2) el filtro (a) hoy casi no muerde: solo 1 de 78 imágenes entrantes (14 días) está marcada, porque el cron de reintentos (verificar-pagos-cron.js:94-100) nunca llama marcarComprobanteAsignado al abonar (tiene conversacion_id y media_id disponibles) y la marca solo existe desde el 8-jun; conviene marcar también ahí, y mientras tanto el corte de 48h (b) es el que ahorra de verdad. Severidad medio justa: ~5-10% del gasto diario evitable (~$0.3-0.5/día sobre $4-8) más latencia de re-descarga; no es crítico ni alto porque no toca dinero ni corrección, solo costo/latencia.

---

## H31 — Candado anti pago falso v2: formulaciones plausibles de confirmación que los patrones no cubren

**Severidad:** medio · **Dimensión:** Dinero · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:418-447`

**Evidencia:** afirmaPagoHecho cubre 'pagada al 100', 'quedó pagada', 'ya está pagada', 'registré tu abono', 'tu pago fue registrado', 'pago confirmado'. NO cubre formulaciones que el modelo produce con naturalidad en contexto de pago: 'recibí/recibimos tu pago', 'tu pago/abono entró', 'el abono se aplicó/se acreditó', 'tu plata ya quedó en la boleta', 'listo, quedó todo en orden con tu pago'. Además el marcador condicional COND (línea 426) incluye `\bsi\b`, de modo que una frase afirmativa como 'si revisas tu boleta, ya está pagada' queda desarmada ('si revisas tu boleta ' precede el match sin puntuación).

**Problema:** El candado es el último respaldo contra el caso real del 9-jun (decir 'pagada' sin abono y dejar $100.000 sin asignar). Con estas frases fuera de los patrones, una confirmación falsa equivalente pasa derecho al cliente sin bloqueo, sin nota y sin etiqueta ASESOR.

**Mejora propuesta:** Ampliar PATRONES con: recib(i|imos) (tu|su|el) (pago|abono|transferencia|consignacion); (tu|su|el) (pago|abono) (ya )?entro; se (aplico|acredito|abono) (tu|su|el) (pago|abono); y excluir 'si' de COND cuando va seguido de un verbo en presente indicativo común (o quitar 'si' de COND y cubrir el condicional real con 'si pagas/si abonas/si quedara'). Acompañar con una mini-lista de frases de prueba (deben bloquear / deben pasar) para no regresar al sobre-bloqueo de la versión vieja.

**Nota del verificador (leer antes de implementar):** CONFIRMADO ejecutando la regex real de agente-responder.js:418-447 contra las frases citadas: 'recibí/recibimos tu pago', 'tu pago ya entró', 'el abono se aplicó/se acreditó', 'tu plata ya quedó en la boleta', 'listo, quedó todo en orden con tu pago' y 'tu transferencia llegó' PASAN sin bloqueo; no hay mitigación en otra capa (debeBloquear línea 1400 depende solo de afirmaPagoHecho; supervisor eliminado a propósito; si el texto pasa no se agenda verificación ni ASESOR). El claim del '\bsi\b' en COND (línea 426) es real pero MARGINAL: solo desarma sin puntuación ('Si revisas tu boleta ya está pagada' pasa), mientras que con coma o '¡Sí!' SÍ bloquea — probado. Severidad medio es justa: es el último respaldo de un caso real, pero el dinero no se mueve en falso y existen capas de detección a posteriori (menú Comprobantes 'sin asignar', transferencias LIBRE). Ajustes a la mejora: (1) al patrón recib(i|imos) agregarle \b inicial y excluir negación previa (no|aun no|todavia no|nunca) para no re-sobre-bloquear respuestas verdaderas tipo 'aún no recibimos tu pago' (la bitácora 9-jun exige probar frases nuevas contra ventas normales); mantener 'comprobante' FUERA de la lista (el mensaje seguro dice 'recibí tu comprobante'). (2) Descartar la sub-propuesta de 'si + presente indicativo' (frágil); dejar 'si' en COND y aceptar el residuo sin puntuación. La mejora no debilita ningún candado (solo agrega patrones). Mantener la mini-lista de pruebas deben-bloquear/deben-pasar.

---

## H32 — Comprobante ajeno reciclado: la coincidencia por referencia confía 100% en una imagen aportada por el cliente

**Severidad:** medio · **Dimensión:** Dinero · **Esfuerzo:** medio

**Archivo:** `api/lib/abono-agente.js:59-86 y api/whatsapp/buscar-pago.js:158-204`

**Evidencia:** La razón 'Coincide la referencia' (la más fuerte) se construye solo con datos extraídos por IA de la foto que manda el cliente; no se valida que la transferencia tenga relación con ESE cliente (la razón 3, teléfono en la referencia, solo aplica si las otras no matchearon primero). verificarYAbonar abona automáticamente al destino conSaldo[0] del cliente que mandó la foto (líneas 69-86).

**Problema:** Quien consiga el comprobante de OTRO cliente (screenshot compartido en grupos de WhatsApp de la rifa, algo común al celebrar pagos) puede reenviarlo desde su chat: monto+fecha+referencia coinciden con una transferencia LIBRE real → el sistema abona la plata del otro a la boleta del defraudador, sin humano. Cuando el dueño real mande su comprobante, su transferencia ya estará ASIGNADA y terminará en 'rendido'.

**Mejora propuesta:** Endurecer (sin debilitar nada): cuando la razón sea 'Coincide la referencia' o 'Misma hora y plataforma' Y la referencia de la transferencia contenga un teléfono de 10 dígitos que NO es el del chat, NO abonar solo — dejarla para asesor con nota explicando el conflicto. Opcional: extraer también el nombre del titular en lib/comprobante.js y compararlo con el nombre del cliente como señal adicional.

**Nota del verificador (leer antes de implementar):** CONFIRMADO en código actual: buscar-pago.js:177-185 elige "Coincide la referencia" solo con datos IA de la foto del cliente, sin amarrar la transferencia al teléfono del chat (razón 3 solo corre si 1-2 fallan), y abono-agente.js:69-86 abona automático a conSaldo[0] del remitente. La cola de reintentos (~1h) incluso deja al defraudador adelantarse a la carga del banco. Mitigación parcial real: abono.js:43 exige LIBRE (consumo único) → una estafa por transferencia y el dueño real termina en 'rendido'+ASESOR (verificar-pagos-cron.js:112-130), o sea el fraude se detecta después con rastro, no es pérdida silenciosa. No es decisión deliberada de la bitácora. Severidad medio es justa (requiere screenshot ajeno + boleta con saldo a nombre del atacante + ganar la ventana LIBRE). AJUSTE A LA MEJORA: la heurística "referencia contiene teléfono de 10 dígitos ≠ chat" es defectuosa — las referencias Bancolombia son números de aprobación de 10 dígitos que suelen empezar por 3 (ejemplo del propio comprobante.js:23: '3186425497'), generaría falsos positivos masivos y desviaría a asesor abonos legítimos. Corregir: retener solo si el número embebido coincide con el teléfono de OTRO cliente registrado en la base, o limitar el chequeo a Nequi/Daviplata (donde la referencia sí es celular). La parte opcional (extraer titular en comprobante.js y compararlo con el nombre del cliente) es el complemento correcto para Bancolombia. Nada de esto debilita candados existentes.

---

## H33 — El candado expira a los 60s pero el bucle de IA nunca lo refresca: corridas solapadas en turnos largos

**Severidad:** medio · **Dimensión:** Escala/robustez · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1401-1457 (refresh solo en 1009)`

**Evidencia:** agente_tomar_lock (verificado en la base) roba el candado si `agente_procesando_at < now() - interval '60 seconds'`. agente_refrescar_lock SOLO se llama dentro del debounce (1009). El bucle posterior — hasta 6 llamadas a Claude (1405) + herramientas con pausas de 600-800ms (517, 521) + envíos — supera los 60s con facilidad y no refresca nunca.

**Problema:** Si el cliente escribe OTRO mensaje cuando la corrida lleva >60s en el bucle, el webhook dispara una segunda corrida que ROBA el candado (lo cree muerto), pasa su propio debounce y responde EN PARALELO. El claim anti-duplicado (1058-1090) solo bloquea el MISMO hasta_ms; un mensaje nuevo tiene hasta_ms mayor y pasa. Resultado: dos Lilianas intercaladas en el mismo chat, con posibilidad de acciones duplicadas (ej. dos números apartados).

**Mejora propuesta:** Llamar agente_refrescar_lock al inicio de cada iteración del bucle y después de ejecutar cada herramienta. La RPC ya existe y es un UPDATE de una fila; el cambio son 2 líneas.

**Nota del verificador (leer antes de implementar):** CONFIRMADO con evidencia: (a) RPC agente_tomar_lock leída en vivo de Supabase roba el candado a los 60s exactos; (b) agente_refrescar_lock solo se llama en agente-responder.js:1009 (debounce) — los únicos call sites de candado son 984/1009/1474, el bucle 1401-1457 nunca refresca; (c) maxDuration=300 en vercel.json permite corridas largas, y el hueco es PEOR que lo reportado: entre el último refresh y el bucle también corren historial + hasta 4 transcripciones Whisper + descarga de imágenes sin refresco; (d) agente_claim_respuesta (leída en vivo) gana con agente_respondido_ms < p_hasta_ms, así que un mensaje nuevo pasa; (e) no es decisión deliberada — el comentario en 1007-1008 muestra que el autor conocía el riesgo y solo protegió el debounce. SEVERIDAD AJUSTADA a medio: la cadena exige varias coincidencias (corrida >60s sin enviar nada + mensaje nuevo en esa ventana + B sobrevive su debounce de 30s sin que A envíe antes de que B lea historial — si A envía, B se sale en 1004/1045), y el dinero tiene candados aguas abajo (transferencia se consume una vez; api/rifa/reservar.js:104-108 rechaza números ocupados, aunque es check-then-update). Daño realista: dos Lilianas intercaladas y gasto doble, no pérdida directa de plata. MEJORA: correcta y segura (no toca candados de dinero), con 2 ajustes: agregar también UN refresco tras el claim (~línea 1090) para cubrir la fase Whisper/imágenes; y documentar el efecto secundario: con el candado sostenido, un mensaje que llegue a mitad de corrida quedará sin respuesta (B sale en 988 y recibir.js no reintenta) — conecta con el pendiente conocido de "respuestas en null"; idealmente A debería re-chequear mensajes nuevos antes de soltarLock.

---

## H34 — Presupuesto de tiempo: debounce de hasta 4 min + transcripciones + 6 vueltas de IA dentro de los 300s de maxDuration, y ninguna llamada externa tiene timeout

**Severidad:** medio · **Dimensión:** Escala/robustez · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:35, 995-1012, 1094-1123, 1401-1457; vercel.json:43-45`

**Evidencia:** DEBOUNCE_MAX_MS=240000 (4 min) corre dentro del MISMO handler que tiene maxDuration 300. Después del debounce vienen: hasta 4 transcripciones Whisper secuenciales (1094-1105), hasta 2 descargas de imágenes (1110-1123), hasta 6 llamadas a Claude y los envíos. Ninguna llamada externa lleva AbortSignal: ni Anthropic (1405), ni Whisper (269), ni los POST internos a /api/rifa/reservar, /api/admin/abono, buscar-pago (llamarApi 292-300 y abono-agente.js:48-57), ni los envíos a Meta (lib/whatsapp.js).

**Problema:** Con una ráfaga larga del cliente quedan <60s para todo el bucle; una sola llamada lenta o colgada (buscar-pago lee la imagen con IA y puede tardar 30-60s) agota maxDuration y Vercel MATA la función a medias. Qué queda a medias: mensajes parciales enviados, abono REGISTRADO sin confirmación al cliente, número apartado sin que corra la red de seguridad de enviar_boleta (1461-1463), candado colgado 60s. Y nadie reintenta el turno.

**Mejora propuesta:** Medir el tiempo transcurrido desde el arranque y (1) salir del debounce si quedan <120s de presupuesto, (2) bajar DEBOUNCE_MAX_MS a ~120s, (3) poner AbortSignal.timeout a las llamadas externas (Anthropic ~90s, Whisper ~30s, llamarApi/Meta ~30s) para que un cuelgue se convierta en error manejable y no en muerte por timeout.

**Nota del verificador (leer antes de implementar):** Confirmado línea por línea: DEBOUNCE_MAX_MS=240000 (agente-responder.js:35) dentro del handler con maxDuration 300 (vercel.json:44); tras el debounce (996-1012) vienen hasta 4 Whisper secuenciales (1093-1105), 2 imágenes (1108-1123) y hasta 7 llamadas a Claude (MAX_ITER=6 + camino apagado), y NINGÚN fetch del camino del agente lleva AbortSignal (Anthropic 1406, Whisper 269, llamarApi 292-300, abono-agente.js post 48-57, lib/whatsapp.js); los únicos timeouts del repo son los 1500ms de los disparos internos. La red de seguridad enviar_boleta (1459-1463) y soltarLock quedan después del bucle, y ningún cron reintenta un turno muerto. La bitácora no lo cubre como decisión deliberada. PERO bajo severidad a MEDIO: (a) cero riesgo de dinero — el abono queda bien registrado y el candado "una transferencia se consume UNA vez" impide duplicados; (b) el candado se autorrecupera a los 60s; (c) el peor caso exige ráfaga continua de ~4 min (que según el propio código ningún cliente alcanza) o un cuelgue real, y un turno de pago normal cabe holgado en 300s; (d) sin evidencia de ocurrencia en producción; el daño es cliente en silencio hasta que vuelva a escribir, no plata perdida. CORRECCIÓN a la mejora: las partes (1) salir del debounce con <120s y (2) bajar DEBOUNCE_MAX_MS a ~120s son seguras y correctas, y Anthropic ~90s / Whisper ~30s / Meta ~30s están bien; pero el timeout de ~30s para llamarApi/post es un error que contradice la propia evidencia (buscar-pago tarda 30-60s leyendo la imagen con IA): abortaría verificaciones legítimas y las mandaría a "pásalo a un asesor". Para llamadas de dinero usar ~90-120s y, clave, abortar el lado cliente NO cancela el servidor — ante timeout de abono el agente debe decir "estoy verificando tu pago" y agendar verificación (verificaciones_pago), nunca afirmar que falló ni reintentar a ciegas. Con ese ajuste la mejora no debilita ningún candado de dinero.

---

## H35 — Métricas de embudo: contacto → premios → números → apartado → abono → pagada

**Severidad:** medio · **Dimensión:** Estrategia · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:60-71`

**Evidencia:** agente_uso solo guarda tokens y dólares (agente-responder.js:60-71). Los datos crudos del embudo YA quedan grabados como notas estandarizadas — 'Envié el contacto inicial' (1270), 'Expliqué los premios' (1303), 'Mostré los números' (1317), 'Pedí los datos' (1331), 'Aparté el número' (685), 'Registré un abono' (736) — y la venta queda atribuida con boletas.asesor='Liliana' (682, 8.3 de la doc) — pero nada los agrega.

**Problema:** Mateo solo mide el COSTO de la IA (agente_uso), no su RESULTADO: no sabe en qué paso del embudo se caen los clientes (¿después de ver los premios?, ¿al pedirles datos?, ¿entre apartar y abonar?), ni qué % de los contactos convierte Liliana frente a los vendedores humanos. Sin eso, las decisiones sobre el manual y los atajos se toman a ojo, y no se puede saber si una edición del manual mejoró o empeoró la conversión.

**Mejora propuesta:** Función SQL agregadora (mismo patrón de agente_costo_resumen, §8.12) que cuente conversaciones que alcanzaron cada hito parseando agente_actividad/notas (o, más limpio, insertando un evento tipo='paso' en agente_actividad en cada hito: un insert de una línea en 6 puntos del motor), cruzada con boletas por asesor para conversión y ticket promedio Liliana vs humanos. Tarjeta 'Embudo (7/30 días)' junto al Gasto de IA en la cabina. Con esto cada cambio del manual se evalúa con números, no con sensaciones.

**Nota del verificador (leer antes de implementar):** Confirmado contra el código real. agente_uso solo guarda costo (agente-responder.js:60-71); los 6 hitos del embudo existen como notas en las líneas citadas (652/1270, 1303, 1317, 1331, 685, 736) y la venta queda atribuida en boletas.asesor (682). Hallazgo clave que mejora la propuesta: TODAS las notas ya caen centralizadas en agente_actividad (tipo='nota', resumen, líneas 399-403), así que la función SQL puede agregar sobre esa tabla con patrones LIKE e incluso backfillear el histórico sin tocar el motor; el evento tipo='paso' es opcional (y si se hace, son ~8-10 puntos, no 6, porque el texto difiere entre ruta-IA y atajo). No hay duplicación: el único "embudo" existente (rescate-whatsapp.js:347-418) cuenta suscriptores de ChateaPro por tags, otra plataforma/líneas; las etiquetas Separada/Abonada/Pagada son estado actual, no eventos del embudo. Mantenible: clona el patrón vivo de §8.12 (agente_costo_resumen → agente-costo.js → tarjeta en cabina), solo lectura, sin tocar candados de dinero. Severidad medio (no alto): es medición, no arreglo — habilita decidir con números el adelgazamiento del manual (fase 5 pendiente) y el remarketing, pero con 246-416 llamadas/día las muestras son chicas: sirve para tendencias semanales, no para A/B por edición del manual como promete la propuesta. Comparación Liliana vs humanos solo válida en conversión y ticket (los humanos no dejan notas de hitos).

---

## H36 — Reestructurar el manual: dos secciones reclaman prioridad máxima a la vez y las reglas clave están duplicadas hasta 4 veces

**Severidad:** medio · **Dimensión:** Estrategia · **Esfuerzo:** medio

**Archivo:** `/tmp/manual-liliana.txt:9,200`

**Evidencia:** /tmp/manual-liliana.txt — supremacía doble: líneas 9 y 200. Acumulado repetido: 15-19, 32-34, 202 y 204-205. Tuteo: 11-13 y 51. Cédula/correo: 67, 113 y 190. Sueldazo: 21-22 y 62. La sección 'CORRECCIONES IMPORTANTES' (200-205) es íntegramente re-declaración de reglas que ya están arriba.

**Problema:** Profundiza el pendiente conocido 'adelgazar el manual' con evidencia nueva: el problema no es solo tamaño sino ESTRUCTURA. Hay dos secciones que reclaman supremacía simultánea — la línea 9 ('por encima de todo lo demás') y la línea 200 ('CORRECCIONES IMPORTANTES... por encima de lo anterior') — dejando la precedencia formalmente ambigua para el modelo. Y el patrón de crecimiento es por parches: cada incidente APPENDEA una regla en vez de editar la existente, por lo que la regla del acumulado vive en 4 sitios, la del tuteo en 2, la de cédula/correo en 3 y la del Sueldazo en 2, con redacciones que divergen entre sí. Cada duplicado es una oportunidad de contradicción futura y garantiza que el manual siga engordando.

**Mejora propuesta:** Una pasada única de consolidación (no goteo de ediciones: el caché de 1h se reescribe igual con cualquier cambio, así que consolidar todo de un golpe no cuesta extra): UNA sola jerarquía explícita (1. reglas duras, 2. datos de la rifa, 3. camino de venta, 4. casos especiales), cada regla declarada UNA sola vez en su nivel, y eliminar la sección de 'correcciones' fusionando su contenido donde corresponde. Publicarla SOLO después de pasar la suite dorada (hallazgo 1) y con el versionado (hallazgo 2) como red. Adoptar la disciplina de 'editar la regla existente, nunca appendear' para futuros incidentes.

**Nota del verificador (leer antes de implementar):** Confirmado contra /tmp/manual-liliana.txt: doble supremacía real (líneas 9 y 200), acumulado en 4 sitios (15-19, 32-34, 202, 204-205), tuteo x2, cédula/correo x3, Sueldazo x2; 'CORRECCIONES' es re-declaración salvo la regla del número del chat (201), que debe preservarse al fusionar. Evidencia EXTRA que refuerza: ya existe tensión activa, no solo riesgo futuro — línea 17 ordena mencionar siempre ambas cifras ($5M base + acumulado) y línea 205 prohíbe mezclarlas en una conversación, sin jerarquía que resuelva el choque; además 16-17 incrustan '$20.000.000' como ejemplo que quedará obsoleto, contra el 'di solo el monto del sistema' de 18/204. Economía verificada en agente-responder.js:1368: el manual entero es un solo bloque cacheado 1h, cualquier edición reescribe el mismo prefijo, así que consolidar de un golpe no cuesta extra. Aporta lo nuevo permitido sobre el pendiente #5 (estructura, no solo tamaño). Ajustes a la mejora: (1) la condición de publicar solo tras suite dorada + versionado es BLOQUEANTE, no recomendación — prompt en vivo con dinero real; (2) preservar línea 201 al eliminar la sección de correcciones; (3) aprovechar la pasada para alinear la descripción de apartar_numero ('OPCIONALES') con la regla consolidada de cédula/correo, matando dos pendientes. Queda en medio: duplicados hoy mayormente consistentes, ahorro en dólares modesto (centavos/día), valor principal es prevenir contradicciones y frenar el engorde — higiene importante, no transformadora.

---

## H37 — trasladar_abono mueve dinero en 7 pasos sin transacción ni candado de concurrencia

**Severidad:** medio · **Dimensión:** Extra (crítico de completitud) · **Esfuerzo:** medio

**Archivo:** `/Users/mateoplatabuitrago/los-platas-rifas/api/admin/trasladar-abono.js:96-137`

**Evidencia:** Líneas 97-115: bucle de update/insert sobre abonos; 117-128: recalc de saldos en llamadas posteriores; 130-137: reapunte de transferencias; no hay transacción, lock ni reintento. El monto a mover se decide con abonosOrigen leídos en la línea 67, antes de los updates.

**Problema:** El traslado (herramienta de riesgo 'alto' que Liliana ejecuta sola) actualiza abonos UNO POR UNO, luego recalcula saldos de ambas boletas y luego reapunta transferencias, todo en llamadas separadas sin transacción: un timeout/crash a mitad deja abonos movidos con saldos sin recalcular (total_abonado/saldo_restante falsos en ambas boletas, que son la base de candados como 'liberar solo con $0' y del candado anti pago falso). Además lee los abonos de origen y decide DESPUÉS: dos traslados simultáneos (o un traslado cruzado con un abono del cron) pueden partir/mover el mismo abono dos veces. Ninguna otra dimensión cubrió este endpoint.

**Mejora propuesta:** Mover los pasos 5-7 a una función SQL (RPC) transaccional en Postgres (mismo patrón que ya se usó para los candados del agente), o como mínimo recalcular saldos dentro de la misma función que mueve los abonos y releer los abonos con un filtro de versión (updated_at) antes de cada update.

**Nota del verificador (leer antes de implementar):** CONFIRMADO en trasladar-abono.js: pasos 5-7 (l.96-137) sin transacción ni lock; un crash entre mover abonos y recalcular deja total_abonado/saldo_restante falsos, y la cadena de impacto es real (el candado de liberar lee boletas.total_abonado en agente-responder.js:765 y liberar-boleta.js:83 BORRA los abonos → dinero movido puede borrarse). Agravante no citado: los update/insert del bucle ignoran errores (nadie chequea .error; l.102,106-112) — en la rama "partir", si falla el update de origen pero entra el insert de destino se DUPLICA dinero sin crash. AJUSTE (mitad de concurrencia sobredimensionada): el endpoint solo lo llama el agente y el motor serializa por conversación vía RPC agente_tomar_lock (l.984-986, refresco l.1009); como ambas boletas deben ser del mismo cliente (= misma conversación), "dos traslados simultáneos del mismo abono" está casi siempre bloqueado (el lock es best-effort, l.987). El cron NO puede partir/mover el mismo abono dos veces (no está en abonosOrigen y el recalc relee); su riesgo real es un lost update sobre total_abonado porque admin/abono.js actualiza incremental desde lectura vieja (l.48→149-150). Bitácora: sin decisión deliberada que lo cubra; el patrón RPC de candados (entrada 2026-06-06) es el precedente correcto. MEJORA, 2 correcciones: (1) mover solo pasos 5-7 al RPC deja vivo el TOCTOU — la relectura de abonos y las validaciones (mismo cliente, tope saldo destino) deben ir dentro de la transacción; (2) no hay evidencia de updated_at en abonos (ningún SQL del repo la define): usar update condicional sobre el monto actual o ir directo al RPC; y el RPC necesita GRANT EXECUTE al rol real (el agente corre como anon, bitácora l.1037-1039). Severidad medio justa: consecuencia grave pero ventana chica, traslados infrecuentes y concurrencia mayormente mitigada.

---

## H38 — Los candados RPC y el esquema real del agente NO están versionados en el repo (sql/ está obsoleto)

**Severidad:** medio · **Dimensión:** Extra (crítico de completitud) · **Esfuerzo:** bajo

**Archivo:** `/Users/mateoplatabuitrago/los-platas-rifas/sql/agente.sql:1-57`

**Evidencia:** grep de agente_tomar_lock/agente_claim_respuesta/verificaciones_pago en sql/ devuelve cero resultados; agente-responder.js:984-1009 y 1062-1063 dependen de esos RPCs; sql/whatsapp-buzon.sql:17 'telefono text not null unique' contradice recibir.js:199-204 ('chat único por línea + teléfono'); docs/bandeja-whatsapp-buzon.md:47 confirma que sincronizar_etiquetas_estado() solo existe en la base.

**Problema:** Toda la lógica crítica que vive en la base es invisible al repo: las funciones del candado anti-duplicado y anti-doble-respuesta (agente_tomar_lock, agente_claim_respuesta, agente_refrescar_lock, agente_soltar_lock), agente_costo_resumen/agente_costo_chat, sincronizar_etiquetas_estado, bandeja_filtrar, difusion_audiencia, los 4 jobs de pg_cron, y tablas enteras (recordatorios, verificaciones_pago, agente_uso, disparadores, plantillas_whatsapp, lineas_asesores, asesores_config). El sql/ del repo está además DESACTUALIZADO: whatsapp-buzon.sql declara telefono UNIQUE global y sin linea_id, cuando el código exige unicidad por línea+teléfono. Nadie puede revisar (auditar) la semántica del candado del dinero, ni reconstruir la base tras un accidente, ni detectar un cambio manual en esas funciones.

**Mejora propuesta:** Volcar el esquema y las funciones actuales de producción a archivos sql/ del repo (pg_dump --schema-only + las CREATE FUNCTION de los RPCs y los cron.schedule), y adoptar la regla de que todo cambio en la base pase primero por un archivo en sql/. Esfuerzo de una sentada, valor permanente.

**Nota del verificador (leer antes de implementar):** CONFIRMADO con evidencia: grep de los 4 RPCs del candado, agente_uso, verificaciones_pago, sincronizar_etiquetas_estado, bandeja_filtrar, difusion_audiencia y cron.schedule en sql/ da cero resultados, y no existe ningún CREATE FUNCTION en el repo; el motor sí los llama (agente-responder.js:985, 1009, 1063 y 1474 — la cita 984-1009/1062-1063 es exacta). sql/whatsapp-buzon.sql:17 declara telefono UNIQUE global sin linea_id, contradiciendo recibir.js:199-204 (unicidad por línea+teléfono). No es decisión deliberada: la bitácora (1055-1078) documenta el porqué de los RPCs pero no su SQL; la decisión "el manual vive en la base" es del prompt, que pg_dump --schema-only ni exportaría. Severidad medio es justa (no hay falla activa; Supabase tiene backups y la bitácora preserva la intención, pero la semántica del candado del dinero es inauditables y un .sql del repo contradice el código). Ajustes a la mejora: (1) los comandos de cron.job llevan el secreto interno que llama a Vercel — REDACTARLO antes de commitear (igual revisar secretos en cuerpos de funciones); (2) marcar los volcados como instantánea de referencia, nunca re-ejecutarlos a ciegas contra prod; (3) corregir whatsapp-buzon.sql (linea_id + unique compuesto); (4) los jobs de pg_cron son filas de cron.job (datos), capturarlos aparte con select sobre cron.job, como ya insinúa la mejora.

---

## H39 — El secreto interno que dispara el motor reutiliza WHATSAPP_VERIFY_TOKEN, sin rotación, replay ni comparación segura

**Severidad:** medio · **Dimensión:** Seguridad · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:944-951`

**Evidencia:** agente-responder.js:944 (const tokenInterno = process.env.WHATSAPP_VERIFY_TOKEN; comparación con ===); recibir.js:163-167 envía interno: verifyToken; recordatorios-cron.js:107-109 y verificar-pagos-cron.js:52-54 usan el mismo token.

**Problema:** El campo 'interno' que autoriza llamar al motor y a los crons es el MISMO WHATSAPP_VERIFY_TOKEN del webhook (agente-responder.js:944-945; recibir.js:163-167; agente.js:234-239; recordatorios-cron.js:107-109; verificar-pagos-cron.js:52-54). Ese token: (1) es una 'palabra secreta que tú inventas' de baja entropía elegida para ser memorable (whatsapp.js:12), (2) se configura en el panel de Meta, ampliando quién lo conoce, y (3) se compara con === no constante en tiempo. Quien lo obtenga puede POSTear a /api/whatsapp/agente-responder con telefono+linea_id arbitrarios y disparar el motor de IA sobre cualquier conversación activa cuantas veces quiera (gasto de API, acciones forzadas), o lanzar los crons a discreción. Reutilizar el token de bajo valor del handshake como llave de ejecución del motor es un desajuste de privilegios. No hay marca de tiempo/nonce que impida replay.

**Mejora propuesta:** Crear una variable dedicada de alta entropía (ej. AGENTE_INTERNO_SECRET = 32 bytes aleatorios) distinta del verify token, y usarla en recibir.js/agente.js/crons/agente-responder.js. Comparar con crypto.timingSafeEqual. Opcional: firmar el cuerpo con HMAC e incluir un timestamp con ventana corta para cortar replay. Mantener el WHATSAPP_VERIFY_TOKEN SOLO para el handshake GET de Meta.

**Nota del verificador (leer antes de implementar):** Confirmado en código y docs. El secreto que autoriza el motor y los crons ES el mismo WHATSAPP_VERIFY_TOKEN del handshake de Meta: agente-responder.js:944 (`const tokenInterno = process.env.WHATSAPP_VERIFY_TOKEN`, comparado con `===`); recibir.js:163-167 (`interno: verifyToken` de configWhatsapp); agente.js:234-239; recordatorios-cron.js:107-109 y verificar-pagos-cron.js:52-54 (`interno !== verifyToken`). Su valor real es `losplata-buzon-2026` (baja entropía, memorable, también en el panel de Meta) — bandeja-whatsapp-buzon.md:155 y whatsapp.js:12. No es una decisión deliberada en la bitácora.

Bajo la severidad de ALTO a MEDIO: (1) No hay vía de fuga pública del token; solo lo conocen admins de la app de Meta y la env de Vercel, no se expone en respuestas ni tráfico normal (Meta lo envía solo en el GET handshake por HTTPS), así que el ataque exige conocer/adivinar el secreto. (2) Los candados de dinero NO se saltan: disparar el motor solo re-procesa la conversación REAL ya existente; el atacante no inyecta texto ni fuerza abono con datos falsos, y el abono se consume una sola vez con verificación contra banco. El daño realista es quemar gasto de API (DoS de billetera) y abusar de los crons, no robo de dinero. (3) El ángulo de comparación no-constante-en-tiempo es real como mala práctica pero impráctico de explotar en serverless de Vercel (latencia variable/cold starts). Sigue siendo un desajuste de privilegios legítimo (secreto reutilizado, de baja entropía, sin compare seguro ni anti-replay) que vale la pena corregir.

La mejora es segura (no debilita candados de dinero) y correcta, con dos precisiones: (a) crypto.timingSafeEqual LANZA si los buffers difieren en longitud — envolver con chequeo de longitud previo; (b) cambiar el secreto obliga a actualizar de forma ATÓMICA los cuerpos `net.http_post` de los pg_cron en Supabase junto con la env var nueva (AGENTE_INTERNO_SECRET) y los 3 disparadores (recibir.js, agente.js, recordatorios/verificar-pagos), o se rompen los crons y el disparo del agente. Mantener WHATSAPP_VERIFY_TOKEN solo para el GET de Meta es correcto. Esfuerzo bajo en código pero requiere deploy coordinado env+crons.

---

## H40 — Sin límite de tasa en la ruta entrante: un atacante puede inflar el gasto de API a voluntad

**Severidad:** medio · **Dimensión:** Seguridad · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:1401-1457`

**Evidencia:** agente-responder.js:31 (MAX_ITER=6), 1405-1408 (fetch a Claude por iteración), 995-1012 (debounce hasta DEBOUNCE_MAX_MS=240000 refrescando lock); ningún archivo del flujo implementa conteo de tasa.

**Problema:** No hay throttling en ninguna capa del flujo entrante. Como recibir.js no valida firma (ver hallazgo crítico), un atacante puede inyectar mensajes en ráfaga y disparar el motor; cada turno cuesta hasta MAX_ITER=6 llamadas a Claude Sonnet (agente-responder.js:31,1401-1457) más imágenes/Whisper, y el debounce mantiene la función viva hasta 4 minutos refrescando el candado (agente-responder.js:995-1012). El candado por conversación evita corridas concurrentes en UN chat, pero no limita el VOLUMEN entre muchos teléfonos/conversaciones falsificados. Resultado: gasto de API descontrolado y posible agotamiento de cupo serverless (DoS económico).

**Mejora propuesta:** Añadir límites de tasa: por (linea_id, telefono) y por IP en recibir.js/agente-responder.js (ej. máx N corridas por minuto y por hora, contando en una tabla o KV), y un tope de gasto diario por línea que apague el disparo cuando se supere. La firma del webhook (hallazgo crítico) corta el grueso del abuso; el rate-limit es la segunda capa para clientes legítimos abusivos.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra código actual. Hechos verificados: (1) recibir.js no valida firma de Meta (no hay X-Hub-Signature-256; api/whatsapp/recibir.js:23-64). (2) MAX_ITER=6 (agente-responder.js:31) con un fetch a Claude por iteración (1405-1409). (3) Debounce hasta DEBOUNCE_MAX_MS=240000 refrescando el lock (995-1012), y vercel.json fija maxDuration=300 a agente-responder.js → confirma el ángulo de agotamiento de cupo serverless. (4) Los candados son SOLO por conversación: agente_tomar_lock/refrescar/claim/soltar todos reciben p_conv=conv.id (985,1009,1063,1474); no hay conteo global. grep no halló ninguna tabla/contador de tasa ni tope de gasto en el flujo entrante (el único rate-limit del repo está en api/auth/enviar-otp.js, no aplica). AMPLIFICADOR no mencionado: el disparador de la línea 1128258647034751 es tipo 'nuevo_contacto' (confirmado en BD), así que CUALQUIER primer mensaje de un número falso AUTO-prende el agente (recibir.js:115-140) y dispara el motor — no hace falta que el chat ya esté activo. Mitigaciones PARCIALES existentes (no anulan el hallazgo): el lock por chat + debounce solo acotan el costo DENTRO de un chat, y los 4 atajos SIN IA abaratan el camino benigno; pero un atacante que controla el texto los evade trivialmente (mensaje con número/"dónde pago"/>180 chars → primerContactoLoResuelveSaludo() devuelve false → bucle IA hasta 6 llamadas). No hay decisión en la bitácora que descarte rate-limiting (las deliberadas son otras: supervisor Opus, auth por contraseña, RLS). Matiz a la EVIDENCIA: el "más imágenes/Whisper" es más débil con tráfico falsificado (un media_id inventado no se descarga de Meta → sin costo real de visión/Whisper); el costo duro es el de las llamadas a Claude, que sí se incurre. SEVERIDAD medio es JUSTA (no inflada): es DoS económico puro, sin fuga de datos ni bypass de candado de dinero (el abono sigue exigiendo verificación bancaria), y hay techos externos (límites de la org en Anthropic, plan de Vercel) aunque ninguno en la app; además todo el vector colapsa al añadir la firma del webhook (hallazgo crítico aparte), así que esto es defensa en profundidad, secundaria en prioridad. MEJORA: segura, NO debilita ningún candado de dinero (rate-limit y tope son controles aditivos). Dos correcciones técnicas: (a) el límite por IP debe ir en recibir.js sobre x-forwarded-for real, NO en agente-responder.js — esa función la invoca recibir.js internamente y vería la IP de egreso de Vercel, no la del atacante; (b) el "tope de gasto diario que apague el disparo" debe hacer pasar_a_humano/alertar en vez de enmudecer en silencio, para no cortar clientes legítimos que pagan en un día de alto tráfico real.

---

## H41 — reservar.js no tiene autenticación ni rate-limit y confía en el campo 'asesor' del cuerpo

**Severidad:** medio · **Dimensión:** Seguridad · **Esfuerzo:** medio

**Archivo:** `api/rifa/reservar.js:26-39`

**Evidencia:** api/rifa/reservar.js:26-39 (sin validarAsesor/interno), :158 (asesorVenta tomado de req.body.asesor); agente-responder.js:679-684 llama a /api/rifa/reservar sin contrasena.

**Problema:** api/rifa/reservar.js cambia estado (marca boletas como 'Ocupada' a nombre de un cliente) sin pedir ninguna credencial (reservar.js:26-39 solo valida formato). Además toma el vendedor del cuerpo sin verificarlo: asesorVenta = req.body.asesor (reservar.js:158). El agente lo invoca server-to-server SIN contraseña ni secreto interno (agente-responder.js:679-684). Consecuencias para seguridad: (1) cualquiera puede mass-reservar todos los números libres con datos falsos y dejar la rifa sin inventario vendible (DoS de ventas), y (2) cualquiera puede atribuir reservas fraudulentas a 'Liliana' o a cualquier asesor pasando asesor=<nombre>, ensuciando bitácora y métricas. El CORS no protege (peticiones sin Origin pasan, cors.js:54).

**Mejora propuesta:** Es el endpoint público de reserva web, así que no se puede exigir contraseña al cliente, pero sí: (a) ignorar/validar el campo 'asesor' salvo que la llamada traiga el secreto interno (solo el agente debe poder fijar vendedor); por defecto dejar 'Pagina Web'. (b) Añadir rate-limit por IP y un tope de números por petición/ventana para frenar el agotamiento de inventario. (c) Considerar un captcha o token de la página rifa.html para las reservas web.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual. reservar.js:26-39 solo hace aplicarCors + validación de formato; NO llama validarAsesor ni exige secreto interno, y cambia estado (marca boletas 'Ocupada', :160-180). :158 toma asesorVenta = req.body.asesor sin verificar (default 'Pagina Web'). El agente lo invoca con llamarApi (agente-responder.js:292-301, llamada en :683) enviando SOLO Content-Type, sin contraseña ni token → el endpoint es realmente anónimo para cualquiera. cors.js:54 solo bloquea si hay header Origin no whitelisteado; un curl/script sin Origin pasa. No hay rate-limit/captcha en todo api/ (grep vacío) y el array `numeros` no tiene tope superior. Ambas consecuencias son reales: (1) mass-reserva → DoS de inventario, y (2) spoofing de asesor=<nombre> que ensucia registro_movimientos/métricas. NO está mitigado en otra parte: los demás endpoints que toca el agente (liberar-boleta :770, abono, trasladar) SÍ exigen `contrasena`; reservar es el único anónimo. La bitácora 2026-06-08 SOLO decidió que reservar 'acepta' asesor para atribuir ventas a Liliana — no cubre protegerlo del spoofing, así que no es decisión deliberada que invalide el hallazgo.

Matiz que sostiene 'medio' en su extremo BAJO (no inflar a alto): reservar NO toca ningún candado de dinero — pone total_abonado:0, saldo_restante=precio, no registra abono ni verifica banco. El peor caso es DoS de inventario RECUPERABLE (las boletas se pueden liberar) + contaminación cosmética de bitácora/métricas; la liquidación se calcula por abonos (plata recibida), no por boletas Ocupadas sin pago, así que el spoofing de asesor no manipula pagos reales. Aun así, endpoint público anónimo que cambia estado y sin tope de números en un negocio en vivo justifica 'medio'.

Mejora: SEGURA y correcta, no debilita candados. Precisiones técnicas para implementarla: (a) el secreto interno ya existe = process.env.WHATSAPP_VERIFY_TOKEN (lo usa recibir.js→agente-responder.js:944); para que (a) funcione hay que hacer que llamarApi/apartar_numero ENVÍE ese token (hoy no manda nada) y que reservar.js solo honre `asesor` si llega el token, default 'Pagina Web'. (b) el rate-limit por IP en Vercel serverless es stateless → requiere store externo (tabla Supabase/Upstash) = esfuerzo medio; pero un TOPE de numeros.length por request (ej. máx 10-20) es un cambio trivial e inmediato y debería ser la primera defensa. (c) captcha/token de rifa.html = esfuerzo mayor, opcional. Esfuerzo global: bajo para (a)+cap de números; medio si se añade rate-limit por IP real.

---

## H42 — Debounce fijo de 30s: piso de latencia para TODO mensaje, incluso los atajos sin IA

**Severidad:** medio · **Dimensión:** Velocidad · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:34-35,995-1012`

**Evidencia:** DEBOUNCE_MS = 30000 (línea 34) y el bucle de espera en 995-1012 aplica a todo disparo `interno && !recordatorio`. Los atajos sin IA se evalúan DESPUÉS del debounce (líneas 1258-1334), así que también pagan los 30s.

**Problema:** El motor espera 30s de silencio desde el ÚLTIMO mensaje del cliente antes de responder (DEBOUNCE_MS=30000), en TODOS los turnos disparados por webhook. Es el término dominante de la latencia percibida: aun cuando la respuesta sale de un atajo predefinido SIN IA (saludo del primer contacto, premios, números, datos), el cliente espera mínimo ~30-35s. Para el ~88% que llega con el texto del anuncio, la primera impresión es media minuto de silencio. La función del debounce (juntar ráfagas) es deliberada y documentada (docs/bandeja-whatsapp-buzon.md:275), pero lo único aceptado explícitamente ahí es el costo en GB-seg, no este piso de 30s para el cliente; el valor fijo único no distingue entre un mensaje claramente completo y una ráfaga a medias.

**Mejora propuesta:** Sin quitar el debounce: hacerlo adaptativo. Opciones concretas y combinables: (a) bajar el piso a ~10-12s cuando el último mensaje termina en señal de cierre (?, ¿…?, saludo de anuncio exacto, o un asentimiento corto que dispararía un atajo); (b) para el PRIMER contacto resoluble por el saludo predefinido (primerContactoLoResuelveSaludo ya lo detecta en agente-responder.js:533-546), usar un debounce corto de ~8-10s; (c) mantener 30s solo cuando el cliente lleva ≥2 mensajes en la ráfaga actual (ahí sí hay evidencia de que escribe por partes). El anti-duplicado atómico (agente_claim_respuesta) ya protege contra doble respuesta si llega otro mensaje justo después.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual de ~/los-platas-rifas: DEBOUNCE_MS=30000 (agente-responder.js:34) y el bucle 997-1011 aplican a todo disparo `interno && !recordatorio` (línea 995); los atajos sin IA (saludo 1258-1273, premios 1292-1306, números 1309-1320, datos 1326-1334) se evalúan DESPUÉS del debounce, así que el saludo predefinido del ~88% (comentario línea 527) también paga el piso de ~30s. No hay mitigación en otra parte: recibir.js dispara al instante sin espera propia, el valor no es configurable desde agente_config (solo se leen estado/prompt/modelo, líneas 972 y 1127), y la bitácora NO tiene ninguna entrada sobre el debounce (grep sin resultados); el único costo aceptado por escrito es el de GB-seg (bandeja-whatsapp-buzon.md:405). No está en la lista de decisiones deliberadas intocables. PERO la severidad "alto" está inflada → MEDIO: es comportamiento deliberado y documentado (doc:275) con función real (juntar ráfagas), sin riesgo de dinero ni de datos, y ~30s está dentro de lo normal en ventas por WhatsApp (una respuesta instantánea incluso delata al bot). Ajustes a la mejora: (1) la opción (a) "termina en ?" disparará poco — esta clientela casi no usa signos; el valor real está en la opción (b); (2) la (b) tiene un hueco de implementación: primerContactoLoResuelveSaludo se evalúa HOY sobre el historial leído DESPUÉS del debounce (1032-1040), así que hay que pre-leer la cola de entrantes ANTES de esperar y RE-VALIDAR tras la espera corta; si la re-validación falla (el cliente agregó algo que el saludo no cubre), seguir esperando hasta los 30s en vez de ir a la IA temprano; (3) acortar el debounce parte algunas ráfagas en dos respuestas → algo más de llamadas a IA y de costo (Mateo optimiza costo activamente), vigilar agente_uso tras el cambio. La mejora NO debilita candados de dinero: agente_tomar_lock (984-985) y agente_claim_respuesta (1058-1063) son independientes del valor del debounce y siguen evitando la doble respuesta de la misma tanda.

---

## H43 — Las imágenes entrantes se RE-descargan de Meta en cada turno y se re-suben en base64 en CADA iteración del bucle

**Severidad:** medio · **Dimensión:** Velocidad · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:1110-1123,1372,1405-1409`

**Evidencia:** imagenesVistas se reconstruye desde cero cada corrida con descargarMediaBase64 (whatsapp.js:329-346, 2 fetches a graph.facebook.com); construirMensajes (896-911) incrusta el base64 en messages, que se reenvía completo en cada iteración del for de 1401.

**Problema:** En cada corrida, el motor descarga de Meta las últimas 2 imágenes entrantes (2 fetches por imagen: metadata + binario, en serie, líneas 1112-1123) aunque ya se hayan descargado en turnos anteriores — mientras un comprobante siga entre las 2 fotos más recientes, se re-descarga en TODOS los turnos siguientes del chat. Luego ese base64 (potencialmente varios MB) viaja dentro del body de CADA llamada a Claude del bucle (hasta MAX_ITER=6): re-subida de payload y re-cobro de ~1.100-1.600 tokens de imagen por llamada, porque el breakpoint de caché solo cubre tools+manual (1367-1370), no los messages. Suma fácilmente 1-3s por turno en chats con comprobante activo.

**Mejora propuesta:** (1) Persistir el base64 (o un puntero a Supabase Storage) la primera vez que se descarga — p. ej. en raw del mensaje, como ya se hace con la transcripción de audios en 1102 — y reutilizarlo en turnos siguientes. (2) Descargar las 2 imágenes en paralelo (Promise.all) en vez de en serie. (3) Adjuntar imágenes solo cuando el turno lo amerita (esContextoPago ya existe como detector) en vez de siempre que estén entre las 2 últimas.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual: (1) re-descarga en cada corrida sin ventana de tiempo ni persistencia (agente-responder.js:1110-1123, serie; whatsapp.js:334+338 = 2 fetches/imagen); (2) base64 incrustado en messages (896-911) y reenviado en cada iteración (1401/1408 y resp2 en 1451); (3) caché solo cubre system[0] (1367-1370), messages se cobra lleno; (4) no hay mitigación: la bitácora no lo registra como decisión deliberada y nada persiste el base64 (raw.pago_asignado es solo un flag). Ajustes: "varios MB" exagerado (Cloud API comprime, típico 100-400 KB); los ~1.100-1.600 tokens son POR IMAGEN (hasta ~3.200/llamada con 2); el bucle suele correr 1-3 iteraciones, no 6. Mejora segura (no toca candados: manejarPagoNoVerificado usa media_id de reales, no imagenesVistas), con 3 correcciones: (a) persistir en `raw` obliga a ampliar el select del historial (línea 1034 no trae raw) y cargaría filas pesadas en cada turno — preferir puntero a Supabase Storage (bonus: los media_id de Meta caducan ~30 días); (b) la opción de esContextoPago casi no cambia comportamiento porque una imagen en los últimos 12 mensajes ya lo activa (línea 456) — solo deja de adjuntar fotos viejas, el caso desperdiciado; (c) FALTA la mitigación más barata: cache_control en el último bloque de messages (la beta TTL 1h ya está activa) elimina el re-cobro entre iteraciones/turnos sin persistir nada. Severidad medio es justa: costo+latencia recurrente en chats de pago, sin riesgo de dinero.

---

## H44 — Turno de registrar_abono: el mismo comprobante se descarga 2 veces y se lee con una SEGUNDA llamada de visión (Sonnet viejo), vía 2 saltos HTTP internos

**Severidad:** medio · **Dimensión:** Velocidad · **Esfuerzo:** bajo

**Archivo:** `api/lib/abono-agente.js:59-86; api/whatsapp/buscar-pago.js:35-39; api/lib/comprobante.js:37`

**Evidencia:** agente-responder.js:731 llama verificarYAbonar → abono-agente.js:60 hace POST self-HTTP a /api/whatsapp/buscar-pago → buscar-pago.js:35 descargarMediaBase64(media_id) de nuevo → comprobante.js:36-46 llamada de visión con 'claude-sonnet-4-20250514' → abono-agente.js:79 segundo POST self-HTTP a /api/admin/abono.

**Problema:** Cuando la IA usa registrar_abono, el camino es: motor → HTTP a /api/whatsapp/buscar-pago (que RE-descarga el comprobante de Meta — buscar-pago.js:35 — aunque el motor acababa de descargarlo en 1116 para mostrárselo a Claude) → extraerDatos hace OTRA llamada de visión con el modelo fijo 'claude-sonnet-4-20250514' (comprobante.js:37) → de vuelta → HTTP a /api/admin/abono. Cada salto HTTP interno paga TLS + posible cold start de otra lambda, y la extracción con Sonnet tarda ~3-6s (Haiku haría la misma extracción de campos en ~1-2s). El cliente, que ya esperó el debounce, espera además ~10-25s entre la llamada 1 de Claude, la verificación y la llamada final.

**Mejora propuesta:** Sin tocar ninguna regla de dinero (la verificación contra el banco y el idTransferencia quedan idénticos): (1) aceptar un parámetro opcional media_base64 en buscar-pago/verificarYAbonar y pasarle el base64 que el motor ya tiene en imagenesVistas, eliminando la segunda descarga de Meta; (2) cambiar el modelo de extraerDatos a claude-haiku-4-5 (extracción simple de campos; el contexto autoriza routing más barato para pasos simples) — además el id actual está hardcodeado a un Sonnet de mayo-2025, distinto del resto del sistema.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual: doble descarga del media (agente-responder.js:1116 y buscar-pago.js:35), 2 saltos self-HTTP (abono-agente.js:60 y :79 vía https://www.losplata.com.co) y segunda llamada de visión con 'claude-sonnet-4-20250514' hardcodeado (comprobante.js:37). Agravante: el cron de reintentos (verificar-pagos-cron.js:90) repite descarga+extracción hasta 4 veces más por comprobante. No es decisión deliberada (la bitácora 7-jun solo justifica reutilizar buscar-pago→/api/admin/abono, no la doble descarga ni el modelo) y el contexto autoriza Haiku para pasos simples. Mejora segura (no toca matching ni idTransferencia) pero con 3 ajustes: (1) "distinto del resto del sistema" es FALSO — es el mismo id que procesar-ia.js (Carga IA), procesar-ia-gasto.js y analisis-ia.js, y comprobante.js copia a propósito el prompt de procesar-ia.js; cambiar solo el lector a Haiku crea asimetría con el extractor que carga las transferencias → probar con comprobantes reales antes (fallo conservador: no_encontrado→cron→asesor, nunca abono errado); (2) imagenesVistas está fuera del alcance de ejecutarHerramienta (top-level, línea 613) y sus llaves son ids de mensaje, no media_id → requiere plomería, y el fallback por media_id debe quedarse (el cron solo tiene media_id y MAX_IMAGENES puede excluir el comprobante); (3) latencias ~3-6s/~10-25s plausibles pero no medidas. Severidad medio es justa: costo en USD menor, pero pega en la latencia del momento del pago con clientes reales y se multiplica en los reintentos.

---

## H45 — numerosDisponibles hace ~13 queries SECUENCIALES por cada uso (herramienta consultar_disponibles y atajo de números)

**Severidad:** medio · **Dimensión:** Velocidad · **Esfuerzo:** bajo

**Archivo:** `api/lib/numeros-disponibles.js:38-52,55-70,77-78`

**Evidencia:** for (let i = 0; i <= 9; i++) { const { data } = await supabase...like('numero', `${i}%`)... } — 10 roundtrips en serie, más pool y 2 updates, también en serie.

**Problema:** La función ejecuta 10 SELECTs en serie (uno por serie 0-9, líneas 38-52), un posible SELECT de relleno de hasta 2.000 filas (58-63) y 2 UPDATEs de marcas (77-78), todo con await secuencial: ~1-1,5s por invocación. La paga el cliente en el atajo predefinido de números (agente-responder.js:1312) y en la herramienta (línea 621), donde además se suma a la espera de la segunda llamada a Claude.

**Mejora propuesta:** Paralelizar las 10 consultas por serie con Promise.all (cambio mínimo y seguro), o mejor: UNA sola SELECT de numero con telefono_cliente IS NULL y mostrado_canal IS NULL (limit ~2000) y agrupar por primer dígito en JS — la tabla son 10.000 filas, es barato. Los 2 UPDATEs de marcas pueden quedarse igual (la marca es suave por diseño).

**Nota del verificador (leer antes de implementar):** Confirmado contra el código real: api/lib/numeros-disponibles.js tiene el for con await secuencial (10 SELECTs, líneas 38-52), el pool limit 2000 (58-63) y 2 UPDATEs en serie (77-78); llamado desde agente-responder.js:621 y :1312 como dice el hallazgo, y ADEMÁS desde api/disponibles.js:20 (web) y respuestas-rapidas.js:189 (bandeja), o sea más exposición de la reportada. Sin mitigación: no hay caché ni RPC y la bitácora no registra decisión deliberada al respecto. La mejora no debilita candados (la marca mostrado_canal es suave por diseño y la disponibilidad real se re-verifica al apartar). Dos ajustes a la mejora: (1) la variante de UNA sola SELECT con limit 2000 puede perder la variedad por serie (sin ORDER BY el orden es físico/arbitrario y los libres pueden venir agrupados); traer todos los numero libres sin límite (máx 10.000 filas minúsculas) o usar Promise.all, que es el cambio drop-in seguro; (2) los 2 UPDATEs deben seguir secuenciales (limpiar antes de marcar; en paralelo el clear podría pisar las marcas nuevas), como el hallazgo ya indica. Severidad medio justa: solo latencia (~0,7-2s), pero en la ruta de venta más caliente, incluido el atajo sin IA y la carga de la web.

---

## H46 — Apartar un número cuesta 3 llamadas completas a Claude: encadenar enviar_boleta determinístico ahorraría una vuelta entera

**Severidad:** medio · **Dimensión:** Velocidad · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:686,689-716,1434-1445,1459-1463`

**Evidencia:** El tool_result de 686 exige 'AHORA, en este MISMO turno, envíale la boleta con enviar_boleta — es OBLIGATORIO', y la red de 1461 ya ejecuta ejecutarHerramienta('enviar_boleta') sola cuando el modelo no lo hizo: la decisión nunca es realmente de la IA.

**Problema:** El tool_result de apartar_numero (línea 686) le ORDENA a la IA llamar enviar_boleta en el mismo turno, y enviar_boleta es 100% determinístico (no usa nada que la IA decida: arma el texto desde la base, líneas 689-716). El turno de separar queda: Claude #1 (tool apartar) → Claude #2 (tool enviar_boleta) → Claude #3 (texto final). Cada llamada a Sonnet son ~3-8s: el cliente espera una vuelta entera de IA solo para que el modelo 'decida' ejecutar algo que ya es obligatorio (tanto, que existe la red de seguridad de 1461-1463 que lo ejecuta sola si el modelo lo omite). Esto profundiza con un caso concreto la fase 3 pendiente (cortar vueltas del bucle), sin solaparla: aquí no se corta, se encadena en código.

**Mejora propuesta:** Tras un apartar_numero exitoso, ejecutar enviar_boleta directamente en código dentro del mismo paso (promoviendo la red de seguridad de 1461 a comportamiento normal) y devolverle a la IA UN tool_result que diga que el número quedó apartado Y la boleta ya fue enviada — queda Claude #1 (tool) → Claude #2 (texto final): se ahorra una llamada completa (~4-8s) en el momento más caliente de la venta. Ojo al caso multi-número: encadenar el envío solo cuando el turno no tenga más apartar_numero pendientes (hoy el propio tool_result ya pide agrupar).

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código real (api/whatsapp/agente-responder.js). Línea 686: el tool_result exige textualmente llamar enviar_boleta "en este MISMO turno — es OBLIGATORIO". Líneas 689-716: el handler de enviar_boleta jamás lee `input` (schema vacío en línea 341) — 100% determinístico. Líneas 1416-1429 suprimen el texto cuando hay tool_use, así que el apartar típico sí cuesta 3 llamadas a Claude. Líneas 1461-1463: la red de seguridad ya lo ejecuta en código puro. NO es decisión deliberada: la bitácora (2026-06-07, "SIEMPRE envía la boleta tras apartar") muestra que la red fue un parche porque la IA omitía el envío, no que la IA deba ser dueña de la llamada; tampoco aparece en la lista de decisiones intocables. No solapa la fase 3 pendiente (corta vs. encadena). DOS CORRECCIONES a la mejora: (1) el guard propuesto "sin más apartar_numero pendientes" solo ve los tool_use de la respuesta ACTUAL; el flujo multi-número real va entre iteraciones (el modelo no sabe si apartar tendrá éxito, y el manual línea 115 ordena apartar todos primero), así que el encadenado inline mandaría boletas intermedias/duplicadas — la variante segura es promover la red post-bucle de 1461 a camino normal y cambiar el tool_result de 686 a "NO llames enviar_boleta; el sistema la envía solo al cerrar el turno" (mismo ahorro de una llamada, un solo envío después de todos los apartar; la boleta llega tras el texto final, cambio de orden menor). (2) El manual en la base (agente_config.prompt, paso 5/línea 115 de /tmp/manual-liliana.txt) TAMBIÉN ordena usar la herramienta tras apartar: hay que actualizarlo junto con el tool_result o el modelo seguirá llamándola (anularía el ahorro y duplicaría el mensaje — molesto, no riesgo de plata). No debilita ningún candado de dinero: enviar_boleta es lectura + un texto de WhatsApp; apartar sigue pasando por /api/rifa/reservar y el candado anti pago falso no se toca. Severidad medio justa: optimización de ~4-8s + una llamada Sonnet por venta en el momento de conversión, no un bug.

---

## H47 — Duplicaciones concretas dentro del manual (8 reglas repetidas 2-5 veces) e instrucción sin referente ("más breves que antes")

**Severidad:** bajo · **Dimensión:** Coherencia · **Esfuerzo:** medio

**Archivo:** `/tmp/manual-liliana.txt (agente_config.prompt): líneas listadas en la evidencia`

**Evidencia:** Repeticiones concretas en /tmp/manual-liliana.txt: (1) acumulado/no contar sábados/no "primer sorteo": líneas 15-19, 32-34, 202, 204, 205 — 5 copias, más la repetición del motor en bloqueResultados/bloqueFechas (agente-responder.js:1231, 1242-1247); (2) cédula/correo ni "opcionales" ni "obligatorios": líneas 67 y 113, casi idénticas (~90 palabras c/u); (3) Sueldazo ya jugó: líneas 21-22 y 62; (4) tuteo/no voseo: líneas 11-13 y 51; (5) no repetir lo ya dicho: líneas 39, 47, 181 y 218 (4 copias) + systemVolatil (agente-responder.js:1345); (6) horarios de sorteos: líneas 82-84 ("tenlos en cuenta") vs 203 ("NO los menciones por tu cuenta") — tono casi contradictorio; (7) consultar saldo con la herramienta y no pasar a asesor: líneas 132 y 163-165 + bloqueEstadoCliente (agente-responder.js:195); (8) contacto inicial al llegar: línea 7 + systemVolatil (agente-responder.js:1343). Instrucción sin referente: línea 46.

**Problema:** El manual (27.706 caracteres) creció por parches y hoy tiene reglas repetidas casi literalmente en secciones distintas. Cada duplicado es una futura fuente de contradicción (ya pasó con el acumulado: se parchó una copia y las otras quedaron viejas) y complica el pendiente de adelgazarlo. Además hay una instrucción imposible de cumplir: "escribe mensajes un POCO más breves que antes" — el modelo no tiene un "antes"; cada llamada es nueva, así que la regla solo mete ruido.

**Mejora propuesta:** Al ejecutar la fase 5 (adelgazar el manual), consolidar cada regla en UNA sola sección canónica usando esta lista como mapa, y reescribir la línea 46 con un objetivo absoluto ("apunta a ~30-35 palabras por mensaje") sin el "que antes". Hacerlo en un solo pase editado y probado en modo sombra, no parche a parche.

**Nota del verificador (leer antes de implementar):** Las 8 duplicaciones SÍ existen (verificadas en /tmp/manual-liliana.txt y en agente-responder.js:196, 1228-1233, 1241-1250, 1343, 1345), pero el hallazgo tiene 3 fallas: (1) la "instrucción sin referente" está refutada en sustancia — la línea 46 YA incluye el objetivo absoluto "(apunta a ~30-35 palabras)" que la mejora propone agregar; solo sobra quitar la frase "que antes" (cosmético; bitácora 7-jun: el "antes" era el tope previo de 40 palabras); (2) la anécdota "se parchó una copia del acumulado y las otras quedaron viejas" no tiene respaldo en la bitácora (el bug del acumulado del 7-jun fue del motor; el caso real de texto viejo fue la frase del "supervisor", corregida 9-jun); (3) horarios 82-84 vs 203 NO son contradictorios (ambos condicionan a que el cliente pregunte) y la copia 205 del acumulado es una regla distinta (consistencia de cifra), no un duplicado. Además, parte de la duplicación es DELIBERADA como refuerzo (encabezados "LO QUE MÁS SE ROMPE — cúmplelas SIEMPRE"; bitácora 9-jun aplicó el fix de cédula/correo a ambos bloques a propósito) y hoy todas las copias son consistentes entre sí. Ajuste a la mejora: es segura (no toca candados de dinero) pero consolidar a una sola copia las reglas que históricamente más se rompen (voseo, acumulado) puede AUMENTAR violaciones — al ejecutar fase 5, conservar énfasis deliberado (sección canónica + recordatorio corto) y comparar tasa de violaciones en modo sombra antes de publicar. Severidad bajo: sin contradicción activa, solapa con el pendiente conocido fase 5; el valor real del hallazgo es el mapa de líneas para esa fase.

---

## H48 — Los medios de pago están escritos en duro en la sección de la web del manual, duplicando la variable {{pagos}}

**Severidad:** bajo · **Dimensión:** Coherencia · **Esfuerzo:** bajo

**Archivo:** `/tmp/manual-liliana.txt:139 (agente_config.prompt)`

**Evidencia:** /tmp/manual-liliana.txt:139 (datos en duro) vs líneas 66 y 155 que usan {{pagos}}; el motor reemplaza variables en agente-responder.js:141-147 y 1131-1134.

**Problema:** El manual usa la variable {{pagos}} en dos sitios (la cabina puede cambiar las cuentas sin tocar el manual), pero la sección "LA PÁGINA WEB" trae los mismos datos escritos en texto plano: "(Nequi/Daviplata/Bre-B 3128732266, Maria Buitrago)". Si Mateo cambia las cuentas en la cabina (variables de agente_config), esa copia queda vencida y Liliana daría DOS cuentas distintas según el párrafo que use: con dinero real, mandar un pago a una cuenta vieja es un incidente.

**Mejora propuesta:** Reemplazar en la línea 139 el paréntesis literal por la variable: "se paga por transferencia a las cuentas ({{pagos}})". Un solo replace en agente_config.prompt, efecto inmediato.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra producción: agente_config.prompt (linea 1128258647034751) usa {{pagos}} 2 veces pero trae "3128732266, Maria Buitrago" en duro 1 vez en el párrafo "Comprar en línea"; el motor solo reemplaza variables (aplicarVariables en agente-responder.js:141-147, aplicado en :1131-1134), así que esa copia quedaría vencida si la cabina cambia las cuentas. No hay mitigación: la bitácora no lo registra como decisión deliberada (su análisis dijo "pagos coinciden", cierto hoy por casualidad de valores). Severidad "bajo" es justa: hoy ambos textos coinciden, el riesgo es latente. Ajuste a la mejora: el replace propuesto "a las cuentas ({{pagos}})" genera paréntesis anidados porque la variable ya incluye "(a nombre de *Maria Buitrago*)"; usar "se paga por transferencia a {{pagos}}" (estilo de las líneas 66/155). Es un UPDATE a agente_config.prompt (escritura en producción → confirmar con Mateo antes) e invalida una vez el caché de prompt 1h (costo trivial). No debilita ningún candado de dinero.

---

## H49 — El manual exige mencionar el próximo sorteo en el contacto inicial, pero la herramienta (camino IA) no lo pide

**Severidad:** bajo · **Dimensión:** Coherencia · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:306-307, 511, 653`

**Evidencia:** Manual /tmp/manual-liliana.txt:100 ("SIEMPRE menciona el sorteo más cercano… En el contacto inicial"). Herramienta: agente-responder.js:306-307 (cierre DEBE incluir: precio, legal, respuesta, '¿Te explico los premios?' — sin sorteo), 653 (resultado que da el contenido por completo) y 511 (cierre default sin sorteo). Atajo que SÍ lo incluye: agente-responder.js:1262-1268.

**Problema:** El manual ordena: "En el contacto inicial (una sola vez), además de la información, menciona el próximo sorteo cercano". El atajo SIN IA cumple (incluye lineaProx con la fecha del próximo sorteo), pero cuando el contacto inicial sale por el camino IA (cliente que pregunta algo que el saludo no cubre), la descripción de enviar_contacto_inicial define el cierre como "precio + legal + respuesta a su pregunta + ¿Te explico los premios?" SIN el sorteo, el resultado de la herramienta confirma ese contenido como completo, y el cierre por defecto tampoco lo trae. El mismo paso del embudo sale con el gancho de urgencia o sin él según el camino, y el manual pierde contra la spec de la herramienta (que es la que el modelo sigue al redactar el input).

**Mejora propuesta:** Añadir a la descripción del parámetro `cierre` (y al default de la línea 511) la mención del próximo sorteo, idealmente inyectando la fecha ya calculada (proximo/etiquetaFecha están disponibles antes del bucle) para que la IA no la invente.

**Nota del verificador (leer antes de implementar):** Confirmado contra el código actual: la spec de enviar_contacto_inicial (agente-responder.js:306-307), su resultado (:653, que además prohíbe escribir más) y el default (:511) omiten el próximo sorteo, mientras el manual (línea 100), el atajo SIN IA (:1262-1268), el comentario del código (:526-527) y la bitácora (líneas 409-410: "cierre con la línea del próximo sorteo") confirman que la intención es incluirlo; no hay decisión deliberada que cubra la omisión. Severidad "bajo" es justa: mitigación parcial (el camino IA sí recibe el manual + bloque FECHAS EXACTAS en :1241-1250, así que puede cumplir; que "el manual pierde contra la spec" no está demostrado con transcripts) y afecta solo ~12% de primeros contactos. AJUSTE a la mejora: NO inyectar la fecha calculada en la descripción de la herramienta — TOOLS es constante de módulo (:303) y forma parte del prefijo cacheado con ttl 1h (:1358-1370); una fecha por-request invalidaría el caché de prompt y desharía el ahorro ~50% del commit cbd920c. Lo seguro: añadir texto ESTÁTICO a la descripción del cierre y a :653 ("menciona el PRÓXIMO sorteo usando la fecha EXACTA del bloque FECHAS del contexto; nunca la calcules tú"), y solo en el default :511 (fuera del caché, casi nunca dispara porque cierre es requerido) pasar proximo/etiquetaFecha a enviarContactoInicial. No toca candados de dinero.

---

## H50 — El atajo de saludo trata como nuevos a clientes CONOCIDOS sin boletas: saludo genérico en vez de por su nombre

**Severidad:** bajo · **Dimensión:** Coherencia · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1258-1261`

**Evidencia:** agente-responder.js:1258-1261 (condición del atajo: solo !remision y !boletas.length; no consulta estadoCliente.cli) vs agente-responder.js:197-199 (bloqueEstadoCliente para conocido sin boletas: "Salúdalo por su nombre"). Corte del historial por rifa: agente-responder.js:1021-1038.

**Problema:** El contexto del motor ordena, para un cliente registrado sin boletas en la rifa actual: "Salúdalo por su nombre… NO se los vuelvas a pedir". Pero el atajo del saludo predefinido solo excluye remisión y clientes CON boletas; no mira si el cliente ya tiene datos guardados. Como el historial se corta en la fecha de inicio de la rifa activa, un cliente de la rifa anterior que escriba "Hola" cae en yaHuboSalientes=false y recibe el "¡Hola! 😊 Soy Liliana, te muestro la casa:" genérico — presentándose de cero ante alguien que ya la conoce y cuyos datos ya están en la base, contradiciendo la instrucción que el propio motor le habría inyectado a la IA.

**Mejora propuesta:** Añadir a la condición del atajo `&& !estadoCliente.cli` (o al menos `&& !(estadoCliente.cli && estadoCliente.cli.nombre)`): los clientes conocidos pasan a la IA, que saluda por su nombre con el contexto ya inyectado.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual. (1) La condición del atajo (agente-responder.js:1258-1261) solo excluye recordatorio/sombra/yaHuboSalientes/remisión/boletas; nunca mira estadoCliente.cli. (2) bloqueEstadoCliente (:197-198) ordena "Salúdalo por su nombre… NO se los vuelvas a pedir" para conocido sin boletas, pero solo se inyecta en la ruta IA (:1348) que el atajo cortocircuita. (3) El historial se corta en fecha_inicio de la rifa activa (:1038) y yaHuboSalientes (:1168) se calcula sobre ese historial recortado → el cliente de la rifa anterior cae en false. (4) La población existe: clientes persiste entre rifas (:157, sin filtro de rifa) y boletas anula telefono_cliente al liberar (liberar-boleta.js:85-95), así que el conocido queda con cli y sin boletas y recibe el saludo genérico fijo (:1269). NO mitigado en otra parte: enviarContactoInicial no personaliza, y la bitácora (Fase 1 y Fase 4 del ahorro, 8-jun) documenta las exclusiones del atajo sin mencionar conocidos sin boleta — no es decisión deliberada; al contrario, la decisión "atajos conservadores: en la duda → IA" respalda la mejora. MEJORA: segura (no toca candados de dinero; costo = pocas llamadas IA extra solo para clientes con ficha) y técnicamente correcta (cli es null o fila, :160); preferible la variante simple `&& !estadoCliente.cli`. AJUSTE: aplicar el mismo guard también al bloque de atajos del embudo (:1280-1281), sobre todo el PASO DATOS (:1325-1334), que hoy le pide nombre/apellido/ciudad/cédula/correo de nuevo a un conocido que diga "quiero el 7185" — misma contradicción y más molesta (apartar_numero :663-673 rellena la ficha después, pero al cliente sí se le vuelve a pedir). Severidad "bajo" es justa: solo UX/imagen, sin riesgo de dinero, población acotada (clientes de la rifa anterior que abren con saludo genérico).

---

## H51 — El atajo de números promete verificar "terminaciones" que ninguna herramienta puede buscar

**Severidad:** bajo · **Dimensión:** Coherencia · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1313-1315`

**Evidencia:** agente-responder.js:1313-1315 (texto fijo que ofrece terminaciones) vs herramientas: 315-318 (verificar_disponibilidad: un número puntual) y 310-313 + api/lib/numeros-disponibles.js:19-82 (muestra sin filtro por terminación). Manual /tmp/manual-liliana.txt:179-180 ("ni los filtres por terminación. Si el cliente quiere una terminación o un número puntual, pídele que te diga uno y verifícalo").

**Problema:** El mensaje fijo tras mostrar los números dice: "Si quieres uno con alguna *terminación* o un número en especial, dime y lo verifico". No existe herramienta para buscar por terminación: verificar_disponibilidad valida UN número exacto de 4 cifras y consultar_disponibles trae una muestra aleatoria sin filtro. Si el cliente responde "terminación 13", la IA no tiene cómo cumplir lo prometido (el manual además prohíbe filtrar la muestra por terminación), y queda a un paso de inventar números — justo lo que la regla de oro prohíbe.

**Mejora propuesta:** Alinear el texto fijo con el manual: "Si tienes un número en mente (4 cifras), dímelo y te confirmo si está libre 😊" — sin ofrecer búsqueda por terminación, o bien crear una variante de consultar_disponibles con filtro de terminación si Mateo quiere soportarlo de verdad.

**Nota del verificador (leer antes de implementar):** Confirmado contra el código actual: el texto fijo (agente-responder.js:1315) ofrece verificar "terminaciones" y ninguna herramienta busca por terminación (verificar_disponibilidad:315-318 valida un número exacto; consultar_disponibles:310-313 + numeros-disponibles.js:19-82 solo filtran canal/exclude); el manual (línea 180) prohíbe filtrar por terminación. PERO el hallazgo exagera el riesgo: si el cliente pide "terminación 13" el atajo no dispara, entra la IA, y el manual (l.180) + el wrapper del resultado de herramienta (agente-responder.js:623) le ordenan pedir un número completo y verificarlo — hay salida definida y la regla de oro (l.179) bloquea inventar números; el daño real es solo incoherencia de copy/UX (promete sin paso extra lo que luego exige un paso extra). No hay decisión en la bitácora que sancione esta redacción (los textos fijos de Fase 4 son deliberados como mecanismo, no esta frase). Severidad "bajo" es correcta. La mejora de copy es segura y de esfuerzo bajo (string fijo, no toca candados de dinero). Ajuste a la alternativa propuesta: crear consultar_disponibles con filtro de terminación exigiría actualizar también el manual l.180 y el texto de agente-responder.js:623 (hoy prohíben filtrar por terminación) o quedarían en contradicción, y su esfuerzo es medio, no bajo.

---

## H52 — "Soy Liliana" está escrito en duro en atajos y herramienta, ignorando el diseño multi-línea con nombre_agente

**Severidad:** bajo · **Dimensión:** Coherencia · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:307, 510, 1269`

**Evidencia:** agente-responder.js:1269 (atajo: '¡Hola! 😊 Soy Liliana…'), 307 (ejemplo del schema: 'Soy Liliana'), 510 (default: 'Mi nombre es Liliana'). Diseño multi-línea: agente-responder.js:138-147 (aplicarVariables, "el prompt base es IGUAL para todas las líneas") y 1131-1134 (nombre_agente). Segunda línea en agente_config (linea_id 1147348345124937, nombre_agente null).

**Problema:** El sistema está diseñado para varias líneas con el MISMO prompt base y solo variables distintas ({{nombre}} sale de agente_config.nombre_agente; existe una segunda línea configurada, hoy apagada y sin nombre). Pero el nombre "Liliana" está fijo en tres textos del código: el saludo predefinido del atajo, el ejemplo de la descripción de enviar_contacto_inicial y el saludo por defecto del ejecutor. Si mañana se enciende la otra línea con otro nombre de agente, se presentará como "Liliana" en el primer mensaje (el más visto de todos) y en los casos de fallback.

**Mejora propuesta:** Pasar cfg.nombre_agente a esos tres textos (el atajo corre después de leer agente_config… en realidad corre antes: mover la lectura de cfg arriba del atajo o leer nombre_agente junto con el estado de la línea en el paso 1b) y usarlo en saludo/ejemplo/default.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código real y la base. Los tres "Liliana" en duro existen tal cual: agente-responder.js:307 (ejemplo del schema de enviar_contacto_inicial), 510 (default de enviarContactoInicial) y 1269 (saludo del atajo SIN IA). El diseño multi-línea también: aplicarVariables (138-147, "el prompt base es IGUAL para todas las líneas") y cfg.nombre_agente inyectado como {{nombre}} en 1131-1134, con fallback "del equipo de Los Plata" que chocaría con un "Soy Liliana" fijo. SQL confirmó la segunda línea (1147348345124937, nombre_agente null, estado apagado, prompt vacío). Nada en la bitácora lo declara deliberado. Severidad "bajo" es justa: hoy no hay impacto (la 2ª línea está apagada y con prompt vacío saldría en la línea 1129 antes de llegar al atajo); solo muerde al activar otra línea con nombre distinto. AJUSTE a la mejora: es incorrecta su afirmación de que el atajo corre antes de leer agente_config — cfg se lee en 1126-1127 y el atajo está en 1252-1273, así que NO hay que mover nada: en 1269 basta usar cfg.nombre_agente con fallback. Para 510 hay que pasar el nombre como parámetro (la función no ve cfg); para 307, como TOOLS es constante de módulo, o se genera la descripción por corrida o (más simple) se reescribe el ejemplo en neutro ("presentándote por tu nombre"). La mejora no toca ningún candado de dinero: es solo texto de presentación, segura.

---

## H53 — enviar_boleta: la descripción dice "justo después de apartar su número", el manual dice "una sola vez cuando apartaste TODOS"

**Severidad:** bajo · **Dimensión:** Coherencia · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:340`

**Evidencia:** agente-responder.js:340 (descripción: "Úsala justo después de apartar su número.") vs manual /tmp/manual-liliana.txt:115 ("cuando ya apartaste TODOS los números… usa UNA sola vez… NO mandes la boleta después de cada número") y agente-responder.js:686 (resultado de apartar: "Si el cliente quería MÁS números, apártalos PRIMERO y recién entonces envía la boleta UNA sola vez").

**Problema:** La descripción de la herramienta empuja a enviarla tras CADA número ("Úsala justo después de apartar su número"), mientras el manual y el propio resultado de apartar_numero ordenan lo contrario para compras múltiples: apartar primero todos los números y enviar la boleta UNA sola vez. En una compra de varios números, el modelo lee la descripción al decidir y puede llamar enviar_boleta tras el primer apartado, antes de recibir el tool_result que lo corrige — el cliente recibe el mensaje de boleta repetido, que es exactamente lo que la regla quiso evitar.

**Mejora propuesta:** Reescribir la descripción: "Envíala UNA sola vez, cuando ya estén apartados TODOS los números que el cliente quería (muestra todas sus boletas en un mensaje); no la envíes después de cada número".

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual: agente-responder.js:340 dice textual "Úsala justo después de apartar su número", contradiciendo el manual (/tmp/manual-liliana.txt:115, "UNA sola vez… NO mandes la boleta después de cada número") y el propio tool_result de apartar_numero (agente-responder.js:686). El mecanismo es plausible: el modelo puede emitir apartar_numero+enviar_boleta en paralelo antes de leer el tool_result correctivo, y el flag envioBoleta (línea 1441) solo frena la red de seguridad (1459-1463), no una segunda llamada de la IA en el mismo turno. NO es decisión deliberada: la bitácora (2026-06-07) documenta reforzar el RESULTADO de apartar_numero y la red determinística, no esta descripción. La mejora es segura (enviar_boleta solo lee boletas y manda un mensaje; no toca candados de dinero) con UN ajuste: la redacción propuesta podría desincentivar reenviar la boleta cuando el cliente la pide después (manual línea 165 lo permite). Texto sugerido: "Envíala UNA sola vez por compra, cuando ya estén apartados TODOS los números que el cliente quería (muestra todas sus boletas en un mensaje); no la envíes después de cada número. También puedes usarla si el cliente pide ver su boleta otra vez." Severidad "bajo" es la justa: peor caso = mensaje de boleta repetido en compras múltiples, sin riesgo de plata.

---

## H54 — Recordatorios: se marcan 'enviado' ANTES de enviar; cualquier fallo rompe la promesa de Liliana sin reintento

**Severidad:** bajo · **Dimensión:** Conversación · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/recordatorios-cron.js:132-137, 58-64, 74-80, 146-156`

**Evidencia:** Claim a 'enviado' antes de cualquier envío (recordatorios-cron.js:132-137); sin plantilla → solo log y return con el recordatorio ya consumido (58-64); envío de plantilla fallido → igual (74-80); disparo al motor con .catch(() => {}) y timeout 1.5s sin verificación de resultado (146-156).

**Problema:** Liliana le promete al cliente 'te escribo el martes'. El cron reclama el recordatorio pasándolo a estado='enviado' y RECIÉN DESPUÉS intenta enviar. Si la plantilla seguimiento_los_plata no está aprobada en la línea, si Meta rechaza el envío, o si el fetch al motor falla/se pierde (fire-and-forget con catch vacío, o el motor hace skip por lock/agente apagado/error de IA), el recordatorio ya quedó 'enviado' y se pierde para siempre: la promesa se rompe en silencio (solo una fila de error en agente_actividad que nadie monitorea) y el cliente queda esperando.

**Mejora propuesta:** Usar un estado intermedio: reclamar a 'procesando' y solo pasar a 'enviado' tras confirmación (env.ok o respuesta del motor); ante fallo, devolver a 'pendiente' con proximo intento +15 min y tope de reintentos, y al agotar marcar 'fallido' + etiqueta ASESOR en el chat.

**Nota del verificador (leer antes de implementar):** Confirmado en código: claim a 'enviado' antes de enviar (recordatorios-cron.js:132-137), sin plantilla o fallo Meta el recordatorio queda consumido (58-64, 74-80), y el disparo al motor es fire-and-forget con catch vacío (146-156); el motor puede hacer skip (agente-responder.js:966, 974, 988) consumiendo el recordatorio en silencio. PERO la severidad 'medio' está inflada por evidencia de producción: la plantilla seguimiento_los_plata está APROBADA en la línea (el vector principal del hallazgo ya no aplica), los 5 recordatorios 'enviado' históricos tienen mensaje saliente real (5/5 entregados), 0 errores de recordatorio en agente_actividad, y los vectores restantes se auto-mitigan: el skip por candado casi no ocurre porque recibir.js cancela el recordatorio si el cliente escribe, y pasar_a_humano ya cancela pendientes (agente-responder.js:880-882). Quedan solo vectores de baja probabilidad (rechazo puntual de Meta, caída de fetch, modo sombra en el minuto exacto). Además el claim-first es deliberado como anti-doble-envío (comentario líneas 130-131). Ajustes a la mejora: (1) el cron NO puede esperar la respuesta del motor (el abort a 1.5s es a propósito; el motor tarda 30-60s y 40 esperas revientan maxDuration) — en su lugar, pasar recordatorio_id al motor para que él marque 'enviado' tras enviar y devuelva a 'pendiente' si hace skip; (2) el reintento de plantilla debe limitarse a fallos pre-envío (env.ok=false) para no duplicar plantillas al cliente; (3) no debilita candados de dinero, segura en ese frente.

---

## H55 — primerContactoLoResuelveSaludo no ve multimedia real (solo busca '[audio...' en el texto) ni filtra mensajes hostiles/equivocados

**Severidad:** bajo · **Dimensión:** Conversación · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:533-546`

**Evidencia:** El test multimedia es /\[(audio|imagen|foto|video|sticker|ubicacion|documento|gif)/.test(t) sobre el join de m.texto (agente-responder.js:539), pero recibir.js guarda sticker/imagen sin caption con texto null (recibir.js:235, 243); solo los audios transcritos llevan '[audio del cliente]' (agente-responder.js:1100). No existe lista de exclusión por negación/queja en 533-546.

**Problema:** El guard de multimedia busca marcadores '[audio|imagen|...' DENTRO del texto, pero los mensajes de imagen/sticker/video en la base tienen texto=null o el caption: nunca contienen ese marcador. Resultado: 'hola' + foto (ej. captura del anuncio preguntando algo, o foto con caption corto) dispara el saludo predefinido e IGNORA la imagen por completo. Además no hay filtro de negatividad: 'número equivocado', 'no me escribas', 'deja de molestar' o un primer mensaje con groserías reciben el saludo de venta con fotos de la casa — pésima imagen y riesgo de bloqueo/reporte en WhatsApp.

**Mejora propuesta:** (1) Cambiar el guard a tipo real: `if (entrantes.some(m => m.tipo !== 'text')) return false;`. (2) Añadir una exclusión corta por palabras de rechazo/equivocación (equivocado, no me escribas, no molestes, estafa, denuncio, groserías comunes) → IA.

**Nota del verificador (leer antes de implementar):** Confirmado el gap multimedia: agente-responder.js:539 busca marcadores '[imagen...' en m.texto pero recibir.js:235/243 guarda imagen/sticker con texto=caption/null, y primerContactoLoResuelveSaludo (533-546) nunca mira m.tipo → 'hola'+foto dispara el saludo ignorando la imagen. Contradice la intención documentada (comentario línea 531 y bitácora 8-jun: multimedia→IA), así que NO es decisión deliberada. PERO la severidad estaba inflada: (a) foto sola sin texto va a IA (t vacío, línea 538); (b) la imagen no se pierde — la IA la carga en el siguiente turno (líneas 1110-1123); (c) el ejemplo 'número equivocado' es FALSO: 'numero' matchea la exclusión de la línea 541 y ya va a IA; (d) las respuestas hostiles a difusiones ya están mitigadas porque difusion-envio.js:104 guarda la difusión como saliente → yaHuboSalientes bloquea el atajo (1258); solo queda el primer contacto frío hostil, raro en una línea de anuncios entrantes. Audios cubiertos (transcripción en 1095-1105 corre antes del atajo y pone '[audio del cliente]'). Mejora (1) correcta y segura: solo hace el atajo más conservador, sin tocar candados de dinero; mantener además el regex actual (cubre audio transcrito) y aceptar que tipos interactive/button también irían a IA. Mejora (2) opcional dado lo raro del caso. Esfuerzo bajo: correcto.

---

## H56 — intentoSeparar dispara con negaciones y con dos números: pide datos para el número que el cliente RECHAZÓ

**Severidad:** bajo · **Dimensión:** Conversación · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:592-601, 1325-1334`

**Evidencia:** Captura del primer número con (t.match(/\b(\d{4})\b/)||[])[1] (agente-responder.js:597) y verbos sin contexto de negación (599); el atajo manda el texto fijo con ese número (1328-1333). El guard del último saliente (1327) no cubre conversaciones donde hubo otro mensaje en medio.

**Problema:** El regex de verbos solo exige que 'quiero/dame/...' aparezca en el texto, sin mirar negación, y toma el PRIMER número de 4 cifras. 'ya no quiero el 1234' (4 palabras) o 'no quiero el 1234, dame el 5678' (7 palabras, ≤8) disparan el atajo y Liliana responde '¡Perfecto! 😊 Para apartarte el *1234* necesito tus datos...' — exactamente lo contrario de lo que pidió el cliente. El guard de 'necesito tus datos' en el último saliente solo salva el caso en que el mensaje inmediatamente anterior fue ese pedido.

**Mejora propuesta:** En intentoSeparar devolver null si: (a) el texto contiene \bno\b o 'ya no' antes del verbo, o (b) hay MÁS de un número distinto de 4 cifras en el mensaje. Ambas señales = ambigüedad → IA.

**Nota del verificador (leer antes de implementar):** CONFIRMADO ejecutando la lógica real: "ya no quiero el 1234", "no quiero el 1234, dame el 5678" y "quiero el 1234 o el 5678" devuelven 1234 (agente-responder.js:597 toma el primer número, :599 sin negación) y disparan el texto fijo de :1328. No es decisión deliberada: la bitácora promete "nunca responde en falso". PERO la severidad baja a "bajo" por tres mitigaciones que el hallazgo subestima: (1) el bloque solo corre si el cliente NO tiene boletas (:1280-1281), así que la negación post-apartado nunca entra al atajo; (2) el guard de :1327 cubre la retractación inmediata; (3) el atajo solo manda un texto pidiendo datos — no aparta ni mueve plata; el apartar lo hace la IA después leyendo todo el historial y verificando disponibilidad, así que el peor caso es un mensaje confuso autorrecuperable. Mejora: correcta y segura (más casos a la IA = diseño conservador documentado; no toca candados de dinero). Ajuste: usar \bno\b en cualquier posición (sin "antes del verbo") + null si hay ≥2 números de 4 cifras distintos; el falso positivo "¡cómo no!" simplemente va a la IA, que es el comportamiento seguro.

---

## H57 — Números con dígitos de más o de menos se truncan en silencio: puede apartar/verificar un número que el cliente no pidió

**Severidad:** bajo · **Dimensión:** Conversación · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:627, 657, 757, 777-778`

**Evidencia:** verificar_disponibilidad (agente-responder.js:627), apartar_numero (657), liberar_boleta (757) y trasladar_abono (777-778) aplican replace(\D)+padStart(4)+slice(-4); ninguno rechaza entradas que no tengan exactamente 4 dígitos: el if posterior /^\d{4}$/ siempre pasa porque el truncado ya garantizó 4 cifras.

**Problema:** Todos los ejecutores normalizan con padStart(4,'0').slice(-4): un '12345' (typo del cliente que la IA copia tal cual) se convierte en '2345' y un '123' en '0123', SIN avisar. Liliana puede responder 'el 2345 está libre' o APARTAR el 0123 cuando el cliente quiso otro número — un error de inventario nacido de un typo, que contradice la regla del manual de pedir confirmación a 4 cifras (manual-liliana.txt:187).

**Mejora propuesta:** Reemplazar la normalización: const limpio = String(input?.numero||'').replace(/\D/g,''); si limpio.length !== 4, devolver a la IA 'El número que dio el cliente tiene X cifras; pídele que lo confirme a 4 cifras' en vez de truncar. Aplicar en los 4 ejecutores (liberar/trasladar quedan además protegidos por el chequeo de dueño).

**Nota del verificador (leer antes de implementar):** CONFIRMADO en código actual: las 4 líneas citadas (agente-responder.js:627, 657, 757, 777-778) usan replace(\D)+padStart(4)+slice(-4) y los if /^\d{4}$/ posteriores son código muerto (hasta input vacío se vuelve '0000' y pasa). No hay decisión en la bitácora que lo justifique, y contradice la regla literal del manual ("Si dan otra cantidad de dígitos, pide que lo confirmen a 4 cifras"). PERO la severidad media está inflada → BAJO, por capas que el hallazgo omite: (1) defensa primaria intacta: el manual + las 4 descripciones de herramientas dicen "4 cifras", la IA normalmente confirma antes; (2) NO es del todo silencioso: cada ejecutor devuelve el número normalizado y la IA se lo repite al cliente ("aparté el 0123"), que puede objetar al instante; (3) liberar (chequeo dueño + abono>0) y trasladar (teléfono al endpoint admin) fallan en seguro con número ajeno; (4) apartar sin abono es reversible sin costo. Matiz importante: la mitad del hallazgo ('123'→'0123') es la convención deliberada de TODO el sistema (reservar.js:75-79 hace el mismo padStart); el defecto real y nuevo es solo slice(-4) con >4 dígitos — que reservar.js:78 habría RECHAZADO (filter length<=4) si el ejecutor no truncara antes. La mejora propuesta es segura y correcta (endurece, no debilita candados; alineada con el manual y elimina el caso ''→'0000'); ajuste sugerido: el caso crítico a arreglar es length>4 (truncado); para length<4 puede mantenerse el padStart por coherencia con reservar.js o rechazarse también — ambas opciones seguras. registrar_abono (línea 730) no trunca y no necesita cambio.

---

## H58 — pasar_a_humano: la despedida al cliente depende de una 2ª llamada a la IA sin fallback — si falla, el cliente pide un humano y recibe SILENCIO

**Severidad:** bajo · **Dimensión:** Conversación · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1447-1456`

**Evidencia:** if (apagado) → resp2/d2; si d2.error no hay ninguna rama de respaldo, solo break (agente-responder.js:1447-1455). El tool result instruye a la IA enviar la despedida (887), pero esa instrucción muere si d2.error.

**Problema:** Al ejecutar pasar_a_humano el agente ya se apagó (agente_activo=false). El mensaje 'un asesor te atiende enseguida' se genera con una segunda llamada a Claude; si esa llamada devuelve error (sobrecarga, rate limit), no se envía NADA: el cliente que pidió hablar con una persona (a menudo molesto o con un reclamo) queda sin confirmación y sin bot, en el peor momento posible para callar.

**Mejora propuesta:** Si d2.error (o si d2 no produjo ningún bloque de texto), enviar un mensaje FIJO determinístico: 'Listo 😊 Te paso con un asesor del equipo; te escribe por aquí mismo en un momento.' — una línea con decir() en la rama de error.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código real: en agente-responder.js la rama if(apagado) (1447-1456) solo envía la despedida si !d2.error (1454) y no tiene fallback; y el anti-narración (1422) suprime cualquier texto emitido junto al tool_use, así que la 2ª llamada es la única vía de despedida (pasar_a_humano en 875-888 no le escribe nada al cliente). PERO la severidad "medio" está inflada: (a) el traspaso ocurre ANTES de la 2ª llamada y es robusto — estado='humano', etiqueta ASESOR 🆘 (885) y nota interna (886), o sea un asesor sí queda alertado y el cliente no se pierde, solo se queda sin confirmación; (b) probabilidad baja: la 1ª llamada acaba de tener éxito (1411 aborta el turno si falla), d2.error exige un fallo transitorio entre dos llamadas seguidas. No es decisión deliberada: la bitácora del 9-jun acepta traspaso silencioso solo en el cron de pagos agotados, y la línea 887 muestra que en esta herramienta la intención SÍ es despedirse. Ajuste a la mejora (necesario): envolver el fetch de resp2 en try/catch — si el fetch LANZA (red), salta al catch externo (1467) y devuelve 500 sin pasar por la rama d2.error y sin soltarLock, mismo silencio por otra vía; el fallback debe cubrir d2.error, excepción del fetch, y d2 sin bloques de texto. El mensaje fijo con decir() es seguro: no afirma pagos, no toca candados de dinero y decir() ya respeta el modo sombra (496-503).

---

## H59 — El atajo de saludo trata como desconocidos a clientes de rifas pasadas (el corte de historial por rifa los vuelve 'nuevos')

**Severidad:** bajo · **Dimensión:** Conversación · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1258-1261, 1168`

**Evidencia:** Condición del atajo: !yaHuboSalientes && !remision && !boletas, sin chequear estadoCliente.cli (agente-responder.js:1258-1261); yaHuboSalientes sale del historial cortado por desdeRifa (1021-1041, 1168); el camino IA sí distingue conocidos (197-199).

**Problema:** El atajo del contacto inicial solo se desactiva si el cliente tiene boletas o remisión, pero NO si ya lo conocemos (registro en clientes sin boletas en la rifa actual). Como el historial y yaHuboSalientes se calculan solo desde la rifa activa, un cliente que conversó semanas en la rifa pasada y escribe 'hola' al arrancar la nueva recibe '¡Hola! 😊 Soy Liliana...' como si jamás hubiera hablado con ella — rompe la regla que el propio sistema le impone a la IA ('salúdalo por su nombre', línea 198).

**Mejora propuesta:** Añadir `&& !estadoCliente.cli` a la condición del atajo (línea 1258): a los clientes ya registrados los atiende la IA, que los saluda por su nombre.

**Nota del verificador (leer antes de implementar):** Confirmado en código actual: el atajo (agente-responder.js:1258-1261) no chequea estadoCliente.cli; yaHuboSalientes (1168) sale del historial cortado por desdeRifa (1021-1040) y un "hola" pasa primerContactoLoResuelveSaludo (533-546). El alcance es incluso MAYOR al descrito: las boletas de rifas pasadas se archivan a boletas_historico (api/admin/rifas-disponibles.js:44-46) y resumenCliente (153-160) solo lee la tabla viva, así que hasta un COMPRADOR de la rifa anterior recibe el saludo de desconocido. No hay mitigación ni decisión deliberada en la bitácora (los frenos documentados del atajo no cubren este caso; la filosofía es "en la duda → IA"). La mejora (`&& !estadoCliente.cli`) es segura: solo estrecha un atajo de ahorro y no toca candados de dinero; el camino IA ya maneja al conocido (línea 198 "Salúdalo por su nombre"). Ajustes menores: (a) costo marginal de más llamadas IA al arrancar cada rifa, aceptable y alineado con "atajos conservadores"; (b) no cubre al cliente pasado sin registro en clientes (imposible, no hay datos); (c) la IA aún puede usar enviar_contacto_inicial pero personalizando el saludo, lo cual es correcto. Severidad "bajo" justa: tema de calidez/marca en transición de rifas, sin riesgo de plata.

---

## H60 — El atajo de pedir datos promete apartar un número sin verificar que siga libre

**Severidad:** bajo · **Dimensión:** Conversación · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1325-1334`

**Evidencia:** El atajo manda el texto fijo directo (agente-responder.js:1325-1334) sin pasar por la consulta de boletas que verificar_disponibilidad sí hace (629-632).

**Problema:** Cuando el cliente dice 'quiero el 7185', el atajo responde '¡Perfecto! Para apartarte el *7185* necesito tus datos...' sin consultar la base. Si el número ya está ocupado, el cliente escribe nombre, apellido, ciudad, cédula y correo para enterarse DESPUÉS de que no se puede — frustración evitable con una consulta que ya existe y no usa IA (no contradice la decisión de que la VERIFICACIÓN de preguntas puntuales la haga la IA: aquí no hay pregunta, hay intención de compra).

**Mejora propuesta:** Antes de mandar el mensaje fijo, hacer la misma consulta de 629-632: si el número está ocupado o no existe, NO usar el atajo y dejar que la IA responda (ofrece alternativas); si está libre, mandar el texto fijo como hoy.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual: el atajo PASO DATOS (agente-responder.js:1325-1334) usa solo intentoSeparar (592-601, parser de texto sin tocar la base) y manda el texto fijo sin la consulta de disponibilidad que verificar_disponibilidad sí hace (629-632). No hay riesgo de plata: apartar_numero pasa por api/rifa/reservar.js, que re-valida en 89-108 que el número siga libre antes de ocuparlo — pero eso no evita que el cliente entregue sus 5 datos antes de enterarse. La bitácora (Fase 4, 8-jun) documenta el diseño "el apartar verifica después" como historia de seguridad, NO como decisión deliberada en contra de un pre-chequeo; y la decisión de Mateo ("la verificación de un número puntual la hace la IA") aplica a PREGUNTAS tipo '¿tienes el 1121?' — la mejora no responde nada desde el atajo, solo decide si dispara, y en ocupado cae a la IA (coherente con "en la duda → IA"). Mejora segura y de esfuerzo bajo con 2 ajustes: (1) si la consulta a Supabase falla/da error, tampoco usar el atajo (caer a IA, no asumir libre); (2) el pre-chequeo debe ser silencioso: nunca emitir un "está ocupado" fijo, dejar ese turno a la IA. La ventana de carrera entre pre-chequeo y apartar persiste pero la cubre reservar.js. Severidad "bajo" es la justa: solo fricción de UX en un escenario acotado (cliente nuevo sin boletas que nombra un número puntual ya ocupado).

---

## H61 — Toda imagen sin caption se le presenta a la IA como posible comprobante ('puede ser el comprobante de pago')

**Severidad:** bajo · **Dimensión:** Conversación · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:906`

**Evidencia:** Pie por defecto: 'Imagen que envié (míralas; puede ser el comprobante de pago).' (agente-responder.js:906); esContextoPago devuelve true ante cualquier entrante tipo image con media_id en los últimos 12 mensajes (454-456 — versión nueva del candado, no la vieja).

**Problema:** El pie por defecto de cualquier imagen entrante sin texto sesga a la IA hacia el tema pagos. Un cliente que manda la foto de su casa, una captura del anuncio o un meme puede recibir una respuesta sobre comprobantes/pagos fuera de lugar, y además esa misma imagen arma el contexto de pago del candado (esContextoPago cuenta cualquier imagen).

**Mejora propuesta:** Pie neutro: 'Imagen que envié (mírala y responde según lo que sea: puede ser un comprobante, un documento o cualquier otra cosa).' — mantiene el caso comprobante sin presuponerlo. No tocar esContextoPago (errar hacia armar el candado es seguro).

**Nota del verificador (leer antes de implementar):** Confirmado contra el código real: el pie sesgado existe textual en agente-responder.js:906 y aplica a TODA imagen entrante sin caption (las líneas 1110-1123 descargan cualquier imagen sin filtrar). esContextoPago:456 también confirmado, PERO esa mitad del "problema" es decisión deliberada de hoy 9-jun (bitácora: el candado se arma con cualquier foto a propósito, fail-safe) — no es defecto y la mejora correctamente la deja intacta; al redactar el hallazgo final, quitar esa parte del "problema" o marcarla como diseño. La mejora es segura: el pie solo alimenta lo que VE la IA, no se guarda en la base, ningún candado de dinero lo lee, y el string no se usa en otro archivo; mantiene "comprobante" como primera opción y el manual (paso 6 PAGO) sigue cubriendo el flujo de comprobantes. Bonus: corrige "míralas" (plural) por "mírala". Severidad "bajo" es la justa: la IA ve la imagen real y el pie dice "puede ser" (hedge), así que el daño práctico es leve.

---

## H62 — Si se agotan las 6 iteraciones del bucle sin un bloque de texto final, el turno termina sin decirle nada al cliente

**Severidad:** bajo · **Dimensión:** Conversación · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1401-1463`

**Evidencia:** for (let iter = 0; iter < MAX_ITER...) sin rama post-bucle que garantice texto (agente-responder.js:1401-1457); tras el bucle solo está la red de enviar_boleta (1459-1463); ninguna variable rastrea si decir() se ejecutó en el turno.

**Problema:** El bucle solo envía texto cuando el modelo deja de pedir herramientas. Si en la iteración 6 el modelo todavía pide herramientas (ej. encadena varias verificaciones/consultas), el for termina y no hay ninguna salvaguarda de 'al menos un mensaje al cliente' (la única red post-bucle es la de la boleta). El cliente ve 'escribiendo...' implícito y nunca llega nada.

**Mejora propuesta:** Rastrear huboTexto (true en cada decir() del turno). Si el bucle agota MAX_ITER con tool_use pendiente y !huboTexto, hacer una última llamada SIN tools (como la rama de apagado, 1448-1455) para forzar un cierre en texto; si también falla, mandar un mensaje fijo corto.

**Nota del verificador (leer antes de implementar):** CONFIRMADO en agente-responder.js: MAX_ITER=6 (línea 31); el texto solo se envía si !vaAUsarHerramientas (1422); si la iteración 6 aún pide herramientas, el for expira sin mensaje y tras el bucle solo está la red de enviar_boleta (1461-1463); no existe huboTexto ni equivalente (solo apagado/apartoNumero/envioBoleta/huboAbono, 1388-1391). No es decisión deliberada (la bitácora solo menciona "cortar el bucle" como fase de ahorro pendiente). Severidad bajo es justa: el caso silencioso exige 6 iteraciones seguidas de herramientas que NO escriben al cliente (verificar_disponibilidad/consultar_* encadenadas) — raro porque enviar_boleta/enviar_contacto_inicial/enviar_resolucion mensajean directo, pasar_a_humano cae en la rama de apagado, y la red de boleta cubre la compra; no toca dinero y se recupera al siguiente mensaje del cliente. La mejora es segura para los candados SI el texto forzado pasa por debeBloquear/manejarPagoNoVerificado como en la línea 1454, PERO ajustarla en dos puntos: (1) NO copiar literal la rama de apagado (1448-1455) que llama SIN `tools` — la API de Anthropic ha rechazado históricamente requests sin `tools` cuando el historial contiene bloques tool_use/tool_result ("must define tools"); no pude confirmarlo empíricamente (sin llave local) y, si aún aplica, la propia rama de apagado estaría fallando en silencio hoy (d2.error → se salta el texto). Forma robusta: mantener `tools: toolsActivas` y añadir `tool_choice: {type:'none'}`, que garantiza respuesta solo-texto, + el mensaje fijo de respaldo. (2) huboTexto también debe activarse cuando una herramienta que mensajea al cliente corrió en el turno (enviar_boleta/enviar_contacto_inicial/enviar_resolucion/manejarPagoNoVerificado) para no duplicar mensajes. De paso conviene verificar al aire si la rama de apagado realmente entrega su texto de cierre (mismo riesgo del punto 1).

---

## H63 — Quitar enviar_contacto_inicial del array de tools parte el caché en dos variantes y multiplica las reescrituras completas (~$1.5/día real)

**Severidad:** bajo · **Dimensión:** Costos/tokens · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:1155-1157 (filtro), 1141 (toolsActivas), 1367-1370 (breakpoint que cachea tools+manual)`

**Evidencia:** agente_uso últimos 3 días: 70 llamadas con cache_write ≥10k (avg 11.607, cache_read 0 = reescritura completa del prefijo) = 812k tokens, el 61% de todo lo escrito. El comentario de la línea 1364-1366 documenta que el breakpoint cachea 'herramientas + manual juntos'.

**Problema:** El breakpoint de caché (en el manual) cachea tools+manual juntos, y el caché es prefix-match: cualquier cambio en el array de tools invalida TODO. Como a los clientes con boleta o remisión se les filtra enviar_contacto_inicial (línea 1155-1157), conviven DOS prefijos distintos (13 tools vs 12), cada uno con su propia entrada de caché y su propio TTL — cada variante que expira o que aparece por primera vez en la hora paga una reescritura completa de ~11.6k tokens (~$0.07 cada una a precio real 2x). Datos reales: 70 reescrituras completas en 3 días (~23/día ≈ $1.6/día real), muchas más de las que explican solo los huecos de tráfico >1h. Otras dos fuentes de invalidación del mismo prefijo a vigilar: cada edición del manual en la cabina y cada cambio de resultados/variables que toque el prompt.

**Mejora propuesta:** Mantener el array TOOLS SIEMPRE idéntico (las 13 activas) y mover el bloqueo determinístico a la ejecución: en ejecutarHerramienta, si el cliente tiene boletas o hay remisión y el modelo llama enviar_contacto_inicial, NO enviar nada y devolver un tool_result correctivo ('este cliente ya es conocido: salúdalo por su nombre, NO te presentes'). El determinismo que importa (el cliente jamás recibe el contacto inicial duplicado) se conserva a nivel de ejecución, y el prefijo de caché queda único. El refuerzo del system volátil (línea 1353) ya existe y seguiría empujando al modelo a no llamarla.

**Nota del verificador (leer antes de implementar):** CONFIRMADO el mecanismo: el filtro (agente-responder.js:1155-1157) crea dos prefijos de caché y agente_uso lo prueba forensemente — las reescrituras vienen en pares de tamaños que difieren exactamente 343 tokens (la tool quitada): 11.091/11.434 conviviendo el 8-jun y 12.150/12.493 el 9-jun. PERO la cifra está inflada ~6x: 51 de las 70 reescrituras son de ANTES del deploy del TTL 1h (8-jun 15:54, commit 377e88c), bajo el TTL viejo de 5 min (problema ya resuelto). Ritmo actual (9-jun, TTL 1h al aire): 10 reescrituras/día = $0.76/día TOTAL, de las cuales solo ~3 son atribuibles a la doble variante (ocurrieron con caché caliente a 3/7/29 min); el resto son huecos >1h inevitables y ediciones del manual. Ahorro real de la mejora: ~$0.20-0.30/día (~5-7% del gasto), no $1.5/día → severidad bajo, no medio. Además la bitácora (líneas 513-514) ya documentaba las 2 variantes como trade-off conocido ('ambas funcionan'). La mejora SÍ es segura y correcta: enviar_contacto_inicial no es candado de dinero, el bloqueo en ejecución conserva el determinismo que motivó la decisión deliberada de la bitácora, y los refuerzos volátiles existen y son más amplios de lo citado (líneas 193, 249 y 1353). Ajustes: ejecutarHerramienta(nombre, input, conv) no recibe estadoCliente/remision — re-consultar dentro del ejecutor (como ya hace apartar_numero con resumenCliente) o pasarlo por conv; aceptar el costo menor de una posible iteración extra cuando el modelo la llame y reciba el tool_result correctivo.

---

## H64 — Manual de 27.7k chars: mapa concreto de duplicados — recortable 25-35% sin perder ninguna regla (profundiza la fase 5 pendiente)

**Severidad:** bajo · **Dimensión:** Costos/tokens · **Esfuerzo:** medio

**Archivo:** `/tmp/manual-liliana.txt:15-34,202-205 (acumulado), 29-30 vs api/whatsapp/agente-responder.js:235-253 (remisión duplicada), 82-84 vs 203 (horarios contradictorios)`

**Evidencia:** El manual tiene 27.706 chars; la regla del acumulado aparece literal en 5 secciones distintas y el motor la inyecta una 6ª vez por runtime ('NUNCA digas cuántos sábados', agente-responder.js:1231). bloqueRemision (runtime) repite las mismas prohibiciones que la sección REMISIÓN del manual.

**Problema:** El manual (~8k tokens) repite las mismas reglas hasta 5 veces, y cada reescritura de caché paga el manual completo a $6/M real (~23 reescrituras/día = ~$1.1/día solo del manual) más ~8k tokens leídos en cada una de las ~222 llamadas/día. Duplicados concretos (líneas de /tmp/manual-liliana.txt): ACUMULADO x5 (15-19, 32-34, 202, 204, 205 — y ADEMÁS el motor lo vuelve a inyectar en runtime en bloqueResultados:1231 y bloqueFechas:1246); TUTEO x2 (11-13 y 51); CÉDULA/CORREO ni-opcional-ni-obligatorio x2 (67 y 113); SUELDAZO x2 (21-22 y 62); HORARIOS DE SORTEO x2 con tensión entre sí (82-84 dice 'tenlos en cuenta', 203 dice 'NO los menciones'); NO-REPETIR x4 (39, 47, 181, 217-218); REMISIÓN duplicada (29-30) con el bloqueRemision que el motor ya inyecta completo en runtime (agente-responder.js:235-253). Como el manual 'CRECE con cada corrección', esta duplicación seguirá empeorando y además diluye la obediencia (dos versiones de la misma regla con matices distintos).

**Mejora propuesta:** Una pasada de consolidación: (1) UNA sola sección de acumulado (fusionar 15-19+32-34+202+204+205) — el refuerzo en runtime ya existe y es el que lleva los montos; (2) borrar 29-30 (remisión) porque bloqueRemision en runtime es más completo y solo aplica cuando hay remisión; (3) fusionar tuteo, cédula/correo, Sueldazo y no-repetir en una aparición cada uno; (4) resolver la contradicción de horarios dejando solo la regla de 203. Estimado: -7 a -9k chars (~2-2.5k tokens) = ~30% menos en cada escritura y lectura de caché, y menos contradicciones. Probar 1 día en modo sombra antes de publicar.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra producción: el manual real (agente_config.prompt, 27.706 chars, md5 idéntico a /tmp/manual-liliana.txt) tiene los duplicados citados línea por línea, el motor reinyecta el acumulado en runtime (agente-responder.js:1231 y 1245-1247) y bloqueRemision está en 235-253; la matemática cuadra (~8k tok × ~23 reescrituras × $6/M ≈ $1.1/día). PERO bajo la severidad a 'bajo' y la mejora necesita 4 correcciones porque choca con decisiones deliberadas de la bitácora: (1) NO borrar líneas 29-30 (remisión): esa regla se agregó HOY 9-jun ('Remisión más firme', caso real luis fernando/Claudia) precisamente porque el bloqueRemision de runtime (existe desde 7-jun) NO bastó solo — borrarla desharía un arreglo deliberado de una protección adyacente a dinero; (2) cédula/correo está en DATOS y en paso 3 a propósito (bitácora 9-jun: '(Bloques DATOS... y paso 3) DATOS'); (3) los 'horarios contradictorios' (82-84 vs 203) NO se contradicen — ambos limitan la hora al caso en que el cliente pregunta si alcanza; dejar solo 203 perdería el 'compara la hora actual/si faltan pocos minutos' de 84: fusionar, no borrar; (4) no-repetir x4 está inflado: 217-218 fue refuerzo deliberado del 8-jun porque la regla genérica falló, 181 es sobre acciones; solo 39 vs 47 son duplicado puro. Consolidación SEGURA: acumulado 5→2 (no 5→1: es 'la que más se rompe' y la inyección runtime solo aparece cuando HAY acumulado/resultados), tuteo 2→1, Sueldazo 2→1, fusionar horarios ≈ 4-5k chars (~15-18%), ahorro real ≈ $0.30-0.50/día (el $1.1/día citado es el costo TOTAL del manual en escrituras, no el ahorro) sobre $4-8/día. Profundización válida de la fase 5 pendiente (bitácora línea 424), con modo sombra disponible (conv.sombra, agente-responder.js:1258), pero más pequeña y riesgosa de lo planteado: en varios casos la repetición fue EL arreglo deliberado a fallas reales, no ruido accidental.

---

## H65 — Más atajos sin IA respaldados por datos: el día 1 de atajos bajó el gasto ~48%, y quedan dos rutas frecuentes y determinísticas que aún van a IA

**Severidad:** bajo · **Dimensión:** Costos/tokens · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:544 (premios excluido del saludo), 592-601 (intentoSeparar exige verbo), 1296-1301 (premiosTxt fijo ya existente), 1322-1334 (paso datos)`

**Evidencia:** mensajes_whatsapp: 9-jun = 622 con raw.predefinido vs 222 de IA; 6-8 jun = 0 predefinidos. Gasto: 8-jun $7.76 (416 llamadas) → 9-jun $4.02 (246 llamadas). Cada turno de IA cuesta en promedio 2,32 llamadas × $0.0163 ≈ $0.038.

**Problema:** Los atajos entraron en producción HOY: 9-jun hubo 622 mensajes predefinidos vs 222 de IA (6-8 jun: 0 predefinidos) y el gasto cayó de $7.76 (8-jun) a $4.02. Hay dos rutas del embudo que siguen yendo a IA siendo igual de determinísticas que los atajos existentes: (1) el PRIMER mensaje que pregunta por los premios se excluye explícitamente del saludo predefinido (línea 544) y gasta una llamada de ~$0.04, aunque el texto fijo de premios ya existe (1296-1301) — se puede responder con contacto inicial + premios fijos en cadena; (2) cuando Liliana acaba de mostrar la lista de números ('¿Cuál te gusta?') y el cliente responde SOLO un número de 4 cifras ('7185'), intentoSeparar lo descarta porque exige un verbo (599) y va a IA, que solo puede hacer una cosa: verificar y pedir datos. Ambos disparadores son tan precisos como los pasos premios/números ya aprobados (no contradicen la decisión de mantener los atajos conservadores).

**Mejora propuesta:** (1) En el atajo del saludo, si el primer mensaje matchea SOLO el patrón de premios (línea 544) y nada más, enviar contacto inicial predefinido + el premiosTxt fijo con dormir() entre ambos; (2) nuevo paso en los atajos (junto a 1322-1334): si el último saliente fue la lista de números (matchear 'cual te gusta|muestra de numeros' en salTxt) y el entrante es EXACTAMENTE un número de 4 cifras (sin más palabras), verificar disponibilidad por código (la consulta de verificar_disponibilidad:629 es 1 query) y mandar el mensaje fijo de pedir datos. Medir una semana con las notas 'SIN IA' que ya se registran.

**Nota del verificador (leer antes de implementar):** Código confirmado tal cual (agente-responder.js:544, 592-601, 1296-1301, 1322-1334; repo al día) y evidencia del día 1 verificada en prod (9-jun: 654 predefinidos vs 243 IA; 6-8 jun: 0). PERO: (a) la ruta 1 está REFUTADA por datos — 0 primeros mensajes preguntando por premios en TODO el histórico (regex laxa 'premio|gano' sobre el primer entrante de cada conversación), o sea ahorro $0; (b) la ruta 2 es real pero modesta (34 casos de '4 cifras tras la lista' desde 1-jun, ~4-10/día ≈ $0.15-0.38/día, <10% del gasto ya reducido) y la mejora propuesta CONTRADICE una decisión deliberada documentada (bitácora 8-jun, Fase 4, 'Cuidado / qué NO hacer': la verificación de un número PUNTUAL la sigue haciendo la IA — decisión de Mateo), que el hallazgo pasó por alto; además está incompleta: verificar tiene 3 desenlaces (libre/ocupado/no existe) y solo define mensaje para 'libre'. Ajuste: descartar la parte (1); re-alcanzar la (2) SIN verificación — disparar solo si el número de 4 cifras estaba EN la muestra recién enviada (22 de los 34 casos) y mandar el mensaje fijo de pedir datos, dejando que el apartar verifique después (idéntico al paso datos ya aprobado) — y aun así pedirle el visto bueno a Mateo por rozar su decisión. Severidad baja: optimización de costo de ~$5-11/mes, sin riesgo de dinero.

---

## H66 — ~1.400 caracteres de instrucciones FIJAS viajan en el bloque volátil (precio lleno en cada llamada) en vez del manual cacheado

**Severidad:** bajo · **Dimensión:** Costos/tokens · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1338-1347 (systemVolatil, parte fija), 1367-1370 (estructura del system)`

**Evidencia:** systemVolatil concatena ~1.400 chars de texto literal constante antes de los bloques realmente variables (estado del cliente:1348, acciones:1349-1351, resultados:1355, fechas:1356). El 9-jun la entrada no cacheada fue la línea de costo #1: $1.48 (37% del día).

**Problema:** Las instrucciones de las líneas 1342-1347 (usa herramientas en vez de inventar, audio transcrito, no narrar acciones, mensajes cortos tras herramienta, no preguntar lo que ya sabes) son idénticas en todas las llamadas pero van en el 2º bloque del system, fuera del caché: ~400 tokens × ~222 llamadas/día ≈ 89k tokens/día a $3/M ≈ $0.27/día (~$8/mes) que podrían costar 10x menos como parte del prefijo cacheado. Solo la fecha/hora, el teléfono, el estado del cliente, acciones hechas, resultados y fechas son volátiles de verdad.

**Mejora propuesta:** Mover esas frases fijas al final del manual (agente_config.prompt) o a un tercer bloque estático ANTES del breakpoint. La única condicional (línea 1343, 'usa primero enviar_contacto_inicial' que se omite con remisión) se reescribe estática: 'si el contexto de abajo NO indica remisión ni cliente con boleta...' — o se deja, porque el bloque de remisión/estado ya manda. Ojo: editar el manual invalida el caché una vez (reescritura de ~$0.07), se paga sola el primer día.

**Nota del verificador (leer antes de implementar):** CONFIRMADO en agente-responder.js: las frases fijas (1342, 1344-1347) viajan en el 2º bloque sin caché (1367-1370) y se pagan a precio lleno en cada iteración del bucle. No hay decisión deliberada en la bitácora que lo justifique. AJUSTES: (a) la magnitud está inflada ~40%: el texto fijo medido es 884 chars (~250 tokens), no ~1.400 (~400); ahorro real ≈ $0.17/día (~$5/mes), no $8/mes — severidad "bajo" se mantiene, en el piso del rango. (b) La premisa de la mejora se verifica con creces: la condicional de 1343 es redundante porque cuando hay remisión/boletas el motor ELIMINA enviar_contacto_inicial de toolsActivas (1154-1157) y los bloques de estado/remisión/yaHuboSalientes (193, 249, 1353) ya lo prohíben explícitamente; puede volverse estática o borrarse. (c) Corrección a la mejora: preferir el tercer bloque estático EN CÓDIGO (breakpoint movido a él) en vez de pegar las frases al manual en agente_config.prompt — el manual vive en la base y se edita desde la cabina, instrucciones del motor ahí podrían borrarse por accidente; además hay 2 variantes de caché por el filtrado de tools (bitácora 513-514), así que la reescritura única cuesta ~$0.10, no $0.07. Ningún candado de dinero se toca: las frases son de estilo; el anti pago falso es código (1399-1400).

---

## H67 — El bloque 'ACCIONES QUE YA EJECUTASTE' crece sin tope ni dedupe: hasta 27 notas re-facturadas a precio lleno en cada llamada del chat

**Severidad:** bajo · **Dimensión:** Costos/tokens · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1162-1165 (recolección sin filtro), 1349-1351 (inyección al system)`

**Evidencia:** mensajes_whatsapp (rifa actual): máx 27 notas 🤖 en un solo chat, promedio 1.9. El filtro de 1163 solo exige el prefijo 🤖, sin dedupe ni límite ni distinción lectura/escritura.

**Problema:** accionesHechas inyecta TODAS las notas 🤖 del chat desde el inicio de la rifa en el system volátil de cada llamada. Hay chats con 27 notas (~500-700 tokens extra por llamada a precio lleno), y muchas son repeticiones sin valor como hechos ('Consulté los números disponibles.' x N, 'Verifiqué el número X.'), porque cada consulta de solo-lectura genera nota. Justo los chats largos (los que más llamadas hacen) son los que más pagan, y el bloque seguirá creciendo durante toda la rifa.

**Mejora propuesta:** En el armado (1162-1165): (a) dedupe exacto de notas repetidas (un Set), (b) excluir las notas de solo-lectura ('Consulté los números', 'Verifiqué el número') que no son acciones irrepetibles — el objetivo del bloque es no repetir acciones con efecto, y (c) tope de las últimas ~12. Las acciones de dinero (aparté, ab—oné, trasladé, liberé) se conservan siempre.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra código y producción. Código: agente-responder.js 1162-1165 solo filtra por prefijo 🤖 (sin dedupe/tope/distinción lectura-escritura; único límite es MAX_HISTORIAL=300, línea 32) y 1349-1351 lo inyecta en systemVolatil, que va SIN caché a propósito (1367-1370), o sea precio lleno en cada request del bucle. Producción (rifa activa): máx 27 notas en un chat, promedio 1.9, 600 chats con notas — cifras exactas del hallazgo; el peor chat tiene 25/27 notas de solo-lectura 'Verifiqué el número X' con hasta 3 duplicados exactos (máx 8 duplicados por chat; 309/1135 notas totales son de lectura). No hay decisión en la bitácora que lo cubra ni mitigación en otra parte; los candados de dinero son a nivel de código/RPC, independientes de este bloque. DOS AJUSTES: (1) la cifra '~500-700 tokens por llamada' está inflada ~2x — el peor bloque pesa ~250-350 tokens por request (sí llega a 500-700 acumulado por turno porque el bucle lo reenvía sin caché); (2) la mejora es segura pero el dedupe debe quedarse con la ÚLTIMA ocurrencia, no la primera (si no, 'Aparté 1234→Liberé 1234→Aparté 1234' con textos idénticos colapsa a 'Aparté, Liberé' y miente sobre el estado final de la plata), y la lista de conservar-siempre debe incluir además 'Pasé el chat a un asesor', 'Programé un recordatorio', 'Actualicé los datos' y 'Envié el contacto inicial' (son acciones con estado), no solo los 4 verbos de dinero. Excluir las notas de lectura es incluso positivo para la calidad: el bloque las rotula 'HECHOS ya aplicados' y un 'Verifiqué el número X' viejo puede desanimar la re-verificación. Severidad 'bajo' es la justa (centavos/día contra $4-8/día de gasto).

---

## H68 — liberar_boleta: el candado dueño + saldo $0 vive solo en el llamador y no resiste carreras

**Severidad:** bajo · **Dimensión:** Dinero · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:756-773 y api/admin/liberar-boleta.js:17-97`

**Evidencia:** El ejecutor del agente SÍ valida en código dueño (`endsWith(last10)`, línea 762) y saldo $0 (`total_abonado > 0` → no libera, línea 765) — bien. Pero el endpoint /api/admin/liberar-boleta.js NO revalida nada de eso: borra TODOS los abonos (línea 83) y devuelve las transferencias a LIBRE (líneas 77-80) para cualquier boleta, validando solo grupo. Entre la lectura del agente (línea 760) y la ejecución del endpoint pasan segundos.

**Problema:** Ventana de carrera: el cliente manda comprobante (queda verificación pendiente), luego dice 'ya no quiero la boleta'; el agente lee total_abonado=0 y llama liberar; en ese intervalo el cron abona. El endpoint borra ese abono recién registrado Y devuelve la transferencia a LIBRE: el registro del pago real desaparece y la transferencia queda disponible para consumirse OTRA vez (doble uso de la misma plata). El endpoint tampoco revalida el dueño, así que toda la protección depende del código del llamador.

**Mejora propuesta:** Agregar parámetros opcionales al endpoint que el agente SIEMPRE mande: `soloSiSinAbonos: true` y `telefonoEsperado` — el endpoint revalida (re-lee abonos y telefono_cliente justo antes de borrar, o mejor en una RPC transaccional) y rechaza si ya hay abonos o el dueño no coincide. El Admin humano sigue funcionando igual (sin los parámetros).

**Nota del verificador (leer antes de implementar):** CONFIRMADO el núcleo: el candado dueño+$0 vive SOLO en agente-responder.js:760-766 y liberar-boleta.js no revalida nada (solo grupo, líneas 33-42) antes de liberar transferencias (77-80) y borrar TODOS los abonos (83). La carrera es real: el cron verificar-pagos (cada 5 min, reintentos +15 min hasta ~1h) puede abonar vía verificarYAbonar, y la rama liberar_boleta NO cancela verificaciones pendientes (cancelarVerificaciones solo se llama en registrar_abono:734), así que el escritor concurrente existe. NO está mitigado en otra parte: la bitácora (8-jun, retiro del supervisor Opus) apoya la seguridad justamente en "liberar valida dueño + saldo $0", que es caller-only; no hay decisión deliberada que cubra esto. REFUTADO el "doble uso de la misma plata": abono.js:43 rechaza transferencias no-LIBRE y tras la carrera el abono queda borrado y la transferencia LIBRE → consumo neto 0; re-consumirla la lleva a 1, nunca a 2. El daño real es menor que el descrito: borrado silencioso de un abono recién verificado + mensaje contradictorio del cron al cliente, recuperable forensicamente (transferencia persiste LIBRE, registro_movimientos y verificaciones_pago dejan rastro) aunque sin alerta. Severidad ajustada a BAJO: ventana de segundos × cadena de precondiciones improbable (comprobante pendiente + cancelación simultánea + match del cron aterrizando en esos segundos) y sin doble-gasto. Mejora: correcta y segura tal cual (params opcionales, Admin humano intacto), con 2 ajustes: (1) un re-read simple en el endpoint NO cierra la ventana — hay sub-ventana incluso contra boletas.total_abonado porque abono.js inserta el abono (~línea 115) antes de actualizar la boleta (~154); el cierre real es la RPC transaccional que el propio hallazgo menciona, o al menos un UPDATE condicional atómico (SET libre WHERE numero=N AND total_abonado=0 AND telefono_cliente LIKE %tel; abortar si 0 filas) ANTES de borrar abonos; (2) agregar cancelarVerificaciones(conv.id) en la rama liberar_boleta (agente-responder.js:756-773) — elimina al escritor concurrente más probable con esfuerzo mínimo y de paso evita que una verificación viva abone a otra boleta del cliente después de cancelar.

---

## H69 — abono.js acepta valorAbono no numérico: NaN salta TODOS los candados de monto

**Severidad:** bajo · **Dimensión:** Dinero · **Esfuerzo:** bajo

**Archivo:** `api/admin/abono.js:23-24, 64, 73-80`

**Evidencia:** `const monto = Number(valorAbono); if (monto <= 0) return ...` — con valorAbono = 'abc' (o un objeto), monto es NaN y `NaN <= 0` es false → pasa. Después `monto > saldoActual` (línea 64) y `nuevoSaldoRestante < 0` (línea 78) también son false con NaN → pasa el candado de exceso y el guard de saldo negativo, y llega al insert con monto NaN (que el cliente JSON serializa como null) y al update de la boleta con total_abonado/saldo_restante NaN→null.

**Problema:** Un body malformado (página vieja, bug del front, o llamada manual con contraseña de asesor) puede dejar saldo_restante en null; en la siguiente lectura, el fallback de la línea 56 lo interpreta como precio COMPLETO (PRECIOS.RIFA_4_CIFRAS), borrando contablemente los abonos previos de la boleta. Corrupción silenciosa de saldos de dinero real saltándose tres validaciones.

**Mejora propuesta:** Cambiar la validación a `if (!Number.isFinite(monto) || monto <= 0) return 400`. Aplicar el mismo `Number.isFinite` a saldoActual/abonadoActual antes de operar.

**Nota del verificador (leer antes de implementar):** Bypass JS confirmado: con valorAbono no numérico, monto=NaN pasa las líneas 24, 64 y 78 de api/admin/abono.js tal como dice el hallazgo. PERO el impacto descrito (saldo_restante en null y borrado contable de abonos) está REFUTADO contra la base de producción: abonos.monto es NOT NULL numeric, supabase-js serializa NaN como null, y el INSERT de abonos (línea 109) es la PRIMERA escritura del handler — falla con violación de not-null, se lanza insertError y el update de la boleta (línea 154) nunca se ejecuta. Resultado real: HTTP 500 limpio, cero corrupción, cero estado parcial. Ojo: boletas.saldo_restante/total_abonado SÍ son nullable y sin CHECK/triggers, así que el NOT NULL de abonos.monto es el único backstop (si algún día reordenan las escrituras, el escenario del hallazgo se vuelve real). La mejora propuesta (`if (!Number.isFinite(monto) || monto <= 0) return 400`) es segura y correcta — endurece un candado de dinero, no lo debilita, y además cubre el caso valorAbono="Infinity"; vale aplicarla como defensa en profundidad de esfuerzo bajo. La parte de aplicar Number.isFinite a saldoActual/abonadoActual es innecesaria (vienen de columnas numeric vía PostgREST, no pueden ser NaN) aunque inofensiva. Severidad ajustada de medio a bajo: el efecto observable hoy es un 500 en vez de un 400, con contraseña de asesor de por medio. Nada en docs/BITACORA-DE-DECISIONES.md lo marca como decisión deliberada.

---

## H70 — Identificación del dueño por sufijo last10 falla con teléfonos extranjeros cortos (7-9 dígitos)

**Severidad:** bajo · **Dimensión:** Dinero · **Esfuerzo:** medio

**Archivo:** `api/rifa/reservar.js:68-71; api/admin/trasladar-abono.js:46 y 61-63; api/whatsapp/agente-responder.js:762; api/whatsapp/buscar-pago.js:45 y 95`

**Evidencia:** reservar.js acepta teléfonos extranjeros de 7 a 15 dígitos (línea 69). Todo el sistema identifica las boletas del cliente con `slice(-10)` + `.endsWith(last10)` o `.like('%' + last10)`: trasladar-abono.js:61 (candado del traslado), agente-responder.js:762 (candado de liberar), buscar-pago.js:95 (boletas candidatas a abonar), enviar_boleta:690-691, consultar_cliente:637-642. Con un número de 7-9 dígitos, last10 queda corto y puede ser sufijo del teléfono de OTRO cliente.

**Problema:** Un cliente extranjero cuyo número (7-9 dígitos) coincida con el final del teléfono de otro cliente vería/operaría las boletas del otro SIN ninguna maña: el candado de trasladar_abono daría por 'del mismo cliente' una boleta ajena, liberar_boleta la daría por propia, y registrar_abono podría abonar el pago a la boleta del otro. Baja probabilidad pero impacto directo en plata ajena, y crece con cada venta internacional (esColombia:false ya es el camino normal del agente, agente-responder.js:679).

**Mejora propuesta:** Exigir longitud exacta de 10 dígitos para el matching por sufijo; para teléfonos con menos de 10 dígitos usar comparación EXACTA del número completo (o anteponer el código de país). Centralizar esa regla en api/lib/telefono.js y usarla en los 5 puntos citados.

**Nota del verificador (leer antes de implementar):** Confirmado el patrón en el código (citas exactas: trasladar-abono.js:46/61 solo valida last10 no-vacío; agente-responder.js:637-642, 690-691, 762, 806-809 y buscar-pago.js:45/95 hacen sufijo sin exigir longitud 10). PERO el escenario está sobredimensionado: (1) TODOS los caminos del agente derivan last10 de conv.telefono = wa_id de WhatsApp (E.164 completo); para que quede <10 dígitos el número de WhatsApp del cliente tendría que ser de un microestado — todos los países del formulario (abonar-data.js PAISES) dan ≥11 dígitos. (2) "esColombia:false camino normal" no produce números cortos: agente-responder.js:679 guarda conv.telefono completo, y el form web antepone SIEMPRE el indicativo (comprar-steps.js StepPago: S = code+celular); 7-9 dígitos solo entran por "Otro país" con indicativo manual. (3) La dirección peligrosa exige que el SOLICITANTE tenga el número corto (un guardado corto nunca matchea un last10 de 10), o sea panel admin con asesor humano + colisión exacta de sufijo 7-9 entre dos clientes reales: probabilidad ínfima. (4) Mitigado parcialmente: telefono.js:70 ya exige 10 para dedup y :82-87 sufijo mutuo; buscar-pago.js:166 ya exige length===10 para referencia; liberar_boleta se niega con total_abonado>0 (agente-responder.js:765). Severidad justa: bajo (hardening). La mejora es segura (solo endurece) pero corregirla así: usar la regla de sufijo MUTUO de telefono.js:82-87 como helper central — exigir 10 exactos no arregla la colisión más realista, la cruzada de 10 dígitos entre países (+1-305xxxxxxx Miami vs 57-305xxxxxxx Colombia comparten last10) — y NO pasar a comparación exacta total porque rompería clientes colombianos viejos guardados sin el 57.

---

## H71 — Reintentos de Meta: el dedup por wa_message_id salva la fila, pero los efectos secundarios se re-ejecutan con el duplicado

**Severidad:** bajo · **Dimensión:** Escala/robustez · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/recibir.js:79-108 y 195-208`

**Evidencia:** El upsert con ignoreDuplicates (79-97) evita duplicar el mensaje, pero guardarEntrante ejecuta IGUAL, para un duplicado: cancelarRecordatorios (101), activarPorDisparador (105), dispararAgenteSiActivo (108), no_leidos+1 (208) y la renovación de la ventana de 24h (196).

**Problema:** Un reintento tardío de Meta (pueden llegar minutos u horas después si el webhook estuvo lento) re-ejecuta todo con un mensaje VIEJO: puede CANCELAR un recordatorio que Liliana acababa de programar, inflar no_leidos y renovar la ventana de 24h con un timestamp falso (riesgo de intentar texto libre fuera de ventana). El re-disparo del motor sí lo absorben los candados.

**Mejora propuesta:** Agregar .select('id') al upsert; si no devolvió fila (era duplicado), saltarse cancelarRecordatorios, activarPorDisparador, dispararAgenteSiActivo y el incremento de no_leidos/ventana.

**Nota del verificador (leer antes de implementar):** CONFIRMADO en el código actual: recibir.js ejecuta incondicionalmente cancelarRecordatorios (101), activarPorDisparador (105), dispararAgenteSiActivo (108), no_leidos+1 (208) y la renovación de ventana con Date.now()+24h (196) aunque el upsert (79-97) descarte el duplicado; la bitácora no lo registra como decisión deliberada. SEVERIDAD AJUSTADA A BAJO: (a) el re-disparo del motor está absorbido (agente-responder.js:1045 sale si el último mensaje real ya fue respondido + claim RPC 1058-1090); (b) activarPorDisparador no reactiva si estado='humano' (recibir.js:121); (c) el efecto más dañino (cancelar recordatorios con mensaje viejo) está subsumido por el bug YA conocido en pendientes ("un gracias cancela recordatorios"), que ocurre con cualquier mensaje real — vía muchísimo más frecuente que un reintento de Meta, dado que el handler siempre devuelve 200 rápido; (d) el daño marginal restante es recuperable y sin plata (ventana falsa → a lo sumo un envío de texto libre falla fuera de ventana; no_leidos es cosmético). MEJORA: segura (no toca candados de dinero) y .select('id') con ignoreDuplicates sí devuelve vacío en duplicado, pero está INCOMPLETA como se propone: no_leidos+1 y la ventana se aplican dentro de upsertConversacion en la línea 76, ANTES del upsert del mensaje; hay que separar upsertConversacion en buscar/crear (se necesita conversacion_id para el upsert) y aplicar contadores/ventana solo tras confirmar fila nueva. Esfuerzo sigue bajo. Conviene arreglarlo junto con el bug conocido de cancelación de recordatorios, que comparte la misma zona del código.

---

## H72 — Los atajos sin IA hardcodean 'Liliana', precios y premios: rompen multi-línea y se desincronizan del manual

**Severidad:** bajo · **Dimensión:** Escala/robustez · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:1269, 510-511, 1267-1268, 1296-1301, 1328-1329; api/lib/abono-agente.js:32-33`

**Evidencia:** El saludo predefinido dice '¡Hola! 😊 Soy Liliana...' fijo (1269) y el default de enviarContactoInicial también (510). El cierre fija '$150 mil / separar con 20 mil' (511, 1267) y el paso premios fija la casa de Chinchiná, la Lotería de Boyacá y los $300.000.000 (1296-1301). agente_config YA tiene nombre_agente y variables que el camino CON IA usa (1131-1134), pero los atajos las ignoran. Además asesorDeLinea cae a 'Liliana' para cualquier línea sin fila en lineas_asesores (abono-agente.js:32-33): ventas/abonos de una línea nueva mal configurada quedarían a nombre de Liliana.

**Problema:** Una segunda línea con otro agente se presentaría como 'Liliana' vía el atajo sin IA, y un cambio de precio o de premios hecho en el manual (que vive en la base y se edita sin deploy) NO se refleja en los atajos: responderían datos viejos a clientes reales con dinero de por medio.

**Mejora propuesta:** Construir los textos de los atajos desde agente_config (nombre_agente + variables tipo precio_boleta, abono_minimo, texto_premios), dejando los literales actuales solo como fallback. En asesorDeLinea, loguear cuando se usa el fallback 'Liliana'.

**Nota del verificador (leer antes de implementar):** Confirmado línea por línea: los literales existen tal cual (agente-responder.js:510-511, 1267-1269, 1296-1301; abono-agente.js:32-33) y el camino con IA sí usa agente_config (1127-1134). Pero la severidad "medio" está inflada → bajo, por tres atenuantes verificados: (1) en producción solo hay 2 líneas en agente_config y la segunda está apagada, sin prompt (el motor retorna en :1129-1130 ANTES de los atajos) y sin enviar_contacto_inicial activa (el atajo de saludo la exige en :1260); los atajos de premios/números/datos disparan por regex sobre la frase exacta de Liliana, que otro agente no usaría — el escenario multi-línea es futuro-condicional, no actual. (2) No hay desincronización hoy: el manual en la base dice exactamente $150.000/$20.000/Chinchiná/$300M, datos fijados por la resolución EDSA para toda la rifa; lo volátil (fechas, acumulado) YA sale de la base dentro de los mismos atajos (sorteosOrden, montoAcumProximo). El "responderían datos viejos con dinero de por medio" no se sostiene salvo en el cambio de rifa, evento planeado. (3) La bitácora documenta la limitación DOS veces como "Cuidado: este texto vive en el CÓDIGO" (entradas 8-jun Fase 4 y 9-jun premios) — es deuda conocida, no hallazgo nuevo. La mejora es segura (los atajos solo redactan; nada de plata) con dos ajustes: el fallback a literales debe ser POR VARIABLE porque aplicarVariables deja vacío lo no definido (:140-141) y un texto en blanco iría a un cliente real; y para multi-línea real también hay que parametrizar el array TOOLS (:306-307 hardcodea "Liliana" y "$150 mil" en la descripción de enviar_contacto_inicial). El log del fallback en asesorDeLinea es válido y barato.

---

## H73 — recibir.js y recordatorios-cron.js sin maxDuration fijado, y el claim marca 'enviado' ANTES de enviar

**Severidad:** bajo · **Dimensión:** Escala/robustez · **Esfuerzo:** bajo

**Archivo:** `vercel.json:33-61; api/whatsapp/recordatorios-cron.js:130-137`

**Evidencia:** vercel.json fija maxDuration para 9 funciones pero NO para recibir.js (el webhook, la entrada de TODO) ni para recordatorios-cron.js: ambos dependen del default del plan. El cron reclama cada recordatorio pasándolo a estado='enviado' (132-136) ANTES de mandar la plantilla o de disparar el motor (que además es fire-and-forget con corte de 1.5s).

**Problema:** Si la función muere entre el claim y el envío (timeout por un default corto, deploy, crash), el recordatorio queda 'enviado' sin que el cliente reciba nada: pérdida silenciosa e irrecuperable del seguimiento de venta. recibir.js procesa los lotes de Meta secuencialmente con hasta 1.5s extra por mensaje entrante: un lote grande puede pasarse de un default corto y cortar a la mitad (Meta reintenta, ver hallazgo de efectos secundarios).

**Mejora propuesta:** Fijar maxDuration explícito en vercel.json (ej. recibir.js: 60; recordatorios-cron.js: 120). En el cron, usar estado intermedio 'procesando' con vencimiento (re-reclamable a los 10 min) y pasar a 'enviado' SOLO tras env.ok — es el mismo patrón de claim atómico que ya usan en verificaciones_pago.

**Nota del verificador (leer antes de implementar):** MITAD CONFIRMADA, MITAD REFUTADA. Confirmado: vercel.json no fija maxDuration para recibir.js ni recordatorios-cron.js, y el claim de recordatorios-cron.js:132-136 marca estado='enviado' ANTES de enviar; además, si la plantilla falla (env.ok falso, líneas 74-80) la fila queda 'enviado' sin reintento (solo log en agente_actividad), y en la ruta de ventana abierta el fetch al motor traga errores (catch vacío, línea 155). La bitácora NO declara ese orden como deliberado, y verificar-pagos-cron.js:75-84 sí tiene el patrón re-reclamable citado. REFUTADO el vector principal de la severidad: consulté la API de Vercel del proyecto real (team Pro) y tiene fluid=true con functionDefaultTimeout=300 — recibir.js y recordatorios-cron.js YA corren con tope de 300s, igual que agente-responder; el escenario 'lote de Meta se pasa de un default corto' no existe aquí (y proponer recibir.js:60 BAJARÍA su límite actual de 300 a 60). Queda solo el defecto de durabilidad: recordatorio perdido y falsamente 'enviado' ante crash/deploy (raro) o fallo de envío (logueado) → severidad bajo. Ajustes a la mejora: (1) en vez de inventar estado 'procesando', copiar el patrón existente de verificar-pagos-cron (mantener 'pendiente' + columna intentos con guarda atómica + reprogramar +10min, 'enviado' solo tras éxito, 'error'/tope de intentos si falla) — ojo: cualquier re-reclamo convierte el diseño en 'al menos una vez' y puede duplicar la plantilla al cliente si la función muere tras enviar; aceptable para un seguimiento pero con tope de intentos. (2) 'enviado solo tras env.ok' solo aplica a la ruta de plantilla; la ruta de ventana abierta es fire-and-forget al motor (el cron nunca ve confirmación): ahí marcar tras despachar el fetch o que el motor actualice la fila. No toca candados de dinero. Fijar maxDuration explícito es solo higiene documental (el default ya es 300s).

---

## H74 — Estampida post-difusión: cada respuesta abre una corrida de hasta 300s con polling a Supabase cada ~3s

**Severidad:** bajo · **Dimensión:** Escala/robustez · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:995-1012; api/lib/difusion-envio.js:111`

**Evidencia:** Cada mensaje entrante con agente activo abre una invocación que espera mínimo 30s en el debounce haciendo 2 llamadas a Supabase por iteración de ~3s (SELECT del último mensaje en 998-1002 + RPC de refresh en 1009), dentro de una función con maxDuration 300. Las difusiones activan el agente en cada chat que responde (difusion-envio.js:111).

**Problema:** Una difusión que genere N respuestas casi simultáneas abre N funciones concurrentes largas y ~0.7×N requests/segundo SOSTENIDOS contra PostgREST solo por el debounce (100 respuestas ≈ 70 req/s durante minutos), compitiendo con los crons (pg_cron + net.http_post) y la bandeja. Con cientos de respuestas puede chocar contra los límites de concurrencia de Vercel y la capacidad del proyecto Supabase, degradando TODO el sistema (incluida la verificación de pagos).

**Mejora propuesta:** Combinar el poll y el refresh en UNA sola RPC (que refresque el lock Y devuelva el timestamp del último mensaje entrante) y espaciar el poll a 5-8s: corta el tráfico del debounce a ~1/4 sin cambiar el comportamiento. Opcional: escalonar el envío de difusiones grandes (ya salen por lotes) para repartir las respuestas.

**Nota del verificador (leer antes de implementar):** Mecanismo CONFIRMADO en el código: agente-responder.js:995-1011 hace 2 llamadas a Supabase (SELECT línea 998 + RPC agente_refrescar_lock línea 1009) cada ~3s durante un debounce de mínimo 30s (DEBOUNCE_MS=30000, línea 34), dentro de maxDuration 300 (vercel.json:44); y difusion-envio.js:112 activa el agente por defecto en cada chat de la difusión. La aritmética (~0.6-0.7 req/s por chat) es correcta. PERO la severidad "medio" está inflada: (1) el escalonamiento que la mejora propone como "opcional" YA existe — difusiones-cron.js envía LOTE=30 por minuto, así que 100 respuestas en la misma ventana de 30s es improbable; (2) el candado por conversación limita a UNA corrida por chat; (3) el poll es un SELECT single-row indexado — decenas de req/s no degradan PostgREST ni la verificación de pagos. El vector residual es el envío MANUAL (difusiones.js: LOTE_MAX=80 con el navegador en bucle) a audiencias grandes; el costo realista es horas de cómputo en Vercel (corridas ociosas de 30-240s), no colapso del sistema. Ajustes a la mejora: es segura (no toca candados de dinero; espaciar a 5-8s deja margen amplio frente a la expiración del lock a 60s; el ×1/4 de tráfico es correcto), pero la RPC combinada DEBE llevar GRANT EXECUTE a anon además de service_role/authenticated — el agente corre como anon en producción (falta SERVICE_ROLE_KEY en Vercel) y la bitácora del 6-jun lo exige para las funciones de candado; sin eso el debounce fallaría en silencio. Correcciones menores al hallazgo: la activación es difusion-envio.js:112 (111 es comentario), el debounce tope es 240s (DEBOUNCE_MAX_MS), no 300; y la parte de "escalonar difusiones" es redundante para las programadas.

---

## H75 — El simulador 'probar' de la cabina prueba un agente DISTINTO al de producción

**Severidad:** bajo · **Dimensión:** Extra (crítico de completitud) · **Esfuerzo:** medio

**Archivo:** `/Users/mateoplatabuitrago/los-platas-rifas/api/whatsapp/agente.js:246-285`

**Evidencia:** agente.js:268-276 arma system = prompt + fecha y llama a la API solo con { model, max_tokens, system, messages } (sin tools, sin bloqueEstadoCliente/bloqueFechas/bloqueResultados que el motor inyecta en agente-responder.js:1338-1356); agente.js:248 usa process.env.ANTHROPIC_API_KEY (la general).

**Problema:** La única herramienta que tiene Mateo para validar cambios del manual antes de guardarlos es la acción 'probar' de la cabina, pero esa llamada va SIN herramientas (no hay array tools), SIN los bloques volátiles que definen la conducta real (ESTADO DE ESTE CLIENTE, remisión, FECHAS EXACTAS, RESULTADOS, acciones ya ejecutadas), SIN los atajos sin IA y SIN el candado anti pago falso; además usa la llave general ANTHROPIC_API_KEY en vez de ANTHROPIC_API_KEY_LILIANA (gasto mal atribuido). Un manual que 'pasa' en el probador puede comportarse distinto al aire: la mitad de los errores reales de Liliana (fechas, acumulado, pagos) dependen de bloques que el probador ni siquiera inyecta.

**Mejora propuesta:** Extraer del motor la construcción de system+tools a una función compartida y que 'probar' la reuse con un cliente sintético (o uno real de prueba), inyectando los mismos bloques volátiles y las herramientas en modo sombra. Mientras tanto, al menos usar la llave de Liliana y avisar en la UI que el probador no incluye herramientas ni contexto.

**Nota del verificador (leer antes de implementar):** Confirmado línea por línea: agente.js:248 usa ANTHROPIC_API_KEY general y agente.js:268-276 llama a la API solo con {model, max_tokens:800, system, messages} (sin tools, sin systemVolatil de agente-responder.js:1338-1356, sin candado anti pago falso de 1391-1399, sin atajos, sin registro en agente_uso), mientras el motor usa la llave Liliana (956) y tools (1408). PERO la severidad está inflada: docs/bandeja-whatsapp-buzon.md:397 ya marca como pendiente "Limpiar el simulador probar de la cabina (ya no se usa)" — refuta la premisa de que sea la herramienta de validación de Mateo. Ajuste a la mejora: la opción correcta NO es el refactor propuesto (compartir system+tools con herramientas "en modo sombra" es riesgoso: las 13 tools tocan plata/BD reales y un stub mal hecho ejecutaría acciones reales; esfuerzo real medio-alto), sino ejecutar el pendiente documentado y BORRAR el simulador (acción probar en agente.js:246-285 + UI en bandeja-whatsapp.html:2515-2554). Si se decide conservarlo, sí aplicar la mitigación interina (llave Liliana + aviso en UI de que no incluye herramientas ni contexto).

---

## H76 — verificarYAbonar ignora en silencio la boleta que pidió el cliente y abona a la de número más bajo

**Severidad:** bajo · **Dimensión:** Extra (crítico de completitud) · **Esfuerzo:** bajo

**Archivo:** `/Users/mateoplatabuitrago/los-platas-rifas/api/lib/abono-agente.js:77-80`

**Evidencia:** abono-agente.js:79 'if (pedido) destino = conSaldo.find(...)' seguido de la línea 80 'if (!destino) destino = conSaldo[0];' sin nota ni distinción; buscar-pago.js:117 'boletas.sort((a, b) => a.numero - b.numero)' define ese [0] como la de número más bajo.

**Problema:** Si numeroPedido no coincide con ninguna boleta con saldo modificable (porque el cliente/la IA se equivocó de número, la boleta ya está pagada, o puede_modificar la filtró), el abono cae SIN AVISO a conSaldo[0], que es simplemente la boleta de número más bajo (buscar-pago.js ordena por numero ascendente). El dinero queda en una boleta que el cliente no pidió y el caso no se marca para revisión; con varias boletas con saldo, el destino es arbitrario. Es la ruta del bug real del 8-jun ($110.000 botados) y nadie auditó este fallback.

**Mejora propuesta:** Si numeroPedido viene y NO está en conSaldo, devolver un tipo nuevo ('boleta_no_coincide') para que la IA confirme con el cliente antes de abonar, en vez de caer al [0]. Si no hay numeroPedido y hay más de una boleta con saldo, priorizar la de saldo igual al monto del pago o preguntar.

**Nota del verificador (leer antes de implementar):** CONFIRMADO en código actual: abono-agente.js:78-80 cae en silencio a conSaldo[0] (la de número más bajo, por el sort de buscar-pago.js:117) cuando numeroPedido no coincide; no es decisión deliberada de la bitácora. PERO 3 correcciones: (1) la evidencia "$110.000 del 8-jun" es FALSA — ese bug devolvía 'sin_saldo' con conSaldo VACÍO (línea 75) y nunca tocó el fallback de la línea 80; (2) el daño está contenido: buscar-pago.js:96-99 filtra por teléfono del cliente, el abono solo puede caer en otra boleta DEL MISMO cliente y es recuperable con trasladar_abono; (3) no es del todo silencioso: agente-responder.js:736-737 y verificar-pagos-cron.js:98-99 informan al cliente y dejan nota con el número real abonado. Mejora segura (no debilita candados, es más conservadora) pero incompleta: el tipo nuevo 'boleta_no_coincide' debe manejarse en AMBOS llamadores (en agente-responder.js un tipo desconocido cae hoy a agendarVerificacion → reintentos ~1h → 'rendido' apaga al agente; en el cron no hay diálogo: etiquetar ASESOR de inmediato), y conservar el abono directo cuando conSaldo.length===1 aunque el número no coincida (el fallback hoy corrige typos en el caso común de una sola boleta). Severidad "bajo" es la justa.

---

## H77 — El recordatorio por plantilla se envía aunque un humano haya apagado el agente en el chat

**Severidad:** bajo · **Dimensión:** Extra (crítico de completitud) · **Esfuerzo:** bajo

**Archivo:** `/Users/mateoplatabuitrago/los-platas-rifas/api/whatsapp/recordatorios-cron.js:45-100`

**Evidencia:** recordatorios-cron.js:54-56 solo lee 'id, nombre_perfil' de conversaciones_whatsapp (nunca agente_activo); agente.js:215-243 (activar_conversacion) actualiza agente_activo sin tocar la tabla recordatorios, a diferencia de agente-responder.js:880-884 (pasar_a_humano) y verificar-pagos-cron.js:124-127 que sí cancelan.

**Problema:** Apagar el 🤖 de un chat desde la bandeja (accion activar_conversacion con activa:false) NO cancela los recordatorios pendientes, y la ruta de plantilla del cron de recordatorios no consulta agente_activo ni estado de la conversación (solo lee nombre_perfil). Resultado: un asesor toma el chat a mano, y días después al cliente le llega igual la plantilla de seguimiento 'de Liliana' ('me dijiste que ibas a separar tu boleta'), pisando la gestión humana; y cuando el cliente responde, el motor ve agente_activo=false y NADIE contesta. Las rutas pasar_a_humano y el cron de pagos sí cancelan recordatorios; este tercer camino de apagado quedó sin cubrir.

**Mejora propuesta:** En agente.js, al apagar el agente de una conversación, cancelar sus recordatorios pendientes (mismas 3 líneas que ya usa pasar_a_humano); y como cinturón, en recordatorios-cron.js verificar agente_activo/estado!='humano' antes de enviar la plantilla o despertar al motor.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual: recordatorios-cron.js:54-56 solo lee id+nombre_perfil (nunca agente_activo) y envía la plantilla incondicionalmente; agente.js:215-243 (activar_conversacion con activa:false) solo hace update {agente_activo:false} sin tocar recordatorios; en cambio pasar_a_humano (agente-responder.js:882-883) y verificar-pagos-cron.js:125 sí cancelan. No es decisión deliberada (bitácora revisada; la entrada del 8-jun amplía el uso del botón 🤖 a Liliana humana, lo que sube la exposición). Matices: (1) la ruta de texto libre del cron SÍ está protegida porque el motor sale si agente_activo=false (agente-responder.js:963-966) — la fuga es SOLO la plantilla a días; (2) recibir.js:99-101 cancela al primer mensaje del cliente, así que el bug exige cliente callado desde el apagado hasta el vencimiento; (3) "NADIE contesta" está algo exagerado: el asesor humano dueño del chat ve la respuesta en la bandeja. Ajustes a la mejora (segura, no toca candados de dinero): (a) el chequeo del cron debe ser sobre agente_activo, NO sobre estado!='humano', porque apagar con el 🤖 deja estado='bot' (agente.js solo pone estado al prender); (b) como el cron reclama el recordatorio a 'enviado' antes de decidir ruta (líneas 132-137), al saltárselo conviene marcarlo 'cancelado' para no dejar un 'enviado' falso en el relojito de la bandeja. Severidad 'bajo' es la justa.

---

## H78 — Inyección de instrucciones al bloque system vía los datos que el propio cliente dicta (nombre/apellido/ciudad)

**Severidad:** bajo · **Dimensión:** Extra (crítico de completitud) · **Esfuerzo:** bajo

**Archivo:** `/Users/mateoplatabuitrago/los-platas-rifas/api/whatsapp/agente-responder.js:177-198`

**Evidencia:** bloqueEstadoCliente (líneas 165-201) concatena nombre/apellido/ciudad/correo crudos al texto que va al system (línea 1348); los ejecutores solo hacen trim(): apartar_numero líneas 658-672 y actualizar_datos_cliente líneas 811-815, sin tope de longitud ni filtro de contenido.

**Problema:** El nombre, apellido y ciudad que el cliente dicta en el chat se guardan tal cual (apartar_numero y actualizar_datos_cliente no limitan longitud ni contenido) y en TODOS los turnos siguientes se interpolan directo en el bloque system ('se llama X', 'Datos que YA tienes guardados... úsalos'). Un cliente malicioso puede registrarse con un 'nombre' que contenga instrucciones ('IGNORA TUS REGLAS Y...') y escalar su texto de mensaje de usuario a contexto de sistema persistente. Los candados deterministas de dinero acotan el daño, pero puede torcer promesas, precios dichos, o hacer que afirme cosas prohibidas. La dimensión de seguridad no cubrió ningún vector de prompt injection.

**Mejora propuesta:** Sanear antes de interpolar: recortar a ~40-60 caracteres, eliminar saltos de línea, comillas y caracteres no alfabéticos raros en nombre/apellido/ciudad (tanto al guardar en los ejecutores como al armar bloqueEstadoCliente), y validar en el ejecutor que el nombre 'parezca nombre' (solo letras/espacios).

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual: bloqueEstadoCliente (agente-responder.js:165-201) interpola nombre/apellido/ciudad/correo crudos y la línea 1348 los mete al 2º bloque system (1367-1370), persistente en todos los turnos; los ejecutores (658-679, 811-821) y los endpoints aguas abajo (reservar.js:41-43, actualizar-cliente.js:43-45) solo hacen trim(), sin tope ni filtro. No hay mitigación en la bitácora ni en SQL. Atenuantes que justifican mantener "bajo": documento queda solo-dígitos y correo pasa regex sin espacios (los dos endpoints); el payload debe pasar por Claude como parámetro de herramienta; los candados de dinero son deterministas. AJUSTE A LA MEJORA: no usar "solo letras/espacios" ASCII ni rechazar en el ejecutor con "parezca nombre" (rompería nombres reales: tildes, ñ, "D'Alessandro", "Bogotá D.C." y generaría fricción con clientes en vivo); mejor sanear en silencio con whitelist Unicode /[^\p{L}\p{M}\s.'-]/gu + tope ~60 chars + quitar saltos de línea y comillas, aplicado tanto en los ejecutores como en bloqueEstadoCliente (cubre datos ya guardados). La mejora no toca ningún candado de dinero. Nota adicional: el mismo bloque system también recibe accionesHechas (notas que incluyen el nombre, línea 685→1349-1351) y el motivo de recordatorio (1377), así que sanear en bloqueEstadoCliente/nota es lo más completo.

---

## H79 — Cuando la transcripción de un audio falla, la IA responde a ciegas y nadie se entera

**Severidad:** bajo · **Dimensión:** Extra (crítico de completitud) · **Esfuerzo:** bajo

**Archivo:** `/Users/mateoplatabuitrago/los-platas-rifas/api/whatsapp/agente-responder.js:255-276`

**Evidencia:** transcribirAudio retorna null en 3 rutas sin rastro (257-258, 273-275); el tope de 4 está en la línea 1096; construirMensajes línea 913 produce '[el cliente envió un audio]'; el systemVolatil línea 1344 solo instruye para '[audio del cliente] ...' ya transcrito.

**Problema:** transcribirAudio devuelve null en silencio si falta OPENAI_API_KEY, si Whisper falla o si el turno trae más de 4 audios (tope transcritos>=4). En ese caso el modelo solo ve '[el cliente envió un audio]' y NO existe ninguna instrucción para ese escenario: el contexto volátil solo cubre el caso transcrito ('Si ves [audio del cliente]...'), y hasta le prohíbe decir que no puede oír audios. La IA queda obligada a improvisar la respuesta a un mensaje que no conoce (puede ser un dato de pago o un número dictado), sin nota en la bandeja ni rastro del fallo. Si la llave de OpenAI se cae, TODOS los audios entran mudos y nadie lo nota.

**Mejora propuesta:** (1) Cuando la transcripción falle, dejar nota 🤖 en el chat ('no pude transcribir el audio'); (2) agregar al bloque volátil la instrucción explícita: 'si ves [el cliente envió un audio] (sin transcripción), pídele con amabilidad que te lo escriba'; (3) registrar en agente_actividad tipo error cuando falte OPENAI_API_KEY.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código real: transcribirAudio (agente-responder.js:256-276) devuelve null sin rastro por 4 rutas (sin OPENAI_API_KEY:258, descarga fallida:261, error Whisper:273, catch:275); tope de 4 en 1096; placeholder '[el cliente envió un audio]' en 913; el systemVolatil:1344 y el manual solo cubren el caso transcrito; bitácora sin decisión deliberada al respecto; ninguna mitigación en otro archivo. Dos matices: (1) 'le prohíbe decir que no puede oír audios' exagera — la prohibición de 1344 está condicionada al caso transcrito, aunque el modelo puede generalizarla; (2) existe un reintento implícito no mencionado: el fallo no marca el mensaje (1097 exige texto vacío), así que la siguiente corrida reintenta la transcripción — un fallo transitorio se autocura, pero el turno fallido sí responde a ciegas y sin llave todos los reintentos fallan. Severidad 'bajo' es la justa: el dinero está protegido (registrar_abono exige comprobante verificado contra banco, línea 345). La mejora es segura pero ajustarla: (a) la nota 🤖 debe deduplicarse (por media_id o solo primera corrida) o saldrá una nota por corrida por audio, y NO marcar el texto del mensaje con centinela porque mataría el reintento automático actual; (b) las notas entran al contexto del modelo como '(ya hice esto → ...)' (línea 919) — redactarla para no confundir a la IA; (c) el log en agente_actividad tipo error (patrón ya en 1070-1075) hacerlo una vez por corrida, no por audio.

---

## H80 — Las fotos del contacto inicial dependen del TÍTULO de una respuesta rápida: si la renombran, el saludo sale sin casa y sin aviso

**Severidad:** bajo · **Dimensión:** Extra (crítico de completitud) · **Esfuerzo:** bajo

**Archivo:** `/Users/mateoplatabuitrago/los-platas-rifas/api/whatsapp/agente-responder.js:514-520`

**Evidencia:** Línea 514: .ilike('titulo', '%contacto inicial%').maybeSingle(); línea 515: si no hay fila, fotos queda [] y el bucle de envío simplemente no corre; no hay nota ni error en ninguna rama.

**Problema:** enviarContactoInicial busca las fotos con ilike '%contacto inicial%' sobre respuestas_rapidas. Si alguien renombra, borra o duplica esa respuesta rápida desde la bandeja (es editable por la UI), el saludo de TODOS los clientes nuevos sale sin las fotos de la casa —el corazón del pitch de venta— y el sistema no falla ni avisa: fotos=[] y sigue derecho. Es el mismo patrón de acoplamiento frágil por nombre que ya mordió con los asesores, y ninguna dimensión lo reportó.

**Mejora propuesta:** Amarre explícito: una clave fija en la respuesta rápida (columna clave='contacto_inicial') o el id guardado en agente_config.variables; y si la consulta no devuelve fotos, dejar nota de error en agente_actividad para que se vea en la cabina el mismo día.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código real y producción. (a) agente-responder.js:514-520 coincide literal con la evidencia: ilike '%contacto inicial%' + maybeSingle; si no hay fila, fotos=[] y el bucle no corre, sin error ni nota. (b) El título es editable/borrable desde la bandeja (respuestas-rapidas.js, acciones editar líneas 131-137 y eliminar 142-146). (c) El caso duplicado también es real: maybeSingle con >1 fila devuelve error con data=null y la línea 514 ignora el error. (d) Es algo PEOR de lo descrito: la línea 652 deja la nota 'Envié el contacto inicial (saludo + fotos...)' aunque salgan cero fotos (éxito falso en la cabina), y el saludo por defecto promete 'te muestro las fotos de la casa:' (línea 510). Afecta las DOS rutas: herramienta IA (650-654) y atajo sin IA del ~88% de entrantes (1262-1271). (e) NO está mitigado: nada en la bitácora, sin clave fija ni fallback; RLS no aplica (supabase usa SERVICE_ROLE, api/lib/supabase.js:41). En producción existe hoy exactamente UNA fila 'Contacto inicial' en la línea 1128258647034751 con 6 imágenes — la dependencia está viva. (f) Mejora segura y correcta (no toca candados de dinero; agente_actividad existe y la cabina la lee en agente.js:152); ajuste menor: al implementarla, revisar también el `error` de maybeSingle para cubrir el duplicado, y corregir la nota de la línea 652 para que no afirme 'fotos' cuando fotos.length===0. Severidad 'bajo' es la justa: fragilidad latente, hoy funciona, impacto comercial silencioso pero requiere una edición humana del título para dispararse.

---

## H81 — El agente incrusta la contraseña MAESTRA de gerencia (Mateo) y la envía en cada operación privilegiada

**Severidad:** bajo · **Dimensión:** Seguridad · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:280-289`

**Evidencia:** agente-responder.js:280-289 busca y devuelve la clave del asesor cuyo nombre es 'mateo'; :771, :782-783, :819 la pasan como contrasena a endpoints admin.

**Problema:** Para llamar a los endpoints de dinero/datos el agente extrae del entorno la contraseña de gerencia/Mateo (la de MÁS privilegio) y la manda en texto plano en el cuerpo de cada POST a /api/admin/liberar-boleta, /api/admin/trasladar-abono y /api/admin/actualizar-cliente (contrasenaGerencia en agente-responder.js:280-289; usos en 768-771, 781-787, 802-822). Esto maximiza el radio de impacto: el runtime del agente (proceso serverless de larga vida, 105k líneas de lógica, integraciones con Anthropic/OpenAI) maneja constantemente la llave maestra del sistema; cualquier fuga por logs de cuerpos de petición, un error que serialice el body, o un endpoint comprometido entrega la cuenta de gerencia completa. NO se propone cambiar el modelo de 'contraseña simple' (decisión global), sino qué credencial usa el agente.

**Mejora propuesta:** Dar al agente una credencial DEDICADA y de menor alcance (un asesor 'Liliana/agente' en ASESORES_SECRETO con su propia clave y solo los permisos que necesita), y que contrasenaGerencia se reemplace por esa clave del agente. Así una fuga del runtime del agente no expone la cuenta de Mateo. Verificar que liberar-boleta/trasladar-abono/actualizar-cliente acepten ese asesor según sus reglas de permisos.

**Nota del verificador (leer antes de implementar):** CONFIRMADO en código actual: agente-responder.js:280-289 extrae la contraseña de Mateo de ASESORES_SECRETO y la manda en el body a liberar-boleta (:768-770), trasladar-abono (:781-786) y actualizar-cliente (:802-822). El hallazgo incluso se queda corto: también va en registrar_abono (:720→lib/abono-agente.js:37,60,82, hacia /api/whatsapp/buscar-pago y /api/admin/abono) y en verificar-pagos-cron.js:58. NO está inmunizado por la bitácora: la entrada del 8-jun ("Los movimientos del agente quedan a nombre de Liliana") documenta que "el agente sigue autenticándose como gerencia", pero como atajo para la atribución, no como decisión de seguridad; la mejora conserva ese resultado. SEVERIDAD AJUSTADA medio→bajo porque el delta de riesgo es pequeño: (1) ASESORES_SECRETO ya vive en el env de TODAS las funciones serverless — un compromiso del runtime filtra todas las claves con o sin este patrón; (2) la contraseña NUNCA entra al contexto del LLM (se inyecta server-side en llamarApi y los resultados de herramienta no la devuelven), así que inyección de prompt no la exfiltra; (3) no hay logging de bodies en ninguno de los endpoints implicados y el tráfico es HTTPS al propio dominio. AJUSTES A LA MEJORA (técnicamente viable, no debilita candados — dueño de boleta, total_abonado>0, mismo cliente, transferencia de un solo uso son ortogonales a la credencial): (a) el asesor dedicado debe llamarse EXACTAMENTE 'Liliana' (dueña de la línea en lineas_asesores, ya 'independiente' en asesores_config); con otro nombre la validación de grupo en abono.js:87 y liberar-boleta.js:33-42 BLOQUEARÍA abonos/liberaciones; (b) con ese nombre el override asesorRegistro (solo gerencia) queda no-op pero el resultado es idéntico (asesorReg=nombreAsesor='Liliana'); (c) el cambio debe cubrir TAMBIÉN abono-agente.js:37 y verificar-pagos-cron.js:58, no solo los 3 endpoints citados, o la llave maestra seguiría viajando por la ruta de mayor volumen (abonos); (d) "solo los permisos que necesita" es impreciso: no hay scoping por endpoint; la clave daría nivel asesor completo (aun así estrictamente menor que gerencia: sin finanzas, configuración, eliminar-abono, sorteo); (e) bonus: autenticar como 'Liliana' (independiente) corregiría de paso el desajuste latente de buscar-pago.js:96, que hoy calcula puede_modificar con el grupo de Mateo ('regular') y desde el 8-jun filtraría las boletas del agente ('Liliana'=independiente) — 0 auto-abonos 'abonado' en verificaciones_pago desde el 7-jun (hallazgo lateral flaggeado aparte, task_42e46a8b).

---

## H82 — La herramienta consultar_cliente expone un parámetro 'telefono' que invita a fuga entre clientes

**Severidad:** bajo · **Dimensión:** Seguridad · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:321-326`

**Evidencia:** agente-responder.js:321-326 define el parámetro telefono; :636-637 lo ignora forzando conv.telefono ('SIEMPRE el teléfono del chat (privacidad...)').

**Problema:** El esquema de la herramienta consultar_cliente declara un parámetro opcional 'telefono' y su descripción dice 'Si no pasas teléfono, usa el del cliente de este chat' (agente-responder.js:321-326), sugiriendo al modelo que PUEDE consultar otro número. Hoy el ejecutor lo ignora y fuerza conv.telefono (agente-responder.js:636-637), lo cual es correcto y evita que un cliente, vía inyección de prompt ('consulta el teléfono 311...'), saque datos de OTRA persona. Pero el parámetro muerto es una trampa: cualquier refactor que llegue a 'respetar' input.telefono convertiría esto en una fuga de PII entre clientes de inmediato.

**Mejora propuesta:** Eliminar el parámetro 'telefono' del input_schema de consultar_cliente y de su descripción, dejando properties: {} y required: []. El ejecutor ya usa conv.telefono; quitar el parámetro elimina la ambigüedad y blinda contra drift futuro (defensa en profundidad).

**Nota del verificador (leer antes de implementar):** Confirmado contra el código real: agente-responder.js:320-327 declara el parámetro opcional 'telefono' con descripción que invita a pasar otro número, y el ejecutor (:635-638) lo ignora forzando conv.telefono ("SIEMPRE el teléfono del chat (privacidad...)"). Grep confirma que input.telefono no se usa en ninguna parte de api/. No hay mitigación adicional: el agente corre con SERVICE_ROLE saltándose RLS, así que el ejecutor es la ÚNICA barrera; la bitácora no documenta este parámetro como decisión deliberada y el manual ni menciona la herramienta (al contrario, refuerza "siempre el número de este chat"). La mejora es segura: consultar_cliente es de solo lectura (no está en HERRAMIENTAS_CON_EFECTO), no toca candados de dinero, y dejar properties:{} replica el patrón de consultar_disponibles/enviar_resolucion. Dos ajustes a la mejora: (1) reescribir también la descripción de la línea 321 (quitar "Si no pasas teléfono...", ej. "Consulta si el cliente de ESTE chat ya tiene boletas y cuánto debe"); (2) editar TOOLS invalida una vez la caché de prompt de 1h (costo único trivial; agrupar con otro deploy si se puede). Severidad "bajo" es la justa: hoy no hay fuga real, es blindaje contra drift futuro.

---

## H83 — Un turno típico hace ~40 idas a la base; la cadena de contexto pre-IA es secuencial y paralelizable (agente_config se lee 2 veces)

**Severidad:** bajo · **Dimensión:** Velocidad · **Esfuerzo:** medio

**Archivo:** `api/whatsapp/agente-responder.js:961-1149,1412,380-404`

**Evidencia:** Secuencia de awaits consecutivos entre las líneas 961 y 1149; doble lectura de agente_config en 971-973 y 1126-1127; registrarUso esperado dentro del bucle en 1412 y nota() con 2 inserts seriales en 380-404.

**Problema:** Conteo de un turno típico (1 mensaje de texto, 1 herramienta de lectura): recibir.js ~6-7 queries; motor: conv (961) + agente_config.estado (971) + lock (984) + ~20 del sondeo del debounce + sigueActivo (1015) + rifas (1024) + historial (1032) + claim (1062) + agente_config COMPLETO otra vez (1126) + herramientas (1138) + resumenCliente ×2 (1145) + lineas_asesores (1149) + inserts de uso/notas/mensajes + soltar lock ≈ 33-35. Total ≈ 40+ roundtrips. Casi todo va en serie con await; a ~50-150ms por llamada REST de Supabase, la cadena pre-IA posterior al debounce suma ~0,8-1,5s muertos antes de la primera llamada a Claude (y también la pagan los atajos sin IA). Además agente_config se consulta DOS veces (971 solo estado, 1126 el resto) y los INSERT best-effort (registrarUso en 1412, nota → 2 inserts en 380-404) se esperan en serie dentro del bucle, entre llamadas a Claude.

**Mejora propuesta:** (1) Unificar las dos lecturas de agente_config en una sola SELECT (estado, prompt, modelo, nombre_agente, variables, resultados) antes del candado. (2) Tras el claim, lanzar en Promise.all el grupo independiente: [historial ya leído] + agente_herramientas + resumenCliente + (analizarRemision encadenada a resumenCliente); rifas puede ir junto a la lectura de config. (3) No esperar registrarUso ni el insert a agente_actividad (dispararlos sin await, son best-effort declarados): quita ~100-200ms por iteración del bucle. Ahorro total estimado: 0,5-1s por turno sin tocar ningún candado.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual: todas las líneas citadas existen tal cual (conv 961; agente_config.estado 971; lock 984; sondeo debounce 998+1009; sigueActivo 1015; rifas 1024; historial 1032; claim 1062; agente_config COMPLETO otra vez 1126; herramientas 1138; resumenCliente 1145; lineas_asesores vía analizarRemision; registrarUso awaited en 1413; nota() con 2 inserts seriales 380-407). La doble lectura de agente_config es real y los atajos sin IA (1252+) sí pagan toda la cadena. Nada en la bitácora lo justifica ni lo mitiga. PERO la severidad "medio" está inflada: todo turno automático ya espera un debounce DELIBERADO de 30s (DEBOUNCE_MS=30000, línea 34) más segundos de llamadas a Claude, así que 0,5-1s de ahorro es ~2-3% e imperceptible para el cliente; solo se siente en el disparo manual desde la bandeja (salta el debounce). Las ~20 queries del sondeo son refresco de candado de seguridad durante una espera intencional, no latencia. Ajustes a la mejora: (1) y (2) son seguras (solo lecturas, no tocan candados de dinero; efecto menor: prompt leído hasta ~4 min antes si se unifica pre-candado). La (3) tal cual es PELIGROSA en Vercel serverless: un insert sin await justo antes del return puede morir al congelarse la función y perder filas de agente_uso en silencio (el mismo "Gasto de IA" que ya falló antes). Corrección: acumular las promesas y hacer await Promise.allSettled(pendientes) antes de soltarLock/return (o waitUntil) — conserva el ahorro dentro del bucle sin perder registros de costo.

---

## H84 — Sin breakpoint de caché en messages: las vueltas 2+ del bucle reprocesan todo el historial a precio y velocidad llenos

**Severidad:** bajo · **Dimensión:** Velocidad · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1367-1370,1405-1409,1431-1445`

**Evidencia:** system lleva cache_control con ttl 1h (1368) pero el body de 1408 manda messages sin ningún breakpoint, y el bucle de 1401 re-manda el array completo (con bloques assistant/tool_result acumulados) en cada vuelta.

**Problema:** El caché de 1h cubre tools+manual (breakpoint en system, línea 1368), pero los messages (historial de hasta 300 mensajes + imágenes base64 + tool_results) se reprocesan sin caché en CADA iteración del bucle (hasta 6 por turno) y en cada turno siguiente. Los tokens leídos de caché no solo cuestan 10× menos: se procesan más rápido (mejor time-to-first-token), así que en chats largos las iteraciones 2 y 3 de un turno con herramientas pagan segundos extra evitables.

**Mejora propuesta:** Agregar cache_control: {type:'ephemeral'} al ÚLTIMO bloque del array messages inicial del turno (antes de entrar al bucle). Como el historial es append-only y construirMensajes es determinístico, el prefijo coincide entre iteraciones del mismo turno (ganancia segura) y entre turnos cercanos del mismo chat. Son hasta 4 breakpoints permitidos; hoy solo se usa 1.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra agente-responder.js: único breakpoint en system (línea 1368); el body (1408) manda messages sin cache_control y el bucle (1401-1457, MAX_ITER=6) re-manda el array completo (hasta 300 mensajes, línea 32, con imágenes base64) a precio lleno en cada vuelta. Sin mitigación en otra parte; la bitácora (fases de ahorro, líneas 401-515) no lo descarta como decisión deliberada. PERO la mejora promete de más: la ganancia "entre turnos cercanos del mismo chat" es FALSA — el 2º bloque del system (systemVolatil, 1338-1356) incluye contextoFechaHora() con minuto (82-87) + estado del cliente + acciones hechas, va ANTES de messages en el prefijo, y cambia cada turno, así que el breakpoint de messages solo pega DENTRO del mismo turno (vueltas 2-6). Ajustes a la mejora: (a) usar el TTL por defecto de 5 min en ese breakpoint, NUNCA 1h (escritura 2× que jamás se recupera entre turnos; el orden 1h-antes-de-5m sí es válido); (b) cada turno paga +25% de escritura sobre systemVolatil+historial y solo lo recupera en turnos con herramientas (≥2 vueltas) — neto positivo porque los turnos con herramientas son comunes (apartar/abonar/comprobantes con imagen son el mejor caso), pero el ahorro real es de centavos/día (entrada sin caché del 9-jun: ~494K tok ≈ $1.48 de $4.02); (c) implementación: el último mensaje suele tener content string (construirMensajes, 928) — hay que convertirlo a array de bloques para ponerle cache_control, y marcarlo DESPUÉS del nudge de recordatorio (1380-1383) que muta ese mismo mensaje; (d) la fase 3 pendiente (cortar el bucle) reducirá las vueltas y con ello el valor de esta mejora. Severidad "bajo" y esfuerzo "bajo" correctos. No debilita ningún candado de dinero.

---

## H85 — resolverLinea consulta el token en la base por CADA envío: el contacto inicial hace 6+ lecturas idénticas

**Severidad:** bajo · **Dimensión:** Velocidad · **Esfuerzo:** bajo

**Archivo:** `api/lib/whatsapp.js:40-52,61-91,219-251`

**Evidencia:** resolverLinea hace await supabaseAdmin.from('lineas_whatsapp')... en cada llamada y lo invocan todos los emisores; enviarContactoInicial (agente-responder.js:509-524) emite 6+ mensajes seguidos.

**Problema:** Cada enviarTexto/enviarImagenPorId/enviarDocumento llama resolverLinea, que hace una SELECT a lineas_whatsapp por el token (whatsapp.js:46). El contacto inicial (saludo + ~4 fotos + cierre) repite 6 veces la misma lectura dentro de la misma invocación (~0,4-0,7s extra sumados a las pausas deliberadas de orden), y cada decir() del bucle paga la suya.

**Mejora propuesta:** Memoizar resolverLinea por lineaId en un Map a nivel de módulo con TTL corto (p. ej. 60s): una línea no cambia de token a mitad de una corrida. Cero cambios de comportamiento, una lectura por invocación en vez de una por mensaje.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código real: resolverLinea (api/lib/whatsapp.js:46) hace la SELECT a lineas_whatsapp en cada llamada sin caché, y la invocan todos los emisores (enviarTexto:62, enviarImagenPorId:220, enviarDocumento:264, etc.); enviarContactoInicial (agente-responder.js:509-524) emite saludo+fotos+cierre y paga una lectura idéntica por mensaje (6 con ~4 fotos), igual que cada decir() del bucle. No hay mitigación en ninguna parte ni decisión en la bitácora que lo cubra; no toca candados de dinero. La mejora (memoizar por lineaId con TTL ~60s) es segura — ningún endpoint del API rota el token (conectar-linea.js solo escribe `suscrita`) y el Map vive por instancia caliente de Vercel — pero con DOS ajustes: (1) cachear SOLO lecturas exitosas: el catch(_){} de resolverLinea cae al WHATSAPP_TOKEN de entorno y memoizar ese fallback tras un error transitorio fijaría el token equivocado 60s; (2) cachear el objeto completo {token, phoneNumberId, wabaId} porque las plantillas usan wabaId. Severidad "bajo" es la justa: ~0,3-0,7s parcialmente enmascarados por las pausas deliberadas (dormir(600)/PAUSA_MS) y las lecturas no cuestan dinero. Matiz menor: el "6+" depende del número de fotos en respuestas_rapidas (estructuralmente mínimo 2+N).

---

## H86 — recibir.js lee 3 veces la misma fila de conversaciones_whatsapp por mensaje y dispara el motor una vez POR MENSAJE de la ráfaga

**Severidad:** bajo · **Dimensión:** Velocidad · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/recibir.js:50-56,118-120,156-170,200-205; vercel.json:33-61`

**Evidencia:** Tres SELECT sobre conversaciones_whatsapp con el mismo (telefono, linea_id) por mensaje; el fetch de 164-169 con AbortSignal.timeout(1500) se agota siempre en el caso normal; vercel.json no lista recibir.js en functions.

**Problema:** Por cada mensaje entrante: upsertConversacion lee la conversación (200-205), activarPorDisparador la vuelve a leer (118-120) y dispararAgenteSiActivo la lee una tercera vez (158-161) — 3 roundtrips a la misma fila. Además dispararAgenteSiActivo bloquea SIEMPRE los 1,5s completos del corte (el motor nunca responde en <1,5s por el debounce), por mensaje: una ráfaga de 3 mensajes en un webhook tarda ~6-7s en responderle a Meta y lanza 3 invocaciones del motor de las que 2 mueren en el candado (cómputo y queries desperdiciados). recibir.js no tiene maxDuration en vercel.json (cae al default), así que un webhook gordo (varios mensajes + acuses) se acerca al límite y provoca reintentos de Meta.

**Mejora propuesta:** (1) Hacer que upsertConversacion devuelva también agente_activo y estado, y pasarlos a activarPorDisparador/dispararAgenteSiActivo: 1 lectura en vez de 3. (2) Dentro de un mismo webhook, disparar el motor UNA vez por conversación (deduplicar por telefono+linea_id al final del for de 50-52), no por mensaje. (3) Agregar maxDuration explícito para api/whatsapp/recibir.js en vercel.json (p. ej. 30).

**Nota del verificador (leer antes de implementar):** CONFIRMADO en el código actual: 3 SELECT a la misma fila de conversaciones_whatsapp por mensaje (recibir.js:200-205, 118-120, 158-161) y un disparo del motor POR MENSAJE (loop 50-52 → dispararAgenteSiActivo), donde en ráfaga 2 de 3 invocaciones mueren en el candado RPC (agente-responder.js:984-988). El primer fetch sí quema siempre los 1,5s (el motor debounce-a 30s, DEBOUNCE_MS en agente-responder.js:34). vercel.json (33-61) no lista recibir.js: confirmado. MATICES: (a) las invocaciones bloqueadas retornan rápido en la línea 988, así que NO todos los fetch tardan 1,5s — ráfaga de 3 ≈ 3-6s, no 6-7s garantizados; (b) el argumento de reintentos de Meta vía maxDuration es especulativo (Meta reintenta por SU timeout, no por el de Vercel); (c) el corte de 1,5s es decisión deliberada de la bitácora (8-jun, disparo servidor fire-and-forget) — no quitarlo, solo deduplicarlo. AJUSTE A LA MEJORA: la (1) tal cual está escrita rompe la activación por disparador: activarPorDisparador puede prender agente_activo (recibir.js:136-138), y si dispararAgenteSiActivo usa el valor leído antes en upsertConversacion, un cliente nuevo activado por palabra clave/nuevo_contacto no dispararía el motor hasta su siguiente mensaje; activarPorDisparador debe devolver si quedó activo y usar ese valor. La (2) (un disparo por conversación por webhook) es la mejora correcta y segura: el candado + debounce ya juntan la ráfaga, no debilita ningún candado de dinero. La (3) es inofensiva pero de beneficio dudoso. Severidad bajo es la justa: solo cómputo/latencia, sin riesgo de dinero ni de doble respuesta.

---

## H87 — El sondeo del debounce hace 2 idas a la base cada 3s (~20 por turno): unificable en un solo RPC

**Severidad:** bajo · **Dimensión:** Velocidad · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:995-1012`

**Evidencia:** El while de 997 ejecuta por ciclo la SELECT de mensajes_whatsapp (998-1002) y el rpc('agente_refrescar_lock') (1009), con dormir(≤3000) entre ciclos.

**Problema:** Durante la espera de 30s, cada ciclo de ≤3s hace una SELECT del último mensaje (998-1002) MÁS el RPC agente_refrescar_lock (1009): ~20 roundtrips por turno solo para esperar, y con cientos de llamadas al día son miles de queries diarias de puro sondeo. No es latencia del cliente (el tope de la espera lo fija DEBOUNCE_MS), pero es carga evitable sobre la base y sobre la conexión de la función mientras el candado está tomado.

**Mejora propuesta:** Fusionar en un único RPC (p. ej. agente_lock_y_ultimo) que en una sola ida refresque el candado Y devuelva direccion+timestamp del último mensaje de la conversación: mitad de roundtrips con el mismo comportamiento exacto del debounce.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra agente-responder.js: el while de 997 hace por ciclo la SELECT de mensajes_whatsapp (998-1002) + rpc agente_refrescar_lock (1009) con dormir ≤3s (1010); con DEBOUNCE_MS=30000 son ~20 roundtrips típicos por turno (hasta ~160 si la ráfaga llega al tope de 4 min). No hay mitigación ni decisión deliberada en la bitácora (la entrada del 6-jun solo justifica que el candado sea RPC, no el sondeo en dos idas). Severidad "bajo" es justa: cero impacto en latencia del cliente y carga trivial. La mejora es segura (refrescar el candado en más iteraciones es más seguro, no menos) PERO con 3 ajustes obligatorios: (1) el RPC nuevo debe ser SECURITY DEFINER con GRANT EXECUTE a anon, authenticated y service_role — el agente hoy corre como anon y sin el grant fallaría en silencio, como exige la bitácora del 6-jun; (2) recargar la caché de PostgREST al crearlo (NOTIFY pgrst o reiniciar la API) o saldrá "function does not exist"; (3) "mismo comportamiento exacto" es impreciso: el candado se refrescaría también en la iteración que rompe el bucle (cambio inocuo). La lógica de cortes (direccion !== 'entrante', silencio >= 30s) debe quedarse en JS, el RPC solo devuelve direccion+timestamp_wa+created_at.

---

## H88 — DEBOUNCE_MAX_MS (240s) deja solo 60s de margen frente al maxDuration de 300s: riesgo de muerte a mitad de turno

**Severidad:** bajo · **Dimensión:** Velocidad · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:35,995-1012; vercel.json:43-45`

**Evidencia:** DEBOUNCE_MAX_MS = 240000 (línea 35) contra maxDuration: 300 de agente-responder.js en vercel.json; ningún chequeo de presupuesto de tiempo antes del bucle de IA.

**Problema:** Si un cliente escribe goteado durante 4 minutos, el debounce consume 240s y quedan 60s para: historial, descargas de imágenes, transcripciones, hasta 6 llamadas a Sonnet con herramientas y los envíos — fácilmente más de 60s en un turno con comprobante. Vercel mata la función a los 300s a mitad de la respuesta: el cliente recibe media respuesta o ninguna, el candado queda pegado 60s y (por el hallazgo del re-disparo inexistente) nadie reintenta: el chat queda en visto.

**Mejora propuesta:** Medir el tiempo transcurrido al salir del debounce y, si quedan <90s de presupuesto, no entrar al bucle: soltar el lock y auto-redispararse (fetch interno fire-and-forget) para arrancar una invocación fresca con los 300s completos. Alternativa más simple: bajar DEBOUNCE_MAX_MS a ~180s.

**Nota del verificador (leer antes de implementar):** Confirmado contra el código real: DEBOUNCE_MAX_MS=240000 (agente-responder.js:35) vs maxDuration:300 (vercel.json), y NO existe ningún chequeo de presupuesto de tiempo tras el debounce (el único Date.now()-inicio es el del propio bucle de espera, línea 997). El sobrecosto >60s del turno es plausible: hasta 6 fetch a Anthropic SIN timeout (líneas 1405, 1448), Whisper (1098), descarga de imágenes (1116) y herramientas de dinero. El candado sí queda pegado ~60s (TTL 60s, comentario línea 983 + bitácora) porque se refresca cada 3s durante el debounce, y las corridas nuevas mueren en la línea 988; no hay reintento salvo que el cliente vuelva a escribir. No hay decisión deliberada en BITACORA-DE-DECISIONES.md que proteja el valor 240s (solo el comentario del autor "ningún cliente lo alcanza", sin datos). Severidad "bajo" es la justa: requiere cliente escribiendo sin pausas >30s por 4 min completos MÁS un turno pesado, y se autorepara si el cliente insiste. Ajustes a la mejora (es segura, no toca candados de dinero, y el patrón fire-and-forget ya está probado en recibir.js:164-169 con fetch + AbortSignal.timeout(1500) en try/catch): (1) orden obligatorio soltar lock → disparar fetch — al revés, la corrida nueva choca con el candado (línea 988) y el chat queda en visto garantizado; (2) si el re-disparo falla, continuar el turno en línea como respaldo, nunca salir; (3) la alternativa de bajar DEBOUNCE_MAX_MS a ~180s es igual de válida y más simple (deja ~120s).

---

## H89 — Transcripción de audios en serie: una ráfaga de notas de voz suma hasta ~20s antes de llamar a la IA

**Severidad:** bajo · **Dimensión:** Velocidad · **Esfuerzo:** bajo

**Archivo:** `api/whatsapp/agente-responder.js:1094-1105,256-276`

**Evidencia:** for (const m of reales) { ... const txt = await transcribirAudio(...) } — await dentro del for, con transcribirAudio haciendo descargarMediaBase64 + POST a Whisper por cada audio.

**Problema:** Los audios pendientes (hasta 4) se transcriben uno tras otro (1095-1105): cada uno son 2 fetches a Meta para descargar + la llamada a Whisper (~2-6s). Con clientes que mandan 2-3 notas de voz seguidas (frecuente en este público), el turno suma 6-18s adicionales de pura espera secuencial, después del debounce y antes de la primera llamada a Claude.

**Mejora propuesta:** Transcribir los audios pendientes en paralelo con Promise.all (y de paso en paralelo con la descarga de imágenes de 1112-1123, que es independiente). La escritura del texto transcrito en la base puede seguir siendo best-effort por audio.

**Nota del verificador (leer antes de implementar):** CONFIRMADO contra el código actual: agente-responder.js:1095-1105 hace `await transcribirAudio(...)` dentro del for (hasta 4 audios), y transcribirAudio (256-276) hace descargarMediaBase64 + POST a Whisper; whatsapp.js:329-346 confirma los 2 fetches a Meta por descarga. El bucle de imágenes (1112-1123) también es secuencial e independiente. No hay decisión deliberada en la bitácora ni mitigación en otra parte (solo se evita RE-transcribir en corridas futuras vía el update de línea 1102, que no quita la espera inicial). La mejora es segura: no toca candados de dinero (el claim RPC anti-duplicado ocurre antes, 1058-1090) y cada audio escribe su propia fila. Severidad "bajo" es justa: el debounce deliberado de 30s (línea 34) ya domina la espera y maxDuration=300 descarta timeouts. Ajustes a la mejora: aplicar el tope de 4 seleccionando audios pendientes ANTES de lanzar (filter+slice(0,4); hoy el tope cuenta solo éxitos — diferencia mínima aceptable) y usar Promise.allSettled o try/catch por audio para que un fallo no tumbe el resto.

---

