/**
 * Test Webhook Endpoint
 * Allows testing the booking email system without HMAC verification
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    // For GET requests, return test instructions
    if (req.method === 'GET') {
      return res.status(200).json({
        message: 'Test webhook endpoint for debugging',
        usage: 'POST a JSON payload with "data" object containing call details',
        example: {
          data: {
            call_id: 'test_call_123',
            transcript: 'Hi, my name is John Smith. My phone is 555-123-4567 and my email is john@example.com. I want to book a deep tissue massage appointment for next Friday at 3 PM.',
            summary: 'Customer requested massage appointment'
          }
        }
      });
    }

    // Parse webhook payload
    const webhook = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const conversationData = webhook.data || {};
    const transcript = conversationData.transcript || 'No transcript available';
    const callId = conversationData.call_id || 'test_' + Date.now();
    const summary = conversationData.summary || transcript.substring(0, 200);

    // Extract booking details from transcript
    const details = {
      name: 'Unknown',
      phone: 'Not provided',
      email: 'Not provided',
      service: 'Not specified',
      datetime: 'Not specified',
      therapist: 'Not specified'
    };

    if (transcript) {
      const nameMatch = transcript.match(/(?:my name is|call me|i'm|my name's)\s+([a-zA-Z\s]+?)(?:\.|,|and|\s(?:my|my phone))/i);
      if (nameMatch) details.name = nameMatch[1].trim();

      const phoneMatch = transcript.match(/(?:phone[:\s]+|number[:\s]+)?(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})/);
      if (phoneMatch) details.phone = phoneMatch[1];

      const emailMatch = transcript.match(/([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) details.email = emailMatch[1];

      const serviceMatch = transcript.match(/(?:service|treatment|appointment|massage)[:\s]+([^,.]+?)(?:,|\.|\s(?:with|on|for))/i);
      if (serviceMatch) details.service = serviceMatch[1].trim();

      const datetimeMatch = transcript.match(/(?:for|at|on)\s+(.+?)(?:\s+at\s+|,|\.|\s*$)/i);
      if (datetimeMatch) details.datetime = datetimeMatch[1].trim();

      const therapistMatch = transcript.match(/(?:therapist|prefer|with|experienced)\s+(?:with\s+)?([a-zA-Z\s]+?)(?:\.|,|$)/i);
      if (therapistMatch) details.therapist = therapistMatch[1].trim();
    }

    // Send test email
    const emailResponse = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@sanctuarywanaka.com',
      to: 'info@sanctuarywanaka.co.nz',
      subject: `[TEST] New Booking Request - ${details.name}`,
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
            .test-badge { background-color: #ff9800; color: white; padding: 8px 12px; border-radius: 3px; display: inline-block; margin-bottom: 10px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">[TEST] New Booking Request</h1>
              <p style="margin: 5px 0 0 0;">Test Message - Ava AI Receptionist</p>
            </div>
            <div class="content">
              <div class="test-badge">✓ TEST MESSAGE - System Working</div>
              <div class="section">
                <div class="section-title">CLIENT INFORMATION</div>
                <div class="detail-row">
                  <div class="detail-label">Name:</div>
                  <div class="detail-value">${details.name}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Phone:</div>
                  <div class="detail-value">${details.phone}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Email:</div>
                  <div class="detail-value">${details.email}</div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">APPOINTMENT DETAILS</div>
                <div class="detail-row">
                  <div class="detail-label">Service:</div>
                  <div class="detail-value">${details.service}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Preferred Date/Time:</div>
                  <div class="detail-value">${details.datetime}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Therapist Preference:</div>
                  <div class="detail-value">${details.therapist}</div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">CONVERSATION SUMMARY</div>
                <div style="background-color: #fff; padding: 15px; border-left: 4px solid #6b4c9a; margin: 15px 0; font-size: 13px;">${summary}</div>
              </div>

              <div style="background-color: #e8e8e8; padding: 10px; border-radius: 3px; margin-top: 10px; font-size: 12px;">
                <strong>Call ID:</strong> ${callId}
              </div>

              <div class="footer" style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
                <p>This test message confirms the booking email system is working correctly.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log('[TEST] Email sent successfully:', emailResponse.id);

    return res.status(200).json({
      success: true,
      message: 'Test email sent successfully!',
      messageId: emailResponse.id,
      bookingDetails: details,
      callId: callId
    });

  } catch (error) {
    console.error('[TEST] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: 'Failed to send test email'
    });
  }
};
