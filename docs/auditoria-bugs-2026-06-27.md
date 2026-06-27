# Auditoría de bugs — Los Plata (2026-06-27)

> Resultado del loop de auditoría de todo el repositorio (5 pasadas: por área + por tipo de bug, cada hallazgo verificado de forma adversarial).

## Resumen

- **35 bugs SEGUROS arreglados, publicados y verificados al aire** (commits 12e3a39, c8663a3, b8b61c0, 84fa659, 6ac9ecd, 0124a9f, 7b6f907, 27e2dca).
- **3 huecos de seguridad ALTA cerrados** (con aprobación): `buscar.js`, `transferencias.js`, `historial.js` ahora exigen contraseña.
- **69 bugs DELICADOS pendientes de tu decisión** (tocan dinero/abonos/permisos/base de datos): 10 ALTA, 46 MEDIA, 13 BAJA.
- **6 flags** (seguros pero sensibles): activación de Liliana por etiqueta/difusión/envío manual (flujo-motor, difusion-envio, enviar.js), retorno de Wompi (abonar-app), y el motor de flujos que no ejecuta los nodos Aleatorio/Solicitud/Clasificar.

## Pendientes DELICADOS (ordenados por severidad)

> NO se tocaron. Cada uno con causa raíz y arreglo propuesto. Decide cuáles quieres que haga (de a uno, con tu visto bueno).

### 1. [ALTA] `api/admin/conciliar-consolidado.js`:176-177, 276-282
**Ingresos por corresponsal se descartan y su matcher es código muerto**

- **Causa raíz:** En parseBloque, la rama 'CONSIGNACION CORRESPONSAL CB' hace `return null`, así que esos ingresos NUNCA se convierten en movimientos del consolidado. Además, buscarMatchIngreso tiene una rama `if (mov.tipoMov === 'corresponsal')` que jamás se ejecuta porque ningún bloque asigna tipoMov='corresponsal' (parseBloque solo produce 'retiro_corresponsal' para egresos). Resultado: las consignaciones por corresponsal del extracto desaparecen de la conciliación: no se cuentan en totalIngresos, no se marcan como encontradas ni como faltantes. La base sí tiene transferencias de corresponsal (ej. 'Consignacion corresponsal cb'), por lo que quedan sin conciliar de forma silenciosa.
- **Arreglo propuesto:** En parseBloque, en vez de `return null` para 'CONSIGNACION CORRESPONSAL CB', clasificarlo como ingreso con tipoMov='corresponsal' (descripcion 'Consignación Corresponsal'). Así la rama de matching corresponsal (que ya existe) podrá emparejarlo y, si no hay match, aparecerá en faltantes en vez de evaporarse.

### 2. [ALTA] `api/admin/liberar-boleta.js`:44-95
**Liberación atómica del agente corrompe estadísticas del cliente cuando el candado falla**

- **Causa raíz:** En el flujo atómico (soloSiSinAbonos=true, que usa el agente Liliana desde api/whatsapp/agente-responder.js:1043) el orden de operaciones está invertido: PRIMERO se ajustan las estadísticas del cliente (líneas 44-72: se descuenta total_comprado por montoARestar y se baja boletas_grandes_compradas en 1 si la boleta estaba pagada) y DESPUÉS, en líneas 80-95, se ejecuta el UPDATE condicional que solo libera si la boleta SIGUE sin abonos y del mismo dueño. Si ese candado NO afecta filas (que es exactamente el caso que el candado existe para detectar: la boleta recibió un abono o cambió de dueño entre la lectura y el borrado), la función retorna en la línea 93 SIN restaurar las estadísticas que ya descontó. Resultado: total_comprado y boletas_grandes_compradas del cliente quedan rebajados aunque la boleta NO se liberó y sigue intacta con sus abonos. Se desincronizan los totales de dinero comprado del cliente.
- **Arreglo propuesto:** Reordenar para que el candado atómico (el UPDATE condicional de las líneas 80-95) se ejecute ANTES de tocar las estadísticas del cliente, y solo continuar con el ajuste de clientes/abonos/transferencias si el claim afectó una fila. Alternativamente, mover todo el bloque de ajuste de estadísticas (44-72) a después del claim exitoso. Así, si el candado no libera, se retorna sin haber modificado nada del cliente.

### 3. [ALTA] `api/cliente.js`:60
**abonado_cliente usa Math.min en vez de sumar: reporta el menor abono, no el total**

- **Causa raíz:** Para calcular el campo abonado_cliente se usa Math.min(...boletas.map(b => Number(b.total_abonado))) en lugar de un reduce/suma. El propio comentario lo confirma ('tomamos el mínimo abonado'). Mientras deuda_cliente sí se suma con reduce (línea 59), el abonado toma el valor más bajo entre todas las boletas. Un cliente con dos boletas (abonado $100.000 y $50.000) aparece reportado como abonado_cliente = 50000 en vez de 150000. ChateaPro/Camila muestran al cliente un total abonado equivocado (menor al real).
- **Arreglo propuesto:** Reemplazar la línea por una suma: const abonadoTotal = boletas.reduce((suma, b) => suma + Number(b.total_abonado || 0), 0); — igual que deudaTotal. Si la intención original era otra (p.ej. abono mínimo por boleta), de todas formas el nombre del campo abonado_cliente implica total y el dato actual es engañoso.

### 4. [ALTA] `public/bandeja-whatsapp.html`:2387-2410
**Reparto de pago: si una boleta falla a mitad del bucle, la transferencia ya quedó consumida y solo se abona parte del dinero (sin rollback)**

- **Causa raíz:** confirmarReparto() registra los abonos uno por uno en un for. La PRIMERA petición (i===0) lleva idTransferencia y boletasRepartidas con TODAS las boletas, lo que en /api/admin/abono (abono.js linea 113-115) marca la transferencia como 'ASIGNADA REPARTIDA: 1,2,3' y la consume. Si una boleta POSTERIOR falla (ya pagada, bloqueada por otro equipo, carrera, error de red), el codigo no revierte el abono de la boleta 1 ni libera la transferencia: solo muestra un aviso 'Repartido con avisos'. Queda la transferencia marcada como repartida entre N boletas pero con abonos reales solo en algunas, y el dinero faltante desaparece de la conciliacion y la transferencia no se puede reutilizar.
- **Arreglo propuesto:** Validar TODO antes de escribir: hacer una pasada previa (dry-run) por cada boleta o, mejor, mover el reparto a un unico endpoint transaccional en el servidor que inserte los N abonos y consuma la transferencia en una sola transaccion atomica (todo o nada). Como mitigacion inmediata en el front: si algun abono del reparto falla, intentar revertir los abonos ya hechos y liberar la transferencia, y NO marcar el comprobante como asignado.

### 5. [ALTA] `public/llamadas.html`:1439-1494 (ejecutarRescateLanzamiento)
**Rescate WhatsApp lanza TODAS las llamadas en una sola petición, sin lotes ni try/catch**

- **Causa raíz:** El flujo de Cobro Directo divide los seleccionados en lotes de 25 (COBRO_BATCH_SIZE) con bucle for + manejo por lote, justamente 'para evitar interrupciones por timeout' (ver comentario en el HTML y ejecutarCobroLanzamiento, lineas 1163-1217). Pero ejecutarRescateLanzamiento hace una sola llamada `await apiCall('lanzar', { clientes_seleccionados: seleccionados, ... })` con la lista COMPLETA. El backend difusion-llamadas.js (accion 'lanzar', lineas 165-225) recorre los clientes secuencialmente con `await twilioClient.calls.create(...)` + 2 inserts a Supabase por cliente. Con 30+ clientes esto excede el timeout de la funcion serverless (Vercel). Cuando se agota: (a) algunas llamadas YA se dispararon y generaron cargo en Twilio, pero (b) la respuesta nunca llega, asi que la UI no muestra ningun resultado ni actualiza el dashboard, y (c) si el fetch rechaza (504/conexion cortada) no hay try/catch alrededor del await, por lo que el boton queda bloqueado en 'Llamando...' deshabilitado para siempre. Si el gerente reintenta, vuelve a llamar (y cobrar) a los mismos clientes.
- **Arreglo propuesto:** Replicar el batching del cobro en rescate: trocear `seleccionados` en lotes de COBRO_BATCH_SIZE y llamar apiCall('lanzar', ...) por lote dentro de un bucle, acumulando exitosas/fallidas/omitidas y resultados, igual que ejecutarCobroLanzamiento. Envolver cada apiCall en try/catch para que un fallo de red no deje el boton bloqueado y se contabilice como fallidas. Restaurar el estado del boton en un bloque finally.

### 6. [ALTA] `api/app/perfil.js`:46-59 (especialmente 53 y 59)
**total_abonado del cliente solo suma los ULTIMOS 20 abonos**

- **Causa raíz:** La consulta de abonos trae como maximo 20 filas (.limit(20)) ordenadas por fecha desc, pensada para 'historial de pagos'. Pero luego ese mismo arreglo `pagos` se reutiliza para calcular `estadisticas.total_abonado = pagos.reduce(...)`. Para cualquier cliente con mas de 20 abonos (frecuente en planes de pago por cuotas de boletas de $150.000), el total mostrado queda subestimado: solo cuenta los 20 pagos mas recientes y omite el resto.
- **Arreglo propuesto:** Calcular `total_abonado` con una consulta separada sin limite (o agregada): por ejemplo traer todos los abonos del cliente (sin .limit) solo para sumar, o usar una suma agregada en Postgres, y mantener el .limit(20) unicamente para la lista `pagos` que se muestra como historial reciente. Alternativamente reutilizar el `total_abonado` real que ya viven en la tabla `boletas`.

### 7. [ALTA] `api/abonar/wompi-webhook.js`:69-76, 110-122
**Idempotencia no atomica: webhooks concurrentes pueden duplicar el abono**

- **Causa raíz:** La proteccion contra doble-procesamiento es un patron read-then-write: primero hace SELECT en `abonos` por `referencia_transferencia = tx.id` (linea 69-74) y si no encuentra nada, inserta los abonos (linea 110). Wompi puede reintentar/entregar el mismo evento `transaction.updated` varias veces, a veces casi simultaneas. Dos invocaciones concurrentes pueden pasar ambas el SELECT (ninguna ve aun la fila de la otra) y ambas insertar, aplicando el monto dos veces y duplicando el saldo descontado. No se encontro indice/constraint UNIQUE sobre referencia_transferencia en el repo que lo bloquee a nivel DB.
- **Arreglo propuesto:** Hacer la idempotencia atomica a nivel base de datos: agregar un UNIQUE (o UNIQUE parcial) sobre `referencia_transferencia` en `abonos` (o sobre (referencia_transferencia, numero_boleta)) y/o envolver la aplicacion del pago en una funcion/RPC transaccional que inserte-o-ignore. Asi un segundo webhook concurrente falla la insercion en vez de duplicar.

### 8. [ALTA] `api/admin/bitacora.js`:10-14
**Bypass de autenticacion cuando CRON_SECRET no esta definido**

