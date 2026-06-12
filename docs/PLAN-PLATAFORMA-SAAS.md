# Plan: Plataforma SaaS de WhatsApp para rifas ("el ManyChat de las rifas")

> **Fecha:** 2026-06-12. **Estado:** PLAN — investigación hecha, esperando decisiones de Mateo.
> **Qué es:** el plan completo para convertir la bandeja de WhatsApp + Liliana en una
> plataforma que se le vende por suscripción a otros riferos (los amigos de Chinchiná y
> luego todo el país). Basado en una investigación verificada contra fuentes oficiales
> (107 agentes de búsqueda + 4 investigadores de profundización, 12-jun-2026).

---

## 1. La oportunidad (lo que encontró la investigación)

**El cruce "rifas + WhatsApp API + IA" está VACÍO en el mercado.** Existen dos mundos que
nadie ha unido:

- **Plataformas de WhatsApp** (ManyChat, ChateaPro, B2Chat, Wati…): bandeja, flujos,
  difusiones — pero ninguna sabe qué es una boleta, un talonario, un abono o un sorteo.
- **Software de rifas** (Rífalo, LAOOZ, Sistema de Rifas…): talonarios digitales y páginas
  de venta — pero ninguno tiene bandeja multiagente, API de WhatsApp ni agente de IA.
  Son básicos y baratos (LAOOZ: pago único $29-199 USD; Rífalo: 5% de comisión).

Nosotros ya tenemos lo más difícil de construir de ambos mundos: la bandeja conectada
directo a Meta, el agente IA que vende solo, la lectura de comprobantes con IA, los
candados de plata, las difusiones por tandas y el control de boletas. **Nadie más tiene
esa combinación.**

---

## 2. ⚠️ LO PRIMERO: el tema legal (esto cambia el plan entero)

Esto es lo que Mateo no estaba teniendo en cuenta y la investigación confirmó con fuentes
oficiales. No mata el proyecto, pero define cómo hay que hacerlo.

### 2.1 Para Meta, una rifa ES un juego de azar ("gambling")

La política oficial de WhatsApp Business lista **"raffles" (rifas) textualmente** como
juego de azar: cualquier producto donde se paga por entrar y se gana algo de valor.
Promocionar gambling por WhatsApp exige **permiso ESCRITO previo de Meta** (un formulario
+ prueba de licencia del regulador). La buena noticia: **Colombia está en la lista de solo
5 países donde Meta SÍ permite mensajería de juegos de azar con permiso** (junto a
Australia, Japón, México y Perú). Restricciones: solo mayores de 18 y solo por la API
(no por la app del celular).

**Implicación:** tanto nuestra propia operación como la de cada cliente del SaaS deberían
tramitar ese permiso. Sin él, las cuentas quedan expuestas a rechazo de plantillas y
baneo escalonado (Meta ya cooperó con Coljuegos bloqueando 289 perfiles de Facebook e
Instagram de riferos).

### 2.2 En Colombia, las rifas necesitan permiso (y Coljuegos está cazando)

- Toda rifa con boleta pagada es monopolio del Estado (Ley 643 de 2001). Autorizan: la
  **alcaldía** (un municipio), la **lotería departamental** (varios municipios) o
  **Coljuegos** (nacional — que es lo que aplica a rifas vendidas por redes/WhatsApp).
  Derechos de explotación: **14% de los ingresos brutos**.
- **Nov-2024:** Coljuegos abrió 35 procesos sancionatorios a influenciadores y empresas
  por rifas ilegales en redes (Epa Colombia, Yeferson Cossio…) y pidió a Meta bloquear
  289 perfiles. Sanción: multa de 100 SMLMV + posible proceso penal (art. 312 CP:
  prisión de 6 a 8 años).
- **Dato clave a favor — Decreto 1486 de diciembre 2024:** creó un cauce legal EXPRESO
  para rifas por plataformas digitales: registro ante un operador autorizado, venta por
  web/redes, sorteo con generador de números aleatorios, tope de 2 rifas/mes por gestor,
  14% de derechos y póliza de cumplimiento por el valor de los premios.

**Implicación para el SaaS:** no hay precedente de sanción a un proveedor de software por
las rifas de sus clientes, pero tampoco inmunidad. La jugada inteligente es darle la
vuelta: **el cumplimiento legal se vuelve función del producto** (ver §6). El SaaS ayuda
al rifero a formalizarse — eso nos diferencia, nos protege, y convierte el miedo del
rifero en razón para pagarnos. **Acción pendiente: consultar 1-2 horas con un abogado**
(penalista/regulatorio) antes de lanzar, y armar términos de servicio que exijan al
cliente declarar que su rifa está autorizada.

