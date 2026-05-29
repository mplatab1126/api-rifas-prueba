# Migración ChateaPro → Manychat — Bitácora y Pendientes

> **Propósito de este archivo:** Llevar el registro de la migración de ChateaPro a Manychat: qué decisiones tomamos, qué ya hicimos y qué falta. Es un documento **vivo**, se va completando en cada sesión.
>
> **Cómo usarlo:** Claude debe leer este archivo antes de avanzar en la migración y actualizar las secciones "Estado" y "Registro de sesiones" cada vez que se haga algo.

---

## 1. Objetivo

Pasar toda la atención de WhatsApp de **ChateaPro → Manychat**. Primero **construir todo en Manychat** y dejarlo funcionando; **después** se hace el corte (la migración real).

Plan elegido: **Avanzado (Advanced), USD $139/mes** → 25.000 contactos, 10 usuarios, canales ilimitados, IA, API, inbox colaborativo y "eliminar marca de Manychat".

---

## 2. El problema que resolvemos: la sincronización

**Hoy con ChateaPro:** la plataforma de chat guarda *copias* de datos (los "bot fields": premios, precios, mensajes). Si cambias algo en tu sistema y nadie empuja la actualización a ChateaPro, **la copia queda vieja**. Por eso ChateaPro siempre se desactualiza.

**Con Manychat lo resolvemos de dos formas:**

1. **Consulta en vivo (bloque "Solicitud externa"):** para datos que cambian (números disponibles, precio, premios, deuda del cliente), Manychat le **pregunta a tu sistema en el momento** de la conversación. Así nunca hay copia vieja. → *Ejemplo: cliente pide el número 1234, Manychat consulta tu sistema en ese segundo y responde si está libre.*
2. **Empuje automático (clave API):** cuando tu sistema cambia algo que Manychat necesita tener guardado, **tu sistema se lo envía solo**, sin depender de que un humano lo recuerde.

**Resultado:** la actualización deja de depender de "si el asesor mandó el flujo" y pasa a ser una **conexión técnica automática**. Los dos quedan siempre alineados. ✅

> **Matiz clave:** "siempre actualizado" se logra sobre todo con la **consulta en vivo** (opción 1) para los datos críticos. Lo que sí guardemos en Manychat, se mantiene al día con el empuje automático (opción 2).
>
> **Buena noticia:** tu sistema **ya tiene los endpoints** que Manychat necesita (`/api/disponibles`, `/api/cliente`, `/api/chateapro/clasificar-plantilla`). Gran parte del trabajo de conexión ya está hecho.

---

## 3. Decisiones confirmadas (verificadas en documentación oficial de Manychat)