- **Causa raíz:** `const esApiExterna = api_key === process.env.CRON_SECRET;` compara dos valores que pueden ser ambos `undefined`. Si la variable de entorno `CRON_SECRET` no esta configurada (o esta vacia) y el cliente NO envia `api_key` en el body, entonces `undefined === undefined` => `true`, por lo que `esApiExterna` queda en `true` y el bloque `if (!esApiExterna) { validarAsesor(...) }` se SALTA por completo. Cualquiera puede crear/editar/eliminar entradas de la bitacora sin contraseña. El propio repo demuestra el patron correcto en api/admin/llamadas-automaticas.js (linea 70): `if (!process.env.CRON_SECRET || authHeader !== ...)`, guardando primero contra la variable ausente; bitacora.js omite ese guard.
- **Arreglo propuesto:** Exigir que CRON_SECRET exista y que api_key venga presente y coincida: `const esApiExterna = !!process.env.CRON_SECRET && typeof api_key === 'string' && api_key === process.env.CRON_SECRET;`. Asi, si la variable no esta seteada o no se envia api_key, `esApiExterna` es `false` y se aplica la validacion de contraseña.

### 9. [ALTA] `api/whatsapp/mensajes.js`:29-39
**IDOR entre líneas: asesor restringido lee mensajes de cualquier teléfono en todas las líneas omitiendo linea_id**

- **Causa raíz:** El guard de permiso de línea es condicional: `if (linea_id && !(await puedeVerLinea(nombre, linea_id)))` (línea 29). Si el caller NO envía `linea_id`, el chequeo se salta por completo. Además la consulta solo filtra por línea cuando hay linea_id (`if (linea_id) query = query.eq('linea_id', linea_id)`, línea 39). Resultado: un asesor con líneas restringidas (no gerencia) puede mandar POST con cualquier `telefono` y SIN `linea_id`, y recibe los 500 mensajes más recientes de ese teléfono de TODAS las líneas, y además resetea `no_leidos=0` (líneas 61-63) en conversaciones de líneas ajenas. El endpoint hermano `conversaciones.js` (líneas 73-75) sí bloquea este caso con `if (!linea_id && !esGerencia(nombre)) return ... conversaciones: []`, lo que confirma que es un olvido, no diseño.
- **Arreglo propuesto:** Replicar el guard de conversaciones.js: tras validarAsesor, agregar `if (!linea_id && !esGerencia(nombre)) return res.status(403).json({ status:'error', mensaje:'No tienes acceso a esta línea.' });` (importando esGerencia de ../lib/asesores.js). Idealmente, para gerencia exigir igualmente que la consulta filtre por línea o que se confirme que la conversación pertenece a una línea que el asesor puede ver antes de devolver mensajes y antes de tocar no_leidos.

### 10. [ALTA] `api/admin/abono.js`:187-188
**abono.js no revierte el abono ni la transferencia consumida si falla el UPDATE de la boleta**

- **Causa raíz:** El flujo registra el abono y consume la transferencia ANTES de actualizar la boleta. En el paso 4a (lineas 117-128) hace UPDATE condicional de transferencias a estado ASIGNADA, en 4b (131-143) inserta en abonos, en el paso 5 (160-178) actualiza estadisticas del cliente, y recien en el paso 6 (187) hace `supabase.from('boletas').update(updatePayload).eq('numero', numeroLimpio)` SIN guarda condicional y SIN rollback: `if (updateError) throw updateError`. Si ese UPDATE falla, el catch global devuelve 500 pero ya quedaron escritos: el abono en la tabla `abonos`, la transferencia marcada ASIGNADA y las estadisticas del cliente sumadas, mientras `saldo_restante`/`total_abonado`/`estado` de la boleta quedan SIN actualizar. Resultado: dinero registrado como abonado y transferencia consumida, pero la boleta sigue mostrando el saldo viejo (estado inconsistente). El mismo proyecto, en api/admin/venta.js (lineas 243-276), SI hace UPDATE condicional con `.is('telefono_cliente', null)` y rollback explicito del abono, transferencia y estadisticas si el UPDATE no afecta filas; abono.js carece por completo de ese patron.
- **Arreglo propuesto:** Antes del throw en `if (updateError)` (linea 188), revertir en orden inverso igual que venta.js: (1) borrar el abono recien insertado (capturar su id con `.insert(...).select('id')`), (2) devolver la transferencia a LIBRE solo si sigue con el estado que le pusimos (`.eq('estado', estadoTransferencia)`), (3) restar de las estadisticas del cliente lo que se sumo (total_comprado - monto, boletas_grandes_compradas - (paso a 0)). Idealmente mover todo el flujo a una RPC transaccional (como trasladar_abono_atomico) para garantizar atomicidad real.

### 11. [MEDIA] `api/admin/eliminar-abono.js`:140-144
**Revertir un abono con exceso deja saldo_restante mayor al precio de la boleta**

- **Causa raíz:** Al crear un abono con permitirExceso (abono.js líneas 66-77), el saldo se fuerza a 0 aunque el monto supere lo que faltaba, pero total_abonado suma el monto completo. En revertirAbono se recalcula nuevoSaldo = saldo_restante + monto sumando el monto COMPLETO. Si el abono original tuvo exceso (p.ej. faltaban $5.000 y se abonó $8.000), al borrarlo el saldo queda en 0 + 8.000 = 8.000, por encima del precio real de la boleta. El saldo_restante queda inflado y descuadrado respecto al total_abonado.
- **Arreglo propuesto:** Reconstruir el saldo desde la verdad (precio_total - suma de abonos restantes) en lugar de sumar ciegamente el monto, o topar nuevoSaldo al precio de la boleta: nuevoSaldo = Math.min(precioBoleta, Number(saldo_restante) + monto). Lo más robusto es recalcular saldo_restante y total_abonado releyendo todos los abonos vivos de la boleta tras el borrado.

### 12. [MEDIA] `api/admin/finanzas.js`:176-188
**Gasto desde Caja Oficina queda sin reflejarse en el saldo si falla el insert en movimientos_caja**

- **Causa raíz:** crear_gasto_caja inserta primero el gasto en 'gastos' y luego, para caja oficina, una 'salida' en movimientos_caja. Si ese segundo insert falla, solo se hace console.error y se continúa (no se aborta ni se revierte el gasto). Pero calcularSaldoCajaOficina lee EXCLUSIVAMENTE de movimientos_caja (línea 55-69). Resultado: el efectivo salió realmente pero el saldo de Caja Oficina sigue inflado, y el cuadre diario nunca descuenta ese gasto. Los dos sistemas quedan desincronizados justo en lo que la función promete mantener en sync.
- **Arreglo propuesto:** Si el insert en movimientos_caja falla para caja oficina, revertir (borrar) el gasto recién insertado y devolver error 500, o bien hacer ambos inserts dentro de una RPC transaccional para que sea atómico. No basta con loguear: el saldo que se valida y se muestra depende de movimientos_caja.

### 13. [MEDIA] `api/admin/buscar-referencia.js`:37-43
**Búsqueda del abono usa la referencia cruda en lugar de la del transfer encontrado**

- **Causa raíz:** El transfer se localiza con búsqueda PARCIAL: `.ilike('referencia', '%refLimpia%')`, así que `trans.referencia` puede ser un texto más largo que lo que tecleó el asesor (ej. teclea '0092366866' y el transfer guardado es 'mauren farid pajoy'... o teclea parte de un código). Pero el abono se busca con igualdad EXACTA sobre la entrada cruda: `.eq('referencia_transferencia', referencia)`. En abonos, referencia_transferencia guarda el texto COMPLETO (verificado: ej. 'Consignacion corresponsal cb'). Si el asesor escribe una referencia parcial, encuentra el transfer pero NO el abono, y el endpoint responde 'ASIGNADA_SIN_ABONO' aunque el abono sí exista, impidiendo liberar/eliminar el abono correcto.
- **Arreglo propuesto:** Buscar el abono usando la referencia del transfer ya hallado en vez de la entrada del usuario: `.eq('referencia_transferencia', trans.referencia)` (o, mejor aún, por el id: `.eq('id_transferencia', trans.id)`, que existe en la tabla abonos y es exacto). Usar referencia cruda solo si se quiere mantener compatibilidad, pero el id es lo robusto.

### 14. [MEDIA] `api/admin/buscar-transferencia-ia.js`:39
**Match por referencia usa includes() con la referencia cruda, generando coincidencias falsas con códigos cortos**

- **Causa raíz:** En el diagnóstico (línea 39) y en el INTENTO 1 (línea 83) se hace `String(c.referencia).includes(referencia)` con la referencia cruda de la IA. Si la IA devuelve una referencia corta o un nombre (en pagos por llave la referencia pasa a ser el NOMBRE del remitente, ver procesar-ia.js línea 153), includes() puede emparejar por substring accidental (ej. 'ana' dentro de 'mariana', o un número corto contenido en otra referencia). El guard `refLimpia.length > 4` solo aplica a la variante de solo-dígitos, no al includes() de la referencia cruda. Puede asociar el comprobante a la transferencia equivocada y, aguas abajo, abonar el pago a la boleta incorrecta.
- **Arreglo propuesto:** Exigir longitud mínima también para el includes() de la referencia cruda (p. ej. referencia.length >= 5) o preferir igualdad exacta para referencias cortas/no numéricas; reservar el match por substring solo para códigos numéricos largos (refLimpia.length > 4).

### 15. [MEDIA] `api/admin/permisos.js`:57-64
**Un solo permiso en BD borra todos los permisos por defecto del asesor (incluye admin/caja)**

- **Causa raíz:** En la acción 'mis_permisos', el flag hasDb se calcula como (data.length > 0): basta UNA fila en permisos_asesores para que el código entre en la rama que SOLO copia las filas existentes de la BD. Las páginas que no tienen fila explícita quedan como undefined en vez de caer en defaultPermitido(). Como 'actualizar' hace upsert de una sola página, la primera vez que un admin cambia UN permiso de un asesor que no tenía filas, ese asesor pasa a hasDb=true con una sola fila y pierde el acceso por defecto al resto de páginas (incluidas 'admin' y 'caja', que siempre deberían ser true). El menú/sidebar interpreta undefined como sin permiso.
- **Arreglo propuesto:** No usar un flag todo-o-nada. Construir el objeto SIEMPRE a partir de defaultPermitido() para cada página de PAGINAS, y luego sobrescribir solo las páginas que sí tienen fila en la BD: for (const p of PAGINAS) permisos[p.id] = defaultPermitido(nombreAsesor, p.id); y después for (const row of data) permisos[row.pagina_id] = row.permitido. Así una fila parcial no borra el resto. (Nota: la acción 'listar_todo' ya hace esto correctamente fila-por-fila con fallback a default, por lo que el panel de admin y 'mis_permisos' divergen.)

### 16. [MEDIA] `api/admin/permisos.js`:103-120
**La acción 'actualizar' no valida que asesor_nombre sea un asesor registrado ni normaliza casing**

- **Causa raíz:** A diferencia de asesores-config.js (que valida asesor_nombre contra listarTodosLosAsesores() antes de escribir), permisos.js confía ciegamente en el asesor_nombre del body y lo guarda tal cual en permisos_asesores. Si llega un nombre con casing distinto al canónico de ASESORES_SECRETO (o un nombre inexistente), se crea una fila 'huérfana': mis_permisos consulta con .eq('asesor_nombre', nombreAsesor) usando el nombre canónico exacto (case-sensitive), y listar_todo hace match con r.asesor_nombre === asesor (case-sensitive), por lo que esa fila nunca se vuelve a leer/editar y el permiso real del asesor no cambia. Hoy el frontend manda el nombre canónico, pero no hay defensa en el backend.
- **Arreglo propuesto:** Antes del upsert, validar que asesor_nombre exista en listarTodosLosAsesores() (devolver 400 si no), igual que en asesores-config.js. Idealmente normalizar a la forma canónica de ASESORES_SECRETO para que las lecturas case-sensitive de mis_permisos/listar_todo siempre coincidan con lo escrito.

