/**
 * ElevenLabs Post-Call Webhook Handler
 * Handles the actual ElevenLabs webhook payload format:
 * {
 *   type: "post_call_transcription",
 *   conversation_id: "...",
 *   agent_id: "...",
 *   status: "done",
 *   transcript: [{role, message, time_in_call_secs}, ...],
 *   analysis: {
 *     transcript_summary: "...",
 *     data_collection_results: {name: {value}, phone: {value}, email: {value}, ...}
 *   },
 *   metadata: {start_time_unix_secs, call_duration_secs}
 * }
 */

import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);
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

  // Helper to get value from data_collection_results
  const get = (key) => {
    const entry = collected[key];
    if (entry && entry.value && entry.value !== 'null' && entry.value !== 'unknown') {
      return entry.value;
    }
    return null;
  };

  // Try structured data first, fall back to regex parsing of transcript
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

// Fallback regex parsing from transcript text
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
    const transcriptText = formatTranscript(webhook.transcript);
    const summary = webhook.analysis?.transcript_summary || transcriptText.substring(0, 300);
    const conversationId = webhook.conversation_id || webhook.data?.call_id || 'Unknown';
    const duration = webhook.metadata?.call_duration_secs
      ? `${Math.round(webhook.metadata.call_duration_secs / 60)}m ${webhook.metadata.call_duration_secs % 60}s`
      : 'Unknown';

    const emailResponse = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@sanctuarywanaka.com',
      to: 'info@sanctuarywanaka.co.nz',
      subject: `New Booking Request - ${booking.name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background: #f0f0f0; }
            .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #6b4c9a, #9b6abf); color: white; padding: 25px 30px; }
            .header h1 { margin: 0; font-size: 22px; }
            .header p { margin: 5px 0 0; opacity: 0.85; font-size: 13px; }
            .content { padding: 25px 30px; }
            .section { margin-bottom: 25px; }
            .section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #6b4c9a; border-bottom: 2px solid #6b4c9a; padding-bottom: 5px; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 8px 0; font-size: 14px; vertical-align: top; }
            td:first-child { font-weight: bold; width: 160px; color: #555; }
            .transcript-box { background: #f8f6fb; border-left: 4px solid #6b4c9a; padding: 15px; font-size: 13px; line-height: 1.6; white-space: pre-line; border-radius: 0 4px 4px 0; }
            .action-box { background: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 15px; font-size: 14px; }
            .footer { text-align: center; padding: 15px; font-size: 11px; color: #999; background: #f9f9f9; border-top: 1px solid #eee; }
            .meta { font-size: 11px; color: #999; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🌿 New Booking Request</h1>
              <p>Received via Amelia — Sanctuary Day Spa AI Receptionist</p>
            </div>
            <div class="content">

              <div class="section">
                <div class="section-title">Client Information</div>
                <table>
                  <tr><td>Name</td><td>${booking.name}</td></tr>
                  <tr><td>Phone</td><td>${booking.phone}</td></tr>
                  <tr><td>Email</td><td>${booking.email}</td></tr>
                </table>
              </div>

              <div class="section">
                <div class="section-title">Appointment Details</div>
                <table>
                  <tr><td>Service</td><td>${booking.service}</td></tr>
                  <tr><td>Preferred Date/Time</td><td>${booking.datetime}</td></tr>
                  <tr><td>Therapist Preference</td><td>${booking.therapist}</td></tr>
                </table>
              </div>

              <div class="section">
                <div class="section-title">Call Summary</div>
                <div class="transcript-box">${summary}</div>
              </div>

              <div class="action-box">
                <strong>⚡ Action Required:</strong> Please call or email the client to confirm their appointment.
              </div>

              <div class="meta">
                Call ID: ${conversationId} &nbsp;|&nbsp; Duration: ${duration}
              </div>
            </div>
            <div class="footer">
              Sanctuary Day Spa · Wanaka · Powered by Amelia AI Receptionist
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log(`[WEBHOOK] Email sent for ${booking.name} | ID: ${emailResponse.id}`);

    return res.status(200).json({
      success: true,
      messageId: emailResponse.id,
      bookingDetails: booking
    });

  } catch (error) {
    console.error('[WEBHOOK] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