### 2.3 Datos personales (Ley 1581 / Habeas Data)

Al alojar las bases de clientes de terceros, nosotros somos **"Encargado"** del
tratamiento y cada rifero es **"Responsable"**. Obligación concreta: un **contrato de
encargo** con cada cliente (va dentro de los términos de servicio), medidas de seguridad
y canal de reclamos. Multas SIC hasta 2.000 SMMLV. Manejable, pero hay que hacerlo desde
el día 1.

---

## 3. La competencia: qué tienen y qué cobran (verificado jun-2026)

### 3.1 Plataformas de WhatsApp

| Plataforma | Precio (USD/mes) | Cobra por | Lo notable |
|---|---|---|---|
| **ManyChat** | $14-139 (anual; $199 el tope mensual) | **Contactos activos**/mes (250 → 25.000) | El modelo de cobro que le gusta a Mateo. Excedente se cobra por contacto, no apaga nada |
| **ChateaPro** | $49 → $399 (web actual) | Contactos del bot + nº de bots | La que usan los amigos. Bots preentrenados, NO constructor libre. WhatsApp+IG+FB |
| **B2Chat** (Colombia) | $105 → $187 | Asiento + consumo | El competidor colombiano directo. CARO para un rifero (2 asesores ≈ $105+) |
| **Wati** | base + $24-69 por usuario extra | Asiento | Castiga el crecimiento del equipo |
| **respond.io** | $99 → $349 | Asiento + contactos activos | El más completo en multicanal e IA (agente RAG incluido) |
| **Whaticket** | $49 | Plan + conexiones | FB/IG ilimitados; IA pagando tokens aparte |
| **Leadsales** | $97 → $247 | Plan + usuarios | CRM kanban + agente IA en beta |
| **Callbell** | €14-18/agente | Asiento | Flow builder es un add-on de €59/mes |
| **SleekFlow** | $149 → $349 | Contactos activos | "AgentFlow": varios agentes IA con roles |
| **Kommo** | $15-45/usuario | Asiento (mín. 6 meses) | AI agent builder "When > Do" |
| **Chatwoot** (open source) | gratis self-hosted; $19-99/agente | Asiento | SIN constructor de flujos (su gran hueco) |

**El estándar mínimo del mercado** (lo que toda plataforma seria tiene): bandeja
multiagente, constructor visual de flujos, agente IA configurable con base de
conocimiento, difusiones con plantillas, etiquetas + campos personalizados + embudos,
asignación automática de chats, roles y permisos, app/vista móvil para asesores,
API + webhooks + integración Sheets, reportes por asesor, prueba gratis de 7-14 días.

### 3.2 La tendencia de IA 2025-2026

Todas migraron del "chatbot de botones" al **"AI Agent" que el cliente configura solo**
(instrucciones + base de conocimiento + escalado a humano) y casi todas lo cobran aparte
(ManyChat: +$29/mes; Wati: créditos; Chatwoot: $20 por 1.000 créditos). **Nosotros ya
tenemos un agente MUY superior a eso** (Liliana: herramientas que ejecutan acciones
reales de plata con candados, no solo responde preguntas).

---

## 4. El modelo de negocio

### 4.1 Cómo funciona la plata con Meta (verificado en fuentes oficiales)

- **Ruta oficial: programa "Tech Provider" de Meta** (no Solution Partner — Meta mismo
  recomienda Tech Provider). Nos volvemos plataforma multi-tenant estilo ManyChat.