### 17. [MEDIA] `api/admin/sincronizar-agentes.js`:23-28
**Errores de ChateaPro se reportan como status 200 'error' pero igual cuentan como fallo silencioso de una línea sin sincronizar la otra**

- **Causa raíz:** Si respuesta1.data falta (token vencido, rate limit, respuesta no-JSON), se hace return inmediato y NUNCA se sincroniza la Línea 2 aunque esta sí haya respondido bien. Una caída temporal de una línea bloquea por completo la actualización de la otra, dejando métricas desactualizadas sin que el flujo continúe con los datos válidos disponibles.
- **Arreglo propuesto:** No abortar todo el proceso cuando una línea falla: acumular los datos de las líneas que sí respondieron, registrar el fallo de la línea caída en un arreglo de errores (como hace sincronizar-facebook.js con erroresFB) y hacer el upsert con lo disponible, informando el fallo parcial.

### 18. [MEDIA] `api/admin/difusion-llamadas.js`:172-177
**La llamada anuncia el saldo TOTAL de todas las boletas pero solo menciona la primera boleta**

- **Causa raíz:** En accion 'lanzar' se toma boletaParaLlamada = cliente.boletas[0] (solo la primera) y se pasa como parámetro 'boletas', pero 'total' se calcula con cliente.totalSaldo, que es la suma del saldo de TODAS las boletas del cliente (acumulado en porCliente[...].totalSaldo en el preview). Resultado: si el cliente tiene varias boletas, la grabación le dice 'su boleta NNNN' (una sola) pero le pide el dinero correspondiente a la suma de todas. El monto leído no corresponde a la boleta mencionada, generando confusión y reclamos de cobro.
- **Arreglo propuesto:** Decidir la semántica deseada: o bien pasar todas las boletas (cliente.boletas.join(',')) junto con el total agregado, o bien leer solo el saldo de la boleta mencionada. Como mínimo, alinear el monto leído con la(s) boleta(s) que se nombran para que el cobro hablado sea coherente.

### 19. [MEDIA] `api/admin/difusion-llamadas.js`:65-67 y 75
**El filtro 'max_abonado' filtra por boleta individual y subreporta el saldo total del cliente**

- **Causa raíz:** El filtro .lte('total_abonado', maxAbonado) se aplica a cada fila de boleta antes de agrupar por cliente. Un cliente con una boleta con poco abonado y otra con mucho abonado entra al resultado, pero solo se suman al totalSaldo las boletas que pasaron el filtro (las de poco abono). Por tanto totalSaldo (que se muestra y se lee en la llamada) queda por debajo de la deuda real del cliente, y la segmentación 'máximo abonado' mezcla clientes que en realidad ya abonaron bastante en otra boleta.
- **Arreglo propuesto:** Definir si 'max_abonado' debe evaluarse a nivel cliente (suma de total_abonado de todas sus boletas) en lugar de por boleta. Si es por cliente, traer todas las boletas con saldo, agrupar, y luego filtrar el cliente por su total_abonado agregado; así totalSaldo refleja la deuda completa. Aplica igual a rescate-whatsapp.js (línea 159).

### 20. [MEDIA] `api/contenido/copy-gen.js`:440
**Chequeo de permisos con startsWith permite acceso no deseado a gerencia**

- **Causa raíz:** El control de acceso usa `ALLOWED.some(n => nombreLower === n || nombreLower.startsWith(n))` con ALLOWED = ['mateo','valeria','alejo p','alejo plata']. El `startsWith` hace que CUALQUIER asesor cuyo nombre empiece por una de esas cadenas pase el filtro. Con 'alejo p' un asesor distinto como 'Alejo Perez' obtendria acceso de gerencia, y 'mateo'/'valeria' como prefijos dejarian pasar a cualquier 'Mateo X' o 'Valeria Y' futuro. Ademas es inconsistente con los otros 3 endpoints del area (datos.js, presupuesto.js, transcribir.js) que usan match EXACTO (`ACCESO_PERMITIDO.includes(...)`). La entrada 'alejo plata' ademas queda redundante porque 'alejo p' ya la cubre por prefijo.
- **Arreglo propuesto:** Reemplazar el chequeo por match exacto igual que los otros endpoints: `const ALLOWED = ['mateo','valeria','alejo plata']; const tieneAcceso = ALLOWED.includes(nombreLower);`. Quitar el `startsWith` y la entrada de prefijo 'alejo p'. Si se quiere seguir permitiendo 'alejo p' como alias, listarlo explicitamente pero siempre comparando con `===`.

### 21. [MEDIA] `api/abonar/wompi-webhook.js`:78-135
**Aplicación de abonos sin transacción ni relectura: lost update si otro flujo abona la misma boleta en paralelo**

- **Causa raíz:** Se lee boletasDB (saldo_restante, total_abonado) en el paso 5 y luego, en el paso 6, se hace UPDATE con valores calculados sobre ESE snapshot (saldo - aPagar, total_abonado + aPagar) usando .eq('numero', ...). No es atómico ni relee el saldo dentro del update. Si entre el SELECT y el UPDATE otro canal (abono de asesor/agente, otro webhook) modifica esa boleta, ese abono se pierde (lost update / write skew). La idempotencia por tx.id evita reprocesar el MISMO evento, pero no protege contra escrituras concurrentes de orígenes distintos sobre la misma boleta.
- **Arreglo propuesto:** Aplicar el abono de forma atómica en la base: usar una RPC/función SQL que haga UPDATE boletas SET saldo_restante = saldo_restante - aPagar, total_abonado = total_abonado + aPagar WHERE numero = ... (cálculo relativo en SQL, no con el valor leído en Node), idealmente dentro de una transacción que inserte el abono y actualice la boleta juntos, con un check de saldo >= aPagar en el WHERE.

### 22. [MEDIA] `public/admin.js`:1512-1559
**El modo 'Transferencia/Inteligente' del abono no resetea esAbonoPendiente, dejando un pago real marcado como pendiente**

- **Causa raíz:** En setModoAbonoPago, solo la rama 'efectivo' (esAbonoPendiente=false) y 'pendiente' (esAbonoPendiente=true) tocan la variable. La rama 'inteligente' (el else final, lineas 1551-1558) NO la pone en false. Secuencia: el asesor elige 'Pendiente' (esAbonoPendiente=true), luego cambia a 'Transferencia' para enlazar un comprobante real; la bandera queda en true. Al registrar (linea 1114) se envia esPendiente:true con una transferencia real. El backend (api/admin/abono.js linea 141) guarda origen='pendiente' en vez de 'transferencia_real', y si la oficina no es Mateo y el interruptor pendiente esta apagado (linea 31) RECHAZA el abono. Lo mismo aplica a la venta: setModoVenta no resetea esVentaPendiente en 'separar' ni 'inteligente' (lineas 39-53).
- **Arreglo propuesto:** En setModoAbonoPago, en la rama 'inteligente' (else final) agregar esAbonoPendiente = false; e idealmente tambien resetearla tras un registro exitoso en registrarAbono. En setModoVenta agregar esVentaPendiente = false en las ramas 'separar' e 'inteligente'. Asi la bandera de pendiente solo queda activa cuando el modo realmente es pendiente.

### 23. [MEDIA] `public/admin.js`:957, 969, 984-992
**Reparto con Math.floor en venta pierde pesos y descuadra el monto de la transferencia enlazada**

- **Causa raíz:** perNum = Math.floor(totalMoney/nums.length) y cada boleta recibe primerAbono: perNum. Cuando el total no es divisible entre el numero de boletas se pierden 1..(n-1) pesos del total abonado. Mas grave en pago inteligente: la transferencia enlazada se marca ASIGNADA por su monto completo, pero la suma de los abonos acreditados (perNum*n) es menor que el monto real de la transferencia, dejando un descuadre permanente entre lo que entro al banco y lo acreditado a las boletas.
- **Arreglo propuesto:** Repartir el residuo: dar a las primeras (totalMoney mod nums.length) boletas un peso extra, p.ej. calcular base=Math.floor(total/n) y resto=total - base*n, y asignar base+1 a las primeras 'resto' boletas. Asi la suma de abonos iguala exactamente el monto de la transferencia.

### 24. [MEDIA] `public/admin.js`:330-346
**El pegado global de comprobante (Ctrl+V con imagen) dispara enlace de transferencia tambien en venta Efectivo/Pendiente**

- **Causa raíz:** El handler de paste global decide solo por la visibilidad de paymentSections (linea 339: style.display !== 'none'). En venta, setModoVenta muestra paymentSections en los modos 'inteligente', 'efectivo' Y 'pendiente' (lineas 46, 55, 76). Por eso, pegar una imagen estando en venta Efectivo o Pendiente ejecuta handleOCR sobre v_referenciaAbono/v_idTransferencia/v_metodoPago, pudiendo sobrescribir la referencia 'efectivo' por la de una transferencia encontrada y activar esPagoInteligente. La rama de abono SI guarda con modoAbonoPago==='inteligente' (linea 342), evidenciando que en venta falta el mismo guard.
- **Arreglo propuesto:** Agregar en la condicion del bloque de venta (linea 339) la verificacion de que el modo sea inteligente, p.ej. && modoVenta === 'inteligente', igual que el guard que ya existe del lado de abono. Asi el OCR de transferencia no actua en Efectivo ni Pendiente.

### 25. [MEDIA] `public/flujos-bandeja.js`:620
**Validación de 'número' acepta entradas sin dígito real útil y rechaza válidas con formato**

- **Causa raíz:** VALIDA.numero = t => /\d/.test(t) && /^[\s$.,\d-]+$/.test(t). El segundo regex permite cadenas como '-', '.', '$', ',' combinadas: '$.,' pasa /\d/? no (no tiene dígito) pero '1-2-3' o '1.2.3.4' pasan y luego parseFloat los interpreta mal en condiciones mayor/menor. Más crítico: en el nodo condición (línea 673) se hace parseFloat(origen.replace(/[^\d.-]/g,'')) sobre montos como '1.000.000' (formato colombiano con puntos de miles) → parseFloat('1.000.000')=1, comparando dinero como 1 en vez de un millón.
- **Arreglo propuesto:** Normalizar números colombianos antes de comparar: quitar separadores de miles (puntos) y/o tratar coma como decimal según convención, p.ej. limpiar a un formato canónico antes de parseFloat en el case 'mayor'/'menor'. Documentar el formato esperado para evitar comparar montos erróneamente.

### 26. [MEDIA] `public/llamadas.html`:1121-1140 (updateCobroSelectCount) + textarea cobroPlantilla (~229)
**La validacion de creditos ElevenLabs no se recalcula al editar el mensaje; se puede lanzar superando el limite**

