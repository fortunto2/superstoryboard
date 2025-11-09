# SuperStoryboard

> **AI-Powered Storyboard Platform with Real-time Figma Sync**

[![Supabase Hackathon](https://img.shields.io/badge/Supabase-Hackathon_2025-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://hackathon.supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

Built for [Supabase Hackathon 2025](https://hackathon.supabase.com/) - A full-stack platform for creating professional video storyboards using AI-powered scene generation with real-time synchronization to Figma.

## 🌐 Live Demos

**Figma Make Solutions** (using the same Supabase database, synchronized in real-time):

- **[AI Chat Dashboard](https://figma-chat.superduperai.co/)** - Interactive AI chat interface powered by Google Gemini Nano and Veo 3 models
- **[Simple Dashboard](https://figma.superduperai.co/)** - Minimalist storyboard management dashboard

Both solutions share the same Supabase backend and work synchronously with the Figma plugin.

## 🎯 What is SuperStoryboard?

Transform natural language into professional video storyboards with AI-powered scene generation and real-time Figma collaboration.

**Inspiration:** [SuperDuperAI](https://superduperai.co)'s multi-agent video production platform.

## ✨ Features

### Currently Implemented

✅ **Figma Plugin with Real-time Sync** ([`/figma-plugin`](./figma-plugin))
- WebSocket-based real-time sync with Supabase Realtime
- Automatic scene CREATE/UPDATE/DELETE
- Hybrid architecture workaround for QuickJS limitations
- FigJam and Figma support
- 37kb plugin with AI image generation
- Selection tracking and image editing

✅ **AI Generation Backend** ([`/supabase`](./supabase))
- **Instant queue processing** via Database Webhooks (< 1 second trigger)
- Queue-based image generation with Google Gemini (gemini-2.5-flash-image-preview)
- Queue-based video generation with Google Veo 3.1 Fast (8-second videos, 720p/1080p)
- Smart model fallback: VEO 3.1 Fast → VEO 3.0 Fast → VEO 2.0
- 4 generation modes: text-to-image/video, image-to-image/video
- Entity linking for scenes and characters
- PGMQ (Postgres Message Queue) for async job processing
- Edge Functions for serverless compute
- Supabase Storage for generated assets
- Complete API documentation and deployment guide

### Coming Soon

🚧 **Web Application**
- AI-powered scene generation from natural language
- Character consistency across scenes
- Style presets (Cinematic, Anime, Comic Book, etc.)
- Storyboard export for different platforms (YouTube, TikTok, Instagram)

## 🏗️ Architecture

```
SuperStoryboard Platform
├─ Web App (coming soon)    → Create & edit storyboards
├─ Figma Plugin ✅          → Real-time canvas sync
└─ Supabase Backend ✅      → Database, Realtime, AI Generation
   ├─ PGMQ Queues ✅        → image_generation_queue, video_generation_queue
   ├─ Edge Functions ✅     → process-image-generation, process-video-generation
   ├─ Google Gemini ✅      → Image generation (PNG, text-to-image, image-to-image)
   └─ Google Veo 3.1 ✅     → Video generation (MP4, 4-8s, 720p/1080p, with audio)
```

**Tech Stack:**
- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Supabase (Postgres + Realtime + Edge Functions + Storage)
- **AI Generation**: Google Gemini (images), Google Veo 3.1 Fast (videos)
- **Queue System**: PGMQ (Postgres Message Queue)
- **Figma Plugin**: esbuild, QuickJS-compatible architecture
- **Real-time**: Supabase Realtime (Phoenix Channels WebSocket protocol)

**Key Innovation:** Hybrid architecture bypasses QuickJS limitations - UI handles network operations, plugin manages canvas.

## 🚀 Quick Start

### Figma Plugin

```bash
cd figma-plugin
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Build plugin
npm run plugin:build && npm run ui:build
```

Then import `figma-plugin/manifest.json` in Figma Desktop App:
**Menu → Plugins → Development → Import plugin from manifest...**

**Environment Variables Required:**
- `VITE_SUPABASE_PROJECT_ID` - Your Supabase project ID
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon (public) key
- `VITE_DEFAULT_STORYBOARD_ID` - Default storyboard ID for testing

See [`figma-plugin/README.md`](./figma-plugin/README.md) for detailed setup instructions.

### Test It

1. Open plugin → Sync Storyboard
2. Change data in Supabase (Dashboard or REST API)
3. Watch instant updates in Figma

## 📖 Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Complete project documentation, architecture, and development guidelines
- **[Supabase Backend](./supabase/README.md)** - AI generation system (PGMQ, Edge Functions, Google Gemini/Veo)
- **[Figma Plugin README](./figma-plugin/README.md)** - Plugin setup, architecture details, and troubleshooting
- **[Implementation Plan](./docs/REALTIME_IMPLEMENTATION_PLAN.md)** - Real-time sync technical details

## 👨‍💻 Developer

**[Rustam Salavatov](https://rusty.superduperai.co/)** - CTO at [SuperDuperAI](https://superduperai.co)

10+ years building AI systems | Multi-agent orchestration | Generative AI (video, image, voice) | Full-stack development

## 🛠️ Project Structure

```
superstoryboard/
├── figma-plugin/           # Figma plugin with real-time sync ✅
│   ├── plugin/             # Plugin backend (QuickJS)
│   ├── ui/                 # React UI (browser)
│   └── README.md
├── supabase/               # Backend infrastructure ✅
│   ├── functions/          # Edge Functions (image/video generation)
│   ├── migrations/         # Database migrations
│   └── README.md           # Complete technical documentation
├── web-app/                # Web application (coming soon)
├── docs/                   # Documentation
├── CLAUDE.md               # Project guidelines
└── .mcp.json               # MCP server config (Supabase)
```

## 🎓 Technical Highlights

**Figma QuickJS Workaround**
QuickJS lacks WebSocket API and `fetch` with headers → Hybrid architecture: UI handles network, plugin manages canvas via `postMessage`

**Supabase Realtime**
Phoenix Channels with 30s heartbeat, object-based messages, scene diffing for change detection

## 📝 License

MIT © Rustam Salavatov

## 🙏 Acknowledgments

- [Supabase](https://supabase.com) for the amazing Hackathon and platform
- [figma-plugin-boilerplate](https://github.com/gnchrv/figma-plugin-boilerplate) by @gnchrv for the plugin foundation
- [SuperDuperAI](https://superduperai.co) for platform inspiration

---

**Built for Supabase Hackathon 2025** 🚀