- **Cada cliente conecta SU propio número** con "Embedded Signup" (un botón "Conectar
  WhatsApp" con login de Facebook) y **le paga a Meta directamente** sus mensajes con su
  propia tarjeta. Nosotros NO revendemos mensajes: cobramos solo la suscripción al
  software. (Menos riesgo y menos cartera para nosotros.)
- **"Coexistence"** (global desde nov-2025): un rifero que hoy usa la app WhatsApp
  Business del celular puede conectarse **sin perder su número ni su historial** —
  exactamente nuestro cliente objetivo. (Límite: 20 msg/seg en esos números.)
- Mensajes en Colombia (tarifas Meta abril-2026): responder clientes que escriben es
  **GRATIS** (ventana de 24h); plantillas de marketing **$0.0125 USD** (≈ $12.50 por cada
  1.000 difusiones); utilidad/autenticación $0.0008. O sea: operar una rifa cuesta
  centavos; solo las difusiones masivas cuestan algo.
- Requisitos para ser Tech Provider: (1) verificación del negocio de Los Plata S.A.S.
  ante Meta, (2) App Review con 2 videos demo (enviar mensaje desde la app + crear
  plantilla), (3) acceso avanzado a 2 permisos. Sin eso solo se pueden conectar cuentas
  de prueba. Límite inicial: 10 clientes nuevos/semana; tras verificación completa sube
  solo a 200/semana (de sobra para años).

### 4.2 Cómo cobramos nosotros (propuesta, decide Mateo)

Modelo **por contactos activos** (como ManyChat, que es el que a Mateo le gusta y el más
justo para negocios estacionales como las rifas — pagan más solo cuando la rifa está
caliente):

| Plan (borrador) | Precio | Incluye |
|---|---|---|
| **Prueba** | gratis 14 días | Todo, hasta 200 contactos activos |
| **Rifero** | ~$120.000 COP/mes (~$30 USD) | 1 línea WhatsApp, 2.500 contactos activos/mes, 3 asesores, talonario, panel, difusiones |
| **Rifero Pro** | ~$280.000 COP/mes (~$70 USD) | + 10.000 contactos, asesores ilimitados, constructor de flujos, Instagram/Facebook |
| **Agente IA** | add-on por uso (margen sobre el costo de Claude) o tarifa fija + tope | El "vendedor que no duerme" — nuestro as |

- Excedente por contacto extra (como ManyChat) en vez de bloquear.
- Referencia: hoy un rifero "avanzado" paga $49-189 USD en ChateaPro **sin nada de
  rifas**; B2Chat le costaría $105+. Entramos por debajo CON funciones de rifa.
- **El agente IA se cobra por uso con margen** (ej. costo Claude × 2) o como plan
  aparte: es el rubro de costo variable nuestro y a la vez el mayor diferenciador.

### 4.3 Cobro de la suscripción (pagos recurrentes en Colombia)

**Recomendación: Wompi (de Bancolombia).** Es la única pasarela que automatiza el cobro
recurrente por **Nequi** (el cliente vincula su Nequi UNA vez aprobando una notificación
y el cobro sale solo cada mes) además de tarjeta tokenizada. Comisión 2,65% + $700 + IVA
(la más barata con suscripciones), plata al día hábil siguiente, y encaja con nuestras
cuentas Bancolombia/Nequi.

- Plan B para el que no quiera débito automático: **link de pago Wompi mensual enviado
  por WhatsApp** (acepta PSE, Nequi manual y efectivo en corresponsal — cubre el pago
  "de pueblo").
- Descartados: Stripe (no opera para empresas colombianas sin montar empresa en EE.UU.),
  PayU (recurrencia descontinuada), Bold (no tiene suscripciones), PSE puro (no permite
  débito automático: cada pago exige clave del banco).

### 4.4 Costos fijos nuestros (estimado para arrancar)

| Rubro | Mensual |
|---|---|
| Supabase Pro (proyecto NUEVO del SaaS) | $25 USD |
| Vercel Pro (proyecto NUEVO del SaaS) | $20 USD |
| Cola de mensajería (Inngest/QStash) | $0-50 USD según volumen |
| IA (Claude) | variable — se traslada al cliente con margen |
| Dominio de la plataforma | ~$15 USD/año |
| Mensajes de Meta | $0 — los paga cada cliente directo a Meta |

Con 3-4 clientes pagando ~$30 USD ya se cubre la infraestructura.

---

## 5. Arquitectura técnica (decisiones recomendadas)

1. **Proyectos NUEVOS y separados de Los Plata**: un Supabase nuevo + un Vercel nuevo,
   bajo las mismas cuentas/organización. Razones: un fallo o rollback del SaaS jamás
   tumba losplata.com.co (ya vivimos un rollback que congeló producción 4 días); llaves
   separadas (la llave maestra del SaaS no abre los datos del negocio propio); costos
   medibles por separado. El sistema de Los Plata podría volverse "un cliente más" del
   SaaS al final, pero NO se mezclan desde el día 1.
2. **Multi-tenant con una sola base**: todas las tablas llevan columna `tenant_id`
   (= la empresa del rifero) con **RLS** (candado por fila) + filtro en servidor — doble
   candado, como ya hicimos con RLS en el sistema actual. Es el patrón estándar de los
   SaaS sobre Supabase. Índices compuestos `(tenant_id, …)` en todo (la regla de
   escala que ya seguimos: filtros y paginación SIEMPRE en el servidor).
3. **Login con Supabase Auth**: Google + Facebook + correo/contraseña + magic link
   (todo soportado oficialmente; exige crear las OAuth apps en Google Cloud y Meta).
   Las "organizaciones" (un dueño invita asesores con roles) no vienen incluidas: se
   construyen con 3 tablas (`organizations`, `memberships`, `invitations`) — patrón
   conocido (referencia: Basejump/Makerkit). Roles: dueño / supervisor / asesor (la
   evolución de nuestro gerencia / mi equipo / independientes).
4. **Constructor visual de flujos**: **React Flow** (librería MIT, gratis para uso
   comercial, la que usan los builders serios) montada como "isla" React solo en esa
   página (el resto sigue siendo nuestro HTML+JS). El flujo se guarda como JSON
   (cajitas + flechas) y un **motor propio en el backend** lo ejecuta como máquina de
   estados por conversación (tabla de sesión: en qué cajita va cada cliente + sus
   variables). OJO: NO forkar Typebot (su licencia prohíbe competir con ellos).
5. **Cola de envío**: para difusiones y los nodos de "esperar X tiempo" de los flujos,
   una cola externa (**Inngest** recomendado: reintentos, pausas de días, y límite de
   velocidad POR NÚMERO de cada cliente — clave para no quemar la calidad de su línea
   con Meta). pg_cron solo para tareas chicas de base de datos. Vercel Pro hoy permite
   funciones de hasta 800s y 100 crons por proyecto.
6. **Integración Excel/Sheets** (menú "Integraciones"): v1 = **subir el archivo**
   (.xlsx/.csv) con un asistente de mapeo de columnas ("¿cuál columna es el número? ¿cuál
   el nombre? ¿cuál el abono?") → se vuelve talonario + contactos, y la ficha del cliente
   en la bandeja muestra sus boletas (como la nuestra). v2 = **conectar Google Sheets**
   (login de Google, sincronización Sheets→SaaS cada X minutos). Sync bidireccional y
   Excel "en vivo" de OneDrive: para después (la API de Microsoft no funciona con
   OneDrive personal — confirmado).
7. **Multicanal (Instagram DM / Messenger)**: la API de Instagram y Messenger son del
   mismo ecosistema Meta (la misma app, otros permisos + app review). Se agregan como
   "canales" de la misma bandeja (los mensajes ya viven en tablas por línea; una línea
   pasa a tener `canal: whatsapp | instagram | messenger`). Va en fase posterior — el
   100% de la venta de rifas hoy pasa por WhatsApp.

---

## 6. El producto: funciones para el rifero

### 6.1 Lo que YA tenemos construido (ventaja de arranque)

Bandeja multiagente y multilínea con permisos · agente IA vendedor con 13 herramientas y
candados de plata · lectura de comprobantes con IA verificada contra transferencias
reales · difusiones segmentadas por tandas con programación · etiquetas (+ automáticas
por estado de pago) · respuestas rápidas · recordatorios · disparadores · plantillas ·
importar contactos CSV · embudo de ventas y costo de IA por chat · talonario/boletas/
abonos/clientes (el CRM de rifas completo) · suite de pruebas del agente.

### 6.2 Lo que falta para estar al nivel del mercado

- Registro/login propio (hoy: contraseñas compartidas) + organizaciones + invitar asesores con roles.
- Onboarding self-service: conectar su número solo (Embedded Signup), asistente de primera rifa.
- Constructor visual de flujos (cajitas: disparador → condición → acción → esperar).
- Campos personalizados de contacto + embudo kanban (opcional).
- Asignación automática de chats entre asesores (hoy: cualquiera de la línea atiende).
- Multicanal Instagram/Facebook.
- App/vista móvil del asesor (nuestra bandeja ya es responsive — pulir).
- Configurador del agente IA self-service (la "cabina" de Liliana, versión para clientes).
- Facturación, planes y cobro automático.

### 6.3 Lo que NADIE tiene (nuestras armas)

1. **Talonario digital integrado a la bandeja**: el asesor ve EN EL CHAT qué boletas
   tiene el cliente, saldo y abonos (nuestra ficha). El cliente consulta su boleta web.
2. **"Vendedor IA de rifas" preconfigurado**: una Liliana lista para personalizar
   (nombre, premios, precios, cuentas, tono) — no un chatbot genérico que el rifero debe
   inventar desde cero. Con los candados de plata YA probados en producción.
3. **Caja registradora con IA**: el cliente manda el pantallazo → la IA lo lee, lo
   cruza con los movimientos del banco del rifero (extracto subido o registro manual) y
   abona a la boleta. El candado anti "comprobante prestado" incluido.
4. **Panel "Mi Rifa"** (lo que pidió Mateo): boletas vendidas/separadas/pagadas,
   recaudo del día y acumulado, cartera pendiente, embudo (llegaron → preguntaron →
   apartaron → pagaron), ranking de asesores, gasto de IA. Todo por rifa activa.
5. **Cobranza automática**: recordatorios de saldo + difusión de cobro a los que deben
   (lo que ya hace nuestro sistema de recordatorios).
6. **Módulo de sorteo**: registro del ganador, página pública de resultados, difusión
   automática del resultado (plantilla ya aprobada en nuestro caso).
7. **Modo cumplimiento** (la jugada legal del §2): campos para nº de autorización de la
   rifa, texto legal en la boleta, filtro de menores de 18, y guía de formalización
   (Decreto 1486/2024). Protege al rifero, nos protege, y nadie más lo ofrece.

---

## 7. Plan de ejecución por etapas

> Regla: cada etapa termina en algo USABLE y probado. Las semanas son estimados gruesos
> de trabajo con IA; pueden comprimirse o estirarse.

### Etapa 0 — Decisiones y trámites (1-2 semanas, corre en paralelo)
- [ ] **Decisiones de Mateo:** nombre y dominio de la plataforma · precios definitivos ·
      ¿los primeros 2-3 amigos como pilotos gratis/descuento?
- [ ] **Consulta con abogado** (rifas/penal + datos): responsabilidad del SaaS, términos
      de servicio, contrato de encargo de datos. 1-2 horas de consulta bastan para arrancar.
- [ ] **Iniciar verificación del negocio ante Meta** (Los Plata S.A.S.) — es prerequisito
      del App Review y puede tardar; se arranca YA.
- [ ] Crear proyectos nuevos: Supabase + Vercel + repo GitHub del SaaS.

### Etapa 1 — Núcleo multi-tenant (3-4 semanas)
- [ ] Esquema nuevo con `tenant_id` en todo + RLS (basado en nuestro esquema actual, limpio).
- [ ] Login (Google + Facebook + correo) con Supabase Auth.
- [ ] Organizaciones: crear empresa, invitar asesores por correo, roles (dueño/supervisor/asesor).
- [ ] Migrar la bandeja al esquema nuevo: chats, mensajes, etiquetas, respuestas rápidas,
      contactos, filtros (todo lo del §6.1 que es de conversación, no de rifa).
- **Entregable:** un rifero se registra, invita a su asesor y ve una bandeja vacía funcionando.

### Etapa 2 — Conexión del WhatsApp del cliente (2-3 semanas + tiempos de Meta)
- [ ] App Review de Meta (2 videos demo) → acceso avanzado a los 2 permisos.
- [ ] Botón "Conectar mi WhatsApp" (Embedded Signup) con Coexistence (no pierden su número).
- [ ] Webhook multi-tenant (detectar la línea/tenant por número, como ya hacemos por `phone_number_id`).
- **Entregable:** un piloto conecta su número EN 10 MINUTOS y chatea desde la bandeja.
- **Riesgo a vigilar:** el permiso de gambling de Meta (§2.1) — tramitarlo con el primer piloto autorizado.

### Etapa 3 — El módulo de rifas (3-4 semanas)
- [ ] Talonario: crear rifa (dígitos, precio, premios, fecha), estados de boleta
      (libre/separada/abonada/pagada), venta y abonos multi-tenant.
- [ ] **Importar Excel** (asistente de mapeo de columnas) → talonario + contactos.
- [ ] Ficha del cliente en la bandeja con sus boletas (la nuestra, multi-tenant).
- [ ] **Panel "Mi Rifa"** (ventas, recaudo, cartera, embudo, ranking de asesores).
- [ ] Lectura de comprobantes con IA + registro de movimientos del banco del rifero.
- [ ] Modo cumplimiento v1 (campo de autorización + texto legal en boleta).
- **Entregable:** el piloto deja el Excel y opera su rifa completa en la plataforma. ESTE
  es el momento "wow" para vender.

### Etapa 4 — Cobro y facturación (2 semanas)
- [ ] Planes + contactos activos medidos por mes (contador por tenant).
- [ ] Wompi: débito automático (Nequi/tarjeta) + link de pago de respaldo.
- [ ] Avisos de límite, excedentes, suspensión suave por no pago.
- **Entregable:** los pilotos pasan a clientes que PAGAN solos cada mes.

### Etapa 5 — Agente IA self-service (3-4 semanas)
- [ ] "Crea tu vendedor": asistente que arma el manual desde una entrevista (nombre del
      agente, premios, cuentas, tono) sobre la plantilla Liliana.
- [ ] Herramientas de rifa preconectadas (consultar números, apartar, registrar abono…)
      con los candados de siempre; el rifero solo prende/apaga.
- [ ] Cobro del agente por uso (medidor `agente_uso` multi-tenant que ya tenemos).
- [ ] Suite de pruebas tipo "casos dorados" por tenant (probar antes de publicar el manual).
- **Entregable:** el diferenciador estrella, cobrable aparte.

### Etapa 6 — Constructor de flujos (4-6 semanas)
- [ ] Editor React Flow (cajitas: disparador / mensaje / pregunta-espera / condición /
      acción de rifa / etiqueta / asignar asesor / esperar tiempo / encender IA).
- [ ] Motor de ejecución (máquina de estados por conversación) + cola Inngest para esperas.
- [ ] 3-4 plantillas de flujo listas para rifas (bienvenida, cobro, post-sorteo).
- **Entregable:** paridad con ManyChat en lo que el rifero de verdad usa.

### Etapa 7 — Multicanal + pulida (3-4 semanas)
- [ ] Instagram DM y Facebook Messenger como canales de la misma bandeja.
- [ ] Vista móvil del asesor pulida; asignación automática de chats.
- [ ] Reportes exportables; webhooks/API pública para integraciones.

### Cómo se valida cada etapa
Con 2-3 **pilotos reales de Chinchiná** desde la Etapa 2 (gratis o con descuento de
fundador a cambio de feedback semanal). No construir las etapas 6-7 hasta que los pilotos
usen y paguen las anteriores.

---

## 8. Riesgos principales y cómo los manejamos

| Riesgo | Tamaño | Manejo |
|---|---|---|
| Política de gambling de Meta (rifas) | ALTO | Permiso escrito de Meta + pilotos con rifa autorizada + modo cumplimiento (§2.1, §6.3.7) |
| Clientes con rifas informales (Coljuegos) | ALTO (para ellos), MEDIO (nuestro) | Términos de servicio + abogado + el SaaS empuja a formalizar (Decreto 1486/2024) |
| Tiempos de Meta (verificación, App Review, permiso gambling) | MEDIO | Arrancar trámites en Etapa 0, en paralelo al desarrollo |
| Que ChateaPro/ManyChat saquen "modo rifas" | BAJO | Nuestra profundidad (candados de plata, comprobantes IA) no se copia en un sprint |
| Soporte: riferos no técnicos | MEDIO | Onboarding guiado + nosotros mismos como primer soporte; documentar desde el día 1 |
| Dispersión: el SaaS compite por tiempo con Los Plata | MEDIO | Proyectos separados; el negocio propio sigue siendo prioridad 1 |

---

## 9. Lo que decide Mateo antes de arrancar

1. **¿Arrancamos?** (Etapa 0 — los trámites de Meta y el abogado son lo más lento; lo
   demás espera su OK.)
2. **Nombre y dominio** de la plataforma.
3. **Precios** (el borrador del §4.2 es propuesta).
4. **Los pilotos**: ¿cuáles 2-3 amigos, y en qué trato (gratis X meses / precio fundador)?
5. **El abogado**: ¿tiene uno de confianza o buscamos?

---

## Fuentes principales de la investigación

Política WhatsApp: business.whatsapp.com/policy · Tech Provider/Embedded Signup/precios:
developers.facebook.com (documentación oficial, verificada 12-jun-2026) · Coljuegos:
coljuegos.gov.co (rifas, boletín 099-2024) · Decreto 1486/2024: funcionpublica.gov.co ·
Ley 1581: secretariasenado.gov.co · Precios competencia: manychat.com/pricing,
chateapro.com, b2chat.io, wati.io, respond.io, whaticket.com, leadsales.io, callbell.eu,
sleekflow.io, kommo.com, chatwoot.com, botmaker.com · Software de rifas: rifaloapp.com,
laooz.com, sistemaderifas.net · Pagos: wompi.com, mercadopago.com.co, epayco.com,
developers.payulatam.com, stripe.com/global · Arquitectura: supabase.com/docs,
github.com/xyflow, reactflow.dev, typebot.com/blog (licencia), vercel.com/docs.
