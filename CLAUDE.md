# Instrucciones generales

## Sobre Mateo (el usuario)

- Mi nombre es Mateo. No soy programador. Construyo mi sistema usando inteligencia artificial.
- Entiendo muy poco de código. Necesito explicaciones simples, como si nunca hubiera programado.

## Cómo explicarme las cosas

- Evita términos técnicos sin explicarlos. Si debes usarlos, explica qué significan con un ejemplo sencillo.
- Usa ejemplos relacionados con rifas cuando puedas (es mi negocio y así entiendo mejor).
- Cuando hagas cambios en el código, explícame en palabras simples qué hiciste y por qué.
- Si hay varias formas de hacer algo, recomiéndame la más simple y dime por qué la elegiste.

## Largo de las respuestas

- Sé conciso. Ve al grano, sin preámbulo ni relleno.
- Para tareas rutinarias (cambios simples, ediciones de texto, commits): responde corto, sin tablas decorativas, sin analogías innecesarias, sin repetir lo que ya te dije.
- Para tareas delicadas (pagos, dinero, permisos, base de datos, cambios que tocan muchos archivos): extiéndete lo necesario para que entienda bien qué pasa y qué riesgos hay. Aquí sí vale la pena explicar con detalle.
- No repitas resúmenes de lo que ya hicimos a menos que te lo pida.
- No termines cada respuesta preguntando "¿seguimos con X?" salvo que tenga sentido para avanzar.
- Evita secciones tipo "Lo que ganaste" o "Beneficios reales" a menos que sean útiles para entender una decisión.

## Cuándo preguntarme o avisarme

- Si una tarea no está clara, hazme una o dos preguntas clave antes de empezar. No adivines.
- Si un cambio puede afectar datos reales (ventas, clientes, números vendidos), avísame claramente antes de hacerlo.
- Si vas a borrar o modificar algo importante, pide confirmación primero.
- Si notas que algo en el sistema podría mejorarse o tiene un riesgo, sugiéremelo aunque no te lo haya pedido.

## Dónde está el código (carpeta de trabajo) — MUY IMPORTANTE

El código vive en **GitHub** (`github.com/mplatab1126/api-rifas-prueba`, rama
`main`); de ahí Vercel publica el sitio. GitHub es la "nube" del código y
sincroniza las máquinas de Mateo (Mac y Windows): NO se usa Google Drive para el
código (Drive corrompe git).

- **Trabajar SIEMPRE desde una copia clonada FUERA de Google Drive.** En el Mac:
  `~/los-platas-rifas`. En Windows: una carpeta tipo `C:\los-platas-rifas`.
- Si el chat abrió dentro de una carpeta de Google Drive (`.../Mi unidad/...` o
  `.../CloudStorage/GoogleDrive-...`), **NO trabajes ni publiques ahí**: clona
  fresco de GitHub a una carpeta fuera de Drive y trabaja desde esa.
- Al empezar haz `git pull` (traer lo último); al terminar, publica (ver abajo).

## Publicar cambios en internet (MUY IMPORTANTE)

Cuando termines un cambio funcional, **publícalo tú mismo sin que Mateo lo pida**. El sitio vive en **Vercel** y sale al aire solo al hacer `push` a la rama `main`. Pasos:

1. `git status` y agrega **solo los archivos de tu tarea** (NO uses `git add -A` / `git add .`: casi siempre hay trabajo de Mateo sin guardar en el árbol, a veces en los mismos archivos que editas — sepáralo).
2. `git commit` con un mensaje corto en español, estilo del repo, **sin** `Co-Authored-By`.
3. `git push origin main`. Vercel publica solo en ~1 minuto (dominio `www.losplata.com.co`).
4. **Verifica que el cambio quedó AL AIRE de verdad** (con `curl` al sitio en vivo, o pidiéndole a Mateo que recargue con Ctrl+Shift+R). No digas "listo" hasta haberlo confirmado en producción.

