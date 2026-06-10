# Checklist de RIFA NUEVA (rotación) — H17

> **Cuándo usarlo:** cada vez que termina una rifa y arranca la siguiente (ej. después
> del sorteo de la casa del 4-jul-2026). Ir tachando EN ORDEN. La mayoría se hace SIN
> programador (base de datos / cabina); los 2 últimos puntos exigen deploy y puede
> hacerlos un chat de Claude.
>
> **Regla de oro:** mientras no esté TODO tachado, dejar la línea de Liliana en
> **modo sombra** (cabina → estado de la línea) para que no venda con datos viejos.

## 1. Base de datos (sin deploy)

- [ ] **Tabla `rifas`:** crear la rifa nueva con `estado='activa'` (y pasar la vieja a
  cerrada), con `fecha_inicio` correcta — el corte de memoria de Liliana sale de ahí.
- [ ] **Calendario `rifas.sorteos`:** fechas y títulos de TODOS los sorteos.
  ⚠️ CONVENCIONES: (a) el sorteo principal DEBE llevar la palabra **"Mayor"** o **"casa"**
  en el título (el código lo detecta con `/mayor|casa/i` para la coletilla del saludo y
  el atajo de premios); (b) los sorteos de la MISMA cadena de acumulado deben tener el
  título IDÉNTICO entre sí (el motor agrupa por título).
- [ ] **`agente_config.resultados`:** vaciarlo (los ganadores son de la rifa vieja).
- [ ] **`agente_config.variables`** (cabina → variables; quedan versionadas por el
  historial H15). Actualizar TODAS:
  - `saludo_inicial` — el saludo del contacto inicial.
  - `cierre_inicial` — las viñetas de precio / separar / legalidad (SIN la pregunta
    "¿Te explico los premios?", esa la agrega el código).
  - `texto_premios` — la explicación fija de premios. Puede usar `{{fecha_mayor}}`
    (el código la rellena con la fecha real del sorteo principal).
  - `texto_pedir_datos` — el mensaje que pide los datos. Debe usar `{{numero}}`.
  - `condiciones_venta` — frase corta de precio/condiciones que ve la IA en la
    herramienta del contacto inicial.
  - `pagos` — medios de pago (si cambian).
- [ ] **Manual de Liliana** (`agente_config.prompt`): actualizar la sección
  "ACTUALIZA ESTOS RENGLONES" (premio, precio, fechas, mínimos) y revisar que no quede
  ningún dato de la rifa vieja. ⚠️ NUNCA escribir montos de acumulado a mano: el manual
  debe seguir diciendo "el monto que te dé el sistema" (decisión 10-jun, H3).
- [ ] **Boletas:** generar/preparar la numeración y precios de la rifa nueva (proceso
  de siempre de gerencia).

## 2. Cabina / Meta (sin deploy)

- [ ] **Fotos del contacto inicial:** actualizar la respuesta rápida cuyo título
  contiene **"contacto inicial"** (las fotos salen de ahí; ⚠️ NO renombrarla — el código
  la busca por ese título).
- [ ] **Plantillas de Meta** (si sus textos mencionan la rifa vieja): `boleta_cliente_v2`,
  `seguimiento_los_plata`, y las de difusión. Crear versión nueva y esperar aprobación.

## 3. Código (SÍ exige deploy — pedírselo a un chat de Claude)

- [ ] **`api/config/precios.js`** (`PRECIOS.RIFA_4_CIFRAS`): solo si cambia el precio de
  la boleta. Lo usan reservar/venta/abonos como respaldo.
- [ ] **`public/resolucion.pdf`**: la resolución/permiso de la rifa nueva (la herramienta
  `enviar_resolucion` manda ese archivo).

## 4. Verificación final (antes de salir de modo sombra)

- [ ] En **modo sombra**, simular un cliente nuevo: saludo, premios, números, separar.
  Revisar en la bandeja que TODOS los textos digan la rifa nueva (precio, premio, fechas).
- [ ] Mensaje REAL de prueba desde un celular propio con la línea ya en vivo.
- [ ] Revisar la tarjeta "Gasto de IA" y la actividad del agente las primeras horas.
