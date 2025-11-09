# AI Agent Implementation Plan

**Project:** SuperStoryboard Figma Plugin with AI Agent
**Date:** 2025-11-09
**Status:** Planning Phase

## Executive Summary

Transform the SuperStoryboard Figma plugin from a simple sync tool into an AI-powered storyboard generation agent. The agent will accept natural language prompts, extract context from Figma selections, process through Google Vertex AI Gemini, and return generated storyboards via real-time sync.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FIGMA PLUGIN                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  UI (React - Browser Environment)                         │  │
│  │  - AI Prompt Input Field                                  │  │
│  │  - Submit Button                                           │  │
│  │  - Status Indicator                                        │  │
│  │  - WebSocket Client (Supabase Realtime)                   │  │
│  │  - HTTP Client (FastAPI Backend)                          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           ↕ postMessage                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Plugin (QuickJS Environment)                             │  │
│  │  - Canvas Management (SceneManager)                       │  │
│  │  - Context Extraction (Screenshots, Metadata, Text)       │  │
│  │  - Scene Rendering                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                ↕
                          HTTPS/WebSocket
                                ↕
┌─────────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND (Python)                      │
│  - Receive prompt + Figma context                               │
│  - Process with Google Vertex AI Gemini                         │
│  - Generate storyboard structure                                │
│  - Store in Supabase                                             │
│  - Return via Realtime sync                                      │
└─────────────────────────────────────────────────────────────────┘
                                ↕
┌─────────────────────────────────────────────────────────────────┐
│                   GOOGLE VERTEX AI GEMINI                        │
│  - Gemini Flash (fast, cost-effective)                          │
│  - Gemini Pro (higher quality)                                  │
│  - Multimodal: text + image context                             │
└─────────────────────────────────────────────────────────────────┘
                                ↕
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE DATABASE                             │
│  - kv_store_7ee7668a table (existing)                          │
│  - Realtime sync to plugin                                      │
│  - Chat history (future)                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Plugin Schema Updates

### Current Schema (plugin/index.ts)

```typescript
interface StoryboardScene {
  id: string;
  sceneNumber: number;
  shotType: string;
  description: string;
  dialogue: string;
  notes: string;
  imageUrl: string;
  duration: string;
}

interface StoryboardData {
  id: string;
  name: string;
  scenes: StoryboardScene[];
  createdAt: string;
  updatedAt: string;
}
```

### New Schema (matching Zod structure, but as simple TypeScript interfaces)

```typescript
interface Scene {
  id: string;
  storyboardId: string;
  sceneNumber: number;
  shotType: string;
  description: string;
  dialogue: string;
  notes: string;
  imageUrl: string;
  duration: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface StoryboardV2 {
  id: string;
  name: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  scenes?: Scene[];
}
```

### Schema Migration Strategy

**Backward Compatibility:**
- Keep old `StoryboardScene` as alias to `Scene` for gradual migration
- Keep old `StoryboardData` as alias to `StoryboardV2`
- Add default values for new fields: `metadata: {}`

**Files to Update:**
1. `/Users/rustam/projects/superstoryboard/figma-plugin/plugin/types.ts` (NEW)
   - Move all interfaces here
   - Export for use in both plugin and UI

2. `/Users/rustam/projects/superstoryboard/figma-plugin/plugin/index.ts`
   - Import types from `types.ts`
   - Update `SceneManager` to handle `metadata` field
   - Ensure QuickJS compatibility (no Zod, no advanced features)

3. `/Users/rustam/projects/superstoryboard/figma-plugin/ui/App.tsx`
   - Import types from `types.ts`
   - Update state types
   - Handle new `metadata` field in change detection

## Phase 2: AI Prompt UI Design

### Minimal UI Mockup

