# Plan: Real-time Storyboard Sync with Supabase Realtime + MCP Integration

## Overview
Create real-time synchronization between web application and Figma/FigJam plugin using:
- **Supabase Realtime** (WebSocket) for live database changes
- **Supabase MCP Server** for backend operations
- **Figma MCP Server** for Figma API integration

---

## Project Structure Analysis

### Current Setup (`/Users/rustam/projects/superstoryboard/`)
```
superstoryboard/
├── App.tsx                 # React web app (storyboard editor)
├── components/             # UI components (StoryboardPanel, SimpleFigJamSync)
├── server/                 # Server-side code
├── figma-plugin/          # Figma plugin (working!)
│   ├── code.ts            # Plugin logic
│   ├── ui.html            # Plugin UI
│   └── manifest.json      # Plugin config
├── .mcp.json              # MCP servers config (Supabase)
└── .env                   # Supabase credentials
```

---

## Proposed: Version 2 Project Structure

### Option A: Extend Current Project
Add realtime to existing `figma-plugin/` folder

### Option B: New Clean Project with pnpm + Next.js + Vercel (RECOMMENDED)
```
superstoryboard-v2/          # New folder
├── web-app/                 # Next.js App (Vercel)
│   ├── app/
│   │   ├── layout.tsx       # Root layout
│   │   ├── page.tsx         # Home page (storyboard editor)
│   │   └── api/
│   │       └── storyboards/ # API routes (proxy to Supabase)
│   ├── components/
│   │   ├── StoryboardPanel.tsx
│   │   ├── AddPanelDialog.tsx
│   │   └── SimpleFigJamSync.tsx
│   ├── hooks/
│   │   └── useRealtimeStoryboard.ts  # NEW: Realtime hook
│   ├── lib/
│   │   ├── supabase.ts      # Supabase client
│   │   └── utils.ts
│   ├── public/
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   └── vercel.json          # Vercel config
│
├── figma-plugin/            # Plugin with Realtime
│   ├── src/
│   │   ├── code.ts          # Main plugin logic
│   │   ├── realtime-sync.ts # NEW: Realtime subscription
│   │   ├── scene-manager.ts # NEW: Node management
│   │   └── supabase-client.ts # NEW: Supabase client
│   ├── ui.html
│   ├── manifest.json
│   └── package.json         # @supabase/supabase-js
│
├── shared/                  # Shared types
│   └── types.ts             # StoryboardScene interface
│
├── .env.local               # Local env vars
├── .env.example             # Example env vars
├── pnpm-workspace.yaml      # pnpm workspace config
├── package.json             # Root package.json
└── vercel.json              # Vercel deployment config
```

---

## Implementation Plan

### Phase 1: Backend Setup (Using Supabase MCP)

**1.1. Enable Realtime on `storyboards` table**
```sql
-- Via mcp__supabase__execute_sql
ALTER PUBLICATION supabase_realtime ADD TABLE storyboards;
ALTER TABLE storyboards REPLICA IDENTITY FULL;
```

**1.2. Verify RLS policies**
```sql
-- Check existing policies
SELECT * FROM pg_policies WHERE tablename = 'storyboards';
```

**1.3. Create indexes for performance**
```sql
CREATE INDEX IF NOT EXISTS idx_storyboards_id ON storyboards(id);
CREATE INDEX IF NOT EXISTS idx_storyboards_updated_at ON storyboards(updated_at);
```

### Phase 2: Figma Plugin - Add Realtime Support

**2.1. Install Dependencies**
```json
// figma-plugin/package.json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0"
  }
}
```

**2.2. Create Supabase Client** (`figma-plugin/src/supabase-client.ts`)
```typescript
import { createClient } from '@supabase/supabase-js'

export function initSupabase(projectId: string, anonKey: string) {
  return createClient(
    `https://${projectId}.supabase.co`,
    anonKey,
    {
      realtime: {
        heartbeatIntervalMs: 30000,
      }
    }
  )
}
```

**2.3. Create Scene Manager** (`figma-plugin/src/scene-manager.ts`)
```typescript
export class SceneManager {
  private sceneNodes = new Map<string, StickyNode | FrameNode>()

