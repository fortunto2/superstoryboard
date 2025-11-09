# Schema v2+ Summary

## What's New

Расширение v2 схемы с минимальными изменениями:

### New Fields in Scene (top-level):
- `nextScenes?: string[]` - стрелки к другим сценам
- `characters?: string[]` - персонажи в сцене
- `actNumber?: number` - номер акта (1, 2, 3)
- `parentScene?: string` - родительская сцена (иерархия)
- `figmaNodeId?: string` - ID sticky note
- `figmaConnectorIds?: string[]` - IDs стрелок

### New Entity: Character
```typescript
interface Character {
  id: string;
  storyboardId: string;
  name: string;
  description: string;
  imageUrl?: string;
  color?: string;
  figmaNodeId?: string;
  position?: { x: number; y: number };
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
```

Storage key: `character:{storyboardId}:{id}`

### New Fields in StoryboardV2:
- `scenesFrameId?: string` - FigJam frame для сцен
- `charactersFrameId?: string` - FigJam frame для персонажей

## Database Changes

✅ Migration applied: `extend_schema_v2_plus_characters_connections`

RLS policy updated to allow `character:*` keys.

## Files Changed

✅ `plugin/types.ts` - updated with v2+ types
✅ Database migration applied
✅ Backward compatible with existing v2 data

## Next Implementation Steps

1. Update plugin to create FigJam connectors
2. Add character management in UI
3. Create frames for organization
4. Color scenes by act number

## Storage Examples

```
kv_store_7ee7668a:
- storyboard_v2:abc123
- scene:abc123:scene1 (with nextScenes, actNumber)
- scene:abc123:scene2
- character:abc123:char1 (NEW!)
- character:abc123:char2 (NEW!)
```
