/**
 * ElevenLabs Post-Call Webhook Handler
 * Receives booking data from ElevenLabs Ava agent and sends email via Resend
 * Deployed to Vercel Serverless Functions
 * Updated: Resend API key configured in Vercel environment
 */

import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);
const WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET;

// Verify ElevenLabs webhook signature
function verifyWebhookSignature(request, secret) {
  // Headers in Vercel are accessed as object properties, not via .get()
  const signature = request.headers['elevenlabs-signature'];
  if (!signature) return false;

  const timestamp = request.headers['elevenlabs-timestamp'];
  if (!timestamp) return false;

  const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  const signedContent = `${timestamp}.${body}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Extract booking details from transcript
function extractBookingDetails(transcript) {
  const details = {
    name: 'Unknown',
    phone: 'Not provided',
    email: 'Not provided',
    service: 'Not specified',
    datetime: 'Not specified',
    therapist: 'Not specified'
  };

  if (!transcript) return details;

  // Simple extraction - looks for common patterns in conversation
  const nameMatch = transcript.match(/(?:my name is|call me|i'm|my name's)\s+([a-zA-Z\s]+?)(?:\.|,|and|\s(?:my|my phone))/i);
  if (nameMatch) details.name = nameMatch[1].trim();

  const phoneMatch = transcript.match(/(?:phone[:\s]+|number[:\s]+)?(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})/);
  if (phoneMatch) details.phone = phoneMatch[1];

  const emailMatch = transcript.match(/([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) details.email = emailMatch[1];

  const serviceMatch = transcript.match(/(?:service|treatment|appointment)[:\s]+([^,.]+?)(?:,|\.|\s(?:with|on))/i);
  if (serviceMatch) details.service = serviceMatch[1].trim();

  const therapistMatch = transcript.match(/(?:therapist|prefer|with)\s+([a-zA-Z\s]+?)(?:\.|,|$)/i);
  if (therapistMatch) details.therapist = therapistMatch[1].trim();

  return details;
}

export default async (req, res) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    // Verify webhook signature
    if (WEBHOOK_SECRET) {
      const isValid = verifyWebhookSignature(req, WEBHOOK_SECRET);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    // Parse webhook payload
    const webhook = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Extract conversation data
    const conversationData = webhook.data || {};
    const transcript = conversationData.transcript || 'No transcript available';
    const callId = conversationData.call_id || 'Unknown';
    const summary = conversationData.summary || transcript.substring(0, 200);

    // Extract booking details from transcript
    const booking = extractBookingDetails(transcript);

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@sanctuarywanaka.com',
      to: 'info@sanctuarywanaka.co.nz',
      subject: `New Booking Request - ${booking.name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #6b4c9a; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
            .section { margin: 20px 0; }
            .section-title { font-weight: bold; color: #6b4c9a; font-size: 14px; margin-bottom: 10px; }
            .detail-row { display: flex; margin: 8px 0; }
            .detail-label { font-weight: bold; width: 150px; }
            .detail-value { flex: 1; }
            .transcript { background-color: #fff; padding: 15px; border-left: 4px solid #6b4c9a; margin: 15px 0; font-size: 13px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
            .call-id { background-color: #e8e8e8; padding: 10px; border-radius: 3px; margin-top: 10px; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">New Booking Request</h1>
              <p style="margin: 5px 0 0 0;">Received from Ava AI Receptionist</p>
            </div>
            <div class="content">
              <div class="section">
                <div class="section-title">CLIENT INFORMATION</div>
                <div class="detail-row">
                  <div class="detail-label">Name:</div>
                  <div class="detail-value">${booking.name}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Phone:</div>
                  <div class="detail-value">${booking.phone}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Email:</div>
                  <div class="detail-value">${booking.email}</div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">APPOINTMENT DETAILS</div>
                <div class="detail-row">
                  <div class="detail-label">Service:</div>
                  <div class="detail-value">${booking.service}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Preferred Date/Time:</div>
                  <div class="detail-value">${booking.datetime}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Therapist Preference:</div>
                  <div class="detail-value">${booking.therapist}</div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">CONVERSATION SUMMARY</div>
                <div class="transcript">${summary}</div>
              </div>

              <div class="section">
                <div class="section-title">ACTION REQUIRED</div>
                <p>Please follow up with the client at your earliest convenience to confirm their appointment and provide any additional details they may need.</p>
              </div>

              <div class="call-id">
                <strong>Call ID:</strong> ${callId}
              </div>

              <div class="footer">
                <p>This booking request was automatically captured by Ava AI Receptionist for Sanctuary Wanaka.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log('Email sent:', emailResponse);

    return res.status(200).json({
      success: true,
      messageId: emailResponse.id,
      bookingDetails: booking
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
