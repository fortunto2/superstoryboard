# SuperStoryboard Figma Plugin - Real-time Sync

Figma plugin with real-time storyboard synchronization from Supabase.

**Based on**: [figma-plugin-boilerplate](https://github.com/gnchrv/figma-plugin-boilerplate) by @gnchrv

## Features

- ✅ **Real-time Sync**: WebSocket connection to Supabase Realtime from UI (browser environment)
- ✅ **Scene Management**: Automatic INSERT, UPDATE, DELETE scene handling
- ✅ **React UI**: Modern interface with status indicators and notifications
- ✅ **Dual Environment**: Works in both Figma and FigJam
- ✅ **TypeScript**: Type-safe plugin and UI code
- ✅ **QuickJS Compatible**: All HTTP/WebSocket operations run in UI (browser), avoiding QuickJS limitations
- ✅ **Lightweight**: Plugin is only 6.2kb (no external dependencies in plugin code)

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
│   ├── plugin/index.js  # Bundled plugin code (6.2kb)
│   └── ui/index.html    # Bundled UI (197.96kb)
└── manifest.json        # Figma plugin manifest
```

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
2. Credentials will be auto-filled from `.env` file
3. Click **"Sync Storyboard"**
4. Watch realtime status indicator:
   - ⚫ Disconnected
   - 🔄 Connecting...
   - 🟢 Live Sync Active
   - 🔴 Connection Error

### 5. Test Real-time Updates

With the plugin open:
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

**Plugin (index.ts) - QuickJS Environment**
- Receives scene data from UI via `postMessage`
- Manages Figma canvas nodes via `SceneManager`
- Creates/updates/deletes scenes on canvas
- Loads fonts once before batch operations
- Tracks nodes via `Map<sceneId, SceneNode>`
- Supports both FigJam sticky notes and Figma frames

### Build Configuration

**esbuild** (plugin)
- Target: ES2015 (Figma QuickJS compatibility)
- Bundle size: **6.2kb** (no external dependencies!)
- Disabled features: `using`, `object-rest-spread`
- No minification (for debugging)
- Tree-shaking removes all unused code

**Vite** (UI)
- React 19 with TypeScript
- SCSS styling with Figma design tokens
- Single-file output: 197.96kb
- Includes WebSocket client code

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
- `sync-complete`: Initial sync finished
- `sync-error`: Sync failed
- `scene-inserted`: New scene added
- `scene-updated`: Scene modified
- `scene-deleted`: Scene removed
- `realtime-error`: WebSocket error

**UI → Plugin**
- `sync-storyboard`: Start sync with credentials + data
- `scene-inserted`: New scene from realtime
- `scene-updated`: Updated scene from realtime
- `scene-deleted`: Deleted scene from realtime
- `cancel`: Close plugin and cleanup

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

## Credits

Built with:
- [Figma Plugin Boilerplate](https://github.com/gnchrv/figma-plugin-boilerplate)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- React 19 + Vite + TypeScript

## License

MIT
