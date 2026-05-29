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
| **⚠️ Dos "IA" distintas (NO confundir)** | (1) La **pestaña "IA de Manychat"** (asistente todo-en-uno: Knowledge/Behavior/Skills) está en **BETA y solo para Instagram** hoy — NO sirve para WhatsApp todavía. (2) La **IA dentro de los flujos** = **Reconocimiento de Intenciones** + **Paso de IA**, y **esa SÍ funciona en WhatsApp**. → Para Camila en WhatsApp usamos la opción (2), no la pestaña. |
| **Secuencias** | Mensajes automáticos espaciados en el tiempo (goteo) para seguimiento/cobro escalonado. Limitación WhatsApp: fuera de las 24h cada mensaje debe ser plantilla aprobada y paga (regla de Meta). |
| **Broadcasts (difusiones)** | Un mensaje a muchos a la vez (equivale a las difusiones de cobro de ChateaPro). Fuera de las 24h requiere plantilla aprobada por Meta, opt-in del cliente y se paga por mensaje desde el "Wallet" de Manychat. |
| **Estados de conversación** | En el Inbox son **Abierta / Cerrada** + **asignar** a un asesor + **recordatorios**. NO existe un estado "Pendiente/Snooze" separado. |
| **API** | Sirve para conectar tu sistema de rifas con Manychat. Incluida en el plan Avanzado. La clave es como una contraseña: **no compartir**. |

⚠️ **Por verificar al momento de pagar:** que la pantalla diga **"IA incluida"** en el plan Avanzado y si hay **límite de uso** de IA (algunas guías externas mencionan un complemento de USD $29 aparte; parece estructura vieja, pero hay que confirmarlo).

---

## 4. Mapa de equivalencias: ChateaPro → Manychat

| En ChateaPro (hoy) | En Manychat (equivalente) |
|---|---|
| Embudo de venta (7 pasos: contacto → info → números → datos → pago → boleta → actualizar) | Flujos / Automatizaciones |
| Agente IA "Camila v2" (AI Hub) | Agente IA de Manychat (**AI Step** + **Reconocimiento de Intenciones**) |
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
- [ ] Configurar "Reconocimiento de Intenciones" → mapear las intenciones actuales (ej.: comprar número, consultar premio, ya pagué, hablar con asesor).
- [ ] Recrear el agente "Camila" en Manychat.
- [ ] Configurar estados de conversación + asignación de asesores.
- [ ] Conectar el sistema de rifas (Solicitud externa + clave API) para la sincronización en vivo.
- [ ] Quitar la marca de Manychat.
- [ ] Diseñar el plan de corte/migración (idea: probar primero con la Línea 2 antes de mover la Línea 1 principal).

---

## 6. Registro de sesiones

- **2026-05-29** — Investigación inicial y decisiones confirmadas (sección 3). Definido el plan (Avanzado). Documentada la estrategia de sincronización (sección 2). Creada esta bitácora.