Si "publicaste pero no se ve", el código casi nunca es el problema. Revisa **PRIMERO** en Vercel si hay un **rollback activo** (Overview → botón "Undo Rollback" / "Promote to Production"): un rollback congela producción aunque todos los despliegues estén en verde. Mateo NO es programador y trabaja desde Mac y Windows: no le pidas que use git ni la terminal; en Vercel solo guíalo a dar el clic que únicamente él puede dar.

## Idioma

- Responde siempre en español.

## Memoria del proyecto (MUY IMPORTANTE)

El sistema tiene memoria en tres niveles. Respétalos:

1. **Este archivo (`CLAUDE.md`) = las reglas de la casa.** Corto, se lee en cada
   chat. Aquí van reglas, convenciones y advertencias — NO detalles largos.
   Mantenerlo breve para no llenar la memoria del chat.
2. **`docs/MAPA-DEL-SISTEMA.md` = el archivador.** Tiene el detalle de cada
   página y cada función. NO hace falta leerlo entero; ábrelo solo cuando
   necesites entender o tocar una parte específica.
3. **`docs/BITACORA-DE-DECISIONES.md` = el diario de decisiones.** El PORQUÉ de
   las decisiones importantes (dinero, seguridad, base de datos, qué se quitó).
   Revísalo antes de cambiar o eliminar algo, para no deshacer una decisión.

Además existe **`docs/PENDIENTES.md` = la lista de tareas a medias**, para pasar
el hilo de un chat a otro sin perder nada.

### Protocolo de cada chat (inicio y cierre)

**AL EMPEZAR un trabajo:**
1. Lee `CLAUDE.md`, `docs/BITACORA-DE-DECISIONES.md` y `docs/PENDIENTES.md`.
2. Si vas a tocar una parte específica, abre su sección en
   `docs/MAPA-DEL-SISTEMA.md`.
3. Antes de crear algo nuevo, revisa las "Piezas reutilizables" (`api/lib/`).
4. Para cambios delicados (pagos, abonos, permisos, base de datos), explícale a
   Mateo qué vas a hacer ANTES de tocar nada.

**AL TERMINAR un trabajo (Mateo suele cerrar el chat y abrir uno nuevo):**
1. Publica directo a `main` TODO cambio hecho que falte por publicar (sin crear
   solicitudes/PR; ver "Publicar cambios en internet") y confírmalo al aire.
2. Si creaste/borraste/cambiaste una página o función, actualiza
   `docs/MAPA-DEL-SISTEMA.md` (su línea y la fecha).
3. Si tomaste una decisión importante, agrégala arriba en
   `docs/BITACORA-DE-DECISIONES.md` (fecha, qué y por qué).
4. Actualiza `docs/PENDIENTES.md`: anota lo que quedó sin terminar y borra/marca
   lo ya completado.
5. Si detectaste código sin usar, anótalo en "Candidatos a revisar" del mapa
   (NO lo borres sin confirmarlo con Mateo).

> No agregues detalles largos a este `CLAUDE.md`; los detalles van en el mapa y
> los porqués en la bitácora.

---

# Proyecto: Sistema de Rifas "Los Plata S.A.S."

Empresa colombiana familiar de venta de rifas. Los socios son dos hermanos: **Mateo** (quien administra el sistema) y **Alejandro**. Mateo no es programador y construye todo con IA.

## Tipos de rifas

| Tipo | Dígitos | Notas |
|---|---|---|
| Rifa principal | 4 cifras (0000–9999) | El precio y los premios cambian con cada rifa. Consultar la base de datos para valores actuales. |

> Antes existían dos rifas diarias (2 y 3 cifras) que fueron **eliminadas del sistema** porque ese tipo de rifas son ilegales en Colombia. Toda esa lógica se quitó: páginas públicas, endpoints, columnas y categorías de gasto. Si encuentras referencias en código viejo o histórico, es residuo no operativo.

