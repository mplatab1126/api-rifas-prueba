# Cómo trabajar con IA — Guía rápida para Mateo

> Este archivo es para Mateo. Tiene dos frases listas para **copiar y pegar**
> cada vez que trabajes con una IA en este proyecto: una al EMPEZAR y otra al
> TERMINAR. Sirven para que todos los chats sigan la misma estructura y no se
> pierda el contexto.

---

## 1️⃣ Frase para INICIAR cualquier chat

Copia esto y pégalo apenas abras un chat nuevo, antes de pedir nada:

```
Antes de empezar, lee los archivos CLAUDE.md y docs/BITACORA-DE-DECISIONES.md
para entender las reglas y las decisiones del proyecto. Si vamos a tocar una
parte específica, abre también su sección en docs/MAPA-DEL-SISTEMA.md. No crees
nada nuevo sin revisar antes las piezas reutilizables en api/lib/. Si el cambio
toca pagos, abonos, permisos o la base de datos, explícame qué vas a hacer ANTES
de tocar nada.
```

---

## 2️⃣ Frase para CERRAR el chat

Copia esto y pégalo cuando ya terminen el trabajo, antes de cerrar:

```
Antes de cerrar: 1) si creaste, borraste o cambiaste una página o función,
actualiza docs/MAPA-DEL-SISTEMA.md con la fecha; 2) si tomamos una decisión
importante (de dinero, seguridad o qué quitar), agrégala arriba en
docs/BITACORA-DE-DECISIONES.md con la fecha, qué y por qué; 3) publica el cambio.
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