```
┌─────────────────────────────────────────────────────┐
│  SuperStoryboard AI Agent                      🟢   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ Describe your storyboard...                    │ │
│  │                                                 │ │
│  │ (multi-line text input)                        │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  [ Generate Storyboard ]  [ Extract Context ]       │
│                                                      │
│  Status: Ready / Processing... / Complete           │
│                                                      │
│  Context: 3 frames selected, 150 text elements      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### UI Components

**New Files:**
- `/Users/rustam/projects/superstoryboard/figma-plugin/ui/components/PromptInput.tsx`
  - Multi-line textarea for AI prompts
  - Character counter
  - Submit on Cmd/Ctrl+Enter

- `/Users/rustam/projects/superstoryboard/figma-plugin/ui/components/ContextPreview.tsx`
  - Display selected Figma elements
  - Show screenshot thumbnails
  - Metadata summary

**Modified Files:**
- `/Users/rustam/projects/superstoryboard/figma-plugin/ui/App.tsx`
  - Add AI prompt state
  - Add context extraction logic
  - Add backend API calls

### UI Workflow

1. User selects elements in Figma (optional)
2. User enters prompt in text field
3. Click "Generate Storyboard"
4. UI sends:
   - Prompt text
   - Selected element screenshots (if any)
   - Metadata (element names, text content, positions)
   - Full page context (optional)
5. Backend processes and stores in Supabase
6. Real-time sync updates canvas automatically

## Phase 3: Figma Context Extraction

### Context Types

**1. Screenshots**
```typescript
async function extractScreenshots(): Promise<ScreenshotContext[]> {
  const selection = figma.currentPage.selection;
  const screenshots: ScreenshotContext[] = [];

  for (const node of selection) {
    const imageBytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2 }
    });

    screenshots.push({
      nodeId: node.id,
      nodeName: node.name,
      imageData: Array.from(imageBytes),
      width: node.width,
      height: node.height
    });
  }

  return screenshots;
}
```

**2. Metadata**
```typescript
interface NodeMetadata {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  locked: boolean;
}

function extractMetadata(node: SceneNode): NodeMetadata {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    visible: node.visible,
    locked: node.locked
  };
}
```

**3. Text Content**
```typescript
async function extractTextContent(): Promise<string[]> {
  const selection = figma.currentPage.selection;
  const textContent: string[] = [];

  for (const node of selection) {
    if (node.type === 'TEXT') {
      textContent.push(node.characters);
    }
  }

  return textContent;
}
```

**4. Full Page Context** (optional)
```typescript
async function extractFullPageContext(): Promise<PageContext> {
  const page = figma.currentPage;
  const allNodes = page.findAll();

  return {
    pageName: page.name,
    totalNodes: allNodes.length,
    nodeTypes: countNodeTypes(allNodes),
    bounds: calculatePageBounds(allNodes)
  };
}
```

### Context Extraction Flow

```
Plugin (QuickJS)                 UI (Browser)               Backend
      │                               │                         │
      │  1. User clicks "Extract"     │                         │
      │ ────────────────────────────> │                         │
      │                               │                         │
      │  2. Request context           │                         │
      │ <──────────────────────────── │                         │
      │                               │                         │
      │  3. Extract screenshots +     │                         │
      │     metadata + text            │                         │
      │                               │                         │
      │  4. Send context              │                         │
      │ ────────────────────────────> │                         │
      │                               │                         │
      │                               │  5. Upload to backend   │
      │                               │ ──────────────────────> │
      │                               │                         │
      │                               │  6. Return context ID   │
      │                               │ <────────────────────── │
```

### Context Message Protocol

**Plugin → UI**
```typescript
{
  type: 'context-extracted',
  context: {
    screenshots: ScreenshotContext[],
    metadata: NodeMetadata[],
    textContent: string[],
    pageContext?: PageContext
  }
}
```

**UI → Backend**
```typescript
POST /api/v2/context
{
  storyboardId: string,
  screenshots: Array<{
    nodeId: string,
    nodeName: string,
    imageData: number[],  // PNG bytes
    width: number,
    height: number
  }>,
  metadata: NodeMetadata[],
  textContent: string[],
  pageContext?: PageContext
}

