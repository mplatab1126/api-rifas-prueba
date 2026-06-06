# Pendientes — Los Plata S.A.S.

> **Qué es este archivo:** la lista de tareas que quedaron a medias o por hacer.
> Sirve para pasar el hilo de un chat a otro sin perder nada.
>
> **Para los chats de IA:**
> - AL EMPEZAR: lee esta lista para saber qué quedó pendiente de chats anteriores.
> - AL CERRAR: anota aquí lo que quedó sin terminar, y borra (o marca como hecho)
>   lo que ya se completó.
>
> **Formato:** una línea por tarea. `[ ]` = pendiente, `[x]` = hecha.
> Ejemplo: `- [ ] (2026-06-06) Revisar si vendedores.html todavía se usa.`

---

## Tareas pendientes

- [ ] (2026-06-06) Construir la **verificación de pagos con reintentos** de Liliana
  (cada ~15 min hasta ~1h con la función "buscar pago"; abona sola si aparece, y si
  no, avisa a un asesor). **TOCA DINERO** — Mateo debe aprobar el diseño primero. Ver bitácora.
- [ ] (2026-06-06) **Afinar el manual de Liliana** con las verdades confirmadas por Mateo:
  mínimo **$20.000** para los sorteos de sábado y **100% pagada** para la casa (4-jul);
  **tutear siempre** (quitar el "vos"); ¿decir "lleva 3 sábados acumulado"?; dejar de
  mencionar "El Sueldazo" (ya pasó); confirmar el framing de los **$300.000.000**;
  ¿cuántas fotos al saludar? (hoy 12+). Falta que Mateo aclare el mínimo de $50.000/$60.000.
- [ ] (2026-06-06) Arreglar **"Gasto de IA = $0"**: configurar `SUPABASE_SERVICE_ROLE_KEY`
  en Vercel (y revisar RLS de las tablas). Ver bitácora.
- [ ] (2026-06-06) Resincronizar la copia de **Google Drive del Mac** con GitHub (está
  desactualizada; por eso ahora se publica clonando fresco del repo).
- [ ] (2026-06-06) Revisar con Mateo si `public/home-sorteo-apartamento.html` es
  residuo de una rifa vieja (apartamento, 2024) y se puede borrar.
- [ ] (2026-06-06) Revisar con Mateo si `public/vendedores.html` todavía se usa o
  está duplicado con `rendimiento.html`.
- [ ] (2026-06-06) Opcional / cosmético: limpiar las ~147 filas de error
  "Candado anti-duplicado falló: column ... does not exist" en `agente_actividad`.
  Son del periodo en que la API no veía la columna del candado (ya resuelto con las
  funciones RPC). No afectan nada; solo ensucian la actividad del agente.

## Hecho recientemente

- [x] (2026-06-06) Agregada al manual de Liliana la regla **"no reventa / no comisiones"**.
- [x] (2026-06-06) Arreglado el bug de **saludos duplicados de Liliana** (mandaba el
  saludo 2-4 veces a cada cliente nuevo). Causa: caché de esquema de PostgREST; los
  candados se movieron a funciones de la base (RPC). Verificado: 0 duplicados.
- [x] (2026-06-06) **Pausado el supervisor automático** de Liliana (decisión de
  Mateo). Ver bitácora para reactivarlo.