| Tema | Conclusión |
|---|---|
| **"Eliminar marca de Manychat"** | Quita el *"powered by Manychat"* que ve el cliente en formularios/widgets. Solo estético, no afecta flujos ni IA. Incluido en el plan Avanzado. |
| **IA de intención** | Manychat tiene **"Reconocimiento de Intenciones"**: la IA detecta la intención del cliente y lo enruta a flujo X o Y (igual que hoy en ChateaPro). Funciona en WhatsApp. |
| **⚠️ Dos "IA" distintas (NO confundir)** | (1) La **pestaña "IA de Manychat"** (asistente todo-en-uno: Knowledge/Behavior/Skills) está en **BETA y solo para Instagram** hoy — NO sirve para WhatsApp todavía. (2) La **IA dentro de los flujos** = **Reconocimiento de Intenciones** + **Paso de IA**, y **esa SÍ funciona en WhatsApp**. → Para el agente de ventas en WhatsApp usamos la opción (2), no la pestaña. |
| **Secuencias** | Mensajes automáticos espaciados en el tiempo (goteo) para seguimiento/cobro escalonado. Limitación WhatsApp: fuera de las 24h cada mensaje debe ser plantilla aprobada y paga (regla de Meta). |
| **Broadcasts (difusiones)** | Un mensaje a muchos a la vez (equivale a las difusiones de cobro de ChateaPro). Fuera de las 24h requiere plantilla aprobada por Meta, opt-in del cliente y se paga por mensaje desde el "Wallet" de Manychat. |
| **⚠️ Etiquetas (Tags) ≠ Etiquetas de conversación (Labels)** | **Tags** (Configuración → Etiquetas) organizan **contactos** y son las que leen los **flujos/condiciones** y la **API** → usar para el estado de pago (sin dinero/abonada/pagada). **Labels de conversación** (las de emoji en la Bandeja) solo organizan la **vista del inbox** para el equipo; se crean/borran desde la Bandeja, no desde Configuración. Revisar que las condiciones de los flujos apunten a **Tags**, no a Labels. |
| **Puente Tag → Label automática (diseño elegido)** | Las etiquetas de conversación se pueden hacer **automáticas** ("Haz que tu etiqueta sea automática" → + Condición): se aplican solas cuando la conversación cumple una condición, ej. *Etiqueta/Tag es `Pagada`*. **Diseño de 2 capas:** (1) **Tags** sin emoji = motor (las ponen flujos + API/sync, las leen las condiciones); (2) **Labels emoji automáticas** = espejo visual en la bandeja (🟢 Pagada, 🟡 Abonada, 🔴 Sin dinero). Flujo/sistema pone la Tag → el emoji aparece solo. **Probar** que aparezca también cuando la Tag la pone el sistema vía API. |
| **⚠️ Agrupar mensajes (diferencia vs ChateaPro)** | ChateaPro junta varios mensajes del cliente enviados dentro de N segundos en un solo campo (debounce con "tiempo de espera completo"). **Manychat NO tiene ese ajuste nativo** (es un feature pedido por la comunidad). Solución: usar el **AI Step** o **Captura + Pausa inteligente** como colchón. |
| **Límites de la API de Manychat (rate limits)** | Confirmado oficial: **10 req/seg** en endpoints de subscriber, **25 req/seg** en sendFlow/sendContent, **10 req/seg** en addTag/removeTag/setCustomField — **por cuenta** (compartido entre todas las API keys). Exceder = error **429**. External Request (Manychat→backend) timeout 10s no modificable; para procesos largos/alto volumen usar lógica **asíncrona** (responder 200 OK ya; luego el backend setea campos + dispara el flujo de respuesta). **Implicación de escala:** Manychat→backend (recibir mensajes) NO cuenta para ese límite (Vercel escala); backend→Manychat (enrutar) SÍ → manejar con **cola** a ≤25/seg + reintento en 429. Una ráfaga de 1000 se drena en ~40s sin perder a nadie. Manychat permite subir límites on-demand. |
| **⚠️ La API de Manychat NO construye flujos** | No existe endpoint para crear/editar flujos (confirmado 2026, limitación conocida — no hay `/createFlow` ni `/updateFlow`). La API solo hace runtime: **tags, campos personalizados, contactos, enviar mensajes, disparar flujos existentes**, y bloques dinámicos (contenido al vuelo vía Solicitud externa). Los flujos se arman SOLO en el constructor visual, a mano. **Implicación estratégica:** Claude NO puede construir los flujos por API → conviene mover la lógica pesada (agrupar mensajes, categorizar, decidir ruta) al **backend de Mateo** (que Claude sí programa) y dejar Manychat como **capa fina** (recibe mensaje → llama al backend por Solicitud externa → obedece la respuesta). |
| **Respuesta predeterminada (Default Reply) — comportamiento** | Es UN disparador **global** (red de seguridad): se activa con mensajes que ningún otro disparador atrapa, y **siempre arranca su flujo asignado** (NO sabe en qué paso iba el cliente). Mientras un paso está **esperando texto**, la respuesta va a ese paso (Default Reply no se mete); pero si el cliente escribe ante **botones** o cuando el flujo ya terminó, sí se dispara y puede mandarlo al lugar equivocado. **Protección:** etiqueta `en_proceso` al inicio del embudo + condición en Default Reply ("si NO tiene la etiqueta") + quitarla al final. **Conclusión:** con el diseño de varios flujos por paso, agrupar mensajes se hace DENTRO de cada paso (bucle esperar-con-tiempo-corto), NO con Default Reply; esta queda solo como red de seguridad para mensajes sueltos / clientes que vuelven. |
| **Arquitectura actual del embudo (Manychat)** | Automatizaciones separadas por paso dentro de la carpeta "Flujo conversacional": **1. Contacto inicial → 2. Información → 3. Números disponibles → 4. Datos → 5. Método de pago**, conectadas con "Iniciar Automatización". Cada paso captura el mensaje, lo categoriza con "Acciones de Claude" y enruta con Condición. |
| **Solución agrupar para el categorizador (Claude + Condición)** | El flujo usa: capturar mensaje → **"Acciones de Claude"** (categoriza en 1 palabra: Informacion/Precio/Pago/Consulta/Numeros/Boleta/Ninguno) → **Condición** enruta. NO se reemplaza por AI Step (el diseño actual da más control). **Enfoque "último mensaje" (Pausa inteligente + Last Text Input): DESCARTADO por Mateo** (solo manda el último mensaje, pierde los anteriores). **Enfoque elegido = BUCLE de concatenación por paso:** (0) al entrar al paso, limpiar campo `mensajes_acumulados`; (1) enviar contenido; (2) **Esperar respuesta de texto** con timeout corto (~10-15s) en "no respondió"; (2a) si responde → **Set Custom Field** `mensajes_acumulados` = `{{mensajes_acumulados}} {{Última entrada de texto}}` (fallback=espacio) → volver a (2); (2b) si NO responde en el tiempo (silencio = terminó) → **Acciones de Claude** con `{{mensajes_acumulados}}` → Condición. **Fragilidad:** depende de que el timeout se pueda poner corto (verificar mínimo en el nodo); mensajes en el mismo segundo podrían escaparse al re-armar el bucle. Hacerlo dentro de cada paso, NO con Default Reply. |
| **Estados de conversación** | En el Inbox son **Abierta / Cerrada** + **asignar** a un asesor + **recordatorios**. NO existe un estado "Pendiente/Snooze" separado. |
| **API** | Sirve para conectar tu sistema de rifas con Manychat. Incluida en el plan Avanzado. La clave es como una contraseña: **no compartir**. |

