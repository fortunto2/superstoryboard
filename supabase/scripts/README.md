# AI Generation Queue System

Queue-based system for asynchronous AI image and video generation using **Google Gemini 2.5 Flash** (images) and **Veo 3.1 Fast** (videos). Powered by Supabase Edge Functions and PGMQ (Postgres Message Queue).

## Overview

This system provides:
- **Queue-based processing**: Asynchronous job handling with visibility timeout
- **Entity linking**: Connect generated assets to scenes or characters
- **Multi-mode generation**:
  - Text-to-image
  - Image-to-image (editing mode)
  - Text-to-video
  - Image-to-video (animation)
- **Storage integration**: Automatic upload to Supabase Storage
- **Database updates**: Generated asset URLs automatically linked to entities

## Architecture

```
Web App / Script
    ↓
PGMQ Queue (image_generation_queue / video_generation_queue)
    ↓
Edge Function (process-image-generation / process-video-generation)
    ↓
Google Gemini API / Veo API
    ↓
Supabase Storage (storyboard-images / storyboard-videos)
    ↓
Database Update (kv_store_7ee7668a)
```

## Files

- **`queue-trigger.ts`** - Deno CLI tool for enqueueing jobs (supports all generation modes)
- **`enqueue-test-images.sql`** - SQL script for quick image queue testing (3 test scenes)
- **`test-prompts.json`** - Sample prompts for batch testing
- **`process-queue.sh`** - Bash wrapper for invoking Edge Functions
- **`.env.example`** - Environment variables template for local development

## Quick Start

### Prerequisites

- Supabase project with PGMQ extension enabled
- Edge Functions deployed: `process-image-generation`, `process-video-generation`
- Storage buckets created: `storyboard-images`, `storyboard-videos`
- Google Generative AI API key configured

### Quick Test (SQL)

**Fastest way to test without installing Deno:**

1. **Enqueue test images**
   - Open Supabase SQL Editor: https://supabase.com/dashboard/project/imvfmhobawvpgcfsqhid/sql
   - Run `enqueue-test-images.sql` (enqueues 3 scene images)

2. **Process the queue**
   ```bash
   # Using bash script
   ./process-queue.sh images

   # Or using curl directly
   curl -X POST \
     "https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-image-generation" \
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltdmZtaG9iYXd2cGdjZnNxaGlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MDAwMjAsImV4cCI6MjA3ODE3NjAyMH0.mDtHEnvy0z6VdAR4xdFLIoxgu6fGl_gcifGoocfLTXk"
   ```

3. **Check results**
   - View logs in Supabase Dashboard → Edge Functions → Logs
   - Check storage: Supabase Dashboard → Storage → `storyboard-images`
   - Verify database updates in `kv_store_7ee7668a` table

## Usage Examples

### Text-to-Image (Scene)

```sql
SELECT pgmq.send(
  'image_generation_queue',
  jsonb_build_object(
    'storyboardId', 'my-storyboard',
    'sceneId', 'scene-001',
    'prompt', 'A cinematic hero standing on a cliff at sunset, wide shot, dramatic lighting'
  )
);
```

### Text-to-Image (Character Reference)

```sql
SELECT pgmq.send(
  'image_generation_queue',
  jsonb_build_object(
    'storyboardId', 'my-storyboard',
    'characterId', 'hero-main',
    'prompt', 'Warrior character portrait, silver armor, red cape, brown hair, anime style'
  )
);
```

### Image-to-Image (Editing)

```sql
SELECT pgmq.send(
  'image_generation_queue',
  jsonb_build_object(
    'storyboardId', 'my-storyboard',
    'sceneId', 'scene-001',
    'prompt', 'Add dramatic storm clouds and lightning in the background',
    'sourceImageUrl', 'https://imvfmhobawvpgcfsqhid.supabase.co/storage/v1/object/public/storyboard-images/my-storyboard/scene-001.png',
    'editMode', true
  )
);
```

### Text-to-Video (Scene)

```sql
SELECT pgmq.send(
  'video_generation_queue',
  jsonb_build_object(
    'storyboardId', 'my-storyboard',
    'sceneId', 'scene-001',
    'prompt', 'A majestic lion walking through the savannah at golden hour',
    'aspectRatio', '16:9',
    'durationSeconds', '8',
    'resolution', '720p'
  )
);
```

### Text-to-Video (Character Animation)

```sql
SELECT pgmq.send(
  'video_generation_queue',
  jsonb_build_object(
    'storyboardId', 'my-storyboard',
    'characterId', 'hero-main',
    'prompt', 'Warrior character turnaround animation, full body, cinematic lighting',
    'aspectRatio', '16:9',
    'durationSeconds', '6',
    'resolution', '720p'
  )
);
```

### Image-to-Video (Animation)

