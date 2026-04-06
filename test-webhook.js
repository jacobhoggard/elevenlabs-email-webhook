/**
 * ElevenLabs Webhook Simulator
 * Simulates a real ElevenLabs post-call webhook with proper HMAC signature
 * This tests the complete end-to-end flow: signature verification, transcript parsing, email delivery
 */

import crypto from 'crypto';

// Configuration
const WEBHOOK_URL = 'https://elevenlabs-email-webhook.vercel.app/api/webhook';
const WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET || 'your_elevenlabs_webhook_secret_here';

// Realistic ElevenLabs webhook payload
const webhookPayload = {
  data: {
    call_id: 'call_' + Date.now(),
    transcript: `
      Agent: Good afternoon, thank you for calling Sanctuary Wanaka! How can I help you today?

      Customer: Hi, I'd like to book a massage appointment. My name is Sarah Johnson.

      Agent: Wonderful, Sarah! I'd be happy to help. What type of massage are you interested in?

      Customer: I'm interested in a deep tissue massage. My phone number is 555-123-4567 and you can email me at sarah.johnson@email.com.

      Agent: Perfect! And when would you like to book your appointment?

      Customer: I'd like to book it for next Friday at 3 PM if that's available. I don't have a therapist preference, anyone experienced with deep tissue would be great.

      Agent: Excellent! Let me confirm that for you - deep tissue massage, next Friday at 3 PM. I'll have our team reach out to confirm with you via email at sarah.johnson@email.com. Thank you for choosing Sanctuary Wanaka!

      Customer: Thank you so much!
    `,
    summary: 'Customer Sarah Johnson requested a deep tissue massage appointment for next Friday at 3 PM. Contact: 555-123-4567, sarah.johnson@email.com'
  }
};

// Generate HMAC signature like ElevenLabs does
function generateWebhookSignature(timestamp, body, secret) {
  const signedContent = `${timestamp}.${body}`;
  return crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');
}

// Send webhook to production endpoint
async function testWebhook() {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify(webhookPayload);
    const signature = generateWebhookSignature(timestamp, body, WEBHOOK_SECRET);

    console.log('\n🧪 Testing ElevenLabs Webhook Simulation\n');
    console.log('Webhook URL:', WEBHOOK_URL);
    console.log('Timestamp:', timestamp);
    console.log('Signature:', signature.substring(0, 16) + '...');
    console.log('Call ID:', webhookPayload.data.call_id);
    console.log('\nSending webhook to production endpoint...\n');

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'elevenlabs-signature': signature,
        'elevenlabs-timestamp': timestamp
      },
      body: body
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Webhook received and processed successfully!');
      console.log('Response:', JSON.stringify(data, null, 2));
      console.log('\n📧 Email should have been sent to: info@sanctuarywanaka.co.nz');
      console.log('📞 Customer contact: 555-123-4567');
      console.log('✉️ Customer email: sarah.johnson@email.com');
      process.exit(0);
    } else {
      console.log('❌ Webhook rejected with status', response.status);
      console.log('Error:', data.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error sending webhook:', error.message);
    process.exit(1);
  }
}

testWebhook();