- **Causa raíz:** estimarTiempoCobro estima los caracteres ElevenLabs a partir de document.getElementById('cobroPlantilla').value y, si no alcanzan (est.alcanza === false), deshabilita btnCobroLanzar. Pero esa validacion solo corre dentro de updateCobroSelectCount, que se dispara con onchange de los checkboxes y al cargar el preview. El textarea cobroPlantilla NO tiene oninput/onchange que recalcule. Si el usuario primero selecciona clientes (estado 'alcanza') y luego alarga el mensaje, est.alcanza queda obsoleto, el boton sigue habilitado y confirmarCobroLanzamiento/ejecutarCobroLanzamiento nunca revalidan `alcanza` antes de disparar. Resultado: se lanzan llamadas ElevenLabs que exceden los caracteres disponibles, consumiendo/agotando creditos pagados.
- **Arreglo propuesto:** Anadir oninput/onchange al textarea cobroPlantilla que invoque updateCobroSelectCount() (o un recalculo de estimarTiempoCobro). Ademas, en confirmarCobroLanzamiento revalidar est.alcanza y abortar con mensaje si no alcanza, en lugar de depender solo del estado disabled del boton.

### 27. [MEDIA] `public/llamadas.html`:1393-1416 (estimarTiempoRescate) y 1431-1437 (confirmarRescateLanzamiento)
**Rescate no valida creditos de ElevenLabs ni muestra el costo segun la voz realmente elegida**

- **Causa raíz:** estimarTiempoRescate fija el subtitulo a '~$X USD · Usa voz de ElevenLabs' sin mirar el valor real de rescateVoz (que por defecto es 'audio:0404.mp3', una voz gratuita). A diferencia del cobro, el flujo de rescate nunca llama a esVozGratis()/estimarCaracteresPorLlamada() ni compara contra elevenlabsInfo, de modo que: si el usuario elige la voz ElevenLabs en rescate, no hay ninguna comprobacion de 'NO ALCANZAN' ni se deshabilita el boton, y el texto de costo/creditos es incorrecto. Se pueden lanzar rescates que agoten los caracteres pagados sin aviso.
- **Arreglo propuesto:** Reutilizar la logica de estimarTiempoCobro/esVozGratis para rescate: leer rescateVoz, calcular caracteres si es ElevenLabs, comparar contra elevenlabsInfo y deshabilitar btnRescateLanzar con aviso 'NO ALCANZAN' cuando no haya creditos suficientes; ajustar el subtitulo al tipo de voz real.

### 28. [MEDIA] `public/admin-horarios.html`:693
**"Agregar Nuevo Asesor" con un nombre ya existente sobrescribe el horario del asesor real sin avisar**

- **Causa raíz:** agregarAsesor() construye un horario por defecto (L-V 08:00-17:00) y lo envía con accion 'guardar_semana'. El backend (api/admin/horarios.js, upsert con onConflict 'asesor_nombre,semana_inicio,dia_semana') hace UPSERT por nombre. No hay validación de que el nombre no exista ya. Si se teclea un nombre idéntico (o se re-agrega por error) a un asesor existente, se machacan sus horarios/colores reales de esa semana con los valores por defecto, sin confirmación ni aviso.
- **Arreglo propuesto:** Antes de enviar, comprobar contra la lista cargada: `if (Object.keys(porAsesor o horariosTodos).map(n=>n.toLowerCase()).includes(nombre.toLowerCase())) { toast('Ya existe un asesor con ese nombre','err'); return; }`, o pedir confirmación con modalConfirm cuando el nombre ya exista.

### 29. [MEDIA] `public/admin.js`:3892-3909 (lbToggleLlamada) y 3924-3940 (lbToggleCobro)
**Toggle de llamada/cobro marca el estado localmente aunque el servidor rechace la peticion**

- **Causa raíz:** Ambas funciones hacen Promise.all(boletas.map(b => fetch(...))) y, si no lanza excepcion, actualizan _listaBoletasCompleta marcando b.llamada/b.cobro = marcar. Pero fetch NO rechaza ante respuestas HTTP 4xx/5xx (solo ante fallo de red); el backend marcar-llamada.js/marcar-cobro.js devuelven status 401 (contrasena incorrecta) o 500 (error DB) con cuerpo {status:'error'}, que se resuelve como exito. Nunca se revisa res.ok ni el JSON status, asi que el catch no se dispara y la UI muestra la boleta como llamada/cobrada cuando en la base de datos no se guardo. Queda un estado falso que desorienta al equipo de cobranza.
- **Arreglo propuesto:** Dentro del Promise.all validar cada respuesta: const r = await fetch(...); const data = await r.json(); if(!r.ok || data.status !== 'ok') throw new Error(...). Solo actualizar _listaBoletasCompleta y re-renderizar si TODAS las peticiones respondieron status ok; si alguna falla, revertir el boton (opacity/disabled) y avisar al usuario.

### 30. [MEDIA] `public/abonar-steps.js`:StepConfirmar (función window.StepConfirmar): const m=a.reduce(...saldoPendiente),M=Math.min(2e4,m); b=n>=M&&n<=m
**El mínimo de abono permitido por el front es menor que el mínimo que exige la API (saldos < $10.000 quedan bloqueados)**

- **Causa raíz:** El front calcula el mínimo como M=Math.min(20000, saldoTotal) y valida b = monto>=M && monto<=saldoTotal. Cuando el saldo pendiente es menor a $10.000 (caso real: una boleta de $150.000 con abonos previos puede quedar con saldo de, p.ej., $5.000), M baja a ese saldo y el front habilita el botón 'Pagar' por ese monto. Pero api/abonar/iniciar-pago.js rechaza explícitamente cualquier monto < 10000 ('El monto mínimo es $10.000'). El usuario ve el botón activo, paga, y la API devuelve error; nunca puede liquidar el saldo final pequeño por este flujo.
- **Arreglo propuesto:** Unificar el mínimo en ambos lados. Si el saldo es <$10.000, el front debe permitir pagar exactamente ese saldo y la API debe aceptar montos que igualen el saldo restante aunque sean <$10.000 (cambiar la regla de iniciar-pago.js a: rechazar solo si monto<10000 Y monto<saldoTotal). Alternativamente, mostrar un aviso y derivar por WhatsApp esos saldos menores a $10.000.

### 31. [MEDIA] `public/abonar-app.js`:AbonarApp, función O (buscar cliente): const o=await fetch(`/api/abonar/cliente?telefono=${encodeURIComponent(d)}`)
**La búsqueda de cliente en el flujo de abono NO antepone el indicativo del país (inconsistente con ver-house-app.js)**

- **Causa raíz:** O() consulta /api/abonar/cliente usando solo 'd' (el número local, sin código de país), mientras que ver-house-app.js sí construye '(pais.code).replace(/+/g,"")+telefono' antes de consultar el mismo endpoint. La API tolera el caso porque hace telefono.slice(-10) y un LIKE '%'+last10, pero para un número extranjero corto (8-9 dígitos, p.ej. Panamá/España) la coincidencia por sufijo de pocos dígitos puede empatar con el teléfono de OTRO cliente (un colombiano cuyo número termine igual), devolviendo datos de boleta ajenos. La inconsistencia entre los dos flujos delata que se omitió anteponer el indicativo.
- **Arreglo propuesto:** Construir el teléfono igual que en ver-house-app.js: anteponer el código de país sin el '+' antes de llamar a /api/abonar/cliente y a /api/abonar/iniciar-pago (usar (l.code||'').replace(/\+/g,'')+d). Así la API recibe el número completo y el slice(-10) opera sobre dígitos consistentes, evitando colisiones de sufijo entre clientes.

### 32. [MEDIA] `api/whatsapp/verificaciones.js`:46-57
**El cierre de caso ('caso cerrado') puede engancharse a un abono de OTRO cliente por colisión de últimos 10 dígitos**

- **Causa raíz:** Se buscan boletas con `.like('telefono_cliente', '%' + last10)` y luego se traen abonos por `numero_boleta in numeros` SIN el filtro `esMismoTelefono(...)` que buscar-pago.js (H70) sí aplica para descartar colisiones de cola (un extranjero +1 305xxxxxxx vs 57 305xxxxxxx comparten los últimos 10 sin ser el mismo). Como aquí no se vuelve a confirmar que la boleta sea de verdad de este teléfono, un abono registrado a un cliente homónimo en cola puede adjuntarse como `abono_posterior`, haciendo que una verificación 'rendido' que SÍ sigue impaga se muestre como '✅ caso cerrado' y se le oculte al asesor el 🆘 que pedía revisión.
- **Arreglo propuesto:** Filtrar las boletas con `esMismoTelefono(b.telefono_cliente, tel)` antes de construir `numeros` (igual que buscar-pago.js línea 107), e idealmente confirmar también que el abono pertenece a una boleta de este teléfono.

### 33. [MEDIA] `api/auth/enviar-otp.js`:48-52 (gate); afecta a /api/auth/vincular-telefono.js que depende de este unico emisor de OTP
**El login social de clientes NUEVOS queda bloqueado: el unico emisor de OTP exige tener boletas previas**

- **Causa raíz:** enviar-otp.js es el UNICO endpoint que genera/inserta codigos en otp_codes (verificar-otp.js y vincular-telefono.js solo leen/actualizan). Pero enviar-otp.js corta con 404 ('No encontramos boletas con este numero') cuando el telefono no tiene ninguna fila en boletas (clienteExiste === false). El flujo documentado social-login -> vincular-telefono (necesita_telefono: true -> pedir OTP -> vincular) es justamente para usuarios que entran por Google/Facebook y aun NO han comprado. Esos usuarios no tienen boletas, por lo que nunca pueden recibir el codigo y no pueden completar la vinculacion ni crear sesion. Confirmado contra el repo (grep: no existe otro emisor de OTP) y contra el esquema de prod (tabla otp_codes y cuentas_sociales existen).
- **Arreglo propuesto:** Permitir emitir OTP a telefonos sin boletas cuando el codigo es para vincular una cuenta social (p.ej. enviar-otp recibe un flag 'motivo=vincular' o existe un emisor dedicado que omite el chequeo de boletas), o que vincular-telefono tenga su propio envio de codigo sin la validacion de boletas. Mantener el rate-limit por telefono.

### 34. [MEDIA] `api/app/mis-boletas.js`:38, 45, 48
**Precio de boleta hardcodeado en 150000 ignora el precio_total real de cada boleta**

- **Causa raíz:** Se define `const PRECIO_BOLETA = 150000` y se asigna ese valor fijo a `precio_total` de TODAS las boletas, sin leer la columna real `precio_total` de la tabla `boletas`. Esa columna existe y varia por boleta (api/rifa/reservar.js calcula el total con `Number(b.precio_total) || PRECIOS.RIFA_4_CIFRAS` y guarda `saldo_restante = precio` con el precio individual, porque la gerencia maneja precios distintos). Resultado: la app muestra `precio_total` incorrecto y por ende `total_pendiente` y el total de la boleta mal en cualquier boleta cuyo precio no sea 150000. Ademas el `estado` ('Pagada' si saldo_restante===0) puede ser coherente por casualidad, pero los montos mostrados no cuadran con saldo_restante real.
- **Arreglo propuesto:** Incluir `precio_total` en el .select y usar `precio_total: Number(b.precio_total || 0)` por boleta, igual que hace api/abonar/cliente.js. Eliminar la constante fija o usarla solo como fallback cuando precio_total sea null.

### 35. [MEDIA] `api/abonar/wompi-webhook.js`:85-87
**Si faltan algunas boletas de la referencia, el pago se aplica parcial y se pierde el remanente**

