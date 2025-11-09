# Supabase Backend - SuperStoryboard

Technical documentation for the SuperStoryboard backend infrastructure built on Supabase.

## Overview

This backend implements a queue-based image and video generation system using:
- **PGMQ** (Postgres Message Queue) for asynchronous job processing
- **Edge Functions** for serverless compute
- **Google Gemini AI** for image generation (gemini-2.5-flash-image-preview)
- **Google Veo 3.1** for video generation (veo-3.1-fast-generate-preview)
- **Supabase Storage** for asset management
- **PostgreSQL** for data persistence

## Architecture

```
┌─────────────────┐
│   Web App       │
│  (Frontend)     │
└────────┬────────┘
         │
         ▼ Enqueue image generation job
┌─────────────────────────────────────┐
│  PGMQ Queue                         │
│  - image_generation_queue           │
│  - video_generation_queue           │
└────────┬────────────────────────────┘
         │
         ▼ Edge Functions poll queues
┌─────────────────────────────────────┐
│  Edge Functions                     │
│                                     │
│  process-image-generation           │
│  ┌──────────────────────────────┐   │
│  │ 1. Read from queue           │   │
│  │ 2. Generate image (Gemini)   │   │
│  │ 3. Upload to Storage         │   │
│  │ 4. Update database           │   │
│  │ 5. Delete from queue         │   │
│  └──────────────────────────────┘   │
│                                     │
│  process-video-generation           │
│  ┌──────────────────────────────┐   │
│  │ 1. Read from queue           │   │
│  │ 2. Generate video (Veo 3.1)  │   │
│  │ 3. Poll operation (async)    │   │
│  │ 4. Download & upload video   │   │
│  │ 5. Update database           │   │
│  │ 6. Delete from queue         │   │
│  └──────────────────────────────┘   │
└────────┬────────────────────────────┘
         │
         ├────► Supabase Storage (images + videos)
         └────► PostgreSQL (kv_store)
```

## Components

### 1. PGMQ Queues

**Extension:** `pgmq` (Postgres Message Queue)
**Schema:** `pgmq`

**Created Queues:**
- `image_generation_queue` - For AI image generation jobs
- `video_generation_queue` - For AI video generation jobs

**Message Format (Images):**
```typescript
{
  storyboardId: string,  // e.g., "test-storyboard-001"
  sceneId: string,       // e.g., "test-scene-001"
  prompt: string         // e.g., "A hero standing on a cliff at sunset"
}
```

**Message Format (Videos):**
```typescript
{
  storyboardId: string,     // e.g., "test-storyboard-001"
  sceneId: string,          // e.g., "test-scene-video-001"
  prompt: string,           // e.g., "A cinematic shot of a lion walking"
  aspectRatio?: "16:9" | "9:16",  // Default: "16:9"
  durationSeconds?: "4" | "6" | "8",  // Default: "8"
  resolution?: "720p" | "1080p"   // Default: "720p" (1080p only for 8s)
}
```

**Key Functions:**
- `pgmq.send(queue_name, message)` - Enqueue a message
- `pgmq.read(queue_name, vt, qty)` - Read messages (vt = visibility timeout in seconds)
- `pgmq.delete(queue_name, msg_id)` - Delete processed message
- `pgmq.archive(queue_name, msg_id)` - Archive message for later analysis

**Public Schema Wrappers:**
Edge Functions can only access `public` schema, so we created wrapper functions:
```sql
-- Send/enqueue message (returns msg_id)
public.pgmq_send(queue_name TEXT, message JSONB)

-- Read messages (returns SETOF records)
public.pgmq_read(queue_name TEXT, vt INTEGER, qty INTEGER)

-- Delete message (returns BOOLEAN)
public.pgmq_delete(queue_name TEXT, msg_id BIGINT)
```

### 2. Edge Functions

#### `process-image-generation`

**Location:** `/supabase/functions/process-image-generation/index.ts`

**Purpose:** Polls the image generation queue and processes jobs asynchronously.

**Environment Variables:**
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google Gemini API key
- `SUPABASE_URL` - Auto-injected by Supabase
- `SUPABASE_ANON_KEY` - Auto-injected by Supabase