Response: { contextId: string }
```

## Phase 4: Backend API Specification

### FastAPI Endpoints

**Base URL:** `https://your-server.com/api/v2`

#### 1. Generate Storyboard
```python
@app.post("/storyboard/generate")
async def generate_storyboard(request: GenerateRequest):
    """
    Generate storyboard from AI prompt and context.

    Request:
    {
      "prompt": "Create a 5-scene action sequence...",
      "contextId": "ctx_123abc",  // optional
      "storyboardId": "1762610415566",
      "model": "gemini-flash" | "gemini-pro",
      "options": {
        "sceneCount": 5,
        "style": "cinematic",
        "includeDialogue": true
      }
    }

    Response:
    {
      "jobId": "job_456def",
      "status": "processing",
      "estimatedTime": 30  // seconds
    }
    """
    pass
```

#### 2. Upload Context
```python
@app.post("/context")
async def upload_context(request: ContextRequest):
    """
    Upload Figma context (screenshots, metadata).

    Request: (see Context Message Protocol above)

    Response:
    {
      "contextId": "ctx_123abc",
      "uploadedAt": "2025-11-09T12:00:00Z"
    }
    """
    pass
```

#### 3. Check Job Status
```python
@app.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """
    Check generation job status.

    Response:
    {
      "jobId": "job_456def",
      "status": "processing" | "complete" | "failed",
      "progress": 0.75,
      "result": {
        "storyboardId": "1762610415566",
        "scenesGenerated": 5
      }
    }
    """
    pass
```

### Backend Processing Flow

```python
# 1. Receive prompt + context
async def generate_storyboard(prompt: str, context_id: Optional[str]):

    # 2. Fetch context if provided
    context = await fetch_context(context_id) if context_id else None

    # 3. Build Gemini prompt
    gemini_prompt = build_gemini_prompt(prompt, context)

    # 4. Call Vertex AI Gemini
    response = await vertex_ai.generate(
        model="gemini-flash",
        prompt=gemini_prompt,
        images=context.screenshots if context else None
    )

    # 5. Parse response to storyboard structure
    storyboard_data = parse_gemini_response(response)

    # 6. Store in Supabase
    await supabase.table('kv_store_7ee7668a').upsert({
        'key': f'storyboard:{storyboard_id}',
        'value': storyboard_data
    })

    # 7. Realtime sync triggers automatically
    # Plugin receives update via WebSocket

    return {"status": "complete"}
```

### Gemini Prompt Template

```python
def build_gemini_prompt(user_prompt: str, context: Optional[Context]) -> str:
    system_prompt = """
    You are a professional storyboard artist. Your task is to create detailed
    storyboard scenes from user descriptions.

    Each scene must include:
    - sceneNumber: Sequential number
    - shotType: (Wide, Medium, Close-up, etc.)
    - description: Visual description
    - dialogue: Character dialogue (if applicable)
    - notes: Director notes
    - duration: Estimated duration (e.g., "3s", "5s")

    Return JSON array of scenes matching this structure.
    """

    context_info = ""
    if context:
        context_info = f"""

        FIGMA CONTEXT:
        - {len(context.screenshots)} selected elements
        - Text content: {', '.join(context.textContent[:5])}
        - Metadata: {json.dumps(context.metadata, indent=2)}
        """

    return f"{system_prompt}\n\nUSER REQUEST:\n{user_prompt}{context_info}"
```

## Phase 5: Integration & Testing

### Integration Steps

1. **Update Plugin Schemas** ✅
   - Create `types.ts`
   - Update `plugin/index.ts`
   - Update `ui/App.tsx`

2. **Add Context Extraction**
   - Implement screenshot export
   - Implement metadata extraction
   - Add postMessage handlers