- **Causa raíz:** Tras parsear la referencia se traen las boletas con .in('numero', boletasNumeros) y solo se valida `boletasDB.length === 0`. Si SOLO ALGUNAS boletas existen (length > 0 pero < boletasNumeros.length), el codigo continua y distribuye `montoEsperadoPesos` unicamente entre las encontradas; si su saldo combinado es menor al monto, el bucle termina con `restante > 0`. El pago ya fue cobrado por Wompi (status APPROVED) pero parte del dinero queda sin aplicar y solo se devuelve `restante` en el JSON, sin alerta ni reintento.
- **Arreglo propuesto:** Validar `boletasDB.length === boletasNumeros.length` y, si no coinciden, registrar el caso para revision manual (log/alerta) en vez de aplicar parcial silenciosamente. Igualmente, si al terminar `restante > 0`, registrar la diferencia como pendiente de conciliacion.

### 36. [MEDIA] `api/lib/numeros-disponibles.js`:51-58 (bucle porSerie con `if (error) throw error`)
**Un error en una sola consulta por serie tumba todo el endpoint de números disponibles**

- **Causa raíz:** Las 10 consultas por serie se lanzan con Promise.all y luego se recorren; ante el primer `error` de cualquier serie se hace `throw error`, abortando toda la función numerosDisponibles. Como esta función está en la ruta caliente de la venta (web, ChateaPro y atajo de la bandeja), un fallo transitorio de una sola de las 10 lecturas deja al cliente sin lista de números, en lugar de devolver las series que sí respondieron.
- **Arreglo propuesto:** No relanzar por serie: ante `error` de una serie, registrar y continuar con las demás (saltar esa serie), apoyándose en el paso 2 (relleno hasta 50 con cualquier disponible) para compensar. Solo fallar si TODAS las series y el pool fallan.

### 37. [MEDIA] `api/lib/difusion-envio.js`:41, 112-119
**Lost-update en contadores enviados/fallidos de la difusion (cron + navegador concurrentes)**

- **Causa raíz:** procesarLoteDifusion lee dif (incluido dif.enviados y dif.fallidos) en la linea 41, ANTES de reclamar el lote. Al final escribe los contadores como `(dif.enviados || 0) + nuevosEnviados` y `(dif.fallidos || 0) + nuevosFallidos` (lineas 112-119), un patron read-modify-write sin atomicidad. El propio docstring del archivo dice que el cron (difusiones-cron.js) y la accion manual 'enviar-lote' del navegador (difusiones.js:224) pueden tocar la MISMA difusion a la vez. El reclamo de destinatarios (difusion_reclamar_lote, FOR UPDATE SKIP LOCKED) es atomico y garantiza que NO haya doble envio: cada corrida toma destinatarios disjuntos. PERO los dos runners leen el mismo dif.enviados=N y cada uno escribe N+30, perdiendo el incremento de uno de ellos. Resultado: los contadores enviados/fallidos quedan por debajo del numero real de mensajes enviados.
- **Arreglo propuesto:** No recalcular los contadores en JS sobre el valor leido al inicio. Usar un incremento atomico en la base: o bien una RPC que haga `UPDATE difusiones SET enviados = enviados + p_nuevos, fallidos = fallidos + p_nuevos_fallidos WHERE id = p_id RETURNING enviados, fallidos`, o derivar los totales con COUNT real sobre difusion_destinatarios por estado (la funcion contar() ya existe) en vez de acumular en memoria. Si se mantiene el acumulado en JS, releer dif.enviados/fallidos justo antes del UPDATE final no elimina la ventana de carrera; la suma debe hacerse en SQL.

### 38. [MEDIA] `api/admin/abono.js`:48-52, 75-77, 187
**Abonos concurrentes a la misma boleta: el UPDATE del saldo no es condicional y pierde un abono**

- **Causa raíz:** Se lee saldo_restante y total_abonado de la boleta en las lineas 48-52, se calculan nuevoTotalAbonado y nuevoSaldoRestante a partir de esos valores (lineas 75-77) y se escribe la boleta con un UPDATE incondicional en la linea 187 (solo `.eq('numero', numeroLimpio)`, sin ninguna condicion CAS sobre el saldo previo). Los hermanos venta.js (`.is('telefono_cliente', null)`) y reservar.js usan updates condicionales precisamente para evitar esto. El consumo de la transferencia (lineas 117-128) si esta protegido con `.eq('estado','LIBRE')`, pero un abono en EFECTIVO o por auto-asignacion de referencia NO trae idTransferencia, y dos transferencias distintas dirigidas a la misma boleta tampoco se serializan entre si. Si dos abonos a la misma boleta corren en paralelo, ambos leen el mismo saldo, ambos pasan la validacion, y el segundo UPDATE pisa al primero con un total_abonado/saldo_restante calculado sobre datos viejos: las DOS filas de abono quedan insertadas pero la boleta solo refleja UNO, dejando saldo_restante inflado (la boleta queda debiendo plata que el cliente ya abono).
- **Arreglo propuesto:** Hacer el ajuste de la boleta atomico: o bien una RPC/SQL que recalcule `total_abonado = (SELECT SUM(monto) FROM abonos WHERE numero_boleta=...)` y derive saldo_restante, o un UPDATE condicional tipo `UPDATE boletas SET total_abonado = total_abonado + monto, saldo_restante = GREATEST(0, saldo_restante - monto) ... WHERE numero = ? AND total_abonado = abonadoActual` (CAS) y si no afecta fila, reintentar releyendo. Asi dos abonos concurrentes a la misma boleta se suman correctamente en vez de pisarse.

### 39. [MEDIA] `api/whatsapp/contactos.js`:24-37
**Fuga de directorio completo de contactos entre líneas al omitir linea_id**

- **Causa raíz:** Mismo patrón que mensajes.js: el guard `if (linea_id && !(await puedeVerLinea(nombre, linea_id)))` (línea 24) solo corre cuando hay linea_id, y la consulta solo filtra por línea con `if (linea_id) query = query.eq('linea_id', linea_id)` (línea 37). Un asesor con líneas restringidas que envía POST sin `linea_id` recibe el listado paginado de TODOS los contactos (telefono, nombre_perfil, correo, ultimo_at) de conversaciones_whatsapp de todas las líneas, incluyendo líneas que no le corresponden. Falta el guard de no-gerencia que sí tiene conversaciones.js (líneas 73-75).
- **Arreglo propuesto:** Importar esGerencia de ../lib/asesores.js y agregar tras validarAsesor: `if (!linea_id && !esGerencia(nombre)) return res.status(200).json({ status:'ok', contactos: [], total: 0, page: 0, porPagina: POR_PAGINA });` (o un 403), igual que conversaciones.js, para que un asesor restringido sin línea no obtenga contactos de líneas ajenas.

### 40. [MEDIA] `api/twiml/estado-llamada.js`:16 (y api/admin/difusion-llamadas.js:303 y :321)
**La columna 'recording_url' NO existe en la tabla llamadas_twilio: las grabaciones de llamadas nunca se guardan ni se pueden reproducir**

- **Causa raíz:** La tabla llamadas_twilio solo tiene las columnas: id, sid, telefono, nombre_cliente, boletas, saldo, estado, duracion, lanzada_por, created_at, updated_at (verificado contra la base de prueba ikvzmojzgpxuhnbymtxm). Sin embargo el código escribe y lee 'recording_url': estado-llamada.js:16 hace .update({ recording_url: ... }) cuando Twilio avisa que la grabación está lista; difusion-llamadas.js:321 hace el mismo update en el 'sync de grabaciones'; y difusion-llamadas.js:303 hace .is('recording_url', null) dentro de un SELECT. PostgREST devuelve 'column llamadas_twilio.recording_url does not exist'. En estado-llamada.js y en el loop de sync el error queda tapado por el try/catch (catch vacío), así que la URL nunca se persiste; y el SELECT con .is('recording_url', null) falla, deja sinGrabacion=undefined y el loop de recuperación nunca corre. El historial (accion 'historial', select('*')) tampoco trae el campo, así que el frontend siempre recibe recording_url vacío y grabacion.js (que solo hace proxy de la URL recibida) no tiene qué reproducir. Resultado: TODA la función de escuchar grabaciones de llamadas está rota silenciosamente.
- **Arreglo propuesto:** Agregar la columna a la tabla: ALTER TABLE llamadas_twilio ADD COLUMN recording_url text; (recargar PostgREST con NOTIFY pgrst, 'reload schema'; si no pega, reiniciar la API en Supabase). Con eso los tres lugares (estado-llamada.js:16, difusion-llamadas.js:303 y :321) quedan correctos sin tocar código. Confirmar luego que el botón de reproducir grabación funcione. Como medida secundaria, NO dejar el catch totalmente vacío en estado-llamada.js: al menos console.error para que un fallo futuro de columna/tipo no vuelva a quedar invisible.

### 41. [MEDIA] `api/admin/liberar-boleta.js`:100-103
**Liberar una boleta NO libera la transferencia cuando el pago estaba REPARTIDO entre varias boletas: la transferencia queda huérfana y no se puede reasignar**

- **Causa raíz:** Al liberar una boleta, el código libera la transferencia con .update({ estado: 'LIBRE' }).eq('estado', `ASIGNADA a boleta ${numeroBoleta}`). Eso solo coincide con el estado EXACTO de una transferencia asignada a UNA boleta. Cuando el pago fue dividido entre varias boletas, su estado es 'ASIGNADA REPARTIDA: 8732, 8733, ...' (no 'ASIGNADA a boleta NNNN'), por lo que el .eq no coincide con ninguna fila y la transferencia se queda en 'ASIGNADA REPARTIDA' para siempre. Mientras tanto el paso C borra los abonos de esa boleta (.delete().eq('numero_boleta', ...)). Como admin/abono.js y admin/venta.js solo consumen transferencias con estado 'LIBRE', esa transferencia repartida queda bloqueada y nunca se puede volver a usar. En la base de prueba hay 42 transferencias en estado REPARTIDA, así que el caso es real. El propio admin/eliminar-abono.js SÍ maneja el reparto (detecta 'ASIGNADA REPARTIDA%', revierte todas las partes y deja la transferencia LIBRE, líneas 21-68); liberar-boleta.js no replicó esa lógica.
- **Arreglo propuesto:** Antes (o en lugar) del .eq('estado', `ASIGNADA a boleta ${numeroBoleta}`), detectar si alguno de los abonos de la boleta pertenece a una transferencia REPARTIDA y, si es así, aplicar la misma lógica que eliminar-abono.js: ubicar la transferencia ('ASIGNADA REPARTIDA%' por referencia o por id_transferencia del abono), borrar TODAS las partes del reparto (abonos con esa referencia en las boletas listadas) y poner la transferencia entera en 'LIBRE'. Idealmente reutilizar el helper boletasDeEstado() y centralizar la liberación de transferencia para no volver a divergir de eliminar-abono.js.

### 42. [MEDIA] `api/admin/abono.js`:229-236
**abono.js devuelve 500 si falla solo la bitacora, induciendo doble abono al reintentar en el camino manual (efectivo)**

