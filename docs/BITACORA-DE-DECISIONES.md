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
