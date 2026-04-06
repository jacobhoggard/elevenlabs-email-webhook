#!/bin/bash

# ElevenLabs Webhook Test Script
# Sends a test webhook with proper HMAC signature to verify the entire system

WEBHOOK_URL="https://elevenlabs-email-webhook.vercel.app/api/webhook"
WEBHOOK_SECRET="${ELEVENLABS_WEBHOOK_SECRET:-your_elevenlabs_webhook_secret_here}"

# Webhook payload
read -r -d '' PAYLOAD << 'EOF'
{
  "data": {
    "call_id": "test_call_$(date +%s)",
    "transcript": "Good afternoon! My name is Emma Davis. I'd like to book an appointment. You can reach me at 555-987-6543 or emma.davis@email.com. I'm interested in a relaxing Swedish massage for next Saturday at 2 PM. I prefer working with a female therapist.",
    "summary": "Customer Emma Davis requested Swedish massage appointment for next Saturday at 2 PM. Contact: 555-987-6543, emma.davis@email.com. Prefers female therapist."
  }
}
EOF

# Generate timestamp
TIMESTAMP=$(date +%s)

# Generate HMAC SHA256 signature
SIGNED_CONTENT="${TIMESTAMP}.${PAYLOAD}"

# Generate signature using openssl
SIGNATURE=$(echo -n "$SIGNED_CONTENT" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | awk '{print $2}')

echo ""
echo "🧪 Testing ElevenLabs Webhook"
echo "================================"
echo "URL: $WEBHOOK_URL"
echo "Timestamp: $TIMESTAMP"
echo "Signature: ${SIGNATURE:0:32}..."
echo ""
echo "📤 Sending webhook request..."
echo ""

# Send the webhook
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "elevenlabs-signature: $SIGNATURE" \
  -H "elevenlabs-timestamp: $TIMESTAMP" \
  -d "$PAYLOAD")

# Parse response
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "📥 Response Status: $HTTP_CODE"
echo ""
echo "Response Body:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Webhook processed successfully!"
  echo "   Email should be sent to: info@sanctuarywanaka.co.nz"
  echo ""
  exit 0
else
  echo "❌ Webhook failed with status $HTTP_CODE"
  echo ""
  exit 1
fi