**Workflow:**
1. Read up to 5 messages from `image_generation_queue` (120s visibility timeout)
2. For each message:
   - Generate image using `gemini-2.5-flash-image-preview` model
   - Upload PNG to `storyboard-images/{storyboardId}/{sceneId}_{timestamp}.png`
   - Update scene's `imageUrl` in database (if scene exists)
   - Delete message from queue on success
   - Keep message in queue on error (will retry after visibility timeout)

**API Endpoint:**
```
POST https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-image-generation
Authorization: Bearer {anon_key}
```

**Response:**
```json
{
  "message": "Processed 2 messages",
  "processed": 2,
  "results": [
    {
      "success": true,
      "sceneId": "scene-001",
      "imageUrl": "https://.../storyboard-images/sb-001/scene-001_1234567890.png"
    },
    {
      "success": false,
      "sceneId": "scene-002",
      "error": "Failed to generate image"
    }
  ]
}
```

#### `process-video-generation`

**Location:** `/supabase/functions/process-video-generation/index.ts`

**Purpose:** Polls the video generation queue and processes jobs asynchronously using Google Veo 3.1 Fast.

**Environment Variables:**
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google Gemini API key (same key works for Veo)
- `SUPABASE_URL` - Auto-injected by Supabase
- `SUPABASE_ANON_KEY` - Auto-injected by Supabase

**Workflow:**
1. Read 1 message from `video_generation_queue` (600s = 10min visibility timeout)
2. For each message:
   - Generate video using `veo-3.1-fast-generate-preview` model
   - Poll operation status every 10s (async generation, 11s-6min latency)
   - Download MP4 from Google servers (videos stored for 2 days)
   - Upload MP4 to `storyboard-videos/{storyboardId}/{sceneId}_{timestamp}.mp4`
   - Update scene's `videoUrl` in database (if scene exists)
   - Delete message from queue on success
   - Keep message in queue on error (will retry after visibility timeout)

**Video Generation Parameters:**
- **Duration:** 4, 6, or 8 seconds at 24fps
- **Resolution:** 720p (default) or 1080p (8s only)
- **Aspect Ratio:** 16:9 (landscape) or 9:16 (portrait)
- **Output Format:** MP4 with natively generated audio
- **Watermark:** SynthID watermark automatically applied

**API Endpoint:**
```
POST https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-video-generation
Authorization: Bearer {anon_key}
```

**Response:**
```json
{
  "message": "Processed 1 message(s)",
  "processed": 1,
  "results": [
    {
      "success": true,
      "sceneId": "scene-video-001",
      "videoUrl": "https://.../storyboard-videos/sb-001/scene-video-001_1234567890.mp4",
      "msg_id": 1
    }
  ]
}
```

**Performance Notes:**
- Video generation takes 11 seconds to 6 minutes (typically 30-60s)
- Process only 1 video at a time to avoid timeout issues
- 10-minute visibility timeout allows for long generation times
- Videos are downloaded from Google then re-uploaded to Supabase Storage

### 3. Database Schema

#### `kv_store_7ee7668a`

Simple key-value store for storyboard data.

**Columns:**
- `key` (TEXT) - Primary key
- `value` (JSONB) - JSON data

**Key Patterns:**
- `storyboard:{id}` - Storyboard metadata
- `scene:{id}` - Scene data (future)
- `character:{id}` - Character definitions (future)

**Example:**
```sql
-- Get storyboard
SELECT value FROM kv_store_7ee7668a WHERE key = 'storyboard:d73s3zul';

-- Update scene image URL
UPDATE kv_store_7ee7668a
SET value = jsonb_set(value, '{scenes,0,imageUrl}', '"https://..."')
WHERE key = 'storyboard:d73s3zul';
```

### 4. Storage Buckets

#### `storyboard-images`

**Public:** Yes
**Purpose:** Store generated storyboard images
**File Size Limit:** None
**Allowed MIME Types:** image/png, image/jpeg, image/webp

**File Structure:**
```
storyboard-images/
  {storyboardId}/
    {sceneId}_{timestamp}.png
    {sceneId}_{timestamp}.png
```

**Example URL:**
```
https://imvfmhobawvpgcfsqhid.supabase.co/storage/v1/object/public/storyboard-images/test-storyboard-001/test-scene-001_1762687366739.png
```

#### `storyboard-videos`

**Public:** Yes
**Purpose:** Store generated storyboard videos
**File Size Limit:** 100MB
**Allowed MIME Types:** video/mp4, video/webm

