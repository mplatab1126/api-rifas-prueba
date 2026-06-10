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
