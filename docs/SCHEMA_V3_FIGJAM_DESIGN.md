# Schema v3: FigJam Storyboard Structure

## Overview

Расширенная схема для FigJam с актами, персонажами, связями и soft delete.

## Entities

### 1. Storyboard v3

```typescript
interface StoryboardV3 {
  id: string;                    // "storyboard_v3:abc123"
  name: string;
  description?: string;

  // FigJam структура
  figmaFileKey?: string;         // Для сохранения связи с файлом
  figmaNodeId?: string;          // Root frame в FigJam

  // Фреймы для организации (контекст для AI)
  scenesFrameId?: string;        // FigJam frame для всех сцен
  charactersFrameId?: string;    // FigJam frame для всех персонажей

  metadata: {
    acts: Act[];                 // Структура актов
    genre?: string;
    targetDuration?: string;     // "90 minutes", "30 seconds" etc
  };

  createdAt: string;
  updatedAt: string;
}

interface Act {
  number: number;                // 1, 2, 3
  name: string;                  // "Setup", "Confrontation", "Resolution"
  description?: string;
  color?: string;                // Цвет для визуализации в FigJam
  sceneRange?: [number, number]; // [1, 5] - сцены с 1 по 5 в этом акте
}
```

**Storage key:** `storyboard_v3:{id}`

---

### 2. Scene v3 (с актами и soft delete)

```typescript
interface SceneV3 {
  id: string;                    // "scene_abc123"
  storyboardId: string;
  sceneNumber: number;

  // Основные данные
  shotType: string;              // "wide", "close-up", "medium"
  description: string;
  dialogue?: string;
  notes?: string;
  duration: string;

  // FigJam интеграция
  figmaNodeId?: string;          // ID sticky note в FigJam
  color?: string;                // Цвет sticky note (по умолчанию желтый)
  position?: { x: number; y: number };

  // Новое: Акт
  actNumber?: number;            // 1, 2, или 3

  // Новое: Soft delete
  deleted: boolean;              // true = помечена удаленной
  deletedAt?: string;            // Когда удалена

  // Генерация
  imageUrl?: string;
  imagePrompt?: string;          // AI prompt для генерации
  generatedAt?: string;

  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
```

**Storage key:** `scene:{storyboardId}:{sceneId}`

---

### 3. Character (Персонажи) - НОВАЯ СУЩНОСТЬ

```typescript
interface Character {
  id: string;                    // "char_xyz789"
  storyboardId: string;

  // Основные данные
  name: string;                  // "Hero", "Villain", "Elder"
  role: string;                  // "protagonist", "antagonist", "supporting"
  description: string;           // Внешний вид, характер

  // Визуальная референс
  imageUrl?: string;             // Референс изображение
  imagePrompt?: string;          // AI prompt для генерации персонажа

  // FigJam интеграция
  figmaNodeId?: string;          // ID sticky note в FigJam
  color: string;                 // Цвет карточки (синий по умолчанию)
  position?: { x: number; y: number };

  // PersonaLock-inspired consistency
  visualTraits: {
    appearance: string;          // "tall, silver armor, red cape"
    style: string;               // "anime", "realistic", "comic"
    keyFeatures: string[];       // ["brown hair", "scar on left cheek"]
  };

  // Связи
  appearingInScenes: string[];   // [sceneId1, sceneId2] - в каких сценах появляется

  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
```

**Storage key:** `character:{storyboardId}:{characterId}`

---

### 4. Connection (Связи/Стрелки) - НОВАЯ СУЩНОСТЬ

```typescript
interface Connection {
  id: string;                    // "conn_123"
  storyboardId: string;

  // Связь между узлами
  sourceType: 'scene' | 'character';
  sourceId: string;

  targetType: 'scene' | 'character';
  targetId: string;

  // Тип связи
  connectionType:
    | 'storyflow'                // Scene → Scene (последовательность)
    | 'appears_in'               // Character → Scene (персонаж в сцене)
    | 'interacts_with'           // Character → Character (взаимодействие)
    | 'parallel'                 // Scene ↔ Scene (параллельные события)
    | 'flashback'                // Scene → Scene (флешбек)
    | 'reference';               // Любая кастомная связь

  // FigJam интеграция
  figmaConnectorId?: string;     // ID connector в FigJam

  label?: string;                // Текст на стрелке
  metadata: Record<string, any>;

  createdAt: string;
  updatedAt: string;
}
```

**Storage key:** `connection:{storyboardId}:{connectionId}`

---

## Storage Structure

```
kv_store_7ee7668a table:

key                                    | value
---------------------------------------|------------------
storyboard_v3:abc123                   | StoryboardV3 JSON
scene:abc123:scene1                    | SceneV3 JSON
scene:abc123:scene2                    | SceneV3 JSON (deleted: true)
character:abc123:char1                 | Character JSON
character:abc123:char2                 | Character JSON
connection:abc123:conn1                | Connection JSON
connection:abc123:conn2                | Connection JSON
```

---

## FigJam Visual Design

### Цветовая схема

```
┌─────────────────────────────────────────────────┐
│  SCENES FRAME                                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ Scene 1 │→ │ Scene 2 │→ │ Scene 3 │         │
│  │ Yellow  │  │ Yellow  │  │ Red     │         │
│  │ Act 1   │  │ Act 1   │  │ (deleted)        │
│  └────┬────┘  └─────────┘  └─────────┘         │
│       │                                          │
│       ↓                                          │
└───────┼──────────────────────────────────────────┘
        │
┌───────┼──────────────────────────────────────────┐
│  CHARACTERS FRAME           │                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │  Hero   │  │ Villain │  │  Elder  │          │
│  │  Blue   │  │  Blue   │  │  Blue   │          │
│  │ appears │  │ appears │  │ appears │          │
│  │ in: 1,2 │  │ in: 2,3 │  │ in: 1   │          │
│  └─────────┘  └─────────┘  └─────────┘          │
└──────────────────────────────────────────────────┘
```