3. **Build AI Prompt UI**
   - Create `PromptInput.tsx`
   - Update `App.tsx` with new state
   - Add backend API client

4. **Backend Development**
   - Set up FastAPI server
   - Implement Vertex AI integration
   - Add Supabase client
   - Deploy to Docker

5. **End-to-End Testing**
   - Test context extraction
   - Test AI generation
   - Test real-time sync
   - Test error handling

### Testing Scenarios

**Scenario 1: Simple Prompt (No Context)**
```
Input: "Create a 3-scene hero's journey"
Expected: 3 scenes generated with basic structure
```

**Scenario 2: Prompt with Selected Elements**
```
Input: "Turn these sketches into a storyboard"
Context: 5 frames selected in Figma
Expected: 5 scenes based on selected frames
```

**Scenario 3: Prompt with Text Content**
```
Input: "Create storyboard from this script"
Context: Text frames with dialogue
Expected: Scenes with dialogue from text frames
```

**Scenario 4: Error Handling**
```
Input: Empty prompt
Expected: Validation error
```

**Scenario 5: Realtime Update**
```
Action: Generate storyboard in plugin A
Expected: Plugin B (same storyboard) updates in real-time
```

## Phase 6: Future Enhancements

### 1. Chat Interface
- Store chat history in Supabase
- Multi-turn conversations with agent
- Refinement prompts ("make scene 3 more dramatic")

### 2. MCP Integration
- Convert FastAPI backend to MCP server
- Direct Claude Code integration
- Tool calling for advanced operations

### 3. Advanced Context
- Layer structure analysis
- Color palette extraction
- Typography analysis
- Component detection

### 4. Style Transfer
- Apply visual styles from reference images
- Consistent character appearance
- Brand guideline adherence

### 5. Export Options
- Platform-specific formats (YouTube, TikTok, Instagram)
- PDF storyboard export
- Animated preview generation

## Implementation Timeline

### Week 1: Plugin Foundation
- [ ] Update plugin schemas
- [ ] Create `types.ts` shared types
- [ ] Test backward compatibility
- [ ] Update documentation

### Week 2: Context Extraction
- [ ] Implement screenshot export
- [ ] Implement metadata extraction
- [ ] Add text content extraction
- [ ] Test postMessage protocol

### Week 3: UI Development
- [ ] Create AI prompt input component
- [ ] Update `App.tsx` with new UI
- [ ] Add context preview
- [ ] Style with Figma design tokens

### Week 4: Backend MVP
- [ ] Set up FastAPI server
- [ ] Implement Vertex AI Gemini integration
- [ ] Add Supabase client
- [ ] Test end-to-end flow

### Week 5: Integration & Testing
- [ ] Connect plugin to backend
- [ ] Test all scenarios
- [ ] Fix bugs and edge cases
- [ ] Performance optimization

### Week 6: Polish & Deploy
- [ ] Error handling improvements
- [ ] Loading states and feedback
- [ ] Documentation updates
- [ ] Deploy backend to production

## Technical Constraints

### QuickJS Limitations
- No Zod validation (use simple TypeScript interfaces)
- No modern spread operators in plugin code
- No WebSocket API (use UI for networking)
- No `fetch` with custom headers (use UI for HTTP)
- ES2015 target for plugin bundle

### Figma API Limitations
- Screenshot export is async
- Font loading required before text creation
- Selection can be empty
- Node types vary (Frame, Text, Group, etc.)

### Backend Considerations
- Vertex AI rate limits
- Image size limits for multimodal input
- Latency: ~5-30 seconds per generation
- Token costs: Gemini Flash vs Pro

### Database Constraints
- `kv_store_7ee7668a` table structure
- JSON serialization for `value` field
- Realtime sync broadcast limits
- Row Level Security policies

## Success Metrics

1. **Functionality**
   - [ ] AI generates valid storyboard JSON
   - [ ] Realtime sync updates canvas < 1 second
   - [ ] Context extraction works for all node types
   - [ ] Error handling covers edge cases

