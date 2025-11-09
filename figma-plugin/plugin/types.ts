/**
 * Shared type definitions for SuperStoryboard Figma Plugin
 *
 * IMPORTANT: These are simple TypeScript interfaces for QuickJS compatibility.
 * No Zod validation, no advanced features, ES2015 compatible only.
 *
 * Schema v2+: Extended with Characters and Connections
 * - Backward compatible with v2
 * - Adds Character entity
 * - Adds connection fields to Scene (nextScenes, characters, actNumber)
 */

/**
 * Represents a single scene in a storyboard
 * v2+ extended: connections on top level
 */
export interface Scene {
  /** Unique identifier for the scene */
  id: string;

  /** ID of the parent storyboard */
  storyboardId: string;

  /** Sequential scene number (1, 2, 3, etc.) */
  sceneNumber: number;

  /** Type of shot (Wide, Medium, Close-up, etc.) */
  shotType: string;

  /** Visual description of the scene */
  description: string;

  /** Character dialogue in the scene */
  dialogue: string;

  /** Director/production notes */
  notes: string;

  /** URL to scene image/screenshot */
  imageUrl: string;

  /** UUID reference to media entity (v3+) */
  mediaId?: string;

  /** Duration of the scene (e.g., "3s", "5s") */
  duration: string;

  // ============ v2+ NEW FIELDS ============

  /** IDs of scenes this scene connects to (for storyflow arrows) */
  nextScenes?: string[];

  /** IDs of characters appearing in this scene */
  characters?: string[];

  /** ID of parent scene (for hierarchical structure) */
  parentScene?: string;

  /** Act number (1, 2, 3, etc.) */
  actNumber?: number;

  /** Sticky note color in hex format (e.g., "#FF6B35" or "orange") */
  color?: string;

  /** FigJam sticky note node ID */
  figmaNodeId?: string;

  /** FigJam connector IDs created for this scene */
  figmaConnectorIds?: string[];

  // ============================================

  /** Additional metadata (AI generation params, context, etc.) */
  metadata: Record<string, unknown>;

  /** ISO 8601 timestamp when scene was created */
  createdAt: string;

  /** ISO 8601 timestamp when scene was last updated */
  updatedAt: string;
}

/**
 * Act structure for organizing scenes (v3)
 */
export interface Act {
  /** Act number (1, 2, 3) */
  number: number;

  /** Act name (e.g., "Setup", "Confrontation", "Resolution") */
  name: string;

  /** Act description */
  description?: string;

  /** Color for visualization in FigJam */
  color?: string;

  /** Scene range in this act [start, end] */
  sceneRange?: [number, number];
}

/**
 * Character entity (NEW in v2+)
 * Represents a character/persona in the storyboard
 */
export interface Character {
  /** Unique identifier for the character */
  id: string;

  /** ID of the parent storyboard */
  storyboardId: string;

  /** Character name (e.g., "Hero", "Villain") */
  name: string;

  /** Character description (appearance, personality, etc.) */
  description: string;

  /** Reference image URL for visual consistency */
  imageUrl?: string;

  /** FigJam sticky note color (default: blue) */
  color?: string;

  /** FigJam sticky note node ID */
  figmaNodeId?: string;

  /** Position in FigJam canvas */
  position?: {
    x: number;
    y: number;
  };

  /** Additional metadata */
  metadata: Record<string, unknown>;

  /** ISO 8601 timestamp when character was created */
  createdAt: string;

  /** ISO 8601 timestamp when character was last updated */
  updatedAt: string;
}

/**
 * Storyboard metadata with act structure (v3)
 */
export interface StoryboardMetadata {
  /** Act structure for organizing scenes */
  acts?: Act[];

  /** Genre (e.g., "action", "drama", "comedy") */
  genre?: string;

  /** Target duration (e.g., "90 minutes", "30 seconds") */
  targetDuration?: string;

  /** Additional custom metadata */
  [key: string]: unknown;
}

/**
 * Represents a complete storyboard with all scenes
 * v2+ extended: FigJam frame organization
 * v3 extended: Act structure
 */
export interface StoryboardV2 {
  /** Unique identifier for the storyboard */
  id: string;

  /** Storyboard name/title */
  name: string;

  // ============ v2+ NEW FIELDS ============

  /** FigJam frame ID for all scenes */
  scenesFrameId?: string;

  /** FigJam frame ID for all characters */
  charactersFrameId?: string;

  // ============================================

  /** Storyboard metadata (project settings, acts, style, etc.) */
  metadata: StoryboardMetadata;

  /** ISO 8601 timestamp when storyboard was created */
  createdAt: string;

  /** ISO 8601 timestamp when storyboard was last updated */
  updatedAt: string;

  /** Array of scenes in this storyboard (optional for flexibility) */
  scenes?: Scene[];
}

/**
 * Legacy type alias for backward compatibility
 * @deprecated Use Scene instead
 */
export type StoryboardScene = Scene;

/**
 * Legacy type alias for backward compatibility
 * @deprecated Use StoryboardV2 instead
 */
export interface StoryboardData {
  id: string;
  name: string;
  scenes: Scene[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Figma context types for AI agent
 */

export interface ScreenshotContext {
  nodeId: string;
  nodeName: string;
  imageData: number[];
  width: number;
  height: number;
}

export interface NodeMetadata {
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

export interface PageContext {
  pageName: string;
  totalNodes: number;
  nodeTypes: Record<string, number>;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface FigmaContext {
  screenshots: ScreenshotContext[];
  metadata: NodeMetadata[];
  textContent: string[];
  pageContext?: PageContext;
}

/**
 * Message types for UI ↔ Plugin communication
 */

export type MessageType =
  | 'sync-storyboard'
  | 'scene-inserted'
  | 'scene-updated'
  | 'scene-deleted'
  | 'character-inserted'      // NEW in v2+
  | 'character-updated'       // NEW in v2+
  | 'character-deleted'       // NEW in v2+
  | 'extract-context'
  | 'context-extracted'
  | 'generate-storyboard'
  | 'cancel'
  | 'realtime-status'
  | 'sync-complete'
  | 'sync-error'
  | 'realtime-error'
  | 'load-credentials'
  | 'credentials-loaded'
  | 'save-credentials'
  | 'credentials-saved'
  | 'clear-credentials'
  | 'credentials-cleared'
  | 'selection-changed'
  | 'insert-generated-media'  // NEW: Insert standalone generated image/video
  | 'media-inserted';         // NEW: Confirmation that media was inserted

export interface PluginMessage {
  type: MessageType;
  [key: string]: unknown;
}