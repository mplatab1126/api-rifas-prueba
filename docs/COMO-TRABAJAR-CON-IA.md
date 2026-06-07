# Cómo trabajar con IA — Guía rápida para Mateo

> Este archivo es para Mateo. Tiene dos frases listas para **copiar y pegar**
> cada vez que trabajes con una IA en este proyecto: una al EMPEZAR y otra al
> TERMINAR. Sirven para que todos los chats sigan la misma estructura y no se
> pierda el contexto.

---

## 1️⃣ Frase para INICIAR cualquier chat

Copia esto y pégalo apenas abras un chat nuevo, antes de pedir nada:

```
Antes de empezar, lee estos archivos para entender el proyecto:
- CLAUDE.md (las reglas de la casa).
- docs/BITACORA-DE-DECISIONES.md (las decisiones importantes y su porqué).
- docs/PENDIENTES.md (las tareas que quedaron pendientes de otros chats).

Si vamos a tocar un tema específico, abre TAMBIÉN su documento (NO los leas todos,
solo el que aplique, para no llenar la memoria):
- docs/MAPA-DEL-SISTEMA.md — detalle de una página o función puntual.
- docs/bandeja-whatsapp-buzon.md — si tocamos la bandeja de WhatsApp o la agente Liliana.

No crees nada nuevo sin revisar antes las piezas reutilizables en api/lib/. Si el
cambio toca pagos, abonos, permisos o la base de datos, explícame qué vas a hacer
ANTES de tocar nada. Para terminar, dime si hay algo pendiente importante antes de
arrancar.
```

---

## 2️⃣ Frase para CERRAR el chat

Copia esto y pégalo cuando vayas a cerrar este chat para abrir uno nuevo:

```
Voy a cerrar este chat y abrir uno nuevo, así que deja todo en orden:
1. Publica directo a la rama main TODO cambio que hayamos hecho y que falte por
   publicar (NO crees solicitudes/PR). Confírmame que quedó al aire.
2. Si creaste, borraste o cambiaste una página o función, actualiza
   docs/MAPA-DEL-SISTEMA.md con la fecha.
3. Si tomamos una decisión importante (dinero, seguridad o qué quitar), agrégala
   arriba en docs/BITACORA-DE-DECISIONES.md con la fecha, qué y por qué.
4. Si trabajamos en la bandeja de WhatsApp o la agente Liliana, actualiza también
   su bitácora: docs/bandeja-whatsapp-buzon.md.
5. Actualiza docs/PENDIENTES.md: anota las tareas que quedaron sin terminar y
   borra (o marca como hechas) las que ya completamos.
6. Confírmame que todo quedó publicado en main y la documentación al día.
```

---

## ¿Por qué sirve esto?

- **La de inicio** hace que el chat arranque sabiendo cómo funciona todo tu
  sistema, sin que tú tengas que explicar el contexto cada vez.
- **La de cierre** hace que el chat deje la documentación al día, para que el
  PRÓXIMO chat también tenga el contexto. Así la memoria nunca se queda vieja.

> Nota: en Claude Code estos pasos ya se hacen casi solos (lee `CLAUDE.md`
> automáticamente). Estas frases son sobre todo por si usas otra IA que no lo
> lee sola.
