/**
 * Extended types for v2+ (Characters + Connections)
 * 
 * Backward compatible with v2, adds new fields and entities
 */

/**
 * Scene with connections (v2+ extended)
 */
export interface Scene {
  id: string;
  storyboardId: string;
  sceneNumber: number;
  shotType: string;
  description: string;
  dialogue: string;
  notes: string;
  imageUrl: string;
  duration: string;

  // NEW: Connection fields (top-level, not metadata)
  nextScenes?: string[];        // IDs of scenes this connects to
  characters?: string[];        // IDs of characters in this scene
  parentScene?: string;         // Parent scene ID (for hierarchy)
  actNumber?: number;           // Act number (1, 2, 3)

  // FigJam integration
  figmaNodeId?: string;         // Sticky note ID in FigJam
  figmaConnectorIds?: string[]; // Connector IDs for this scene

  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Character entity (NEW in v2+)
 */
export interface Character {
  id: string;
  storyboardId: string;
  name: string;
  description: string;          // Appearance, personality

  // Visual reference
  imageUrl?: string;            // Reference image
  color?: string;               // FigJam sticky color (default: blue)

  // FigJam integration  
  figmaNodeId?: string;         // Sticky note ID in FigJam
  position?: { x: number; y: number };

  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Storyboard v2+
 */
export interface StoryboardV2 {
  id: string;
  name: string;

  // NEW: FigJam frame IDs for organization
  scenesFrameId?: string;       // Frame for all scenes
  charactersFrameId?: string;   // Frame for all characters

  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  scenes?: Scene[];
}

// Backward compatibility
export type StoryboardScene = Scene;
export interface StoryboardData {
  id: string;
  name: string;
  scenes: Scene[];
  createdAt: string;
  updatedAt: string;
}