**Цвета:**
- 🟨 **Yellow** - Обычные сцены
- 🟦 **Blue** - Персонажи
- 🟧 **Orange** - Act 1 scenes
- 🟩 **Green** - Act 2 scenes
- 🟪 **Purple** - Act 3 scenes
- 🟥 **Red** - Deleted scenes (soft delete)

**Стрелки (Connectors):**
- **Solid arrow** → Storyflow (последовательность сцен)
- **Dashed arrow** ↔ Character appears in Scene
- **Dotted arrow** ⟿ Flashback/Reference

---

## Queries

### Get all active scenes for storyboard
```sql
SELECT * FROM kv_store_7ee7668a
WHERE key LIKE 'scene:{storyboardId}:%'
AND value->>'deleted' = 'false';
```

### Get all characters
```sql
SELECT * FROM kv_store_7ee7668a
WHERE key LIKE 'character:{storyboardId}:%';
```

### Get all connections
```sql
SELECT * FROM kv_store_7ee7668a
WHERE key LIKE 'connection:{storyboardId}:%';
```

### Get scenes by act
```sql
SELECT * FROM kv_store_7ee7668a
WHERE key LIKE 'scene:{storyboardId}:%'
AND value->>'actNumber' = '1'
AND value->>'deleted' = 'false';
```

---

## Migration Path: v2 → v3

**Option 1: Additive (recommended for prototype)**
- Keep v2 schema working
- Add v3 as new keys (`storyboard_v3:*`)
- Migrate manually or via script

**Option 2: In-place upgrade**
- Add new fields to existing `scene:*` records
- Set `deleted: false` for all existing scenes
- Create `character:*` and `connection:*` records

---

## AI Agent Context Structure

Когда AI агент генерирует storyboard, он получает:

```typescript
interface AIAgentContext {
  storyboard: StoryboardV3;
  scenes: SceneV3[];           // Только не удаленные
  characters: Character[];
  connections: Connection[];

  // Визуальная структура из FigJam
  figmaContext?: {
    scenesFrame: FigmaFrame;
    charactersFrame: FigmaFrame;
    layout: 'linear' | 'grid' | 'freeform';
  };
}
```

AI может:
1. Видеть существующих персонажей и их визуальные traits
2. Понимать структуру актов
3. Генерировать сцены с правильными персонажами
4. Создавать связи между сценами
5. Поддерживать визуальную консистентность (PersonaLock)

---

## Implementation Priority

### Phase 1: Core Extensions (Week 1)
- [ ] Add `deleted` field to Scene
- [ ] Add `actNumber` field to Scene
- [ ] Implement soft delete in UI/Plugin

### Phase 2: Characters (Week 2)
- [ ] Create Character entity
- [ ] Character sticky notes (blue color)
- [ ] Character frame in FigJam
- [ ] Link characters to scenes

### Phase 3: Connections (Week 3)
- [ ] Create Connection entity
- [ ] FigJam connectors for storyflow
- [ ] Character ↔ Scene connectors

### Phase 4: Acts (Week 4)
- [ ] Add Act structure to Storyboard
- [ ] Color-code scenes by act
- [ ] Act visualization in FigJam

### Phase 5: AI Integration (Week 5-6)
- [ ] Build AIAgentContext
- [ ] Character consistency (PersonaLock)
- [ ] Scene generation with context

---

## Example: Complete Storyboard

```json
{
  "storyboard": {
    "id": "story_abc",
    "name": "Dragon Quest",
    "metadata": {
      "acts": [
        { "number": 1, "name": "Setup", "sceneRange": [1, 3] },
        { "number": 2, "name": "Confrontation", "sceneRange": [4, 6] },
        { "number": 3, "name": "Resolution", "sceneRange": [7, 9] }
      ]
    }
  },
  "scenes": [
    {
      "id": "scene1",
      "sceneNumber": 1,
      "actNumber": 1,
      "description": "Hero enters dark forest",
      "deleted": false
    }
  ],
  "characters": [
    {
      "id": "char1",
      "name": "Hero",
      "role": "protagonist",
      "visualTraits": {
        "appearance": "tall warrior, silver armor, red cape",
        "style": "anime"
      },
      "appearingInScenes": ["scene1", "scene2", "scene3"]
    }
  ],
  "connections": [
    {
      "id": "conn1",
      "sourceType": "scene",
      "sourceId": "scene1",
      "targetType": "scene",
      "targetId": "scene2",
      "connectionType": "storyflow"
    },
    {
      "id": "conn2",
      "sourceType": "character",
      "sourceId": "char1",
      "targetType": "scene",
      "targetId": "scene1",
      "connectionType": "appears_in"
    }
  ]
}
```

---

## Questions to Decide

1. **Soft delete UI**: Показывать удаленные сцены серым или вообще скрывать?
2. **Act colors**: Автоматически красить сцены по акту или вручную?
3. **Character images**: Генерировать сразу или по запросу?
4. **Connections**: Создавать вручную в FigJam или автоматически?
5. **Migration**: v2 → v3 делать сразу или постепенно?

---

## Next Steps

Что делать первым делом?
1. Добавить `deleted` и `actNumber` в Scene?
2. Создать Character entity?
3. Или сначала доработать текущий v2 sync?

Ты решаешь приоритеты! 🎬
