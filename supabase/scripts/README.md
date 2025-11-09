# Queue Trigger Scripts

Scripts for testing AI generation queues.

## Files

- `queue-trigger.ts` - Deno script for enqueueing jobs (requires Deno)
- `enqueue-test-images.sql` - SQL script for testing image generation
- `test-prompts.json` - Sample prompts for batch testing
- `.env.example` - Environment variables template

## Quick Test (SQL)

### Enqueue 3 Test Images

1. Open Supabase SQL Editor: https://supabase.com/dashboard/project/imvfmhobawvpgcfsqhid/sql
2. Run `enqueue-test-images.sql`
3. Invoke Edge Function:

```bash
curl -X POST \
  "https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-image-generation" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltdmZtaG9iYXd2cGdjZnNxaGlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MDAwMjAsImV4cCI6MjA3ODE3NjAyMH0.mDtHEnvy0z6VdAR4xdFLIoxgu6fGl_gcifGoocfLTXk"
```

### Enqueue Video

```sql
SELECT pgmq.send(
  'video_generation_queue',
  jsonb_build_object(
    'storyboardId', 'test-video-001',
    'sceneId', 'scene-video-001',
    'prompt', 'A majestic lion walking through the savannah at golden hour',
    'aspectRatio', '16:9',
    'durationSeconds', '8',
    'resolution', '720p'
  )
);
```

## Using Deno Script (Optional)

### Install Deno

```bash
curl -fsSL https://deno.land/x/install/install.sh | sh
```

### Configure Environment

```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

### Usage

```bash
# Single image
deno run --allow-net --allow-env queue-trigger.ts image "A hero on a cliff"

# Image with scene ID
deno run --allow-net --allow-env queue-trigger.ts image "A dragon flying" --scene=scene-002

# Character image
deno run --allow-net --allow-env queue-trigger.ts image "Warrior portrait" --character=hero-001

# Image editing
deno run --allow-net --allow-env queue-trigger.ts image-edit "Add dramatic sunset" \
  --source=https://imvfmhobawvpgcfsqhid.supabase.co/storage/v1/object/public/storyboard-images/test/scene-001.png

# Video generation
deno run --allow-net --allow-env queue-trigger.ts video "Lion walking" --duration=8

# Image-to-video
deno run --allow-net --allow-env queue-trigger.ts video "Animate this scene" \
  --source=https://imvfmhobawvpgcfsqhid.supabase.co/storage/v1/object/public/storyboard-images/test/scene-001.png

# Batch from JSON
deno run --allow-net --allow-env queue-trigger.ts batch-images test-prompts.json
```

## Message Schema

### Images

```typescript
{
  storyboardId: string,      // Required
  sceneId?: string,          // Optional - links to scene
  characterId?: string,      // Optional - links to character
  prompt: string,            // Required
  sourceImageUrl?: string,   // Optional - for image-to-image editing
  editMode?: boolean         // Optional - enables edit mode
}
```

### Videos

```typescript
{
  storyboardId: string,           // Required
  sceneId?: string,               // Optional - links to scene
  prompt: string,                 // Required
  sourceImageUrl?: string,        // Optional - for image-to-video
  aspectRatio?: "16:9" | "9:16",  // Default: "16:9"
  durationSeconds?: "4" | "6" | "8",  // Default: "8"
  resolution?: "720p" | "1080p"   // Default: "720p"
}
```

## Monitoring

### Check Queue Status

```sql
-- Image queue
SELECT count(*) FROM pgmq.image_generation_queue;
SELECT * FROM pgmq.read('image_generation_queue', 30, 10);

-- Video queue
SELECT count(*) FROM pgmq.video_generation_queue;
SELECT * FROM pgmq.read('video_generation_queue', 600, 10);
```

### View Generated Assets

```sql
-- Check storage
SELECT name, created_at, metadata
FROM storage.objects
WHERE bucket_id = 'storyboard-images'
ORDER BY created_at DESC
LIMIT 10;

SELECT name, created_at, metadata
FROM storage.objects
WHERE bucket_id = 'storyboard-videos'
ORDER BY created_at DESC
LIMIT 10;
```

### Check Edge Function Logs

Via Supabase Dashboard:
- Go to **Edge Functions** → `process-image-generation` → **Logs**
- Go to **Edge Functions** → `process-video-generation` → **Logs**

Via CLI:
```bash
supabase functions logs process-image-generation --follow
supabase functions logs process-video-generation --follow
```
