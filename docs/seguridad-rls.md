# Plan de seguridad — Prender RLS (Row Level Security)

> **Estado:** ✅ HECHO (8-jun-2026). Se prendió RLS en las 56 tablas y se cerró el
> acceso de la llave anónima. El chequeo pasó de 84 problemas (con tokens expuestos) a
> 0 errores. Detalle del resultado al final de este doc. Abajo queda el diagnóstico
> original y el plan, como referencia.

## Por qué (el problema)

Hoy casi todas las tablas tienen **RLS apagado** (en Supabase salen con el rótulo rojo
**UNRESTRICTED**). El sistema funciona y NO está publicado al público (la llave anónima
NO aparece en el frontend; todo pasa por el backend de Vercel, que pide la contraseña de
asesor). PERO: la API de Supabase es alcanzable desde internet y la llave "anónima" está
diseñada para ser pública → **toda la seguridad depende de que esa llave nunca se filtre**.
Si se filtra, con RLS apagado alguien podría leer/escribir TODO.

Ya está configurada la **llave maestra** (`SUPABASE_SERVICE_ROLE_KEY`, 7-jun), que **bypassa
RLS**. Por eso el código que usa `supabaseAdmin` seguirá funcionando aunque prendamos RLS.

## Diagnóstico (chequeo oficial de Supabase, 8-jun-2026): 84 avisos

- **🔴 `sensitive_columns_exposed` (2):** `lineas_whatsapp.token` (¡tokens de WhatsApp!) y
  `sesiones_app.token` expuestos vía API sin RLS. **Lo más urgente.**
- **🔴 `rls_disabled_in_public` (56 tablas):** ver lista abajo. Incluye dinero y datos
  personales: `clientes, abonos, transferencias, gastos, permisos_asesores, otp_codes`,
  finanzas de Alejo, etc.
- **🟠 `policy_exists_rls_disabled` (12):** tablas con reglas creadas pero RLS apagado (las
  reglas NO se aplican): bitacora, cuentas_sociales, finanzas_alejo_*, etc.
- **🟠 `rls_policy_always_true` (2):** `finanzas_alejo_activos` con reglas que dejan pasar a todos.
- **🟠 security definer ejecutable por anon/authenticated (1):** `bandeja_filtrar(...)`
  (es a propósito: el endpoint la llama con la llave anónima; conservar el grant).
- **🟠 `function_search_path_mutable` (8):** funciones sin `search_path` fijo (endurecer).
- **🟡 `extension_in_public` (1)** y **`rls_enabled_no_policy` (1)** (probablemente `agente_uso`,
  que escribe el service role — ok).

### Las 56 tablas con RLS apagado
otp_codes, asesores, registro_sorteo, transferencias, sesiones_app, movimientos_caja,
ganadores_principales, horarios_asesores, historial_rifas, rendimiento_asesores,
metricas_facebook, registro_movimientos, premios_rifa, gastos, rifas, categorias_gastos,
capitalizacion_rifa, costos_whatsapp, llamadas_twilio, permisos_asesores, cuentas_sociales,
abonos, bitacora, finanzas_alejo_categorias, finanzas_alejo_chat, finanzas_alejo_perfil,
finanzas_alejo_movimientos, finanzas_alejo_cuentas, plantillas_difusion, registro_sorteo_apto,
abonos_historico, asesores_config, boletas_historico, cierres_caja, boletas, clientes,
etiquetas, configuracion, backup_llave_liberadas_2026_06_01, lineas_whatsapp, lineas_asesores,
mensajes_whatsapp, conversaciones_whatsapp, conversacion_etiquetas, respuestas_rapidas,
plantillas_whatsapp, difusiones, difusion_destinatarios, recordatorios, agente_herramientas,
agente_actividad, agente_config, agente_qa_estado, agente_sugerencias, disparadores,
verificaciones_pago.

## ⚠️ El riesgo al prender RLS (lo que puede romper)

- Código que usa **`supabaseAdmin`** (= service role) → sigue funcionando con RLS prendido. ✅
- Código que usa **`supabase`** (= llave anónima) → **se BLOQUEA** con RLS prendido si no hay
  política que lo permita. ❌ Hay que encontrar TODOS esos usos antes de prender cada tabla.
  - Ejemplos ya conocidos de lecturas con la llave anónima en `agente-responder.js`:
    `resumenCliente` lee **`boletas`** y **`clientes`**; `analizarRemision` lee
    **`lineas_asesores`** y **`asesores_config`**; el motor lee `agente_config`,
    `agente_herramientas`, `conversaciones_whatsapp`, `rifas`, etc.
  - Si prendemos RLS en `boletas`/`clientes` sin política o sin pasar esas lecturas a
    `supabaseAdmin`, **Liliana deja de detectar clientes**. (Ya nos pasó algo así de sutil.)
