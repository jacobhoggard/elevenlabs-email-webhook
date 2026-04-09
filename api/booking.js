/**
 * During-Call Booking Tool Endpoint
 * Called by ElevenLabs Amelia when booking details are collected mid-call
 * Sends instant WhatsApp notification to spa team via Twilio
 */

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_FROM = process.env.WHATSAPP_FROM || 'whatsapp:+14155238886';
const WHATSAPP_TO = process.env.WHATSAPP_TO || 'whatsapp:+64211305723';

async function sendWhatsApp(message) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const body = new URLSearchParams({
    From: WHATSAPP_FROM,
    To: WHATSAPP_TO,
    Body: message
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Twilio error: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

export default async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'Booking endpoint — POST booking details to send WhatsApp notification',
      required_fields: ['name', 'phone', 'service', 'preferred_datetime'],
      optional_fields: ['email', 'therapist']
    });
  }

  if (req.method !== 'POST') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { name, phone, email, service, preferred_datetime, therapist } = body;

    if (!name || !phone || !service) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, phone, service' });
    }

    const message = [
      `🌿 *New Booking — Sanctuary Day Spa*`,
      ``,
      `👤 *Name:* ${name}`,
      `📞 *Phone:* ${phone}`,
      `📧 *Email:* ${email || 'Not provided'}`,
      `💆 *Service:* ${service}`,
      `📅 *Date/Time:* ${preferred_datetime || 'Not specified'}`,
      `👩‍⚕️ *Therapist:* ${therapist || 'No preference'}`,
      ``,
      `⚡ Please call or message the client to confirm.`
    ].join('\n');

    const result = await sendWhatsApp(message);
    console.log(`[BOOKING] WhatsApp sent for ${name} | SID: ${result.sid}`);

    return res.status(200).json({
      success: true,
      message: 'Booking request sent to Sanctuary team via WhatsApp'
    });

  } catch (error) {
    console.error('[BOOKING] Error:', error);
    // Return success to Amelia so the call continues smoothly
    return res.status(200).json({
      success: true,
      message: 'Booking request received'
    });
  }
};
