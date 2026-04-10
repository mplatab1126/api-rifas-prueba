# Instrucciones generales

## Sobre Mateo (el usuario)

- Mi nombre es Mateo. No soy programador. Construyo mi sistema usando inteligencia artificial.
- Entiendo muy poco de código. Necesito explicaciones simples, como si nunca hubiera programado.

## Cómo explicarme las cosas

- Evita términos técnicos sin explicarlos. Si debes usarlos, explica qué significan con un ejemplo sencillo.
- Usa ejemplos relacionados con rifas cuando puedas (es mi negocio y así entiendo mejor).
- Cuando hagas cambios en el código, explícame en palabras simples qué hiciste y por qué.
- Si hay varias formas de hacer algo, recomiéndame la más simple y dime por qué la elegiste.

## Cuándo preguntarme o avisarme

- Si una tarea no está clara, hazme una o dos preguntas clave antes de empezar. No adivines.
- Si un cambio puede afectar datos reales (ventas, clientes, números vendidos), avísame claramente antes de hacerlo.
- Si vas a borrar o modificar algo importante, pide confirmación primero.
- Si notas que algo en el sistema podría mejorarse o tiene un riesgo, sugiéremelo aunque no te lo haya pedido.

## Idioma

- Responde siempre en español.

---

# Proyecto: Sistema de Rifas "Los Plata S.A.S."

Empresa colombiana familiar de venta de rifas. Los socios son dos hermanos: **Mateo** (quien administra el sistema) y **Alejandro**. Mateo no es programador y construye todo con IA.

## Tipos de rifas

| Tipo | Dígitos | Notas |
|---|---|---|
| Rifa principal | 4 cifras (0000–9999) | El precio y los premios cambian con cada rifa. Consultar la base de datos para valores actuales. |
| Rifa diaria | 2 cifras (00–99) | Rifa diaria de menor valor |
| Rifa diaria 3 cifras | 3 cifras (000–999) | Rifa diaria de menor valor |

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
| `reiniciar-rifa.html` | Reiniciar/resetear rifas diarias |
| `diarias.html` | Página pública — clientes reservan números de 2 cifras |
| `diarias3.html` | Página pública — clientes reservan números de 3 cifras |
| `boleta.html` | Página pública — clientes consultan su boleta |

## Tablas principales en Supabase

`boletas`, `boletas_diarias`, `boletas_diarias_3cifras`, `clientes`, `abonos`, `transferencias`, `registro_movimientos`, `gastos`, `movimientos_caja`, `rendimiento_asesores`, `metricas_facebook`, `costos_whatsapp`, `rifas`, `premios_rifa`, `capitalizacion_rifa`, `horarios_asesores`, `config_rifa_diaria`, `historial_rifas`, `llamadas_twilio`, `permisos_asesores`, `comprobantes`, `bitacora`, `registro_sorteo`

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
- `POST /api/chateapro/clasificar-plantilla` — Clasificación de intenciones con Claude Haiku

### Endpoints del sistema que consumen la API de ChateaPro
- `POST /api/admin/sincronizar-agentes` — Trae rendimiento de asesores de ambas líneas

## Consideraciones importantes de ChateaPro

- Los tags con "FALLÓ" indican que **Meta bloqueó el envío**. Estos clientes son candidatos para **llamada de Twilio**.
- Los bot fields se pueden actualizar desde la API para cambiar premios, precios y mensajes sin tocar los flujos.