⚠️ **Por verificar al momento de pagar:** que la pantalla diga **"IA incluida"** en el plan Avanzado y si hay **límite de uso** de IA.

**Qué es el "complemento de IA" (Manychat AI):** cuesta USD $29/mes sobre los planes bajos (Pro/Business) y viene **incluido en los planes altos**. Contiene 4 herramientas: (1) **Reconocimiento de Intenciones** (enrutar por intención), (2) **AI Step** (IA dentro del flujo), (3) **Asistente del Constructor de Flujos** (la IA ayuda a armar los flujos), (4) **Mejorador de Texto** (pule los mensajes). También permite entrenar la IA con la info del negocio. En la cuenta de Mateo ya aparece el AI Step disponible → parece estar activo; confirmar al pagar el Avanzado.

---

## 4. Mapa de equivalencias: ChateaPro → Manychat

| En ChateaPro (hoy) | En Manychat (equivalente) |
|---|---|
| Embudo de venta (7 pasos: contacto → info → números → datos → pago → boleta → actualizar) | Flujos / Automatizaciones |
| ~~Agente IA "Camila v2"~~ — **RETIRADO** (Mateo ya no lo usa; docs eliminados) | Agente de ventas con IA **nuevo, desde cero** en Manychat (**AI Step** + **Reconocimiento de Intenciones**) |
| Clasificación de intención con Claude Haiku (`/clasificar-plantilla`) | **Reconocimiento de Intenciones** nativo **o** seguir usando tu endpoint vía "Solicitud externa" *(decisión pendiente)* |
| Llamadas a `/api/disponibles` y `/api/cliente` | Bloque **"Solicitud externa"** (se reutilizan los mismos endpoints) |
| Bot fields (premios, precios, mensajes) | Campos personalizados **o**, mejor, consulta en vivo |
| Tags y user fields | Tags y campos personalizados de Manychat |
| `send-text`, `broadcast`, `assign-agent` | API y acciones de Manychat |

---

## 5. Estado

### ✅ Hecho
- Investigación oficial: plan, "eliminar marca", IA de intención, estados de conversación, API.
- Confirmado que el sistema ya tiene endpoints reutilizables para la conexión.
- Creada esta bitácora.

### ☐ Pendiente
- [ ] Contratar plan Avanzado y verificar "IA incluida" / límites de uso.
- [ ] Conectar el canal de WhatsApp Business a Manychat.
- [ ] Reconstruir el embudo de venta (los 7 pasos) en Manychat.
- [ ] Configurar "Reconocimiento de Intenciones" → mapear las intenciones actuales (ej.: comprar número, consultar premio, ya pagué, hablar con asesor). **OJO:** es un **Disparador/Trigger** al inicio de la automatización, NO un nodo del flujo ni el AI Step. Se activa: disparador *"El usuario envía un mensaje"* → *"Reconocer la intención del mensaje"*. (El **AI Step** es distinto: nodo que maneja un tramo de conversación hacia un objetivo, dentro del flujo.)
- [ ] Diseñar un **agente de ventas con IA nuevo, desde cero** en Manychat (Camila quedó retirada; no se reutiliza nada de ella).
- [ ] Configurar estados de conversación + asignación de asesores.
- [ ] Conectar el sistema de rifas (Solicitud externa + clave API) para la sincronización en vivo.
- [ ] Quitar la marca de Manychat.
- [ ] Diseñar el plan de corte/migración (idea: probar primero con la Línea 2 antes de mover la Línea 1 principal).

---

## 6. Registro de sesiones

- **2026-05-29** — Investigación inicial y decisiones confirmadas (sección 3). Definido el plan (Avanzado). Documentada la estrategia de sincronización (sección 2). Creada esta bitácora.
- **2026-05-29** — Camila (agente de IA de ChateaPro) **retirada**: Mateo confirmó que ya no la usa. Eliminados su documentación (`camila-v2-configuracion.md`, `agente-hibrido-v2.md`) y los scripts de auditoría (`auditar-linea-2.js`, `extraer-mensajes-raros.js`, `dump-conversaciones-linea-2.js`) + el volcado de conversaciones. **Se conservó el código en vivo** (`disponibles.js`, `verificar-numero.js`, `house-data.jsx`) porque la página web también lo usa; la palabra "Camila" queda solo en comentarios.
- **2026-05-29** — Confirmado que **Laura** (agente post-venta) también queda retirada. No tenía archivos propios en el repo (vivía dentro de ChateaPro). Ambos agentes se reemplazan por **uno nuevo en Manychat**.
