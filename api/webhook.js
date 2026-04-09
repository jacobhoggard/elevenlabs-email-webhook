/**
 * ElevenLabs Post-Call Webhook Handler
 * Fires after every call ends — sends WhatsApp notification to spa team via Twilio
 */

import crypto from 'crypto';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_FROM = process.env.WHATSAPP_FROM || 'whatsapp:+14155238886'; // Twilio sandbox default
const WHATSAPP_TO = process.env.WHATSAPP_TO || 'whatsapp:+64211305723';
const WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET;

// Verify ElevenLabs webhook signature
function verifyWebhookSignature(req, secret) {
  const signature = req.headers['elevenlabs-signature'];
  const timestamp = req.headers['elevenlabs-timestamp'];
  if (!signature || !timestamp) return false;
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const signedContent = `${timestamp}.${body}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.replace('v1=', '')),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// Format transcript array into readable text
function formatTranscript(transcriptArray) {
  if (!Array.isArray(transcriptArray)) return String(transcriptArray || '');
  return transcriptArray
    .map(t => `${t.role === 'agent' ? 'Amelia' : 'Caller'}: ${t.message}`)
    .join('\n');
}

// Extract booking details from ElevenLabs data_collection_results or transcript
function extractBookingDetails(webhook) {
  const analysis = webhook.analysis || {};
  const collected = analysis.data_collection_results || {};
  const transcriptText = formatTranscript(webhook.transcript);

  const get = (key) => {
    const entry = collected[key];
    if (entry && entry.value && entry.value !== 'null' && entry.value !== 'unknown') {
      return entry.value;
    }
    return null;
  };

  const name = get('name') || get('customer_name') || parseFromTranscript(transcriptText, 'name');
  const phone = get('phone') || get('phone_number') || get('contact_number') || parseFromTranscript(transcriptText, 'phone');
  const email = get('email') || get('email_address') || parseFromTranscript(transcriptText, 'email');
  const service = get('service') || get('service_type') || get('treatment') || parseFromTranscript(transcriptText, 'service');
  const datetime = get('preferred_datetime') || get('preferred_date') || get('date_time') || get('appointment_time') || parseFromTranscript(transcriptText, 'datetime');
  const therapist = get('therapist') || get('therapist_preference') || get('preferred_therapist') || parseFromTranscript(transcriptText, 'therapist');

  return {
    name: name || 'Not provided',
    phone: phone || 'Not provided',
    email: email || 'Not provided',
    service: service || 'Not specified',
    datetime: datetime || 'Not specified',
    therapist: therapist || 'No preference'
  };
}

function parseFromTranscript(text, field) {
  if (!text) return null;
  switch (field) {
    case 'name':
      const nameMatch = text.match(/(?:my name is|i'm|i am|call me)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/i);
      return nameMatch ? nameMatch[1].trim() : null;
    case 'phone':
      const phoneMatch = text.match(/(\+?64[\s-]?[0-9]{1,3}[\s-]?[0-9]{3,4}[\s-]?[0-9]{3,4}|0[0-9]{1,2}[\s-]?[0-9]{3,4}[\s-]?[0-9]{3,4}|\b\d{10}\b)/);
      return phoneMatch ? phoneMatch[1].trim() : null;
    case 'email':
      const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      return emailMatch ? emailMatch[1] : null;
    case 'service':
      const serviceMatch = text.match(/(?:book|want|like|need|interested in)\s+(?:a\s+)?([a-zA-Z\s]+?(?:massage|facial|treatment|spa|stone|scrub|wrap|peel|manicure|pedicure))/i);
      return serviceMatch ? serviceMatch[1].trim() : null;
    case 'datetime':
      const timeMatch = text.match(/(?:on\s+)?(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i);
      return timeMatch ? timeMatch[0].trim() : null;
    case 'therapist':
      const therapistMatch = text.match(/(?:prefer|with|request)\s+([A-Z][a-z]+)/i);
      return therapistMatch ? therapistMatch[1] : null;
    default:
      return null;
  }
}

// Send WhatsApp message via Twilio REST API
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
  if (req.method !== 'POST') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    // Verify signature if secret is configured
    if (WEBHOOK_SECRET) {
      const isValid = verifyWebhookSignature(req, WEBHOOK_SECRET);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const webhook = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Accept post_call_transcription events only
    if (webhook.type && webhook.type !== 'post_call_transcription') {
      return res.status(200).json({ message: `Event type ${webhook.type} ignored` });
    }

    const booking = extractBookingDetails(webhook);
    const conversationId = webhook.conversation_id || webhook.data?.call_id || 'Unknown';
    const duration = webhook.metadata?.call_duration_secs
      ? `${Math.round(webhook.metadata.call_duration_secs / 60)}m ${webhook.metadata.call_duration_secs % 60}s`
      : 'Unknown';

    const message = [
      `🌿 *New Booking — Sanctuary Day Spa*`,
      ``,
      `👤 *Name:* ${booking.name}`,
      `📞 *Phone:* ${booking.phone}`,
      `📧 *Email:* ${booking.email}`,
      `💆 *Service:* ${booking.service}`,
      `📅 *Date/Time:* ${booking.datetime}`,
      `👩‍⚕️ *Therapist:* ${booking.therapist}`,
      ``,
      `⚡ Please call or message the client to confirm.`,
      ``,
      `_Call ID: ${conversationId} | Duration: ${duration}_`
    ].join('\n');

    const result = await sendWhatsApp(message);
    console.log(`[WEBHOOK] WhatsApp sent for ${booking.name} | SID: ${result.sid}`);

    return res.status(200).json({
      success: true,
      messageSid: result.sid,
      bookingDetails: booking
    });

  } catch (error) {
    console.error('[WEBHOOK] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
