/**
 * Shared type definitions for SuperStoryboard Figma Plugin
 *
 * IMPORTANT: These are simple TypeScript interfaces for QuickJS compatibility.
 * No Zod validation, no advanced features, ES2015 compatible only.
 *
 * These types match the Zod schemas used by the Python backend and API v2,
 * but are implemented as plain interfaces for Figma's QuickJS runtime.
 */

/**
 * Represents a single scene in a storyboard
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

  /** Duration of the scene (e.g., "3s", "5s") */
  duration: string;

  /** Additional metadata (AI generation params, context, etc.) */
  metadata: Record<string, any>;

  /** ISO 8601 timestamp when scene was created */
  createdAt: string;

  /** ISO 8601 timestamp when scene was last updated */
  updatedAt: string;
}

/**
 * Represents a complete storyboard with all scenes
 */
export interface StoryboardV2 {
  /** Unique identifier for the storyboard */
  id: string;

  /** Storyboard name/title */
  name: string;

  /** Additional storyboard metadata (project settings, style, etc.) */
  metadata: Record<string, any>;

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
  | 'extract-context'
  | 'context-extracted'
  | 'generate-storyboard'
  | 'cancel'
  | 'realtime-status'
  | 'sync-complete'
  | 'sync-error'
  | 'realtime-error';

export interface PluginMessage {
  type: MessageType;
  [key: string]: any;
}
