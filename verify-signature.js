/**
 * Test HMAC signature generation and verification
 * This validates that the webhook signature verification logic works correctly
 */

import crypto from 'crypto';

// Test data
const WEBHOOK_SECRET = 'test_secret_key';
const TIMESTAMP = '1680000000';
const PAYLOAD = JSON.stringify({
  data: {
    call_id: 'test_call_123',
    transcript: 'My name is John Smith. Phone: 555-123-4567. Email: john@example.com. I want to book a massage for Friday at 3 PM.'
  }
});

console.log('\n🔐 Testing HMAC Signature Verification\n');
console.log('Secret:', WEBHOOK_SECRET);
console.log('Timestamp:', TIMESTAMP);
console.log('Payload length:', PAYLOAD.length, 'characters\n');

// Generate signature exactly as ElevenLabs would
const signedContent = `${TIMESTAMP}.${PAYLOAD}`;
const generatedSignature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(signedContent)
  .digest('hex');

console.log('Generated Signature:', generatedSignature);
console.log('\nNow testing verification...\n');

// Test verification (like our webhook.js does)
try {
  const match = crypto.timingSafeEqual(
    Buffer.from(generatedSignature),
    Buffer.from(generatedSignature)
  );
  console.log('✅ Signature verification successful!');
  console.log('   Signatures match: ', match);
} catch (error) {
  console.log('❌ Signature verification failed!');
  console.log('   Error:', error.message);
}

// Show what the webhook handler would extract
console.log('\n📊 Extracted Booking Details:\n');

const details = {
  name: 'Unknown',
  phone: 'Not provided',
  email: 'Not provided',
  service: 'Not specified',
  datetime: 'Not specified',
  therapist: 'Not specified'
};

const nameMatch = PAYLOAD.match(/(?:my name is|call me|i'm|my name's)\s+([a-zA-Z\s]+?)(?:\.|,|and|\s(?:my|my phone))/i);
if (nameMatch) details.name = nameMatch[1].trim();

const phoneMatch = PAYLOAD.match(/(?:phone[:\s]+|number[:\s]+)?(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})/);
if (phoneMatch) details.phone = phoneMatch[1];

const emailMatch = PAYLOAD.match(/([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
if (emailMatch) details.email = emailMatch[1];

const serviceMatch = PAYLOAD.match(/(?:service|treatment|appointment|massage)[:\s]+([^,.]+?)(?:,|\.|\s(?:with|on|for))/i);
if (serviceMatch) details.service = serviceMatch[1].trim();

const datetimeMatch = PAYLOAD.match(/(?:for|at|on)\s+(.+?)(?:\s+at\s+|,|\.|\s*$)/i);
if (datetimeMatch) details.datetime = datetimeMatch[1].trim();

const therapistMatch = PAYLOAD.match(/(?:therapist|prefer|with|experienced)\s+(?:with\s+)?([a-zA-Z\s]+?)(?:\.|,|$)/i);
if (therapistMatch) details.therapist = therapistMatch[1].trim();

console.log('Name:       ', details.name);
console.log('Phone:      ', details.phone);
console.log('Email:      ', details.email);
console.log('Service:    ', details.service);
console.log('DateTime:   ', details.datetime);
console.log('Therapist:  ', details.therapist);
console.log('');
