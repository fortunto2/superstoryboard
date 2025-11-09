# SuperStoryboard Figma Plugin - Real-time Sync

Figma plugin with real-time storyboard synchronization from Supabase.

**Based on**: [figma-plugin-boilerplate](https://github.com/gnchrv/figma-plugin-boilerplate) by @gnchrv

## Features

- ✅ **Real-time Sync**: WebSocket connection to Supabase Realtime from UI (browser environment)
- ✅ **Scene Management**: Automatic INSERT, UPDATE, DELETE scene handling
- ✅ **Image Generation**: Queue-based AI image generation with Google Gemini
- ✅ **Video Generation**: Create videos from prompts or animate existing images
- ✅ **Selection Context**: Real-time tracking of selected objects in Figma
- ✅ **Image-to-Image Editing**: Edit existing images with AI prompts
- ✅ **Image-to-Video**: Animate static images into videos
- ✅ **Figma Context Extraction**: Extract and use Figma elements as prompt context
- ✅ **Queue Monitoring**: Live display of image/video generation queues
- ✅ **React UI**: Modern interface with status indicators and notifications
- ✅ **Dual Environment**: Works in both Figma and FigJam
- ✅ **TypeScript**: Type-safe plugin and UI code
- ✅ **QuickJS Compatible**: All HTTP/WebSocket operations run in UI (browser), avoiding QuickJS limitations
- ✅ **Lightweight**: Plugin is only 40.2kb (minimal dependencies in plugin code)
- ✅ **CORS Support**: Edge Functions configured to work with Figma plugins (origin: null)
- ✅ **Queue Processing**: Manual and automatic image/video generation processing

## Project Structure

```
figma-plugin/
├── plugin/              # Plugin backend (esbuild)
│   ├── index.ts         # Scene management logic (receives data from UI)
│   ├── esbuild.mjs      # Build configuration (ES2015 target)
│   └── tsconfig.json
├── ui/                  # React UI (Vite)
│   ├── App.tsx          # HTTP + WebSocket client (runs in browser)
│   ├── main.tsx         # React entry point
│   └── styles/          # SCSS styles
├── dist/                # Build output
│   ├── plugin/index.js  # Bundled plugin code (37.1kb)
│   └── ui/index.html    # Bundled UI (211.5kb)
└── manifest.json        # Figma plugin manifest
```

## Quick Start Features

### 1. Real-time Storyboard Sync
Automatically syncs storyboard changes from your database to Figma canvas:
- 🟢 Live Sync Active - WebSocket connected
- ⚫ Disconnected - No connection
- 🔄 Connecting - Establishing connection

### 2. AI Image Generation
Generate images directly from Figma:

**Create New Image:**
1. Enter a prompt (e.g., "A hero on a cliff at sunset")
2. Click "🎨 Generate Image"
3. Image is enqueued for processing
4. Generated image appears on canvas automatically

**Edit Existing Image (Image-to-Image):**
1. Select an image rectangle in Figma
2. Plugin detects selection: "🖼️ Image selected (edit mode)"
3. Enter edit prompt (e.g., "Add more dramatic lighting")
4. Click "✏️ Edit Image"
5. Edited image replaces original

### 3. Video Generation
Generate videos from text or animate existing images:

**Create New Video:**
1. Enter a video prompt (e.g., "Camera panning through a futuristic city")
2. Click "🎬 Generate Video"
3. Video is enqueued for processing

**Image-to-Video (Animate Images):**
1. Select an image in Figma
2. Enter animation prompt (e.g., "Zoom in slowly with particles")
3. Click "🎬 Image to Video"
4. Static image becomes animated video

### 4. Figma Context Extraction
Use your Figma design elements as context for generation:

1. Select elements in Figma (text, shapes, etc.)
2. Click "📡 Extract Context"
3. Context appears as XML-formatted data
4. Check "Include Figma context in prompt" when generating
5. AI uses your design context for better results

**Extracted Context Includes:**
- Selected node metadata (type, position, size)
- Text content from selected elements
- Page information and viewport data
- Safe XML format (truncated to prevent bloat)

### 5. Queue Monitoring & Processing
Real-time display and control of generation queues:
- **Images**: Number of pending image generation jobs
- **Videos**: Number of pending video generation jobs
- **Process Queue Buttons**:
  - "⚡ Process Image Queue" - Process pending images
  - "⚡ Process Video Queue" - Process pending videos
- Auto-refreshes every 10 seconds
- Automatic processing via pg_cron (every 5-10 minutes)

### 6. Selection Context
Plugin tracks what you have selected:
- ⚪ Nothing selected
- 🖼️ Image selected (edit mode)
- 🔵 1 object selected
- 🔵 N objects selected

## Installation & Testing

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```bash
VITE_SUPABASE_PROJECT_ID=your-project-id
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_DEFAULT_STORYBOARD_ID=your-storyboard-id
```

Get these values from your Supabase project:
- **Project ID**: From project settings URL or dashboard
- **Anon Key**: Settings → API → Project API keys → `anon` `public`
- **Storyboard ID**: The numeric ID from your `kv_store_7ee7668a` table (format: `storyboard:ID`)

### 3. Build Plugin

```bash
# Development mode (watch)
npm run dev

# Production build
npm run plugin:build && npm run ui:build
```

### 4. Import Plugin to Figma

1. Open Figma Desktop App
2. Go to **Plugins → Development → Import plugin from manifest...**
3. Select `manifest.json` from this directory
4. Plugin will appear as "SuperStoryboard Sync"

### 5. Run the Plugin

1. In Figma/FigJam: **Plugins → Development → SuperStoryboard Sync**
2. **Configure credentials** (first time):
   - Click ⚙️ (gear icon) to expand settings
   - Enter Supabase Project ID and Anon Key
   - Click "Save Credentials"
   - Settings auto-collapse after saving
3. **Select storyboard** from dropdown (optional - can generate without)
4. **Sync storyboard** (optional):
   - Click "Sync Storyboard" to load existing scenes
   - Watch realtime status: ⚫ → 🔄 → 🟢
5. **Generate images**:
   - Enter a prompt in the text field
   - Click "🎨 Generate Image"
   - Watch queue counter increase
   - Images appear automatically when processed

### 6. Test Image Generation

**Method 1: Create New Image**
```
1. Open plugin (nothing selected)
2. Enter prompt: "A dramatic sunset over mountains"
3. Click "🎨 Generate Image"
4. Check queue: Images [1]
5. Wait for processing (~10-30 seconds)
6. Image appears on canvas
```

**Method 2: Edit Existing Image**
```
1. Select an image rectangle in Figma
2. Plugin shows: "🖼️ Image selected (edit mode)"
3. Enter prompt: "Make it darker and more dramatic"
4. Click "✏️ Edit Image"
5. Check queue: Images [1]
6. Wait for processing
7. Updated image replaces original
```

### 7. Process Queue

**Option 1: Use Plugin Button (Recommended)**
- Click "⚡ Process Image Queue" button when it appears
- Button only shows when queue has pending jobs
- Works directly from Figma (CORS enabled)

**Option 2: Manual Trigger via cURL**
```bash
curl -X POST \
  "https://YOUR_PROJECT_ID.supabase.co/functions/v1/process-image-generation" \
  -H "Authorization: Bearer {anon_key}"
```

**Option 3: Set up Auto-Processing**
Configure cron job in Supabase for automatic processing every 5 minutes

### 8. Test Real-time Sync (Optional)

With the plugin open and storyboard synced:
- **Add scene** in web app → Scene appears in Figma
- **Edit scene** in web app → Scene updates in Figma
- **Delete scene** in web app → Scene removed from Figma

Notifications will appear for each change.

## Development

### Build Commands

```bash
# Development mode (watch)
npm run dev

# Production build (with linting)
npm run build

# Build without linting (faster)
npm run plugin:build && npm run ui:build
```

### File Watching

During development, run these in parallel:
```bash
npm run plugin:dev  # Watch plugin changes
npm run ui:dev      # Watch UI changes
```

Then use "Hot reload plugin" in Figma after changes.

## Technical Details

### Architecture Overview

**Why UI-based HTTP/WebSocket?**

Figma plugins run in **QuickJS** (not V8), which has severe limitations:
- No `fetch` with custom headers (401 errors)
- No `WebSocket` API available
- Limited ES2020+ features
- Supabase SDK is incompatible

**Solution: Hybrid Architecture**
- **UI (React)**: Runs in browser → handles all HTTP and WebSocket
- **Plugin (QuickJS)**: Only manages Figma canvas nodes
- **Communication**: `postMessage` between UI and Plugin

### Component Details

**UI (App.tsx) - Browser Environment**
- Fetches initial storyboard data via REST API
- Establishes WebSocket connection to Supabase Realtime
- Implements Supabase Realtime Protocol (object-based messages)
- Subscribes to `postgres_changes` for `kv_store_7ee7668a` table
- 30-second heartbeat to maintain connection
- Detects scene changes (INSERT/UPDATE/DELETE)
- Sends updates to plugin via `postMessage`
- **NEW**: Enqueues image generation jobs to PGMQ
- **NEW**: Monitors queue status (auto-refresh every 10s)
- **NEW**: Handles selection context updates from plugin

**Plugin (index.ts) - QuickJS Environment**
- Receives scene data from UI via `postMessage`
- Manages Figma canvas nodes via `SceneManager`
- Creates/updates/deletes scenes on canvas
- Loads fonts once before batch operations
- Tracks nodes via `Map<sceneId, SceneNode>` and `Map<sceneId, ImageNode>`
- Supports both FigJam sticky notes and Figma frames
- **NEW**: Tracks selection changes via `figma.on('selectionchange')`
- **NEW**: Analyzes selected objects (image detection, scene ID extraction)
- **NEW**: Loads and displays generated images automatically
- **NEW**: Supports image-to-image editing workflow

### Build Configuration

**esbuild** (plugin)
- Target: ES2015 (Figma QuickJS compatibility)
- Bundle size: **37.1kb** (includes image loading and selection tracking)
- Disabled features: `using`, `object-rest-spread`
- No minification (for debugging)
- Tree-shaking removes all unused code

**Vite** (UI)
- React 19 with TypeScript
- SCSS styling with Figma design tokens
- Single-file output: **213.72kb**
- Includes WebSocket client, queue management, and CORS handling

### Evolution of Solutions

**Initial Approach (Failed)**
- Tried using `@supabase/supabase-js` SDK in plugin
- **Problem**: QuickJS doesn't support SDK dependencies (spread operators, modern features)
- Bundle was 444kb with many compatibility issues

**Second Approach (Failed)**
- Implemented Phoenix Channels WebSocket client in plugin
- **Problem**: QuickJS doesn't have `WebSocket` API at all
- `fetch` API exists but doesn't work with custom headers (401 errors)

**Final Solution (Success!)**
- Move ALL network operations to UI (React/browser environment)
- UI handles: HTTP requests + WebSocket connection
- Plugin handles: Canvas manipulation only
- Communication via `postMessage`
- **Result**: 6.2kb plugin, 100% reliable, fully compatible

### Supabase Realtime Protocol

**Message Format** (Object-based, not array):
```typescript
{
  event: "phx_join" | "heartbeat" | "postgres_changes" | ...,
  topic: "realtime:public:table:filter",
  payload: {...},
  ref: "1"
}
```

**postgres_changes Payload Structure**:
```typescript
{
  data: {
    type: "INSERT" | "UPDATE" | "DELETE",
    record: { key: "...", value: {...} },
    old_record: {...},
    schema: "public",
    table: "kv_store_7ee7668a",
    commit_timestamp: "2025-11-08T20:35:09.611Z"
  },
  ids: [111081108]
}
```

**Key Differences from Documentation**:
- Use `type` instead of `eventType`
- Use `record` instead of `new`
- Structure is `payload.data.record.value` for storyboard data

### Message Protocol

**Plugin → UI**
- `realtime-status`: Connection status change
- `sync-complete`: Initial sync finished (includes updated scene IDs with figmaNodeIds)
- `sync-error`: Sync failed
- `scene-inserted`: New scene added to canvas
- `scene-updated`: Scene modified (triggers image load if imageUrl changed)
- `scene-deleted`: Scene removed from canvas
- `realtime-error`: WebSocket error
- `selection-changed`: Selection in Figma changed (count, hasImage, imageUrl, sceneId)
- `credentials-loaded`: Saved credentials retrieved from storage
- `credentials-saved`: Credentials saved successfully
- `credentials-cleared`: Credentials cleared from storage

**UI → Plugin**
- `sync-storyboard`: Start sync with credentials + storyboard data
- `scene-inserted`: New scene from realtime
- `scene-updated`: Updated scene from realtime (may include new imageUrl)
- `scene-deleted`: Deleted scene from realtime
- `load-credentials`: Request saved credentials from plugin storage
- `save-credentials`: Save credentials to plugin storage
- `clear-credentials`: Clear credentials from plugin storage
- `cancel`: Close plugin and cleanup

### Image Generation Workflow

```
┌──────────────────────────────────────────────────────────────┐
│  1. User Action (in Figma Plugin)                            │
│     ├─ Select nothing/object → Create mode                   │
│     └─ Select image → Edit mode                              │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  2. Plugin (QuickJS) → Analyzes Selection                    │
│     ├─ Count objects                                          │
│     ├─ Detect IMAGE fills in rectangles                       │
│     ├─ Extract scene ID from node name                        │
│     └─ Send 'selection-changed' to UI                         │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  3. UI (Browser) → Display Context                           │
│     ├─ Show: ⚪ Nothing / 🖼️ Image / 🔵 Object              │
│     ├─ Update prompt placeholder                              │
│     └─ Change button: 🎨 Generate / ✏️ Edit                 │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  4. User → Enter Prompt & Click Generate                     │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  5. UI → Enqueue to PGMQ                                      │
│     POST /rest/v1/rpc/pgmq_send                               │
│     {                                                          │
│       storyboardId: "...",                                    │
│       sceneId: "...",  // if linked to scene                  │
│       prompt: "...",                                          │
│       sourceImageUrl: "...",  // if edit mode                 │
│       editMode: "image-to-image"  // if edit mode            │
│     }                                                          │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  6. Edge Function → Process Queue                            │
│     ├─ Read message from PGMQ                                 │
│     ├─ Generate image (Gemini AI)                             │
│     ├─ Upload to Supabase Storage                             │
│     ├─ Update scene.imageUrl in database                      │
│     └─ Delete message from queue                              │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  7. Realtime → Detect UPDATE                                  │
│     ├─ postgres_changes event                                 │
│     └─ UI receives scene update via WebSocket                 │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  8. UI → Send to Plugin                                       │
│     └─ 'scene-updated' message with new imageUrl              │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  9. Plugin → Update/Create Image on Canvas                    │
│     ├─ fetch(imageUrl) → Download image bytes                 │
│     ├─ figma.createImage(bytes) → Create Figma image          │
│     ├─ Create/update rectangle with IMAGE fill                │
│     └─ Position above sticky note (if linked to scene)        │
└──────────────────────────────────────────────────────────────┘
```

**Queue Message Format:**

```typescript
// Create new image
{
  storyboardId: "d73s3zul",
  prompt: "A dramatic sunset over mountains",
  sceneId: "scene-1"  // optional: links image to scene
}

// Edit existing image
{
  storyboardId: "d73s3zul",
  sceneId: "scene-1",
  prompt: "Make it darker and more dramatic",
  sourceImageUrl: "https://.../image.png",
  editMode: "image-to-image"
}
```

## Testing Instructions

1. **Build the plugin**:
   ```bash
   npm run plugin:build && npm run ui:build
   ```

2. **Import to Figma**:
   - Plugins → Development → Import plugin from manifest
   - Select `manifest.json` from this directory

3. **Open plugin**:
   - Plugins → Development → SuperStoryboard Sync

4. **Sync storyboard**:
   - Click "Sync Storyboard" button
   - Watch for scenes to appear on canvas

5. **Test realtime** (open web app in parallel):
   - Add/edit/delete scenes in web app
   - Watch scenes update in Figma automatically

6. **Check console** (if errors):
   - Plugins → Development → Open Console
   - Look for syntax or runtime errors

## Troubleshooting

### Plugin won't load
- Check manifest.json syntax
- Verify dist/ folder exists with index.js
- Try reimporting plugin from manifest
- Run `npm run plugin:build && npm run ui:build` to rebuild

### No storyboards found in dropdown
**Symptoms:** Dropdown shows "No storyboards found" even though data exists in database.

**Root Cause:** Row Level Security (RLS) policy blocking access.

**Solution:**
1. Check RLS policies allow access to your key pattern:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'kv_store_7ee7668a';
   ```

2. For Schema v2, ensure policy allows these patterns:
   ```sql
   CREATE POLICY "Allow public read access to storyboards and scenes"
   ON kv_store_7ee7668a
   FOR SELECT
   TO anon
   USING (
     key LIKE 'storyboard:%' OR      -- Old schema
     key LIKE 'storyboard_v2:%' OR   -- New schema storyboards
     key LIKE 'scene:%'               -- New schema scenes
   );
   ```

3. Test with curl to verify access:
   ```bash
   curl "https://YOUR_PROJECT.supabase.co/rest/v1/kv_store_7ee7668a?key=like.storyboard_v2:%2A&select=key" \
     -H "apikey: YOUR_ANON_KEY" \
     -H "Authorization: Bearer YOUR_ANON_KEY"
   ```

### PostgREST LIKE pattern matching issues
**Symptoms:** Empty results `[]` from API even though data exists.

**Common Mistakes:**
1. ❌ Using SQL `%` wildcard: `key=like.storyboard_v2:%`
2. ❌ Using raw `*` in URL: `key=like.storyboard_v2:*`
3. ❌ Missing URL encoding: `key=like.storyboard_v2:*` conflicts with `select=*`

**Correct Syntax:**
- PostgREST uses `*` as wildcard (not SQL `%`)
- Must URL-encode `*` as `%2A` to avoid conflict with `select=*`
- **Correct:** `key=like.storyboard_v2:%2A&select=*`

**Example:**
```javascript
// ✅ CORRECT
const url = `https://PROJECT.supabase.co/rest/v1/table?key=like.pattern:%2A&select=*`;

// ❌ WRONG - conflicts with select=*
const url = `https://PROJECT.supabase.co/rest/v1/table?key=like.pattern:*&select=*`;

// ❌ WRONG - SQL syntax doesn't work in PostgREST
const url = `https://PROJECT.supabase.co/rest/v1/table?key=like.pattern:%&select=*`;
```

**WebSocket Realtime filters are different:**
- Use SQL LIKE syntax with `%` (not `*`)
- No URL encoding needed (it's JSON payload, not URL)
- **Correct:** `filter: "key=like.scene:${id}:%"`

### Realtime not working
- Verify Supabase credentials are correct
- Check network access in manifest.json (must include `https://*.supabase.co` and `wss://*.supabase.co`)
- Enable Realtime on `kv_store_7ee7668a` table in Supabase dashboard
- Check browser console: Plugins → Development → Open Console
- Look for WebSocket connection logs showing "WebSocket connected"
- Verify you see "✅ Successfully joined channel!" in console

### Scenes not updating
- Verify SceneManager is tracking nodes (check console logs)
- Ensure scene IDs match between database and Figma
- Check that storyboard ID is correct
- Verify the `kv_store_7ee7668a` table has a record with key `storyboard:{your_id}`
- Check console for "🔄 Postgres change detected!" when updating in web app

### WebSocket connection drops
- Check heartbeat logs (should ping every 30 seconds)
- Verify network stability
- Look for "WebSocket closed" messages in console with close code
- Code 1011 = Server error (check Realtime configuration)

### WebSocket Error 1011 (Internal Server Error)
- **Cause**: Wrong message format (array instead of object)
- **Fix**: Already implemented - using object-based protocol
- **Verify**: Check console for "Sending join message" - should show object, not array

### CORS errors when processing queue
**Symptoms:** `Access to fetch... has been blocked by CORS policy: Origin: null`

**Solution:** Edge Function now includes CORS headers for Figma plugin compatibility:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

**If you still get CORS errors:**
1. Ensure Edge Function is deployed with latest version:
   ```bash
   supabase link --project-ref YOUR_PROJECT_ID
   supabase functions deploy process-image-generation
   ```
2. Test with curl to verify function works
3. Check if RLS policies allow `anon` role access
4. Verify authentication headers are correct

## Related Documentation

- **[Project README](../README.md)** - Main project overview and features
- **[CLAUDE.md](../CLAUDE.md)** - Complete project architecture and development guidelines
- **[Supabase Backend](../supabase/README.md)** - AI generation system (PGMQ, Edge Functions, Google Gemini/Veo)

## Credits

Built with:
- [Figma Plugin Boilerplate](https://github.com/gnchrv/figma-plugin-boilerplate)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- React 19 + Vite + TypeScript

## License

MIT
