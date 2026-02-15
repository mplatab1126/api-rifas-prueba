import { createClient } from '@supabase/supabase-js'

// Estas llaves las pondremos secretas en Vercel más adelante
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default async function handler(req, res) {
  // 1. Recibimos el teléfono que manda Chatea Pro
  const { telefono } = req.query

  if (!telefono) {
    return res.status(400).json({ error: 'Falta el número de teléfono' })
  }

  // 2. Buscamos en tu nueva bóveda de Supabase
  const { data, error } = await supabase
    .from('clientes_prueba')
    .select('boletas, deuda')
    .eq('telefono', telefono)
    .single() // single() porque buscamos 1 solo cliente exacto

  // 3. Si no existe o hay error
  if (error || !data) {
    return res.status(404).json({ error: 'Cliente no encontrado', Boletas_Prueba: 'Ninguna', Deuda_Prueba: 0 })
  }

  // 4. Si existe, le devolvemos los datos limpios a Chatea Pro
  return res.status(200).json({
    Boletas_Prueba: data.boletas,
    Deuda_Prueba: data.deuda
  })
}
