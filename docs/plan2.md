План реализации AI Storyboard Agent в Figma Plugin                               │
     │                                                                                  │
     │ Архитектура                                                                      │
     │                                                                                  │
     │ Figma/FigJam Plugin                                                              │
     │     ↓ (1) User Prompt + Context                                                  │
     │ FastAPI Backend (ваш сервер)                                                     │
     │     ↓ (2) Google Vertex AI Gemini                                                │
     │ Generate Storyboard Scenes                                                       │
     │     ↓ (3) Save to Supabase                                                       │
     │ Supabase Realtime                                                                │
     │     ↓ (4) WebSocket Push                                                         │
     │ Figma Plugin updates canvas                                                      │
     │                                                                                  │
     │ 1. Plugin: AI Chat Interface (минималистичный)                                   │
     │                                                                                  │
     │ Добавить в UI:                                                                   │
     │ - Текстовое поле для промпта (textarea)                                          │
     │ - Кнопка "Generate Storyboard"                                                   │
     │ - Loading indicator                                                              │
     │ - История запросов (опционально)                                                 │
     │                                                                                  │
     │ Файлы для изменения:                                                             │
     │ - figma-plugin/ui/App.tsx - добавить AI chat UI                                  │
     │ - figma-plugin/plugin/index.ts - добавить функцию извлечения контекста           │
     │                                                                                  │
     │ 2. Извлечение контекста из Figma                                                 │
     │                                                                                  │
     │ Что отправляем в AI:                                                             │
     │ - ✅ Screenshots выделенных элементов (PNG/base64)                                │
     │ - ✅ Metadata (названия, позиции, размеры) - JSON                                 │
     │ - ✅ Текстовый контент из text nodes                                              │
     │ - ✅ Вся страница как референс (screenshot)                                       │
     │                                                                                  │
     │ Новая функция в plugin/index.ts:                                                 │
     │ async function captureContext() {                                                │
     │   const selection = figma.currentPage.selection;                                 │
     │                                                                                  │
     │   // Screenshots выделенных элементов                                            │
     │   const screenshots = await Promise.all(                                         │
     │     selection.map(node => node.exportAsync({ format: 'PNG' }))                   │
     │   );                                                                             │
     │                                                                                  │
     │   // Metadata                                                                    │
     │   const metadata = selection.map(node => ({                                      │
     │     id: node.id,                                                                 │
     │     name: node.name,                                                             │
     │     type: node.type,                                                             │
     │     x: node.x,                                                                   │
     │     y: node.y,                                                                   │
     │     width: node.width,                                                           │
     │     height: node.height                                                          │
     │   }));                                                                           │
     │                                                                                  │
     │   // Текстовый контент                                                           │
     │   const textContent = extractText(selection);                                    │
     │                                                                                  │
     │   // Page screenshot                                                             │
     │   const pageScreenshot = await figma.currentPage.exportAsync({ format: 'PNG' }); │
     │                                                                                  │
     │   return { screenshots, metadata, textContent, pageScreenshot };                 │
     │ }                                                                                │
     │                                                                                  │
     │ 3. Python Backend (FastAPI)                                                      │
     │                                                                                  │
     │ Создать новый проект:                                                            │
     │ backend/                                                                         │
     │ ├── main.py                 # FastAPI app                                        │
     │ ├── ai_agent.py             # Vertex AI Gemini integration                       │
     │ ├── requirements.txt                                                             │
     │ ├── Dockerfile (опционально)                                                     │
     │ └── .env                                                                         │
     │                                                                                  │
     │ Endpoints:                                                                       │
     │ # POST /api/generate-storyboard                                                  │
     │ # Input: { prompt, context: { screenshots, metadata, text } }                    │
     │ # Output: { storyboard_id, scenes[] }                                            │
     │                                                                                  │
     │ # WebSocket /ws/generation-status/{storyboard_id}                                │
     │ # Real-time progress updates                                                     │
     │                                                                                  │
     │ AI Agent (ai_agent.py):                                                          │
     │ - Vertex AI Gemini Flash/Pro integration                                         │
     │ - Multimodal input (text + images)                                               │
     │ - Structured output (JSON с scenes)                                              │
     │ - Сохранение в Supabase через API v2                                             │
     │                                                                                  │
     │ 4. Типы данных для Plugin (БЕЗ Zod!)                                             │
     │                                                                                  │
     │ Создать: figma-plugin/plugin/types.ts                                            │
     │ // Простые TypeScript типы (QuickJS compatible)                                  │
     │ export interface Scene {                                                         │
     │   id: string;                                                                    │
     │   storyboardId: string;                                                          │
     │   sceneNumber: number;                                                           │
     │   shotType: string;                                                              │
     │   description: string;                                                           │
     │   dialogue: string;                                                              │
     │   notes: string;                                                                 │
     │   imageUrl: string;                                                              │
     │   duration: string;                                                              │
     │   metadata: Record<string, any>;                                                 │
     │   createdAt: string;                                                             │
     │   updatedAt: string;                                                             │
     │ }                                                                                │
     │                                                                                  │
     │ export interface StoryboardV2 {                                                  │
     │   id: string;                                                                    │
     │   name: string;                                                                  │
     │   metadata: Record<string, any>;                                                 │
     │   createdAt: string;                                                             │
     │   updatedAt: string;                                                             │
     │   scenes?: Scene[];                                                              │
     │ }                                                                                │
     │                                                                                  │
     │ export interface FigmaContext {                                                  │
     │   screenshots: Uint8Array[];                                                     │
     │   metadata: Array<{                                                              │
     │     id: string;                                                                  │
     │     name: string;                                                                │
     │     type: string;                                                                │
     │     x: number;                                                                   │
     │     y: number;                                                                   │
     │     width: number;                                                               │
     │     height: number;                                                              │
     │   }>;                                                                            │
     │   textContent: string;                                                           │
     │   pageScreenshot: Uint8Array;                                                    │
     │ }                                                                                │
     │                                                                                  │
     │ 5. Обновления в UI (ui/App.tsx)                                                  │
     │                                                                                  │
     │ Добавить:                                                                        │
     │ - AI prompt input section                                                        │
     │ - Function handleGenerateStoryboard(prompt)                                      │
     │ - Context capture trigger                                                        │
     │ - Loading states                                                                 │
     │ - Error handling                                                                 │
     │                                                                                  │
     │ Новый компонент:                                                                 │
     │ function AIPromptSection() {                                                     │
     │   const [prompt, setPrompt] = useState('');                                      │
     │   const [isGenerating, setIsGenerating] = useState(false);                       │
     │                                                                                  │
     │   async function generate() {                                                    │
     │     setIsGenerating(true);                                                       │
     │                                                                                  │
     │     // 1. Get context from plugin                                                │
     │     const context = await getContextFromPlugin();                                │
     │                                                                                  │
     │     // 2. Send to backend                                                        │
     │     const response = await fetch('YOUR_SERVER/api/generate-storyboard', {        │
     │       method: 'POST',                                                            │
     │       body: JSON.stringify({ prompt, context })                                  │
     │     });                                                                          │
     │                                                                                  │
     │     const { storyboard_id } = await response.json();                             │
     │                                                                                  │
     │     // 3. Realtime updates automatically via existing WebSocket!                 │
     │     setIsGenerating(false);                                                      │
     │   }                                                                              │
     │                                                                                  │
     │   return (                                                                       │
     │     <div>                                                                        │
     │       <textarea value={prompt} onChange={e => setPrompt(e.target.value)} />      │
     │       <button onClick={generate} disabled={isGenerating}>                        │
     │         {isGenerating ? 'Generating...' : 'Generate Storyboard'}                 │
     │       </button>                                                                  │
     │     </div>                                                                       │
     │   );                                                                             │
     │ }                                                                                │
     │                                                                                  │
     │ 6. Backend Implementation                                                        │
     │                                                                                  │
     │ main.py (FastAPI):                                                               │
     │ from fastapi import FastAPI, File, UploadFile                                    │
     │ from ai_agent import generate_storyboard                                         │
     │ import asyncio                                                                   │
     │                                                                                  │
     │ app = FastAPI()                                                                  │
     │                                                                                  │
     │ @app.post("/api/generate-storyboard")                                            │
     │ async def generate(                                                              │
     │     prompt: str,                                                                 │
     │     screenshots: list[bytes],                                                    │
     │     metadata: dict,                                                              │
     │     text_content: str                                                            │
     │ ):                                                                               │
     │     # 1. Call Vertex AI Gemini                                                   │
     │     scenes = await generate_storyboard(                                          │
     │         prompt=prompt,                                                           │
     │         images=screenshots,                                                      │
     │         context={"metadata": metadata, "text": text_content}                     │
     │     )                                                                            │
     │                                                                                  │
     │     # 2. Save to Supabase via API v2                                             │
     │     storyboard = await create_storyboard_in_supabase(scenes)                     │
     │                                                                                  │
     │     # 3. Realtime automatically pushes to plugin!                                │
     │     return {"storyboard_id": storyboard.id, "scenes": scenes}                    │
     │                                                                                  │
     │ ai_agent.py (Vertex AI):                                                         │
     │ from google.cloud import aiplatform                                              │
     │ from vertexai.preview.generative_models import GenerativeModel                   │
     │                                                                                  │
     │ async def generate_storyboard(prompt, images, context):                          │
     │     model = GenerativeModel("gemini-1.5-flash")                                  │
     │                                                                                  │
     │     # Multimodal prompt                                                          │
     │     response = model.generate_content([                                          │
     │         prompt,                                                                  │
     │         *images,  # screenshots                                                  │
     │         f"Context: {context}"                                                    │
     │     ])                                                                           │
     │                                                                                  │
     │     # Parse structured output                                                    │
     │     scenes = parse_scenes_from_response(response.text)                           │
     │     return scenes                                                                │
     │                                                                                  │
     │ 7. Интеграция с существующей схемой                                              │
     │                                                                                  │
     │ Использование Zod схем:                                                          │
     │ - ✅ Python backend валидирует через Pydantic (аналог Zod)                        │
     │ - ✅ Веб-приложение (будущее) использует Zod                                      │
     │ - ✅ Figma plugin использует простые TypeScript типы                              │
     │                                                                                  │
     │ Файлы:                                                                           │
     │ - schemas.ts + api-v2.ts → для веб-приложения (НЕ для plugin!)                   │
     │ - figma-plugin/plugin/types.ts → простые типы для QuickJS                        │
     │                                                                                  │
     │ 8. Обновления в manifest.json                                                    │
     │                                                                                  │
     │ Добавить:                                                                        │
     │ {                                                                                │
     │   "networkAccess": {                                                             │
     │     "allowedDomains": [                                                          │
     │       "https://*.supabase.co",                                                   │
     │       "wss://*.supabase.co",                                                     │
     │       "https://YOUR_SERVER_DOMAIN"  // ваш FastAPI сервер                        │
     │     ]                                                                            │
     │   }                                                                              │
     │ }                                                                                │
     │                                                                                  │
     │ Итого: Изменения                                                                 │
     │                                                                                  │
     │ Figma Plugin                                                                     │
     │                                                                                  │
     │ 1. ✅ Добавить AI prompt UI в App.tsx                                             │
     │ 2. ✅ Создать types.ts (простые типы, БЕЗ Zod)                                    │
     │ 3. ✅ Добавить функцию извлечения контекста в plugin/index.ts                     │
     │ 4. ✅ Обновить manifest.json с вашим сервером                                     │
     │ 5. ✅ Интегрировать с существующим WebSocket (уже работает!)                      │
     │                                                                                  │
     │ Python Backend (новое)                                                           │
     │                                                                                  │
     │ 1. ✅ FastAPI сервер                                                              │
     │ 2. ✅ Vertex AI Gemini интеграция                                                 │
     │ 3. ✅ Supabase API v2 клиент                                                      │
     │ 4. ✅ Multimodal processing (text + images)                                       │
     │ 5. ✅ Docker setup (опционально)                                                  │
     │                                                                                  │
     │ Supabase                                                                         │
     │                                                                                  │
     │ - ✅ Схемы уже готовы (показанные)                                                │
     │ - ✅ Realtime уже настроен                                                        │
     │ - ✅ API v2 готов                                                                 │
     │                                                                                  │
     │ ---                                                                              │
     │ Преимущества этого подхода:                                                      │
     │ 1. ✅ Нет необходимости в отдельном веб-приложении (пока)                         │
     │ 2. ✅ Весь workflow в Figma/FigJam                                                │
     │ 3. ✅ Real-time updates уже работают                                              │
     │ 4. ✅ Vertex AI Gemini поддерживает multimodal                                    │
     │ 5. ✅ Простой деплой на вашем сервере                                             │
     │                                                                                  │
     │ Хотите начать с реализации?            