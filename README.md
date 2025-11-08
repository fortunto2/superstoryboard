# SuperStoryboard

> **AI-Powered Storyboard Platform with Real-time Figma Sync**

[![Supabase Hackathon](https://img.shields.io/badge/Supabase-Hackathon_2025-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://hackathon.supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

Built for [Supabase Hackathon 2025](https://hackathon.supabase.com/) - A full-stack platform for creating professional video storyboards using AI-powered scene generation with real-time synchronization to Figma.

## 🎯 What is SuperStoryboard?

SuperStoryboard transforms natural language descriptions into professional video storyboards, enabling creators to visualize their stories before production. The platform bridges the gap between ideation and execution with AI-powered scene generation and real-time collaboration through Figma.

**Inspiration:** Based on concepts from [SuperDuperAI](https://superduperai.co)'s video creation platform, featuring multi-agent orchestration, character consistency (PersonaLock™-inspired), and automated production workflows.

## ✨ Features

### Currently Implemented

✅ **Figma Plugin with Real-time Sync** ([`/figma-plugin`](./figma-plugin))
- WebSocket-based real-time synchronization with Supabase Realtime
- Automatic scene INSERT/UPDATE/DELETE handling
- Hybrid architecture (UI handles networking, plugin handles canvas)
- Works in both Figma and FigJam
- 6.2kb plugin bundle (no external dependencies)
- Status indicators and toast notifications

**Technical Achievement:**
Overcame Figma's QuickJS runtime limitations (no WebSocket API, no fetch with custom headers) by implementing a hybrid architecture where the React UI (browser environment) handles all network operations and communicates with the plugin via `postMessage`.

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
└─ Supabase Backend ✅      → Database, REST API, Realtime
```

**Tech Stack:**
- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Supabase (Postgres + Realtime + REST API)
- **Figma Plugin**: esbuild, QuickJS-compatible architecture
- **Real-time**: Supabase Realtime (Phoenix Channels WebSocket protocol)

**Key Innovation:**
The Figma plugin uses a unique hybrid architecture to work around QuickJS limitations. All HTTP requests and WebSocket connections run in the browser-based UI, while the plugin code only manages Figma canvas operations. This results in a tiny 6.2kb plugin that's fully compatible with Figma's restricted runtime environment.

## 🚀 Quick Start

### Figma Plugin

```bash
cd figma-plugin
npm install
npm run plugin:build && npm run ui:build
```

Then import `figma-plugin/manifest.json` in Figma Desktop App:
**Menu → Plugins → Development → Import plugin from manifest...**

See [`figma-plugin/README.md`](./figma-plugin/README.md) for detailed setup instructions.

### Testing Real-time Sync

1. Open the Figma plugin
2. Enter your Supabase credentials
3. Click "Sync Storyboard"
4. Open Supabase Dashboard or use REST API to add/edit/delete scenes
5. Watch changes appear instantly in Figma canvas

## 📖 Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Complete project documentation, architecture, and development guidelines
- **[Figma Plugin README](./figma-plugin/README.md)** - Plugin setup, architecture details, and troubleshooting
- **[Implementation Plan](./docs/REALTIME_IMPLEMENTATION_PLAN.md)** - Real-time sync technical details

## 👨‍💻 Developer

**[Rustam Salavatov](https://rusty.superduperai.co/)** ([@rustysalavatov](https://github.com/rustysalavatov))

CTO & AI Engineer at [SuperDuperAI](https://superduperai.co) - Building multi-agent AI systems for creative video production.

**Expertise:**
- Multi-agent AI orchestration
- Generative AI (video, image, voice synthesis)
- RAG systems and LLM operations
- Full-stack development (Python, Node.js, React)
- DevOps & cloud infrastructure (AWS, GCP, Azure)

**Background:**
10+ years building AI systems with previous leadership roles at Zenpulsar (AI financial agents), LIFE2FILM (1M+ users, ML-powered video analysis), and Insense (computer vision). Created SuperDuperAI platform featuring AI-powered video creation with character consistency, automated editing, and multi-agent production workflows.

🔗 **Connect:**
- Website: [rusty.superduperai.co](https://rusty.superduperai.co/)
- SuperDuperAI: [superduperai.co](https://superduperai.co)
- YouTube: AI tools & image generation tutorials

## 🛠️ Project Structure

```
superstoryboard/
├── figma-plugin/           # Figma plugin with real-time sync ✅
│   ├── plugin/             # Plugin backend (QuickJS)
│   ├── ui/                 # React UI (browser)
│   └── README.md
├── web-app/                # Web application (coming soon)
├── docs/                   # Documentation
├── CLAUDE.md               # Project guidelines
└── .mcp.json               # MCP server config (Supabase)
```

## 🎓 Key Learnings

### Figma Plugin Development

**Challenge:** Figma plugins run in QuickJS (not V8), which lacks:
- WebSocket API
- `fetch` with custom headers
- Modern JavaScript features
- External SDK compatibility (e.g., Supabase SDK)

**Solution:** Hybrid architecture
- UI (React/browser): Handles all HTTP + WebSocket operations
- Plugin (QuickJS): Only manages Figma canvas
- Communication: `postMessage` protocol
- **Result:** 6.2kb plugin, 100% reliable, fully compatible

### Supabase Realtime

Successfully implemented Phoenix Channels WebSocket protocol with:
- Object-based message format (not array-based)
- 30-second heartbeat for connection stability
- Scene diffing algorithm for change detection
- Proper error handling and reconnection logic

## 📝 License

MIT © Rustam Salavatov

## 🙏 Acknowledgments

- [Supabase](https://supabase.com) for the amazing Hackathon and platform
- [figma-plugin-boilerplate](https://github.com/gnchrv/figma-plugin-boilerplate) by @gnchrv for the plugin foundation
- [SuperDuperAI](https://superduperai.co) for platform inspiration

---

**Built for Supabase Hackathon 2025** 🚀