```sql
SELECT pgmq.send(
  'video_generation_queue',
  jsonb_build_object(
    'storyboardId', 'my-storyboard',
    'sceneId', 'scene-001',
    'prompt', 'Camera slowly zooms in, hero turns head to look at the horizon',
    'sourceImageUrl', 'https://imvfmhobawvpgcfsqhid.supabase.co/storage/v1/object/public/storyboard-images/my-storyboard/scene-001.png',
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
  characterId?: string,           // Optional - links to character
  prompt: string,                 // Required
  sourceImageUrl?: string,        // Optional - for image-to-video
  aspectRatio?: "16:9" | "9:16",  // Default: "16:9"
  durationSeconds?: "4" | "6" | "8",  // Default: "8"
  resolution?: "720p" | "1080p"   // Default: "720p"
}
```

## Deployment

### Deploy Edge Functions

```bash
# Deploy image generation function
supabase functions deploy process-image-generation

# Deploy video generation function
supabase functions deploy process-video-generation

# Set environment variable (if not set)
supabase secrets set GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

### Create Storage Buckets

```sql
-- Create image bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('storyboard-images', 'storyboard-images', true);

-- Create video bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('storyboard-videos', 'storyboard-videos', true);
```

### Enable PGMQ Extension

```sql
CREATE EXTENSION IF NOT EXISTS pgmq;
```

## Monitoring

### Check Queue Status

```sql
-- Image queue count
SELECT count(*) FROM pgmq.image_generation_queue;

-- View pending image jobs
SELECT msg_id, enqueued_at, vt, read_ct,
       message->>'storyboardId' as storyboard_id,
       message->>'sceneId' as scene_id,
       message->>'characterId' as character_id,
       left(message->>'prompt', 60) || '...' as prompt_preview
FROM pgmq.read('image_generation_queue', 30, 10);

-- Video queue count
SELECT count(*) FROM pgmq.video_generation_queue;

-- View pending video jobs
SELECT msg_id, enqueued_at, vt, read_ct,
       message->>'storyboardId' as storyboard_id,
       message->>'sceneId' as scene_id,
       message->>'characterId' as character_id,
       left(message->>'prompt', 60) || '...' as prompt_preview
FROM pgmq.read('video_generation_queue', 600, 10);
```

### View Generated Assets

```sql
-- Recent images
SELECT name, created_at,
       pg_size_pretty((metadata->>'size')::bigint) as size
FROM storage.objects
WHERE bucket_id = 'storyboard-images'
ORDER BY created_at DESC
LIMIT 10;

-- Recent videos
SELECT name, created_at,
       pg_size_pretty((metadata->>'size')::bigint) as size
FROM storage.objects
WHERE bucket_id = 'storyboard-videos'
ORDER BY created_at DESC
LIMIT 10;

-- Check entity updates
SELECT key,
       value->>'imageUrl' as image_url,
       value->>'videoUrl' as video_url,
       value->>'imageGeneratedAt' as image_generated,
       value->>'videoGeneratedAt' as video_generated
FROM kv_store_7ee7668a
WHERE key LIKE 'scene:%' OR key LIKE 'character:%'
ORDER BY (value->>'updatedAt')::timestamp DESC
LIMIT 10;
```

### Check Edge Function Logs

**Via Supabase Dashboard:**
- Go to **Edge Functions** → `process-image-generation` → **Logs**
- Go to **Edge Functions** → `process-video-generation` → **Logs**

**Via CLI:**
```bash
# Follow image generation logs
supabase functions logs process-image-generation --follow

# Follow video generation logs
supabase functions logs process-video-generation --follow
```

## Troubleshooting

### No messages being processed

**Check queue has messages:**
```sql
SELECT count(*) FROM pgmq.image_generation_queue;
```

**Manually trigger Edge Function:**
```bash
./process-queue.sh images
```

### Images/videos not uploading to storage

**Check storage bucket exists and is public:**
```sql
SELECT * FROM storage.buckets WHERE id IN ('storyboard-images', 'storyboard-videos');
```

**Check Edge Function logs for errors:**
```bash
supabase functions logs process-image-generation --follow
```

### Database not updating with URLs

**Check entity exists in kv_store:**
```sql
SELECT * FROM kv_store_7ee7668a
WHERE key = 'scene:your-storyboard-id:your-scene-id';
```

**Check function logs for database errors:**
- Look for "Error updating entity" or "Entity not found" in logs

### API errors

**Check API key is set:**
```bash
supabase secrets list
```

**Should show:**
```
GOOGLE_GENERATIVE_AI_API_KEY
```

**Test API key manually:**
```bash
curl https://generativelanguage.googleapis.com/v1beta/models \
  -H "x-goog-api-key: YOUR_API_KEY"
```

### Queue visibility timeout issues

**If jobs are stuck "in flight":**
```sql
-- Check visibility timeout (vt)
SELECT msg_id, enqueued_at, vt, read_ct FROM pgmq.image_generation_queue;

-- Jobs become visible again after vt expires:
-- Images: 30 seconds
-- Videos: 600 seconds (10 minutes)
```

## Performance Notes

- **Image generation**: ~5-15 seconds per image
- **Video generation**: ~2-6 minutes per video (depending on duration)
- **Queue processing**: Processes 5 images or 1 video at a time
- **Visibility timeout**: 30s for images, 600s for videos
- **Retry logic**: Failed jobs automatically retry after timeout expires
