# Instant Queue Processing Solutions

## ✅ Best Solution: Database Webhooks

Database Webhooks provide **instant, event-driven processing** when items are added to queue tables. No polling, no cron jobs, no delays!

### How to Set Up Database Webhooks

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/imvfmhobawvpgcfsqhid/database/webhooks
   - Click "Create a new hook"

2. **Create Webhook for Image Queue**

   **Name**: `process-image-queue`

   **Table**: `pgmq.q_image_generation_queue`

   **Events**: ✅ INSERT

   **Type**: HTTP Request

   **Method**: POST

   **URL**:
   ```
   https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-image-generation
   ```

   **Headers**:
   ```json
   {
     "Content-Type": "application/json",
     "Authorization": "Bearer [YOUR_SERVICE_ROLE_KEY]"
   }
   ```

   **Body** (optional):
   ```json
   {}
   ```

3. **Create Webhook for Video Queue**

   **Name**: `process-video-queue`

   **Table**: `pgmq.q_video_generation_queue`

   **Events**: ✅ INSERT

   **Type**: HTTP Request

   **Method**: POST

   **URL**:
   ```
   https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-video-generation
   ```

   **Headers**:
   ```json
   {
     "Content-Type": "application/json",
     "Authorization": "Bearer [YOUR_SERVICE_ROLE_KEY]"
   }
   ```

### How It Works

1. Application adds message to queue → INSERT event fires
2. Webhook instantly calls Edge Function (< 1 second)
3. Edge Function processes the queue immediately
4. No polling, no waiting, no cron jobs needed!

## Alternative: Manual Triggering from Application

If you can't use Database Webhooks, trigger Edge Functions directly from your application:

### From Figma Plugin

```typescript
// When generating an image
async function generateImage(prompt: string) {
  // 1. Add to queue
  await supabase.rpc('pgmq_send', {
    queue_name: 'image_generation_queue',
    msg: { prompt, storyboardId, sceneId }
  });

  // 2. Immediately trigger processing
  await fetch('https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-image-generation', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
}
```

### From Web App (Next.js/React)

```typescript
// api/generate-image.ts
export async function POST(request: Request) {
  const { prompt } = await request.json();

  // 1. Add to queue
  const { data: queueResult } = await supabase.rpc('pgmq_send', {
    queue_name: 'image_generation_queue',
    msg: { prompt, /* ... */ }
  });

  // 2. Trigger processing immediately
  const processingResponse = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-image-generation`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    }
  );

  return Response.json({
    queued: true,
    processing: processingResponse.ok
  });
}
```

## Comparison of Solutions

| Solution | Response Time | Setup Complexity | Reliability |
|----------|--------------|------------------|-------------|
| **Database Webhooks** | < 1 second | Medium (Dashboard) | High |
| **Manual Trigger** | < 1 second | Low (Code only) | High |
| **pg_cron** | 60+ seconds | Low | Medium |
| **Shell Script** | 10 seconds | Low | Low |
| **Queue Monitor** | 10 seconds | Medium | Medium |

## Testing Webhooks

After setting up webhooks, test them:

```bash
# Add a test message to queue
curl -X POST https://imvfmhobawvpgcfsqhid.supabase.co/rest/v1/rpc/pgmq_send \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "queue_name": "image_generation_queue",
    "msg": {
      "storyboardId": "test-123",
      "prompt": "Test webhook trigger"
    }
  }'

# Check if Edge Function was triggered (view logs)
```

## Monitoring

Check webhook delivery in Supabase Dashboard:
- Database → Webhooks → Click on webhook → View logs
- Edge Functions → Logs → Check for instant invocations

## Summary

**Recommended Setup:**
1. **Primary**: Database Webhooks for instant processing
2. **Fallback**: pg_cron every minute to catch any missed messages
3. **Optional**: Manual trigger from app for critical operations

This gives you:
- ⚡ Instant processing (< 1 second)
- 🛡️ Redundancy with cron fallback
- 📊 Full visibility via Dashboard
- 🚀 No code changes needed (webhooks work automatically)