2. **Performance**
   - [ ] Plugin bundle size < 10kb
   - [ ] UI load time < 1 second
   - [ ] Generation time < 30 seconds
   - [ ] No memory leaks in long sessions

3. **User Experience**
   - [ ] Intuitive prompt interface
   - [ ] Clear status indicators
   - [ ] Helpful error messages
   - [ ] Responsive UI updates

4. **Code Quality**
   - [ ] TypeScript type safety
   - [ ] Comprehensive error handling
   - [ ] Clean separation of concerns
   - [ ] Well-documented code

## Risk Mitigation

### Risk 1: Vertex AI Quota Limits
**Mitigation:**
- Implement rate limiting
- Add queue system for high traffic
- Fallback to cached responses

### Risk 2: Large Context Size
**Mitigation:**
- Compress images before upload
- Limit screenshot count (max 10)
- Pagination for large selections

### Risk 3: WebSocket Disconnects
**Mitigation:**
- Already implemented: 30-second heartbeat
- Auto-reconnect with exponential backoff
- Store pending updates in local state

### Risk 4: QuickJS Compatibility
**Mitigation:**
- Strict ES2015 transpilation
- No external dependencies in plugin
- All networking in UI (browser)

## Appendix A: File Structure

```
superstoryboard/
├── figma-plugin/
│   ├── plugin/
│   │   ├── index.ts              # Main plugin entry (updated)
│   │   ├── types.ts              # Shared types (NEW)
│   │   ├── SceneManager.ts       # Canvas management (updated)
│   │   └── ContextExtractor.ts   # Context extraction (NEW)
│   ├── ui/
│   │   ├── App.tsx               # Main UI (updated)
│   │   ├── components/
│   │   │   ├── PromptInput.tsx   # AI prompt input (NEW)
│   │   │   ├── ContextPreview.tsx # Context display (NEW)
│   │   │   └── StatusIndicator.tsx # Status display (existing)
│   │   └── api/
│   │       └── backend.ts        # Backend API client (NEW)
│   ├── .env                      # Environment variables
│   └── manifest.json             # Figma manifest
├── backend/                      # Python backend (NEW)
│   ├── main.py                   # FastAPI app
│   ├── services/
│   │   ├── vertex_ai.py          # Gemini integration
│   │   └── supabase.py           # Supabase client
│   ├── models/
│   │   └── schemas.py            # Pydantic schemas
│   ├── requirements.txt
│   └── Dockerfile
└── docs/
    └── AI_AGENT_IMPLEMENTATION_PLAN.md # This file
```

## Appendix B: API v2 Client Reference

Based on user's shared code, the API v2 client structure:

```typescript
// User's existing API client
export const apiV2 = {
  storyboards: {
    create: async (name: string, metadata?: Record<string, any>) =>
      StoryboardV2Schema.parse(await post('/storyboards', { name, metadata })),

    get: async (id: string) =>
      StoryboardV2Schema.parse(await get(`/storyboards/${id}`)),

    update: async (id: string, updates: Partial<StoryboardV2>) =>
      StoryboardV2Schema.parse(await patch(`/storyboards/${id}`, updates)),

    delete: async (id: string) =>
      await del(`/storyboards/${id}`),
  },

  scenes: {
    create: async (storyboardId: string, scene: Omit<Scene, 'id' | 'createdAt' | 'updatedAt'>) =>
      SceneSchema.parse(await post('/scenes', { ...scene, storyboardId })),

    update: async (id: string, updates: Partial<Scene>) =>
      SceneSchema.parse(await patch(`/scenes/${id}`, updates)),

    delete: async (id: string) =>
      await del(`/scenes/${id}`),
  }
};
```

This API structure will be used by the plugin UI to communicate with the backend.

---

**End of Plan Document**
**Next Action:** Update plugin schemas in `/Users/rustam/projects/superstoryboard/figma-plugin/`