- **Causa raíz:** Tras completar el abono, la transferencia, las estadisticas y la boleta (todo ya commit), el ultimo paso inserta en `registro_movimientos` y hace `if (errorBitacora) throw new Error('Error en Bitacora: ...')` (linea 236), que cae al catch global y responde 500. El abono YA fue registrado con exito, pero quien llama recibe un error y normalmente reintenta. En el camino manual/efectivo NO se envia `idTransferencia`, asi que no existe el candado anti-doble-abono (que en el camino del agente impide reusar una transferencia ya consumida). Un reintento del asesor inserta un SEGUNDO abono, sumando de nuevo al `total_abonado` y bajando otra vez el `saldo_restante` de la boleta. Una falla cosmetica en la bitacora termina causando doble cobro registrado.
- **Arreglo propuesto:** No tumbar la operacion por un fallo de bitacora: la bitacora es informativa. Cambiar el `throw` por un log (console.error) y devolver 200 con status ok (opcionalmente un campo warning), igual que caja.js trata el arrastre de base como warning sin bloquear el cierre. Asi el cliente no reintenta una operacion que ya tuvo exito.

### 43. [MEDIA] `api/admin/procesar-ia.js`:268
**Crash (TypeError) en escudo anti-clones cuando la IA no devuelve 'plataforma'**

- **Causa raíz:** En la comparación de duplicados de transferencias se accede a `datos.plataforma.toLowerCase().trim()` SIN proteger contra que `datos.plataforma` sea undefined/null. La validación previa (línea 117) solo exige `monto`, `referencia` y `fecha_pago` — NO `plataforma`. Si Claude devuelve el JSON sin el campo `plataforma` (o como null), o si entra por la ruta `datosDirectos` (que solo requiere monto+fecha_pago, línea 43), y ADEMÁS ya existe en la base una transferencia con el mismo monto+fecha (línea 265 `existentes.length > 0`), la línea 268 lanza `Cannot read properties of undefined (reading 'toLowerCase')`. El catch global lo convierte en un 500 y la carga del comprobante falla. El archivo hermano `procesar-ia-gasto.js` (líneas 81 y 107) hace lo correcto con `String(datos.plataforma || '')`, lo que confirma que aquí es un descuido.
- **Arreglo propuesto:** Envolver el acceso con String() y default, igual que en procesar-ia-gasto.js: `const mismaPlatf = String(datos.plataforma || '').toLowerCase().trim() === String(tExist.plataforma).toLowerCase().trim();`. Opcionalmente, añadir un default `datos.plataforma = datos.plataforma || 'Bancolombia'` tras el bloque de normalización (líneas 124-131).

### 44. [MEDIA] `api/admin/marcar-devolucion.js`:25-58
**marcar-devolucion: check-then-write sin candado puede pisar una transferencia que se acaba de ASIGNAR a una boleta (race LIBRE->ASIGNADA vs DEVUELTA)**

- **Causa raíz:** El handler LEE la transferencia (select estado, lineas 25-29), valida que estadoActual === 'LIBRE' (linea 48) y luego hace un UPDATE INCONDICIONAL estado='DEVUELTA' WHERE id=idTransferencia (lineas 55-58), SIN .eq('estado','LIBRE') ni verificacion de filas afectadas. Entre la lectura y la escritura, otro proceso (api/admin/venta.js lineas 153-162 y la auto-asignacion por referencia lineas 206-211, o un abono) puede consumir la MISMA transferencia con su guard .eq('estado','LIBRE'), dejandola en 'ASIGNADA a boleta NNNN'. El UPDATE de devolucion pisa ese 'ASIGNADA' y lo convierte en 'DEVUELTA': la transferencia queda marcada como devolucion aunque su plata ya quedo aplicada al abono de una boleta. Verificado en produccion (Supabase 'Rifa prueba'): los estados reales son 'LIBRE', 'ASIGNADA a boleta NNN' y 'DEVUELTA'; venta.js y verificar-pagos-cron usan el guard condicional, pero marcar-devolucion NO. Es el mismo patron consultar-y-luego-escribir sin atomicidad que el resto del sistema ya blinda.
- **Arreglo propuesto:** Hacer el UPDATE condicional y comprobar filas afectadas: const { data: dev } = await supabase.from('transferencias').update({ estado: 'DEVUELTA' }).eq('id', idTransferencia).eq('estado', 'LIBRE').select('id'); if (!dev || dev.length === 0) return res.status(400).json({ status:'error', mensaje:'Esta transferencia se acaba de asignar a una boleta en otro proceso. Refresca y verifica antes de marcar la devolucion.' }); Asi el motor de la base garantiza la atomicidad (mismo enfoque que venta.js/abono.js) y nunca se pisa una asignacion concurrente.

### 45. [MEDIA] `api/whatsapp/recordatorios.js`:22-37
**IDOR entre líneas: recordatorios.js no valida puedeVerLinea y filtra recordatorios de otras líneas**

- **Causa raíz:** El handler valida que el caller sea un asesor con validarAsesor, pero a diferencia de todos sus endpoints hermanos (marcar-respondido.js, etiquetas.js, comprobantes.js, etc.) NO llama a puedeVerLinea(nombre, linea_id). Luego consulta con supabaseAdmin (service role, ignora RLS) `recordatorios` filtrando solo por el linea_id y telefono recibidos del body. Un asesor asignado únicamente a la línea A puede pasar el linea_id de la línea B y leer los recordatorios (incluido el campo libre `motivo` que el agente guardó sobre ese cliente) de líneas a las que no tiene acceso.
- **Arreglo propuesto:** Importar puedeVerLinea de ../lib/asesores.js y, tras validar el asesor y antes de la consulta, agregar: `if (!(await puedeVerLinea(nombre, linea_id))) return res.status(403).json({ status:'error', mensaje:'No tienes acceso a esta línea.' });` (igual que en marcar-respondido.js).

### 46. [MEDIA] `api/admin/grabacion.js`:13
**SSRF/fuga de credenciales Twilio por validación laxa con includes('api.twilio.com')**

- **Causa raíz:** La única validación del parámetro `url` es `!url.includes('api.twilio.com')`. includes() coincide con cualquier URL que contenga ese texto en path o query, p.ej. https://atacante.com/?x=api.twilio.com o https://atacante.com/api.twilio.com. El handler luego hace fetch(url, { headers: { Authorization: Basic base64(TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN) }}), enviando las credenciales de Twilio al host arbitrario. Un asesor (cred. de bajo privilegio) puede así exfiltrar el Account SID y Auth Token de Twilio, o usar el servidor como proxy SSRF.
- **Arreglo propuesto:** Validar el host real, no el string: `let u; try { u = new URL(url); } catch { return res.status(400).json({error:'URL inválida'}); } if (u.protocol !== 'https:' || u.hostname !== 'api.twilio.com') return res.status(400).json({ error:'URL de grabación inválida' });`. Así el Authorization de Twilio solo se envía al host exacto api.twilio.com.

### 47. [MEDIA] `api/subir-comprobante.js`:4-82
**Inserción de transferencias 'LIBRE' falsas sin autenticación a partir de texto_ia controlado por el cliente**

- **Causa raíz:** El endpoint es público (sin validarAsesor) y sin guard de método. Toma `texto_ia` directamente del body/query del solicitante, lo parsea con regex (Plataforma/Monto/Referencia/Fecha/Hora) e inserta una fila en `transferencias` con estado 'LIBRE'. Como texto_ia es totalmente controlable por el atacante (no hay verificación de que provenga de un OCR real ni de un cliente autenticado), cualquiera puede fabricar transferencias 'LIBRE' con monto y referencia a elección. Esas transferencias falsas son justo las que admin/transferencias.js y el flujo autoBuscarPorReferencia tratan como pagos disponibles para asignar a boletas, abriendo un vector de fraude (reclamar boletas como pagadas con pagos inexistentes).
- **Arreglo propuesto:** Exigir autenticación/origen confiable antes de insertar: validar sesión del cliente (validarSesionApp) o el secreto interno (esSecretoInternoValido) según quién deba llamarlo, y/o no derivar la fila de transferencia directamente de texto_ia del request sino del resultado del OCR ejecutado server-side sobre una imagen subida. Como mínimo, marcar estas filas con un estado distinto ('PENDIENTE_VERIFICAR') que un asesor deba confirmar antes de poder asignarse.

### 48. [MEDIA] `api/admin/sin-etiqueta.js`:11-26 (fetchSubscribersByLabel) y 49-72 (uso)
**Falla silenciosa de ChateaPro invierte el reporte: clientes que SI pagaron salen como 'sin etiqueta de pago'**

- **Causa raíz:** En fetchSubscribersByLabel el fetch a ChateaPro se consume con `.then(r => r.json())` sin verificar `r.ok` ni que la respuesta traiga `resp.data`. ChateaPro responde los errores (token vencido/invalido, 401, 5xx) con un JSON de error (ej. {message:'Unauthenticated'}) que NO tiene `data`, asi que `resp.data` es undefined, el while corta con `hasMore=false` y devuelve `subs=[]` SIN lanzar excepcion. Como esto ocurre por etiqueta/linea, si una o varias de las 6 llamadas fallan, el Set `phonesPagados` queda vacio o incompleto. Luego (linea 69-72) se calcula `sinEtiqueta` filtrando las boletas activas cuyo telefono NO esta en `phonesPagados`: con el Set vacio, TODAS las boletas activas se clasifican como 'sin etiqueta de pago' y se responde `status:'ok'` con HTTP 200. No hay ningun guard tipo `!resp.data` como SI lo tiene su hermano sincronizar-agentes.js (lineas 23-28), que justamente frena cuando la respuesta no trae data.
- **Arreglo propuesto:** En fetchSubscribersByLabel verificar `r.ok` antes de json y detectar la ausencia de `resp.data` como error explicito (no como 'lista vacia'). Propagar ese fallo hacia el handler (lanzar o devolver una bandera) y, en el handler, si CUALQUIER consulta de etiquetas fallo, responder status:'error' (o sin_datos) en vez de calcular `sinEtiqueta` con un set incompleto. Asi nunca se sirve un reporte que marca como morosos a clientes que ya pagaron.

### 49. [MEDIA] `api/admin/difusion-llamadas.js`:283-294 (accion 'sync-estados')
**Un error de Twilio se escribe como 'estado' de la llamada (corrompe la fila o se traga el error)**

- **Causa raíz:** En sync-estados el GET a Twilio se consume con `.then(r => r.json())` sin chequear `r.ok` (linea 283-286). Cuando Twilio responde error (ej. 404 SID inexistente, 401), su JSON de error trae un campo `status` que es el CODIGO HTTP (ej. 404), no el estado de la llamada. La condicion `if (twResp.status && twResp.status !== llamada.estado)` (linea 288) entonces pasa con `twResp.status = 404` y se ejecuta `update({ estado: 404 })` (linea 291): si la columna `estado` es texto libre, queda escrito '404' como estado de la llamada; si tiene constraint/enum, el update falla y lo traga el `catch {}` vacio de la linea 295, dejando la llamada sin sincronizar en silencio. En ambos casos un fallo de la API se trata como dato valido en vez de saltarse esa llamada.
- **Arreglo propuesto:** Validar `r.ok` (o usar el SDK de Twilio como en 'lanzar'/'test') antes de leer el cuerpo, y antes de actualizar verificar que `twResp.status` sea uno de los estados validos de Twilio (queued, ringing, in-progress, completed, busy, no-answer, failed, canceled) y no un codigo HTTP. Si la respuesta no es ok, hacer continue (saltar esa llamada) sin tocar la fila.

### 50. [MEDIA] `api/whatsapp/media.js`:23-34
**IDOR entre lineas en media.js: cualquier asesor descarga archivos de otra linea con su token**