  // Track created nodes by scene.id
  registerNode(sceneId: string, node: StickyNode | FrameNode) {
    this.sceneNodes.set(sceneId, node)
  }

  // Find node by scene.id
  getNode(sceneId: string) {
    return this.sceneNodes.get(sceneId)
  }

  // Update existing node text
  async updateNode(sceneId: string, newText: string) {
    const node = this.sceneNodes.get(sceneId)
    if (!node) return

    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })

    if (node.type === 'STICKY') {
      node.text.characters = newText
    } else if (node.type === 'FRAME') {
      // Update text node inside frame
      const textNode = node.findOne(n => n.type === 'TEXT') as TextNode
      if (textNode) textNode.characters = newText
    }
  }

  // Remove node
  removeNode(sceneId: string) {
    const node = this.sceneNodes.get(sceneId)
    if (node) {
      node.remove()
      this.sceneNodes.delete(sceneId)
    }
  }
}
```

**2.4. Create Realtime Sync** (`figma-plugin/src/realtime-sync.ts`)
```typescript
import { RealtimeChannel } from '@supabase/supabase-js'
import { SceneManager } from './scene-manager'

export class RealtimeSync {
  private channel: RealtimeChannel | null = null
  private sceneManager: SceneManager

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager
  }

  async subscribe(supabase, storyboardId: string) {
    this.channel = supabase
      .channel(`storyboard:${storyboardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'storyboards',
          filter: `id=eq.${storyboardId}`
        },
        this.handleChange.bind(this)
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          log('🟢 Realtime active')
          figma.ui.postMessage({ type: 'realtime-status', status: 'connected' })
        }
      })
  }

  private async handleChange(payload) {
    const { eventType, new: newData, old: oldData } = payload

    log('Realtime event:', eventType, payload)

    switch(eventType) {
      case 'INSERT':
        // New storyboard or scenes added
        await this.handleInsert(newData)
        break

      case 'UPDATE':
        // Scenes updated
        await this.handleUpdate(newData, oldData)
        break

      case 'DELETE':
        // Storyboard deleted
        await this.handleDelete(oldData)
        break
    }
  }

  private async handleUpdate(newData, oldData) {
    // Compare scenes and update changed ones
    const newScenes = newData.scenes || []
    const oldScenes = oldData.scenes || []

    // Find changed scenes
    for (const newScene of newScenes) {
      const oldScene = oldScenes.find(s => s.id === newScene.id)

      if (!oldScene) {
        // New scene added
        await this.createSceneNode(newScene)
      } else if (JSON.stringify(oldScene) !== JSON.stringify(newScene)) {
        // Scene updated
        await this.updateSceneNode(newScene)
      }
    }

    // Find deleted scenes
    for (const oldScene of oldScenes) {
      if (!newScenes.find(s => s.id === oldScene.id)) {
        this.sceneManager.removeNode(oldScene.id)
      }
    }
  }

  async unsubscribe() {
    if (this.channel) {
      await this.channel.unsubscribe()
      this.channel = null
    }
  }
}
```

**2.5. Update Main Plugin Code** (`figma-plugin/src/code.ts`)
```typescript
import { initSupabase } from './supabase-client'
import { SceneManager } from './scene-manager'
import { RealtimeSync } from './realtime-sync'

let realtimeSync: RealtimeSync | null = null
const sceneManager = new SceneManager()

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'sync-storyboard') {
    const { projectId, publicAnonKey, storyboardId } = msg.data

    // Initial sync
    const response = await fetch(...)
    const { storyboard } = await response.json()

    await createStoryboardInFigJam(storyboard.scenes)

    // START REALTIME
    const supabase = initSupabase(projectId, publicAnonKey)
    realtimeSync = new RealtimeSync(sceneManager)
    await realtimeSync.subscribe(supabase, storyboardId)

    figma.ui.postMessage({
      type: 'sync-complete',
      message: `Synced ${storyboard.scenes.length} scenes. 🟢 Live sync active.`
    })
  }
}

// Cleanup on close
figma.on('close', async () => {
  if (realtimeSync) {
    await realtimeSync.unsubscribe()
  }
})
```

**2.6. Update UI** (`figma-plugin/ui.html`)
```html
<!-- Add status indicator -->
<div id="status-indicator" class="status">
  <span class="dot"></span>
  <span id="status-text">Not connected</span>
</div>

<style>
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  margin-top: 12px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7a7a8e;
}

.dot.connected {
  background: #4ade80;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>

<script>
window.onmessage = (event) => {
  const msg = event.data.pluginMessage

  if (msg.type === 'realtime-status') {
    const dot = document.querySelector('.dot')
    const text = document.getElementById('status-text')

    if (msg.status === 'connected') {
      dot.classList.add('connected')
      text.textContent = '🟢 Live sync active'
    }
  }
}
</script>
```

### Phase 3: Next.js Web App with Realtime + Vercel Deployment

**3.1. Initialize Next.js Project**
```bash
cd /Users/rustam/projects/superstoryboard-v2
pnpm create next-app@latest web-app --typescript --tailwind --app --src-dir

# Install dependencies
cd web-app
pnpm add @supabase/supabase-js @supabase/ssr
pnpm add lucide-react sonner class-variance-authority clsx tailwind-merge
pnpm add -D @types/node
```

**3.2. Create Supabase Client** (`web-app/lib/supabase.ts`)
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
)
```

**3.3. Create Realtime Hook** (`web-app/hooks/useRealtimeStoryboard.ts`)
```typescript
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useRealtimeStoryboard(storyboardId: string | null) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected')

  useEffect(() => {
    if (!storyboardId) return

    let channel: RealtimeChannel

    setStatus('connecting')

    // Subscribe to KV store changes
    channel = supabase
      .channel(`storyboard:${storyboardId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'kv_store_7ee7668a',
          filter: `key=eq.storyboard:${storyboardId}`
        },
        (payload) => {
          console.log('🔄 Storyboard updated:', payload)
          // Trigger re-fetch of data
          window.dispatchEvent(new CustomEvent('storyboard-updated', {
            detail: payload.new.value
          }))
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setStatus('connected')
          console.log('🟢 Realtime connected')
        } else if (status === 'CHANNEL_ERROR') {
          setStatus('disconnected')
          console.error('❌ Realtime error')
        }
      })

    return () => {
      channel?.unsubscribe()
      setStatus('disconnected')
    }
  }, [storyboardId])

  return { status }
}
```

**3.4. Update Main Page** (`web-app/app/page.tsx`)
```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRealtimeStoryboard } from '@/hooks/useRealtimeStoryboard'
import { StoryboardPanel } from '@/components/StoryboardPanel'
import { toast } from 'sonner'

export default function HomePage() {
  const [storyboardId, setStoryboardId] = useState<string | null>(null)
  const [scenes, setScenes] = useState([])
  const { status } = useRealtimeStoryboard(storyboardId)

  // Listen for realtime updates
  useEffect(() => {
    const handleUpdate = (event: CustomEvent) => {
      const updatedStoryboard = event.detail
      setScenes(updatedStoryboard.scenes)
      toast.success('Storyboard updated from Figma plugin! 🎨')
    }

    window.addEventListener('storyboard-updated', handleUpdate as EventListener)
    return () => window.removeEventListener('storyboard-updated', handleUpdate as EventListener)
  }, [])

  return (
    <div>
      {/* Realtime Status Indicator */}
      <div className="fixed top-4 right-4 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          status === 'connected' ? 'bg-green-500 animate-pulse' :
          status === 'connecting' ? 'bg-yellow-500' :
          'bg-gray-500'
        }`} />
        <span className="text-xs text-gray-400">
          {status === 'connected' ? '🟢 Live' :
           status === 'connecting' ? '🟡 Connecting...' :
           '⚪ Offline'}
        </span>
      </div>

      {/* ... rest of UI ... */}
    </div>
  )
}
```

**3.5. Environment Variables** (`.env.local`)
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://imvfmhobawvpgcfsqhid.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...

# Edge Function
NEXT_PUBLIC_EDGE_FUNCTION_URL=https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/make-server-7ee7668a
```

**3.6. Vercel Configuration** (`vercel.json`)
```json
{
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "regions": ["sfo1"],
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase_url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase_anon_key"
  }
}
```

**3.7. Deploy to Vercel**
```bash
# Install Vercel CLI
pnpm add -g vercel

# Login to Vercel
vercel login

# Deploy
cd web-app
vercel --prod

# Set environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## Files to Create/Modify

### New Files (v2 Project)
```
/Users/rustam/projects/superstoryboard-v2/
├── REALTIME_IMPLEMENTATION_PLAN.md (this file)
├── pnpm-workspace.yaml
├── figma-plugin/
│   ├── src/
│   │   ├── supabase-client.ts  ✨ NEW
│   │   ├── scene-manager.ts    ✨ NEW
│   │   ├── realtime-sync.ts    ✨ NEW
│   │   └── code.ts             🔄 MODIFY
│   ├── ui.html                 🔄 MODIFY (add status)
│   └── package.json            🔄 MODIFY (add @supabase/supabase-js)
└── web-app/
    └── src/
        └── hooks/
            └── useRealtimeStoryboard.ts ✨ NEW (optional)
```

### Modified Files (Current Project)
```
/Users/rustam/projects/superstoryboard/
├── figma-plugin/
│   ├── code.ts                 🔄 ADD realtime
│   ├── ui.html                 🔄 ADD status indicator
│   └── package.json            🔄 ADD @supabase/supabase-js
└── App.tsx                     🔄 ADD realtime hook (optional)
```

---

## MCP Integration Points

### Using Supabase MCP
```typescript
// Enable realtime via MCP
mcp__supabase__execute_sql({
  query: "ALTER PUBLICATION supabase_realtime ADD TABLE storyboards;"
})

// Check table setup
mcp__supabase__list_tables({ schemas: ["public"] })

// Monitor logs
mcp__supabase__get_logs({ service: "realtime" })
```

### Using Figma MCP (Future Enhancement)
```typescript
// Get Figma file context
mcp__figma__get_design_context({
  fileKey: "ernadxzZk8OcYRLeXt2WjD",
  nodeId: "0-1"
})

// Could use for advanced plugin features
```

---

## Testing Plan

1. **Initial Sync Test**
   - Open plugin → Sync storyboard
   - Verify 🟢 Live indicator appears

2. **INSERT Test**
   - Web app: Add new scene
   - Plugin: New sticky note appears automatically

3. **UPDATE Test**
   - Web app: Change scene description
   - Plugin: Sticky text updates in real-time

4. **DELETE Test**
   - Web app: Delete scene
   - Plugin: Sticky note disappears

5. **Reconnection Test**
   - Close/reopen plugin
   - Verify subscription restarts

---

## Next Steps - Choose Your Path

### Path A: Extend Current Project
1. Save this plan as `REALTIME_PLAN.md` in current project
2. Modify existing `figma-plugin/` files
3. No need for pnpm workspace

### Path B: Create Clean v2 Project
1. Create `/Users/rustam/projects/superstoryboard-v2/`
2. Setup pnpm workspace
3. Copy and enhance existing code
4. Better structure, cleaner dependencies

**Recommendation: Path B** - Clean separation, better for future maintenance

---

## Deliverables

1. ✅ `REALTIME_IMPLEMENTATION_PLAN.md` (this file)
2. ⏳ Working Figma plugin with realtime
3. ⏳ Next.js web app with realtime
4. ⏳ Vercel deployment (production URL)
5. ⏳ pnpm workspace setup
6. ⏳ Documentation for setup/usage

---

## Estimated Timeline
- Backend setup (KV store realtime): 15 min
- Plugin realtime: 1 hour
- Next.js app setup: 30 min
- Web app realtime integration: 20 min
- Vercel deployment: 15 min
- Testing: 30 min
- **Total: ~2.5-3 hours**

---

## User Requirements (from discussion)

✅ **Update Mode**: Update existing stickers (find by scene ID)
✅ **UI Control**: Always active (no toggle needed)
✅ **Plugin Mode**: Plugin stays open during live sync
✅ **Events**: Track all events (INSERT, UPDATE, DELETE)

---

## Implementation Status

- [ ] Phase 1: Backend Setup
- [ ] Phase 2: Figma Plugin Realtime
- [ ] Phase 3: Web App Realtime (optional)
- [ ] Testing & Documentation
