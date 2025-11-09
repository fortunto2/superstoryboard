# Queue Processing Automation for SuperStoryboard

## Current Issue
Edge Functions (`process-image-generation`, `process-video-generation`) need to be invoked manually to process queued jobs. Messages will sit in the queue indefinitely until the functions are called.

## Quick Solution (Implemented)
Added a **"⚡ Process Image Queue"** button in the Figma plugin UI that appears when there are items in the queue.

### How to Use
1. Generate images from the plugin
2. When queue count shows > 0, click "⚡ Process Image Queue"
3. Images will be generated and appear in Figma

## ✅ IMPLEMENTED: Automatic Queue Processing

### Cron Jobs Active (Since January 2025)
Automatic processing is now enabled using Supabase's `pg_cron` extension:

- **Image processing**: Every 5 minutes (job_id: 1)
- **Video processing**: Every 10 minutes (job_id: 2)

```sql
-- View scheduled jobs
SELECT * FROM cron.job;

-- Check cron job execution history
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;

-- Remove a job (if needed)
SELECT cron.unschedule('process-image-generation');
SELECT cron.unschedule('process-video-generation');

-- Re-enable jobs
SELECT cron.schedule(
  'process-image-generation',
  '*/5 * * * *', -- Every 5 minutes
  $$
    SELECT net.http_post(
      'https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-image-generation',
      '{}',
      '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltdmZtaG9iYXd2cGdjZnNxaGlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MDAwMjAsImV4cCI6MjA3ODE3NjAyMH0.mDtHEnvy0z6VdAR4xdFLIoxgu6fGl_gcifGoocfLTXk", "Content-Type": "application/json"}'::jsonb
    )
  $$
);

SELECT cron.schedule(
  'process-video-generation',
  '*/10 * * * *', -- Every 10 minutes
  $$
    SELECT net.http_post(
      'https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-video-generation',
      '{}',
      '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltdmZtaG9iYXd2cGdjZnNxaGlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MDAwMjAsImV4cCI6MjA3ODE3NjAyMH0.mDtHEnvy0z6VdAR4xdFLIoxgu6fGl_gcifGoocfLTXk", "Content-Type": "application/json"}'::jsonb
    )
  $$
);
```

### Option 2: Database Trigger
Create a trigger that invokes the Edge Function when new messages are added:

```sql
CREATE OR REPLACE FUNCTION trigger_image_processing()
RETURNS trigger AS $$
BEGIN
  -- Call Edge Function when new message is inserted
  PERFORM net.http_post(
    'https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-image-generation',
    '{}',
    '{"Authorization": "Bearer YOUR_ANON_KEY_HERE"}'::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_image_queue_insert
AFTER INSERT ON pgmq.q_image_generation_queue
FOR EACH ROW
EXECUTE FUNCTION trigger_image_processing();
```

### Option 3: External Scheduler
Use an external service (GitHub Actions, Vercel Cron, etc.) to call the Edge Functions:

**GitHub Actions Example** (`.github/workflows/process-queues.yml`):
```yaml
name: Process Generation Queues
on:
  schedule:
    - cron: '*/5 * * * *' # Every 5 minutes
  workflow_dispatch: # Allow manual trigger

jobs:
  process-images:
    runs-on: ubuntu-latest
    steps:
      - name: Process Image Queue
        run: |
          curl -X POST \
            "https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-image-generation" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Content-Type: application/json"

      - name: Process Video Queue
        run: |
          curl -X POST \
            "https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-video-generation" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Content-Type: application/json"
```

### Option 4: Long Polling in Edge Function
Modify the Edge Function to continuously poll the queue:

```typescript
// In process-image-generation/index.ts
Deno.serve(async (req) => {
  // Long polling mode
  const longPoll = new URL(req.url).searchParams.get('longPoll') === 'true';

  if (longPoll) {
    // Keep function running for up to 25 minutes (Supabase limit)
    const endTime = Date.now() + 25 * 60 * 1000;

    while (Date.now() < endTime) {
      // Process queue
      const processed = await processQueue();

      if (processed === 0) {
        // No messages, wait 30 seconds
        await new Promise(r => setTimeout(r, 30000));
      }
    }
  } else {
    // Single run (current behavior)
    await processQueue();
  }

  return new Response(JSON.stringify({ status: 'complete' }));
});
```

Then call with `?longPoll=true` parameter once to keep it running.

## Current Anon Key
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltdmZtaG9iYXd2cGdjZnNxaGlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MDAwMjAsImV4cCI6MjA3ODE3NjAyMH0.mDtHEnvy0z6VdAR4xdFLIoxgu6fGl_gcifGoocfLTXk
```

## Testing Manual Invocation
```bash
# Process image queue
curl -X POST \
  "https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-image-generation" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltdmZtaG9iYXd2cGdjZnNxaGlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MDAwMjAsImV4cCI6MjA3ODE3NjAyMH0.mDtHEnvy0z6VdAR4xdFLIoxgu6fGl_gcifGoocfLTXk"

# Process video queue
curl -X POST \
  "https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-video-generation" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltdmZtaG9iYXd2cGdjZnNxaGlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MDAwMjAsImV4cCI6MjA3ODE3NjAyMH0.mDtHEnvy0z6VdAR4xdFLIoxgu6fGl_gcifGoocfLTXk"
```

## Summary
- **Quick Fix**: ✅ Added "Process Queue" button in plugin
- **Best Long-term**: Option 1 (pg_cron) - runs inside Supabase
- **Most Flexible**: Option 3 (External scheduler) - easy to monitor
- **Most Efficient**: Option 2 (Database trigger) - instant processing