- **Causa raíz:** El endpoint valida la contrasena del asesor (validarAsesor) pero NO llama a puedeVerLinea(nombre, linea_id) antes de usar resolverLinea(linea_id). resolverLinea() devuelve el token de WhatsApp de CUALQUIER linea cuyo phone_number_id se pase, sin verificar pertenencia. Un asesor asignado solo a la linea A puede mandar el linea_id de la linea B y descargar (con el token de B) cualquier foto/audio/documento que un cliente haya enviado a la linea B (media_id). Es el unico endpoint scope-de-linea junto con buscar-pago.js que omite la verificacion puedeVerLinea que TODOS los demas (mensajes, contactos, comprobantes, enviar, enviar-archivo, marcar-comprobante, etc.) si aplican.
- **Arreglo propuesto:** Importar puedeVerLinea desde '../lib/asesores.js' y, tras validar el asesor, agregar: if (!linea_id || !(await puedeVerLinea(nombre, linea_id))) return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta linea.' }); antes de resolverLinea(linea_id), igual que en comprobantes.js / marcar-comprobante.js.

### 51. [MEDIA] `api/whatsapp/buscar-pago.js`:30-44
**buscar-pago.js no verifica puedeVerLinea: descarga media y corre IA con el token de otra linea**

- **Causa raíz:** Valida validarAsesor pero nunca llama puedeVerLinea(nombre, linea_id). Pasa linea_id directo a descargarMediaBase64(media_id, linea_id), que usa el token de esa linea via resolverLinea. Un asesor sin acceso a la linea B puede pasar su linea_id y media_id para que el sistema descargue media de la linea B y la procese con IA (extraerDatos), gastando cuota de IA y exponiendo comprobantes de otra linea. Mismo patron faltante que media.js.
- **Arreglo propuesto:** Importar puedeVerLinea y agregar tras validar el asesor: if (linea_id && !(await puedeVerLinea(nombre, linea_id))) return res.status(403).json({ status: 'error', mensaje: 'No tienes acceso a esta linea.' }); (y exigir linea_id cuando no venga media_base64, porque la descarga necesita el token de la linea).

### 52. [MEDIA] `api/twiml/audio-elevenlabs.js`:1-12
**Endpoint de TTS ElevenLabs publico sin auth ni rate-limit: abuso de costo**

- **Causa raíz:** El handler convierte el parametro de query 'texto' (arbitrario) a audio llamando la API PAGA de ElevenLabs, sin ninguna autenticacion, secreto compartido en la URL, ni limite de tasa. Cualquiera que conozca/adivine la URL (queda embebida en el TwiML que genera cobro.js, otro endpoint publico) puede invocarlo en bucle para quemar la cuota/dinero de ElevenLabs (amplificacion de costo / DoS financiero). Twilio lo consume durante las llamadas pero el endpoint ignora por completo la firma de Twilio, asi que no hay nada que distinga a Twilio de un atacante.
- **Arreglo propuesto:** Exigir un secreto en la URL (ej. ?k=process.env.TWIML_SECRET) que cobro.js incluya al armar el <Play>/<Redirect>, y rechazar si no coincide (comparacion a tiempo constante). Adicionalmente aplicar rate-limit por IP (lib/rate-limit.js) y validar la firma X-Twilio-Signature cuando la peticion venga de Twilio.

### 53. [MEDIA] `api/auth/verificar-otp.js`:29-49
**OTP sin limite de intentos de verificacion: fuerza bruta del codigo de 6 digitos**

- **Causa raíz:** verificar-otp.js (y vincular-telefono.js igual) consultan otp_codes con .eq('codigo', codigo).eq('used', false) y devuelven 401 si no coincide, pero NO marcan el codigo como usado ni cuentan los intentos fallidos. enviar-otp.js limita el ENVIO (3/10min) pero la verificacion no tiene tope alguno. Mientras un codigo este vivo (10 min) un atacante puede enviar peticiones ilimitadas probando codigos contra ese telefono; el espacio es solo 1.000.000 y la sesion resultante (sesiones_app, 30 dias) da acceso a perfil y boletas del cliente.
- **Arreglo propuesto:** Agregar limite de intentos: contar fallos por telefono en una ventana corta (lib/rate-limit.js o un contador en otp_codes) y bloquear tras ~5 intentos, e invalidar (used=true) el codigo activo tras N fallos para forzar pedir uno nuevo. Aplicar lo mismo en vincular-telefono.js.

### 54. [MEDIA] `api/subir-comprobante.js`:64-68
**.single() en chequeo anti-duplicado rompe la deduplicación cuando ya existen 2+ transferencias con la misma referencia**

- **Causa raíz:** El bloque que evita registrar dos veces el mismo comprobante hace `supabase.from('transferencias').select('referencia').eq('referencia', referencia).single()` y luego solo evalúa `if (existente)`. Con `.single()`: si hay 0 filas devuelve data=null + error (PGRST116) → pasa el chequeo (correcto); si hay exactamente 1 fila lo bloquea (correcto); PERO si ya existen 2 o más transferencias con esa misma `referencia`, `.single()` devuelve data=null y un error 'multiple rows' que el código IGNORA (solo destructura `data`). Como `existente` queda null, el guard cree que NO hay duplicado e INSERTA otra transferencia más. Es decir, una vez que se cuela un duplicado, el candado anti-duplicado queda permanentemente roto para esa referencia y se siguen acumulando copias. Distinto del hallazgo ya reportado de pass 4 (auth/inyección desde texto_ia): este es un defecto de lógica de DB en el mismo archivo.
- **Arreglo propuesto:** Cambiar `.single()` por `.maybeSingle()` y comprobar también el error, o mejor usar `.limit(1)` sin `.single()` y evaluar `if (data && data.length)`. Lo ideal: `const { data: existente } = await supabase.from('transferencias').select('id').eq('referencia', referencia).limit(1).maybeSingle();` y mantener `if (existente) return ...ya registrado...`. Así, con N filas, sigue detectando el duplicado en vez de fallar en silencio e insertar otra copia.

### 55. [MEDIA] `api/finanzas-alejo/chat.js`:211 (y 271, 303)
**Movimientos/activos de Alejo se guardan con la fecha en UTC, no en hora Colombia**

- **Causa raíz:** Al registrar un movimiento sin fecha explicita se usa `fecha: input.fecha || new Date().toISOString().slice(0, 10)`. En Vercel el runtime corre en UTC, asi que `new Date().toISOString()` devuelve la fecha calendario UTC. Entre las 19:00 y 23:59 hora Colombia (UTC-5) la fecha UTC ya es el dia SIGUIENTE, por lo que un gasto/ingreso/compra/venta registrado de noche queda fechado un dia adelante. Mismo patron en `registrar_activo` (fecha_compra, linea 271) y `vender_activo` (fecha_venta, linea 303).
- **Arreglo propuesto:** Calcular la fecha calendario de Colombia en lugar de UTC: `new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })` (devuelve YYYY-MM-DD ya en hora Bogota). Aplicar el mismo cambio en las lineas 211, 271 y 303.

### 56. [MEDIA] `api/admin/finanzas.js`:315-334
**justificar_pendiente con distribuciones borra el gasto antes de insertar y no revierte si el INSERT falla (pérdida del egreso)**

- **Causa raíz:** En la rama de distribuciones de la acción 'justificar_pendiente' se hace primero DELETE del gasto pendiente (línea 315, `delete().eq('id', id).eq('categoria','Pendiente')`) y DESPUÉS el INSERT de las filas distribuidas (línea 333). No hay transacción. Si el INSERT falla (constraint, NOT NULL, monto inválido, error transitorio de red), `if (insErr) throw insErr` salta al catch general que devuelve 500, pero el DELETE ya quedó confirmado en la base. Resultado: el egreso original desaparece por completo y no se crea ningún reemplazo — el gasto se esfuma de los libros y el usuario solo ve un error 500. Es la misma fragilidad de 'borrar-luego-insertar sin rollback' que ya se corrigió en abono.js/venta.js, pero aquí quedó sin revertir.
- **Arreglo propuesto:** Invertir el orden o envolver en una RPC transaccional: insertar primero las distribuciones y solo si el INSERT tiene éxito borrar el pendiente; o mejor, mover el conjunto delete+insert a una función SQL atómica (como trasladar_abono_atomico) para que un fallo a mitad no deje el egreso destruido. Como mínimo, si insErr ocurre, reinsertar la fila `pendiente` original (ya está cargada en memoria en la variable `pendiente`) antes de lanzar el error.

### 57. [BAJA] `api/admin/procesar-ia-gasto.js`:98
**Segunda detección de duplicado por referencia se salta cuando hay gastos del mismo monto+fecha que NO son el duplicado**

- **Causa raíz:** La detección 'adicional por referencia' está protegida por `if (!gastosExistentes?.length && ...)`. Es decir, SOLO corre si NO hay ningún gasto con ese monto+fecha. Pero el caso que pretende cubrir (egreso distribuido en varias categorías, donde el monto total difiere de las partes guardadas) implica precisamente que SÍ existen gastos de otras partes/montos ese día, y la primera verificación (que filtra por monto exacto) no los detecta. La condición debería ser que el primer chequeo no halló duplicado, no que no exista ningún gasto del día. Tal como está, la red de seguridad por referencia casi nunca se activa y se pueden colar egresos distribuidos duplicados.
- **Arreglo propuesto:** Cambiar la guarda: en vez de `!gastosExistentes?.length`, ejecutar el chequeo por referencia siempre que la primera detección no haya retornado duplicado (es decir, mover este bloque a ejecutarse cuando gastoDuplicado fue falsy), conservando la comparación de plataforma. Comparar por monto exacto en el primer chequeo es correcto, pero el segundo (por referencia, sin monto) debe correr independientemente de que existan otros gastos del día.

### 58. [BAJA] `api/admin/sincronizar-agentes.js`:6-9
**Falta guard de método y de body: el upsert puede ejecutarse en GET y req.body indefinido lanza TypeError**

- **Causa raíz:** A diferencia del resto de endpoints del área (sincronizar-facebook, sincronizar-whatsapp, vendedor-metricas), este handler no valida req.method !== 'POST' y destructura const { contrasena } = req.body sin fallback. Si llega una petición sin cuerpo (o un GET), `req.body` es undefined y la desestructuración lanza TypeError antes de validar, o se permite alcanzar lógica de escritura por un método no previsto.
- **Arreglo propuesto:** Agregar al inicio `if (req.method !== 'POST') return res.status(405)...` y desestructurar con `const { contrasena } = req.body || {}` como hacen los demás endpoints del módulo.

### 59. [BAJA] `api/admin/llamadas-automaticas.js`:36-50 (convertir/menorMil)
**numeroAPalabras dice 'undefined millones' para saldos de mil millones o más**

- **Causa raíz:** convertir() maneja millones tomando Math.floor(n/1000000) y pasándolo a menorMil(), pero menorMil() solo sabe convertir números < 1000. Cuando el saldo total es >= 1.000.000.000, la parte de millones es >= 1000 y menorMil(1000+) devuelve undefined. El array de unidades/decenas/centenas no cubre el caso de 'mil millones'. Verificado ejecutando la función: numeroAPalabras(1000000000) => 'undefined millones'.
- **Arreglo propuesto:** Hacer que la parte de millones también use convertir() recursivamente en vez de menorMil(): const millones = Math.floor(n/1000000); const prefijo = millones === 1 ? 'un millón' : convertir(millones) + ' millones'. Así soporta 'mil millones', 'dos mil millones', etc. Aplicar el mismo arreglo en difusion-llamadas.js.