**File Structure:**
```
storyboard-videos/
  {storyboardId}/
    {sceneId}_{timestamp}.mp4
    {sceneId}_{timestamp}.mp4
```

**Example URL:**
```
https://imvfmhobawvpgcfsqhid.supabase.co/storage/v1/object/public/storyboard-videos/test-storyboard-001/test-scene-video-001_1762687500000.mp4
```

**Video Specifications:**
- Format: MP4 (H.264)
- Duration: 4, 6, or 8 seconds
- Resolution: 720p or 1080p
- Frame Rate: 24fps
- Audio: Natively generated by Veo 3.1

## Workflow: Image Generation

### 1. Enqueue Job (from Frontend)

```typescript
// Example: Enqueue image generation job
const { data, error } = await supabase
  .rpc('pgmq_send', {
    queue_name: 'image_generation_queue',
    message: {
      storyboardId: 'sb-001',
      sceneId: 'scene-001',
      prompt: 'A hero standing on a cliff at sunset, cinematic composition'
    }
  });
```

**SQL Alternative:**
```sql
SELECT pgmq.send(
  'image_generation_queue',
  jsonb_build_object(
    'storyboardId', 'sb-001',
    'sceneId', 'scene-001',
    'prompt', 'A hero standing on a cliff at sunset'
  )
);
```

### 2. Process Job (Edge Function)

The Edge Function runs periodically or is invoked manually:

```bash
# Manual invocation
curl -X POST \
  "https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-image-generation" \
  -H "Authorization: Bearer {anon_key}"
```

**Automatic Processing (Future):**
Set up a cron job using Supabase:
```sql
-- Run every 5 minutes
select cron.schedule(
  'process-image-generation',
  '*/5 * * * *',
  $$
    select net.http_post(
      'https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-image-generation',
      '{}',
      '{"Authorization": "Bearer {anon_key}"}'::jsonb
    )
  $$
);
```

### 3. Monitor Queue

```sql
-- Check queue depth
SELECT count(*) FROM pgmq.image_generation_queue;

-- View pending messages
SELECT * FROM pgmq.read('image_generation_queue', 30, 10);

-- View archived messages (completed/failed)
SELECT * FROM pgmq.a_image_generation_queue ORDER BY archived_at DESC LIMIT 10;
```

## Workflow: Video Generation

### 1. Enqueue Job (from Frontend)

```typescript
// Example: Enqueue video generation job
const { data, error } = await supabase
  .rpc('pgmq_send', {
    queue_name: 'video_generation_queue',
    message: {
      storyboardId: 'sb-001',
      sceneId: 'scene-video-001',
      prompt: 'A cinematic shot of a majestic lion walking through the savannah at golden hour',
      aspectRatio: '16:9',
      durationSeconds: '8',
      resolution: '720p'
    }
  });
```

**SQL Alternative:**
```sql
SELECT pgmq.send(
  'video_generation_queue',
  jsonb_build_object(
    'storyboardId', 'sb-001',
    'sceneId', 'scene-video-001',
    'prompt', 'A cinematic shot of a majestic lion walking through the savannah',
    'aspectRatio', '16:9',
    'durationSeconds', '8',
    'resolution', '720p'
  )
);
```

### 2. Process Job (Edge Function)

The Edge Function runs on-demand (manual invocation recommended for videos due to long processing time):

```bash
# Manual invocation
curl -X POST \
  "https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-video-generation" \
  -H "Authorization: Bearer {anon_key}"
```

**Processing Time:**
- Minimum: 11 seconds
- Maximum: 6 minutes
- Typical: 30-60 seconds

**Why Manual Invocation?**
Videos take significantly longer to generate than images. Manual invocation allows you to:
- Control when video generation starts
- Avoid multiple concurrent long-running operations
- Monitor progress in real-time via logs

### 3. Monitor Queue

```sql
-- Check queue depth
SELECT count(*) FROM pgmq.video_generation_queue;

-- View pending messages (10 minute visibility timeout)
SELECT * FROM pgmq.read('video_generation_queue', 600, 10);

-- View archived messages
SELECT * FROM pgmq.a_video_generation_queue ORDER BY archived_at DESC LIMIT 10;

-- Check message status (read count indicates retries)
SELECT msg_id, read_ct, enqueued_at, message
FROM pgmq.read('video_generation_queue', 600, 10);
```

## Local Development

### Setup