Los precios y premios específicos NO van aquí porque cambian con cada rifa. Están en la base de datos (tabla `rifas`, `premios_rifa`) y en los bot fields de ChateaPro.

## Equipo y permisos

- **Mateo y Alejandro (Alejo P)**: Gerencia. Acceso total al sistema.
- **Asesores "mi equipo"**: Empleados directos. Solo pueden abonar en boletas de su grupo.
- **Vendedores independientes**: Externos. No pueden abonar en boletas del otro grupo.
- La autenticación es por contraseña simple (no hay usuarios ni sesiones). Las contraseñas están en la variable de entorno `ASESORES_SECRETO`.
- Los permisos de cada asesor se guardan en la tabla `permisos_asesores`.

## Cómo se vende y cobra

1. Clientes llegan por **anuncios en Meta** (Facebook/Instagram) que van directo a WhatsApp.
2. Se atienden por **WhatsApp** usando la API de **ChateaPro** (con flujos de IA, nodos de acción y prevención).
3. Los asesores también hacen **difusiones masivas** desde ChateaPro para cobrar a clientes.
4. Los clientes pagan por **transferencia o consignación** a: Bancolombia, Nequi, Daviplata.
5. Los asesores registran los pagos en el panel admin. Se usa IA para leer comprobantes automáticamente.
6. Para cobros automáticos: **Twilio** llama por teléfono a clientes con saldo pendiente, con voz generada por **ElevenLabs**.

## Tecnologías del sistema

- **Vercel**: Donde vive y se ejecuta toda la aplicación en internet.
- **Supabase**: Base de datos (PostgreSQL). Aquí se guarda todo: boletas, clientes, pagos, transferencias, gastos, métricas.
- **Node.js / JavaScript**: El lenguaje de programación del backend (carpeta `/api`).
- **Anthropic (Claude)**: Proveedor de IA. Se usa Claude Sonnet para análisis de rendimiento y oráculo. Claude Haiku para clasificar mensajes de WhatsApp.
- **ChateaPro**: Proveedor de la API de WhatsApp Business. Sincroniza rendimiento de asesores.
- **Meta (Facebook Ads)**: Publicidad. Se sincronizan métricas de 2 cuentas publicitarias.
- **Twilio**: Llamadas telefónicas automáticas de cobro.
- **ElevenLabs**: Voz clonada para las llamadas automáticas de Twilio.

## Páginas del sistema

| Página | Quién la usa |
|---|---|
| `index.html` | Página de entrada / login |
| `admin.html` | Asesores — vender, abonar, leer comprobantes, ver movimientos |
| `caja.html` | Control de efectivo del día, arqueo de caja |
| `rifas.html` | Solo Mateo — finanzas de rifas, premios, recapitalización entre socios |
| `rendimiento.html` | Gerencia — métricas de asesores, Facebook Ads, WhatsApp, análisis IA |
| `estado-resultados.html` | Estado de resultados financiero (ingresos, gastos, P&L) |
| `llamadas.html` | Gestión de llamadas automáticas y rescate de WhatsApp |
| `sorteo.html` | Sorteo en vivo — selección y anuncio de ganadores |
| `calendario.html` | Horarios semanales de los asesores |
| `admin-horarios.html` | Gestión de horarios de asesores |
| `permisos.html` | Solo Mateo — gestión de permisos de asesores |
| `boleta.html` | Página pública — clientes consultan su boleta |

## Tablas principales en Supabase

`boletas`, `clientes`, `abonos`, `transferencias`, `registro_movimientos`, `gastos`, `movimientos_caja`, `rendimiento_asesores`, `metricas_facebook`, `costos_whatsapp`, `rifas`, `premios_rifa`, `capitalizacion_rifa`, `horarios_asesores`, `historial_rifas`, `llamadas_twilio`, `permisos_asesores`, `comprobantes`, `bitacora`, `registro_sorteo`

## Consideraciones críticas