### 60. [BAJA] `api/admin/difusion-llamadas.js`:23-28 (convertir/menorMil) y 176
**numeroAPalabras dice 'undefined millones' para saldos >= 1.000.000.000**

- **Causa raíz:** Misma raíz que en llamadas-automaticas.js: convertir() usa menorMil(Math.floor(n/1000000)) y menorMil solo cubre < 1000, así que para totales en miles de millones devuelve 'undefined millones'. La voz de la llamada (parámetro total= en el TwiML, línea 176) leería 'undefined millones' al cliente.
- **Arreglo propuesto:** En convertir(), para la rama de millones usar convertir(m) en lugar de menorMil(m): (m === 1 ? 'un millón' : convertir(m) + ' millones'). Mismo arreglo que en llamadas-automaticas.js.

### 61. [BAJA] `api/whatsapp/agente-responder.js`:914-928 (registrar_abono, claim de verificaciones pendientes)
**Al reclamar verificaciones 'pendiente' solo se libera la primera de varias filas**

- **Causa raíz:** El UPDATE de claim pasa estado 'pendiente'→'en_proceso' a TODAS las filas pendientes de la conversación y devuelve todas en claimRows, pero solo se guarda claimVerifId = claimRows[0].id. soltarClaimVerif (y los caminos que no cierran/reemplazan) solo devuelven a 'pendiente' esa primera fila; si por algún motivo quedaron 2+ filas pendientes (la invariante 'una activa por chat' no siempre se cumple por carreras), las demás quedan 'en_proceso' colgadas hasta el rescate de 10 min del cron.
- **Arreglo propuesto:** Guardar todos los ids reclamados (claimRows.map(r=>r.id)) y soltarlos todos en soltarClaimVerif con un .in('id', ids), en vez de solo claimRows[0].id.

### 62. [BAJA] `public/admin.js`:1078-1083
**Reparto uniforme del abono con Math.floor pierde pesos del dinero recibido**

- **Causa raíz:** En el modo uniforme (else, linea 1081) montoPorBoleta = Math.floor(montoTotal / boletasTarget.length) y cada boleta recibe ese valor floored. Si el monto de la transferencia no es divisible entre las boletas, la diferencia (hasta n-1 pesos) no se acredita a ninguna boleta y desaparece del total abonado. El propio mensaje de error del cobro compartido (linea 1107) reconoce el problema al exigir 'un total que sea divisible', pero en el cobro normal de un mismo cliente no hay ninguna validacion ni reparto del residuo.
- **Arreglo propuesto:** Igual que en la venta: repartir el residuo (base+1 a las primeras 'resto' boletas) para que la suma de los abonos sea exactamente el monto recibido, en vez de truncar y perder pesos.

### 63. [BAJA] `public/sorteo-en-vivo.html`:1407
**Validación del número de boleta en registro manual acepta valores no enteros como '12.3' o '1e34'**

- **Causa raíz:** La condición es: !boleta || boleta.length!==4 || isNaN(boleta). 'boleta' es el value.trim() SIN filtrar no-dígitos, e isNaN() acepta como número cadenas como '12.3', '1.5e' o '0x12' de longitud 4. Esas pasan la validación y se mandan al backend como número de boleta inválido. El input tiene inputmode='numeric' pero eso no impide pegar/escribir caracteres no numéricos.
- **Arreglo propuesto:** Validar con regex de 4 dígitos exactos en lugar de isNaN: if(!/^\d{4}$/.test(boleta)) { ...marcar error... }. Así solo se aceptan 4 dígitos reales antes de registrar.

### 64. [BAJA] `public/admin.js`:957, 969, 991
**Venta multi-boleta pierde el residuo del dinero al repartir con Math.floor**

- **Causa raíz:** En el handler de btnRegistrarVenta se calcula perNum = Math.floor(totalMoney/nums.length) y ese mismo valor floored se envia como primerAbono para CADA boleta (baseData.primerAbono = perNum, igual en todas las iteraciones). El backend (api/admin/venta.js linea 61: abonoNum = Number(primerAbono)) confia ciegamente en el valor del cliente. Cuando totalMoney no es divisible exacto entre el numero de boletas, el residuo (hasta N-1 pesos) nunca se asigna a ninguna boleta y desaparece del total registrado. Ej: $100.000 entre 3 boletas -> 33.333 x 3 = $99.999 registrados, $1 perdido frente a lo que pago el cliente.
- **Arreglo propuesto:** Repartir el residuo: calcular perNum base con Math.floor y sumar el residuo (totalMoney - perNum*nums.length) a la primera boleta (o distribuirlo de a 1 peso). Construir un mapa montosPorBoleta y enviar el valor correcto por boleta en lugar de perNum fijo para todas.

### 65. [BAJA] `public/admin.js`:1081-1082
**Abono uniforme multi-boleta pierde el residuo del dinero (Math.floor)**

- **Causa raíz:** En registrarAbono, modo no-manual: montoPorBoleta = Math.floor(montoTotal / boletasTarget.length) y se asigna ese valor floored a TODAS las boletas (boletasTarget.forEach(b => montosPorBoleta[b] = montoPorBoleta)). El backend api/admin/abono.js usa Number(valorAbono) sin recalcular. Si el monto no es divisible exacto entre las boletas, el residuo no se asigna y se pierde del total abonado del cliente. A diferencia del modo manual y del cobro compartido (que exigen suma exacta), el modo uniforme no compensa el residuo.
- **Arreglo propuesto:** Sumar el residuo (montoTotal - Math.floor*n) a la primera boleta del reparto uniforme, igual que se debe hacer en la venta, para que la suma de montosPorBoleta sea exactamente igual al monto de la transferencia.

### 66. [BAJA] `api/admin/marcar-cobro.js`:28-33
**maybeSingle() puede lanzar error si existen filas duplicadas de 'Aviso Cobro'**

- **Causa raíz:** La verificacion de existencia usa `.eq('accion','Aviso Cobro').eq('boleta', ...).maybeSingle()`. `maybeSingle()` lanza error si la consulta devuelve mas de una fila. No hay restriccion UNIQUE en codigo ni control de concurrencia, y el insert (linea 36) no es atomico respecto al select: dos peticiones simultaneas (o un doble click) pueden insertar dos filas 'Aviso Cobro' para la misma boleta. A partir de ahi, toda llamada a 'marcar' falla con error de Supabase porque `maybeSingle()` recibe 2 filas. Ademas el resultado del select no comprueba `error`, solo desestructura `data`.
- **Arreglo propuesto:** Usar `.select('id').eq(...).limit(1)` y revisar `data?.length` en vez de `maybeSingle()`, o agregar una restriccion UNIQUE (accion, boleta) y manejar el conflicto. Idealmente reemplazar el patron select-then-insert por un upsert atomico con onConflict.

### 67. [BAJA] `api/admin/marcar-llamada.js`:28-44
**Check-then-insert sin atomicidad permite marcadores 'Aviso Llamada' duplicados**

- **Causa raíz:** En la accion 'marcar' se consulta si ya existe un registro_movimientos con accion='Aviso Llamada' para la boleta (lineas 28-33, maybeSingle) y solo si no existe se inserta (lineas 35-44). Es un patron consultar-y-luego-escribir sin atomicidad: dos peticiones 'marcar' simultaneas para la misma boleta (doble clic, reintento de red, dos asesores) leen ambas `existente = null` y ambas insertan, creando filas duplicadas del aviso. No hay restriccion unica que lo impida ni candado condicional.
- **Arreglo propuesto:** Evitar la carrera con una insercion idempotente: agregar un indice unico parcial sobre (accion='Aviso Llamada', boleta) y usar upsert con onConflict, o cambiar a un UPDATE/INSERT atomico. Como mitigacion menor, el 'desmarcar' ya borra todas las filas, pero conviene impedir el duplicado en origen con la restriccion unica.

### 68. [BAJA] `api/twiml/estado-llamada.js`:25-31
**statusCallback de Twilio degrada el estado de la llamada por eventos fuera de orden**

- **Causa raíz:** El handler aplica un UPDATE INCONDICIONAL de `estado` a lo que llegue en `CallStatus` (`.update({ estado: CallStatus }).eq('sid', CallSid)`). Twilio NO garantiza el orden de entrega de los statusCallback (`initiated`, `ringing`, `answered`, `completed`) sobre HTTP: pueden llegar y procesarse desordenados. Si el evento `completed` se procesa primero y luego llega un `ringing`/`answered` rezagado, la fila se SOBRESCRIBE de un estado terminal (`completed`) de vuelta a uno intermedio. Es exactamente la misma clase de bug que ya se arregló en recibir.js para los acuses de Meta (allí se resolvió con un ranking que solo SUBE de estado y nunca degrada), pero aquí en el callback de Twilio el guard no existe. Además, un evento rezagado sin `CallDuration` no trae duracion, y como el UPDATE de estado se hace igual, la llamada queda en un estado intermedio aunque ya había terminado. No se auto-cura de forma fiable: `sync-estados` es una acción MANUAL del panel (no un cron) y además solo re-consulta llamadas en estado NO terminal.
- **Arreglo propuesto:** Hacer el UPDATE condicional para que el estado solo AVANCE y nunca degrade desde un estado terminal, igual que actualizarEstado() en api/whatsapp/recibir.js. Definir un rango/orden de estados (p.ej. iniciada/queued < ringing < in-progress/answered < completed/busy/no-answer/failed/canceled) y agregar al update un filtro tipo `.not('estado','in','(completed,busy,no-answer,failed,canceled)')` (o un rank por OR) para no pisar un estado ya terminal. Aplicar el mismo guard a la rama de RecordingSid si corresponde.

### 69. [BAJA] `api/lib/etiquetas.js`:12-20
**ponerEtiqueta: check-then-insert sin atomicidad puede crear etiquetas duplicadas (la tabla `etiquetas` no tiene UNIQUE en linea_id,nombre)**

- **Causa raíz:** ponerEtiqueta hace SELECT de la etiqueta por (linea_id, nombre) con maybeSingle() y, si no existe, la INSERTA. La tabla `etiquetas` solo tiene PK en `id` (verificado en prod: no hay índice único sobre (linea_id, nombre)). Esta función se invoca desde múltiples caminos concurrentes para la misma etiqueta (p.ej. 'ASESOR' la ponen en paralelo el motor del agente agente-responder.js, el relojito verificar-pagos-cron.js y recordatorios-cron.js sobre el mismo chat/línea). Dos llamadas simultáneas para una etiqueta que aún no existe pasan ambas el maybeSingle() (null) y ambas insertan, creando filas duplicadas. A partir de ahí, las lecturas posteriores con `.ilike('nombre', nombre).maybeSingle()` (aquí mismo y en flujo-motor.js quitarEtiqueta) devuelven error por múltiples filas, y la asignación/quita de esa etiqueta empieza a fallar. El try/catch global oculta el síntoma pero no evita la corrupción del catálogo de etiquetas de la línea.
- **Arreglo propuesto:** Crear un índice único en `etiquetas (linea_id, lower(nombre))` y convertir la creación en un upsert con onConflict sobre esa clave (o usar una RPC atómica get-or-create), de modo que dos llamadas concurrentes converjan en una sola fila en vez de duplicarla. Mientras tanto, al menos manejar el error de inserción re-leyendo la etiqueta existente tras un conflicto.