1. **Install Supabase CLI:**
```bash
brew install supabase/tap/supabase
```

2. **Configure Environment Variables:**

Edit `/supabase/functions/.env`:
```bash
SUPABASE_URL=https://imvfmhobawvpgcfsqhid.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GOOGLE_GENERATIVE_AI_API_KEY=your-actual-api-key-here
```

Get Google API key from: https://ai.google.dev/

3. **Run Functions Locally:**
```bash
cd supabase/functions
supabase functions serve process-image-generation
```

The function will be available at:
```
http://localhost:54321/functions/v1/process-image-generation
```

4. **Test Locally:**
```bash
curl -X POST http://localhost:54321/functions/v1/process-image-generation \
  -H "Authorization: Bearer {anon_key}"
```

### Development Commands

```bash
# Download function from Supabase
supabase functions download process-image-generation
supabase functions download process-video-generation

# Serve locally with auto-reload
supabase functions serve process-image-generation
supabase functions serve process-video-generation

# Deploy to Supabase
supabase functions deploy process-image-generation
supabase functions deploy process-video-generation

# Delete function
supabase functions delete process-image-generation
supabase functions delete process-video-generation

# View logs
supabase functions logs process-image-generation
supabase functions logs process-video-generation --follow
```

## Deployment

### 1. Deploy Edge Functions

```bash
cd /Users/rustam/projects/superstoryboard

# Deploy image generation function
supabase functions deploy process-image-generation

# Deploy video generation function
supabase functions deploy process-video-generation
```

### 2. Set Environment Variables (Production)

Both functions use the same environment variable for Google AI.

**Via Supabase Dashboard:**
1. Go to **Edge Functions** → `process-image-generation` → **Settings**
2. Add secret: `GOOGLE_GENERATIVE_AI_API_KEY`
3. Go to **Edge Functions** → `process-video-generation` → **Settings**
4. Add secret: `GOOGLE_GENERATIVE_AI_API_KEY` (same key)

**Via CLI:**
```bash
# Set globally (available to all functions)
supabase secrets set GOOGLE_GENERATIVE_AI_API_KEY=your-key-here

# Or set per function
supabase secrets set --env-file supabase/functions/.env
```

### 3. Apply Database Migrations

```bash
# Create new migration
supabase migration new migration_name

# Apply migrations
supabase db push
```

**Existing Migrations:**
- `enable_pgmq_extension.sql` - Enables PGMQ extension
- `create_image_video_queues.sql` - Creates message queues for images and videos
- `create_pgmq_public_wrappers.sql` - Creates public schema wrappers (read, delete)
- `create_pgmq_send_wrapper.sql` - Creates send wrapper for easy enqueueing

## API Reference

### Edge Function: `process-image-generation`

**Endpoint:**
```
POST /functions/v1/process-image-generation
```

**Headers:**
```
Authorization: Bearer {anon_key}
Content-Type: application/json
```

**Response (Success):**
```json
{
  "message": "Processed N messages",
  "processed": 2,
  "results": [
    {
      "success": true,
      "sceneId": "scene-001",
      "imageUrl": "https://imvfmhobawvpgcfsqhid.supabase.co/storage/v1/object/public/storyboard-images/sb-001/scene-001_1234567890.png"
    }
  ]
}
```

**Response (Empty Queue):**
```json
{
  "message": "No messages in queue",
  "processed": 0
}
```

**Response (Error):**
```json
{
  "error": "Error message details"
}
```

### Edge Function: `process-video-generation`

**Endpoint:**
```
POST /functions/v1/process-video-generation
```

**Headers:**
```
Authorization: Bearer {anon_key}
Content-Type: application/json
```

**Response (Success):**
```json
{
  "message": "Processed 1 message(s)",
  "processed": 1,
  "results": [
    {
      "success": true,
      "sceneId": "scene-video-001",
      "videoUrl": "https://imvfmhobawvpgcfsqhid.supabase.co/storage/v1/object/public/storyboard-videos/sb-001/scene-video-001_1234567890.mp4",
      "msg_id": 1
    }
  ]
}
```

**Response (Empty Queue):**
```json
{
  "message": "No messages in queue",
  "processed": 0
}
```

**Response (Error):**
```json
{
  "error": "Error message details"
}
```

**Response (Timeout):**
```json
{
  "success": false,
  "sceneId": "scene-video-001",
  "error": "Video generation timed out after 6 minutes",
  "msg_id": 1
}
```

