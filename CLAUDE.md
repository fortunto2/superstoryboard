# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

https://figma.superduperai.co/


## Project Overview

SuperStoryboard is a full-stack storyboard generation platform inspired by SuperDuperAI's video creation platform. The project enables users to generate professional video storyboards using AI-powered scene generation, with real-time synchronization between web app and Figma plugin.

**Project Components:**
1. **Figma Plugin** (`/figma-plugin`): Real-time storyboard sync with Figma canvas
   - Based on [figma-plugin-boilerplate](https://github.com/gnchrv/figma-plugin-boilerplate)
   - WebSocket connection to Supabase Realtime
   - Hybrid architecture (UI handles networking, plugin handles canvas)
2. **Web Application** (coming soon): Storyboard creation and editing interface
   - AI-powered scene generation
   - Natural language input
   - Character management

**Core Inspiration from SuperDuperAI:**
- Natural language to visual element conversion
- Frame-accurate storyboard control
- Character consistency across scenes (PersonaLock™-inspired)
- Multi-stage rendering pipeline concepts
- Style flexibility with pre-built and custom options

## Technology Stack

### MCP Integrations
- **Figma MCP**: For Figma plugin development, design system integration, and canvas manipulation
- **Supabase MCP**: Backend database and API services
  - Project Reference: `imvfmhobawvpgcfsqhid`
  - Connected via: `https://mcp.supabase.com/mcp?project_ref=imvfmhobawvpgcfsqhid`

### Accessing Documentation
- Figma Plugin API: Use `mcp__figma__*` tools for Figma integration
- Supabase: Use `mcp__supabase__*` tools for database operations
- Context7: Use `mcp__context7__resolve-library-id` and `mcp__context7__get-library-docs` for up-to-date library documentation

## Architecture Approach

### System Architecture

1. **Web Application Layer** (coming soon)
   - React/Next.js frontend for storyboard creation
   - AI-powered scene generation
   - Natural language to storyboard conversion
   - User authentication and management

2. **Figma Plugin Layer** (`/figma-plugin`)
   - **Hybrid Architecture** (implemented):
     - **UI (React/Browser)**: Handles all HTTP requests and WebSocket connections
     - **Plugin (QuickJS)**: Handles only Figma canvas manipulation
     - **Reason**: Figma uses QuickJS (not V8) which doesn't support WebSocket API or fetch with custom headers
   - Real-time sync via Supabase Realtime
   - Scene management (CREATE, UPDATE, DELETE)
   - Supports both Figma and FigJam

3. **Data Layer** (Supabase)
   - Postgres database with RLS policies
   - Realtime subscriptions for live updates
   - REST API for initial data fetching
   - Key-value store for storyboard data (`kv_store_7ee7668a`)

4. **AI Generation Layer** (future)
   - Text-to-storyboard scene generation
   - Character consistency engine
   - Style transfer and customization

### Key Design Patterns

- **Frame-based Storyboards**: Each Figma frame represents a scene/shot
- **Real-time Sync**: Changes in web app instantly reflect in Figma plugin
- **Hybrid Plugin Architecture**: Browser handles networking, QuickJS handles canvas
- **Character Consistency**: Maintain visual consistency across storyboard panels
- **Natural Language Input**: Convert text descriptions into visual storyboard layouts
- **Export Flexibility**: Generate outputs suitable for different video platforms

### Technical Constraints (Figma Plugin)

**QuickJS Limitations:**
- No `WebSocket` API available
- `fetch` doesn't work with custom headers (401 errors)
- Supabase SDK incompatible (uses modern JS features)
- Limited ES2020+ support

**Solution: Hybrid Architecture**
- UI runs in browser iframe → full access to modern APIs
- Plugin runs in QuickJS → only manipulates Figma canvas
- Communication via `postMessage`
- Result: 6.2kb plugin bundle (no external dependencies)

## Development Guidelines

### Working with Figma
- Always use Figma MCP tools (`mcp__figma__get_design_context`, `mcp__figma__get_screenshot`, etc.)
- Extract fileKey and nodeId from Figma URLs in format: `https://figma.com/design/:fileKey/:fileName?node-id=:int1-:int2`
- NodeId format: "123:456" or "123-456"

### Working with Supabase
- Use `mcp__supabase__apply_migration` for DDL operations (schema changes)
- Use `mcp__supabase__execute_sql` for DML operations (data queries)
- Always run `mcp__supabase__get_advisors` after schema changes to check for security/performance issues
- Check logs with `mcp__supabase__get_logs` when debugging

### Database Schema Considerations
- Store storyboard metadata (project_id, scenes, character definitions)
- Track generation history and user preferences
- Implement RLS (Row Level Security) policies for multi-user access
- Consider versioning for storyboard iterations

## Project Setup

### Repository Structure

```
superstoryboard/
├── figma-plugin/           # Figma plugin with real-time sync (✅ implemented)
│   ├── plugin/             # Plugin backend (QuickJS)
│   ├── ui/                 # React UI (browser)
│   ├── dist/               # Build output
│   ├── manifest.json       # Figma plugin manifest
│   └── README.md           # Plugin documentation
├── web-app/                # Web application (coming soon)
├── .mcp.json               # MCP server configuration
├── CLAUDE.md               # This file
└── examples/               # Demo repos (gitignored)
```

### Figma Plugin Setup

The Figma plugin is located in `/figma-plugin` directory.

**Quick Start:**
```bash
cd figma-plugin
npm install
npm run plugin:build && npm run ui:build
```

**Import to Figma:**
1. Open Figma Desktop App
2. Go to **Menu → Plugins → Development → Import plugin from manifest...**
3. Select `figma-plugin/manifest.json`
4. Plugin will appear as "SuperStoryboard Sync"

**Run Plugin:**
1. In Figma/FigJam: **Plugins → Development → SuperStoryboard Sync**
2. Enter Supabase credentials (auto-filled from `.env`)
3. Click **"Sync Storyboard"**
4. Watch real-time updates: 🟢 Live Sync Active

See `figma-plugin/README.md` for detailed documentation, architecture, and troubleshooting.

### Web Application Setup (Coming Soon)

Web app will provide:
- Storyboard creation interface
- AI-powered scene generation
- Character management
- Real-time sync with Figma plugin

### Future Setup Tasks

1. ✅ ~~Figma plugin with real-time sync~~ (completed)
2. Web application frontend (Next.js)
3. Configure AI generation API integration
4. Implement authentication and user management
5. Add AI image generation features

## MCP Server Configuration

The project uses `.mcp.json` for MCP server configuration. Currently configured:
- Supabase: Connected to project `imvfmhobawvpgcfsqhid`

Additional MCP servers can be added to `.mcp.json` as needed.

## Feature Development Priorities

### Implemented Features

✅ **Figma Plugin with Real-time Sync**
- WebSocket connection to Supabase Realtime
- Automatic scene INSERT/UPDATE/DELETE handling
- Hybrid architecture (UI handles networking, plugin handles canvas)
- Supports both Figma and FigJam
- 6.2kb plugin bundle (no external dependencies)
- Status indicators and notifications

### Upcoming Features

Based on SuperDuperAI inspiration:
1. **Web Application**: Storyboard creation and editing interface
2. **Natural Language Parser**: Convert text descriptions to storyboard scenes
3. **Character Management**: Define and maintain consistent characters across panels
4. **Scene Generation**: AI-powered panel/frame generation
5. **Style System**: Pre-built visual styles for different video aesthetics
6. **Export Options**: Generate storyboards optimized for different platforms (YouTube, TikTok, Instagram, etc.)

### Working with Real-time Sync

**Testing Real-time Updates:**
1. Open Figma plugin (keep it open)
2. Open web app in browser (or use Supabase REST API)
3. Add/edit/delete scenes in web app
4. Watch changes appear instantly in Figma

**Database Structure:**
```typescript
// kv_store_7ee7668a table
{
  key: "storyboard:{storyboard_id}",
  value: {
    id: string,
    name: string,
    scenes: [
      {
        id: string,
        sceneNumber: number,
        shotType: string,
        description: string,
        dialogue: string,
        notes: string,
        imageUrl: string,
        duration: string
      }
    ],
    createdAt: string,
    updatedAt: string
  }
}
```

**Supabase Realtime Protocol:**
- Uses Phoenix Channels protocol (object-based messages)
- Subscribes to `postgres_changes` events
- Detects INSERT/UPDATE/DELETE via scene diffing
- Sends updates to plugin via `postMessage`

## Demo & Quick Start Examples

### Example 1: Creating a Simple Storyboard
```
User Input: "A hero walks into a dark forest, discovers a glowing sword, and fights a dragon"

Generated Storyboard:
- Frame 1: Wide shot - Hero at forest entrance, sunlight behind
- Frame 2: Medium shot - Hero finds glowing sword embedded in stone
- Frame 3: Close-up - Hero's face reflecting sword's glow
- Frame 4: Wide shot - Dragon emerges from cave
- Frame 5: Action shot - Hero vs Dragon battle scene
```

### Example 2: Character Consistency Workflow
```typescript
// Define character once
const character = {
  name: "Hero",
  appearance: "tall warrior, silver armor, red cape, brown hair",
  style: "anime"
};

// Character appears consistently across all frames
generateScene("Hero walks through village", character);
generateScene("Hero talks to elder", character);
generateScene("Hero prepares for battle", character);
```

### Example 3: Using Figma MCP Tools
```typescript
// Get current Figma selection
const screenshot = await mcp__figma__get_screenshot({
  fileKey: "ernadxzZk8OcYRLeXt2WjD",
  nodeId: "0-1"
});

// Get design context for implementation
const design = await mcp__figma__get_design_context({
  fileKey: "ernadxzZk8OcYRLeXt2WjD",
  nodeId: "0-1"
});
```

### Example 4: Supabase Data Operations
```sql
-- Store storyboard project
INSERT INTO storyboards (user_id, title, scenes)
VALUES ($1, 'Dragon Quest', $2);

-- Retrieve user's storyboards
SELECT * FROM storyboards WHERE user_id = $1 ORDER BY created_at DESC;

-- Update scene details
UPDATE storyboard_scenes
SET ai_prompt = 'Hero discovers magical sword in ancient temple'
WHERE scene_id = $1;
```

### Example 5: Style Presets
```
Available Styles:
- Cinematic: Film-quality lighting, wide shots, dramatic angles
- Anime: Bold outlines, vibrant colors, expressive characters
- Comic Book: Panel layouts, speech bubbles, action lines
- Minimalist: Simple shapes, limited color palette, clean composition
- Realistic: Photo-realistic rendering, natural lighting
- Sketch: Hand-drawn aesthetic, pencil textures
```

### Quick Development Workflow
```bash
# 1. Set up Figma plugin development environment
npm init -y
npm install --save-dev @figma/plugin-typings typescript

# 2. Create initial database schema
# Use mcp__supabase__apply_migration for schema

# 3. Develop plugin UI
# React component for text input → storyboard generation

# 4. Test with Figma file
# File: https://www.figma.com/design/ernadxzZk8OcYRLeXt2WjD/Untitled?node-id=0-1
```

## Security Considerations

- Never commit API keys or secrets to the repository
- Use Supabase environment variables for sensitive configuration
- Implement proper RLS policies for data access control
- Validate and sanitize user inputs for AI generation prompts