- El sistema maneja **dinero real y datos reales de clientes colombianos**.
- Si algo falla, Mateo no tiene un equipo técnico para arreglarlo. Ser muy cuidadoso con los cambios.
- Antes de modificar lógica de abonos, transferencias o permisos de asesores, explicar exactamente qué cambia.
- La lógica de **recapitalización entre socios** (rifas.js) es financieramente sensible. No modificar sin entenderla bien primero.

---

# ChateaPro — API de WhatsApp Business

ChateaPro es el proveedor de la API de WhatsApp Business. Mateo tiene **2 líneas de WhatsApp** conectadas, cada una con su propio token de acceso.

- **Base URL de la API**: `https://chateapro.app/api`
- **Autenticación**: Header `Authorization: Bearer {TOKEN}`
- **Variables de entorno**: `CHATEA_TOKEN_LINEA_1` y `CHATEA_TOKEN_LINEA_2`
- **Línea 1** (flow_ns: `f159929`): Línea principal con todos los flujos, IA y configuración completa.
- **Línea 2** (flow_ns: `f166221`): Réplica de la Línea 1 con los mismos flujos de venta.

## Flujos principales (Línea 1)

### Flujo de venta (embudo principal)

| Orden | Flujo | Descripción |
|---|---|---|
| 1 | Contacto inicial | Primer mensaje al cliente cuando llega del anuncio de Meta |
| 2 | Información | Se le muestra la rifa, premios y precio |
| 3 | Números disponibles | Consulta a la API `/api/disponibles` para mostrar boletas libres |
| 4 | Datos | Se piden nombre, apellido, cédula, ciudad |
| 5 | Método de pago | Se muestran las cuentas de Nequi/Daviplata/Bancolombia |
| 6 | Enviar boleta | Se envía la boleta digital al cliente |
| 7 | Actualizar datos | El cliente puede corregir sus datos |

### Otros flujos importantes

| Flujo | Descripción |
|---|---|
| Flujo avanzado agente | Lógica cuando el bot pasa la conversación a un asesor humano |
| Consultar número especifico | El cliente consulta si un número está disponible |
| Pago | Flujo cuando el cliente confirma que ya pagó |
| Datos completados | Se activa cuando el cliente termina de dar todos sus datos |
| Plantilla | Flujo que se usa para enviar difusiones de cobro |

## Endpoints de la API más útiles

### Lectura (GET)
- `/flow/subflows` — Lista todos los flujos
- `/flow/agents` — Lista asesores y si están online
- `/flow/tags` — Lista todos los tags
- `/flow/user-fields` — Lista campos de usuario
- `/flow/bot-fields` — Configuración global del bot
- `/subscribers` — Lista suscriptores
- `/subscriber/get-info?user_ns={ns}` — Info de un suscriptor
- `/subscriber/chat-messages?user_ns={ns}` — Historial de mensajes

### Escritura (POST)
- `/subscriber/send-text` — Enviar texto a un suscriptor
- `/subscriber/broadcast` — Difusión masiva
- `/subscriber/add-tag` / `remove-tag` — Agregar/quitar tags
- `/subscriber/set-user-field` — Modificar campos de usuario
- `/subscriber/assign-agent` — Asignar asesor a conversación

## Integración con el sistema

### Endpoints que ChateaPro consume del sistema
- `GET /api/cliente?telefono={tel}` — Boletas, deuda y datos del cliente
- `GET /api/disponibles` — Números de boleta disponibles
- *(eliminado)* el clasificador de difusiones se retiró; ya no se usan difusiones de cobro por ChateaPro.

### Endpoints del sistema que consumen la API de ChateaPro
- `POST /api/admin/sincronizar-agentes` — Trae rendimiento de asesores de ambas líneas

## Consideraciones importantes de ChateaPro

- Los tags con "FALLÓ" indican que **Meta bloqueó el envío**. Estos clientes son candidatos para **llamada de Twilio**.
- Los bot fields se pueden actualizar desde la API para cambiar premios, precios y mensajes sin tocar los flujos.