### Database RPC Functions

#### `pgmq_send`
```typescript
// Enqueue image generation
supabase.rpc('pgmq_send', {
  queue_name: 'image_generation_queue',
  message: {
    storyboardId: 'sb-001',
    sceneId: 'scene-001',
    prompt: 'A hero on a cliff'
  }
})

// Enqueue video generation
supabase.rpc('pgmq_send', {
  queue_name: 'video_generation_queue',
  message: {
    storyboardId: 'sb-001',
    sceneId: 'scene-video-001',
    prompt: 'A cinematic lion walking',
    aspectRatio: '16:9',
    durationSeconds: '8',
    resolution: '720p'
  }
})
```

#### `pgmq_read`
```typescript
supabase.rpc('pgmq_read', {
  queue_name: 'image_generation_queue',
  vt: 120,  // visibility timeout in seconds
  qty: 5    // max messages to read
})
```

#### `pgmq_delete`
```typescript
supabase.rpc('pgmq_delete', {
  queue_name: 'image_generation_queue',
  msg_id: 123
})
```

## Troubleshooting

### Issue: Function Returns 401 Unauthorized

**Cause:** Expired or invalid anon key.

**Solution:**
```bash
# Get current anon key
supabase projects api-keys
```

Update your requests with the new key.

### Issue: Message Stays in Queue (Not Deleted)

**Cause:** Error during processing (image generation failed, storage upload failed, etc.)

**Solution:**
1. Check Edge Function logs:
```bash
supabase functions logs process-image-generation
```

2. View message details:
```sql
SELECT * FROM pgmq.read('image_generation_queue', 30, 10);
```

3. Manually delete stuck message:
```sql
SELECT pgmq.delete('image_generation_queue', msg_id);
```

### Issue: "Could not load the default credentials" (Google API)

**Cause:** Incorrect GoogleGenAI SDK initialization.

**Solution:**
Ensure you're passing `apiKey` in options object:
```typescript
const ai = new GoogleGenAI({ apiKey: geminiApiKey });  // ✅ Correct
const ai = new GoogleGenAI(geminiApiKey);              // ❌ Wrong
```

### Issue: Storage Bucket Not Found

**Cause:** Bucket `storyboard-images` doesn't exist.

**Solution:**
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('storyboard-images', 'storyboard-images', true);
```

## Performance Considerations

### Queue Processing

- **Visibility Timeout:** 120 seconds (message hidden from other consumers while processing)
- **Batch Size:** 5 messages per invocation
- **Concurrency:** Edge Functions auto-scale, but Gemini API has rate limits

### Rate Limits

**Google Gemini API:**
- Free tier: 15 requests/minute
- Paid tier: Higher limits depending on plan

**Solution:** Implement exponential backoff:
```typescript
if (error.status === 429) {
  // Re-enqueue with delay
  await sleep(60000);
  throw error; // Message will be re-processed after vt
}
```

### Storage Optimization

- Images stored as PNG (lossless)
- Consider WebP for smaller file sizes (future optimization)
- Implement lifecycle policies to archive old images

## Future Enhancements

1. **Video Generation Queue**
   - Implement `video_generation_queue` processing
   - Use longer visibility timeout (videos take longer to generate)

2. **Dead Letter Queue**
   - Move failed messages after N retries
   - Implement manual review workflow

3. **Progress Tracking**
   - Real-time updates via Supabase Realtime
   - WebSocket notifications to frontend

4. **Batch Processing**
   - Generate multiple scenes in parallel
   - Use Promise.all() for concurrent generation

5. **Cron Automation**
   - Auto-process queue every 5 minutes
   - No manual invocation needed

## Security Notes

- **API Keys:** Never commit `GOOGLE_GENERATIVE_AI_API_KEY` to git
- **RLS Policies:** Not yet implemented (future: restrict queue access by user)
- **Rate Limiting:** Consider implementing per-user quotas
- **Storage Access:** Currently public bucket (future: implement signed URLs)

## Resources

- [PGMQ Documentation](https://github.com/tembo-io/pgmq)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Google Gemini API](https://ai.google.dev/docs)
- [Supabase Storage](https://supabase.com/docs/guides/storage)

---

**Last Updated:** 2025-11-09
**Version:** 1.0.0
**Maintainer:** SuperStoryboard Team
