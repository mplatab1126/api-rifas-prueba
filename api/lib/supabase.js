/**
 * Conexion central a Supabase.
 *
 * Este archivo crea UNA sola vez las instancias de Supabase que usan
 * todos los endpoints del backend. Antes, cada archivo creaba su propia
 * conexion, lo que significaba que las credenciales estaban repetidas
 * en decenas de archivos.
 *
 * Hay dos clientes disponibles:
 *
 *   supabase       - Cliente normal (ANON_KEY). Lo usan casi todos los
 *                    endpoints. Respeta las reglas de seguridad (RLS) de
 *                    Supabase.
 *
 *   supabaseAdmin  - Cliente con permisos especiales (SERVICE_ROLE_KEY).
 *                    Solo lo usan los endpoints de permisos y horarios,
 *                    que necesitan saltar las reglas de seguridad para
 *                    administrar el sistema. Si la SERVICE_ROLE_KEY no
 *                    esta configurada en Vercel, usa la ANON_KEY como
 *                    respaldo (mismo comportamiento que tenian antes los
 *                    archivos horarios.js y permisos.js).
 *
 * Como usarlos en otros archivos:
 *
 *   import { supabase } from '../lib/supabase.js';
 *   import { supabaseAdmin } from '../lib/supabase.js';
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
);
