# ElevenLabs Webhook Configuration Guide

## Overview
This document outlines the exact configuration required in ElevenLabs to enable post-call webhooks for booking email delivery.

## Current System Status ✅

### Deployment
- **Webhook Endpoint**: `https://elevenlabs-email-webhook.vercel.app/api/webhook`
- **Status**: Live and Ready
- **Last Fix**: Header access method corrected for Vercel serverless environment (deployed)
- **Test Endpoint**: `https://elevenlabs-email-webhook.vercel.app/api/test` (working, verified)

### Email System ✅
- **Email Provider**: Resend API (v3.0.0)
- **Target Email**: info@sanctuarywanaka.co.nz
- **Status**: Verified working (5 successful test emails sent)
- **Features**:
  - Automated booking confirmation emails
  - HTML templates with Sanctuary Wanaka branding
  - Automatic transcript parsing for booking details

### Security ✅
- **Signature Verification**: HMAC SHA256
- **Status**: Implemented and deployed
- **Environment Variables**: Configured in Vercel

## Configuration Required in ElevenLabs

### Step 1: Access Agent Settings
1. Log into ElevenLabs Dashboard
2. Navigate to "Agents" or your AI agent
3. Select the Sanctuary Wanaka booking agent

### Step 2: Configure Webhook

**Webhook URL:**
```
https://elevenlabs-email-webhook.vercel.app/api/webhook
```

**Webhook Secret:**
```
Must match ELEVENLABS_WEBHOOK_SECRET in Vercel environment variables
```

**Webhook Trigger:**
- Enable "Post-Call Webhook"
- Trigger: "After call ends" or "On call completion"

**Webhook Settings:**
- Method: POST
- Content-Type: application/json
- Include Signature: Yes (HMAC SHA256)
- Include Timestamp: Yes

### Step 3: Verify Configuration

Once configured, the webhook will send requests in this format:

```
POST /api/webhook HTTP/1.1
Host: elevenlabs-email-webhook.vercel.app
Content-Type: application/json
elevenlabs-signature: <HMAC-SHA256-SIGNATURE>
elevenlabs-timestamp: <UNIX-TIMESTAMP>

{
  "data": {
    "call_id": "call_abc123",
    "transcript": "Full conversation transcript...",
    "summary": "Brief summary of conversation..."
  }
}
```

## Payload Processing

The webhook automatically:

1. **Verifies Signature**: Uses HMAC SHA256 to verify webhook authenticity
2. **Parses Transcript**: Extracts booking details using regex patterns:
   - Customer name
   - Phone number
   - Email address
   - Service requested
   - Preferred date/time
   - Therapist preference

3. **Sends Email**: Delivers formatted email to info@sanctuarywanaka.co.nz with:
   - CLIENT INFORMATION section
   - APPOINTMENT DETAILS section
   - CONVERSATION SUMMARY
   - ACTION REQUIRED notification
   - Call ID for reference

## Testing

### Option 1: Test Endpoint (No Signature Required)
```bash
curl -X POST https://elevenlabs-email-webhook.vercel.app/api/test \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "call_id": "test_call_123",
      "transcript": "My name is Jane Smith. Phone: 555-123-4567. Email: jane@example.com. I want to book a massage for Friday at 2 PM.",
      "summary": "Customer requested massage appointment"
    }
  }'
```

Response: Email sent successfully to info@sanctuarywanaka.co.nz ✅

### Option 2: Production Webhook (With Signature)
Use the `test-webhook.sh` script with the correct ELEVENLABS_WEBHOOK_SECRET

## Expected Email Format

The system sends a formatted HTML email with:
- Purple header (#6b4c9a) matching Sanctuary Wanaka branding
- Organized sections for easy reading
- Call ID for tracking
- Professional footer

## Troubleshooting

### Issue: Webhook returns 401 Unauthorized
**Cause**: Invalid HMAC signature
**Solution**: Verify that ELEVENLABS_WEBHOOK_SECRET matches in both ElevenLabs and Vercel

### Issue: Webhook returns 500 Error
**Cause**: Malformed request or missing headers
**Solution**: Ensure headers include:
- `elevenlabs-signature`
- `elevenlabs-timestamp`
- `Content-Type: application/json`

### Issue: Email not received
**Cause**: Booking details not extracted correctly from transcript
**Solution**: Check transcript contains:
- Clear name statement (e.g., "My name is...")
- Phone number (10 digits or formatted)
- Email address (valid format)

## Files

- **Production Webhook**: `api/webhook.js`
- **Test Endpoint**: `api/test.js`
- **Test Scripts**:
  - `test-webhook.sh` (requires ELEVENLABS_WEBHOOK_SECRET)
  - `test-webhook.js` (Node.js script)
- **Configuration**: `vercel.json`, `.env.local`

## Next Steps

1. ✅ Configure webhook in ElevenLabs Dashboard
2. ✅ Set webhook URL to production endpoint
3. ✅ Ensure secret matches Vercel environment
4. ✅ Make test call to verify email delivery
5. ✅ Monitor Vercel logs for webhook activity
6. ✅ Receive 5 complete booking confirmation emails

## Contact

For issues or questions about the webhook configuration, check:
- Vercel logs: https://vercel.com/sanctuary-wanaka/elevenlabs-email-webhook/logs
- GitHub repository: https://github.com/jacobhoggard/elevenlabs-email-webhook
