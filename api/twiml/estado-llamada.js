import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).end();

  const body = req.body || {};
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // Twilio envía datos de grabación cuando la grabación está lista
  if (body.RecordingSid && body.RecordingUrl && body.CallSid) {
    const recordingUrl = body.RecordingUrl + '.mp3';
    await supabase
      .from('llamadas_twilio')
      .update({ recording_url: recordingUrl, updated_at: new Date().toISOString() })
      .eq('sid', body.CallSid);
    return res.status(200).end();
  }

  // Twilio envía actualizaciones del estado de la llamada
  const { CallSid, CallStatus, CallDuration } = body;
  if (!CallSid || !CallStatus) return res.status(200).end();

  const update = { estado: CallStatus, updated_at: new Date().toISOString() };
  if (CallDuration) update.duracion = Number(CallDuration);

  await supabase
    .from('llamadas_twilio')
    .update(update)
    .eq('sid', CallSid);

  return res.status(200).end();
}