- **Páginas públicas:** revisado el 7-jun — el frontend NO trae la llave anónima; las páginas
  públicas (boleta, abonar) van por el backend. Reconfirmar en la pasada.

## Plan de ejecución (cuando Mateo diga: pasada dedicada)

1. **Auditar usos de la llave anónima:** `grep -rn "supabase\." api/` y separar todo lo que
   use el cliente `supabase` (anon) del que usa `supabaseAdmin`. Decidir caso por caso:
   pasar la lectura a `supabaseAdmin`, o crear una política que permita a `anon` esa tabla.
2. **Definir el patrón de política** (probable: el backend hace todo con service role → para la
   mayoría basta `enable RLS` + NINGUNA política para anon = nadie entra por la llave pública;
   y mover a `supabaseAdmin` las pocas lecturas anónimas que queden). Decidir con Mateo.
3. **Prender tabla por tabla, probando después de cada una** (agente + bandeja + páginas
   públicas + admin/caja/rifas). Empezar por las críticas:
   `lineas_whatsapp`, `sesiones_app`, `otp_codes`, `permisos_asesores` → luego dinero/clientes
   (`abonos`, `transferencias`, `clientes`, `gastos`, finanzas) → luego el resto.
4. **Limpiar lo demás:** quitar/ajustar las reglas "always true" de `finanzas_alejo_activos`,
   fijar `search_path` en las 8 funciones, revisar `bandeja_filtrar` (mantener su grant a anon).
5. **Re-correr el chequeo** (`get_advisors` security) hasta dejarlo limpio.

> Recordatorio de la lección de PostgREST: tras cambios de esquema, recargar el esquema con
> `apply_migration` (un NOTIFY/ALTER por SQL no basta).

---

## ✅ RESULTADO (ejecutado el 8-jun-2026)

**Estrategia usada (la más segura):** en vez de editar 80+ archivos, se hizo que TODO el
backend use la llave maestra (un cambio en `api/lib/supabase.js`: el cliente `supabase`
ahora usa `SERVICE_ROLE_KEY`). Así el backend pasa por encima de RLS y se pudo prender RLS
en todo sin romper nada. **Confirmado antes:** ni el frontend web ni la app móvil le pegan
directo a Supabase (solo el backend lo hace).

**Lo que se hizo:**
1. `api/lib/supabase.js`: `supabase` usa la llave maestra (Fase 1, desplegado y verificado).
2. Migración `seguridad_enable_rls_todas_las_tablas`: se borraron 14 reglas permisivas
   ("deja pasar a todos", incl. otp_codes y sesiones_app) y se prendió RLS en las 56 tablas.
3. Migración `seguridad_cerrar_bandeja_filtrar_y_search_path`: `bandeja_filtrar` (SECURITY
   DEFINER) ya NO la puede ejecutar la llave anónima (solo `service_role`); y se fijó
   `search_path=public` en 8 funciones.

**Verificado:** la llave anónima ahora ve 0 filas en boletas/clientes/lineas_whatsapp/sesiones;
el backend sigue leyendo (disponibles, cliente, bandeja_filtrar=300 chats). Chequeo de
seguridad: de 84 → 0 errores. Quedan 56 INFO "RLS enabled no policy" (es lo deseado: solo el
backend entra) y 1 WARN menor (`pg_net` en esquema public; no se movió por riesgo con los crons).

**Cuidado a futuro:**
- El backend DEBE seguir usando la llave maestra (`SUPABASE_SERVICE_ROLE_KEY` en Vercel). Si se
  borra esa variable, `supabase` cae a la anónima y, con RLS prendido, TODO el backend dejaría
  de leer. No quitar esa variable.
- Al crear una tabla NUEVA: prenderle RLS (`alter table ... enable row level security;`). El
  backend (service role) la seguirá usando; la llave anónima quedará bloqueada por defecto.
- Si alguna vez se necesita una página/app que lea Supabase DIRECTO (sin backend), habría que
  crearle una política RLS específica para esa lectura.
