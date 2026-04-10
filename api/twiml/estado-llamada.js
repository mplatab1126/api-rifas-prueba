import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).end();

  const body = req.body || {};

  try {
    // Twilio envía datos de grabación cuando la grabación está lista
    if (body.RecordingSid && body.CallSid) {
      const recordingUrl = body.RecordingUrl
        ? body.RecordingUrl + '.mp3'
        : `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${body.RecordingSid}.mp3`;
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
  } catch (_) { /* responder 200 siempre para que Twilio no reintente */ }

  return res.status(200).end();
}
