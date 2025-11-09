// SuperStoryboard Figma Plugin - Real-time Sync
/// <reference types="@figma/plugin-typings" />

import { Scene, StoryboardV2 } from './types';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[SuperStoryboard]', ...args);
  }
}

// ============================================================================
// SCENE MANAGER
// ============================================================================

class SceneManager {
  private sceneNodeMap: Map<string, SceneNode>;
  private scenesFrame: FrameNode | null = null;

  constructor() {
    this.sceneNodeMap = new Map();
  }

  createScenesFrame(): FrameNode {
    log('Creating main scenes frame...');

    const frame = figma.createFrame();
    frame.name = '📝 SCENES';
    frame.x = 50;
    frame.y = 50;
    frame.resize(3000, 800);
    frame.fills = []; // Transparent background

    figma.currentPage.appendChild(frame);
    this.scenesFrame = frame;

    log('Main scenes frame created');
    return frame;
  }

  async createScene(scene: Scene): Promise<void> {
    log('Creating scene:', scene.id);

    try {
      const isFigJam = figma.editorType === 'figjam';
      let node: SceneNode;

      if (isFigJam) {
        // Create sticky note in FigJam
        node = figma.createSticky();
        node.text.characters = this.formatSceneText(scene);
        node.x = (scene.sceneNumber - 1) * 300;
        node.y = 100;

        // Set random gradient color (HSL)
        const hue = (scene.sceneNumber * 137.508) % 360; // Golden angle for distribution
        const color = this.hslToRgb(hue, 0.7, 0.75);
        node.fills = [{
          type: 'SOLID',
          color: color
        }];

        // Add to scenes frame if it exists
        if (this.scenesFrame) {
          this.scenesFrame.appendChild(node);
        } else {
          figma.currentPage.appendChild(node);
        }
      } else {
        // Create frame in Figma (fonts already loaded)
        const frame = figma.createFrame();
        frame.name = `Scene ${scene.sceneNumber}: ${scene.shotType}`;
        frame.resize(250, 350);
        frame.x = (scene.sceneNumber - 1) * 300;
        frame.y = 100;

        // Add text (Inter Regular already loaded)
        const text = figma.createText();
        text.characters = this.formatSceneText(scene);
        text.fontSize = 12;
        text.x = 10;
        text.y = 10;
        text.resize(230, text.height);

        frame.appendChild(text);
        node = frame;
      }

      // Store node reference
      this.sceneNodeMap.set(scene.id, node);
      log('Scene created successfully:', scene.id);

    } catch (error) {
      log('Error creating scene:', error);
      throw error;
    }
  }

  async updateScene(scene: Scene): Promise<void> {
    log('Updating scene:', scene.id);

    const node = this.sceneNodeMap.get(scene.id);
    if (!node) {
      log('Scene node not found, creating new one');
      await this.createScene(scene);
      return;
    }

    try {
      const isFigJam = figma.editorType === 'figjam';
      const formattedText = this.formatSceneText(scene);

      if (isFigJam && node.type === 'STICKY') {
        node.text.characters = formattedText;
      } else if (node.type === 'FRAME') {
        // Update frame name
        node.name = `Scene ${scene.sceneNumber}: ${scene.shotType}`;

        // Find and update text node
        const textNode = node.findChild((child) => child.type === 'TEXT') as TextNode;
        if (textNode) {
          await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
          textNode.characters = formattedText;
        }
      }

      log('Scene updated successfully:', scene.id);

    } catch (error) {
      log('Error updating scene:', error);
      throw error;
    }
  }

  deleteScene(sceneId: string): void {
    log('Deleting scene:', sceneId);

    const node = this.sceneNodeMap.get(sceneId);
    if (!node) {
      log('Scene node not found');
      return;
    }

    try {
      node.remove();
      this.sceneNodeMap.delete(sceneId);
      log('Scene deleted successfully:', sceneId);
    } catch (error) {
      log('Error deleting scene:', error);
      throw error;
    }
  }

  createConnectors(scenes: Scene[]): void {
    log('Creating connectors for scenes...');

    // Only create connectors in FigJam
    if (figma.editorType !== 'figjam') {
      log('Skipping connectors - not in FigJam');
      return;
    }

    for (const scene of scenes) {
      // Skip if no connections defined
      if (!scene.nextScenes || scene.nextScenes.length === 0) {
        continue;
      }

      const currentNode = this.sceneNodeMap.get(scene.id);
      if (!currentNode) {
        log('Warning: Node not found for scene', scene.id);
        continue;
      }

      // Create connector to each next scene
      for (const nextSceneId of scene.nextScenes) {
        const nextNode = this.sceneNodeMap.get(nextSceneId);

        if (!nextNode) {
          log('Warning: Next scene node not found:', nextSceneId);
          continue;
        }

        try {
          const connector = figma.createConnector();
          connector.strokeWeight = 4;

          connector.connectorStart = {
            endpointNodeId: currentNode.id,
            magnet: 'AUTO'
          };

          connector.connectorEnd = {
            endpointNodeId: nextNode.id,
            magnet: 'AUTO'
          };

          log(`Created connector: ${scene.id} → ${nextSceneId}`);
        } catch (error) {
          log('Error creating connector:', error);
        }
      }
    }

    log('Connectors creation complete');
  }

  private formatSceneText(scene: Scene): string {
    // Better formatting with clear sections
    let text = `━━━━ SCENE ${scene.sceneNumber} ━━━━\n`;
    text += `${scene.shotType.toUpperCase()}\n\n`;
    text += `${scene.description}\n`;

    if (scene.dialogue) {
      text += `\n💬 "${scene.dialogue}"\n`;
    }

    if (scene.notes) {
      text += `\n📝 ${scene.notes}\n`;
    }

    text += `\n⏱️ ${scene.duration}`;

    return text;
  }

  private hslToRgb(h: number, s: number, l: number): RGB {
    // Convert HSL to RGB for Figma fills
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;

    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) {
      r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
      r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
      r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
      r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
      r = x; g = 0; b = c;
    } else if (h >= 300 && h < 360) {
      r = c; g = 0; b = x;
    }

    return {
      r: r + m,
      g: g + m,
      b: b + m
    };
  }

  clear(): void {
    for (const [sceneId, node] of this.sceneNodeMap) {
      try {
        node.remove();
      } catch (error) {
        log('Error removing node:', sceneId, error);
      }
    }
    this.sceneNodeMap.clear();

    // Remove scenes frame
    if (this.scenesFrame) {
      try {
        this.scenesFrame.remove();
      } catch (error) {
        log('Error removing scenes frame:', error);
      }
      this.scenesFrame = null;
    }
  }
}

// ============================================================================
// MAIN PLUGIN LOGIC
// ============================================================================

const sceneManager = new SceneManager();

figma.showUI(__html__, { width: 400, height: 500 });

figma.ui.onmessage = async (msg) => {
  log('Received message from UI:', msg.type);

  if (msg.type === 'load-credentials') {
    try {
      const savedProjectId = await figma.clientStorage.getAsync('supabase_project_id');
      const savedAnonKey = await figma.clientStorage.getAsync('supabase_anon_key');
      const savedStoryboardId = await figma.clientStorage.getAsync('default_storyboard_id');

      log('Loaded saved credentials from clientStorage');
      figma.ui.postMessage({
        type: 'credentials-loaded',
        projectId: savedProjectId || '',
        anonKey: savedAnonKey || '',
        storyboardId: savedStoryboardId || ''
      });
    } catch (error) {
      log('Error loading credentials:', error);
    }
    return;
  }

  if (msg.type === 'sync-storyboard') {
    try {
      const storyboardId = msg.storyboardId.trim();

      log('Starting sync...', { storyboardId });

      // Clear existing scenes
      sceneManager.clear();

      // Check if scenes array was passed from UI
      if (!msg.scenes || !Array.isArray(msg.scenes)) {
        throw new Error('No scenes array received from UI');
      }

      const scenes: Scene[] = msg.scenes;
      log('Received scenes from UI:', scenes.length);

      // Load fonts once before creating scenes
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
      log('Fonts loaded successfully');

      // Create main scenes frame (FigJam only)
      if (figma.editorType === 'figjam') {
        sceneManager.createScenesFrame();
      }

      // Create initial scenes
      for (const scene of scenes) {
        await sceneManager.createScene(scene);
      }

      // Create connectors between scenes (FigJam only)
      sceneManager.createConnectors(scenes);

      figma.ui.postMessage({
        type: 'sync-complete',
        sceneCount: scenes.length
      });

      // Realtime connection is handled by UI (WebSocket from browser)
      log('Initial sync complete, waiting for realtime updates from UI...');

    } catch (error: any) {
      log('Sync error:', error);
      figma.ui.postMessage({
        type: 'sync-error',
        message: error.message || 'Unknown error'
      });
      figma.ui.postMessage({
        type: 'realtime-status',
        status: 'error'
      });
    }
  }

  if (msg.type === 'scene-inserted') {
    log('Scene inserted from UI:', msg.scene);
    await sceneManager.createScene(msg.scene);
  }

  if (msg.type === 'scene-updated') {
    log('Scene updated from UI:', msg.scene);
    await sceneManager.updateScene(msg.scene);
  }

  if (msg.type === 'scene-deleted') {
    log('Scene deleted from UI:', msg.sceneId);
    sceneManager.deleteScene(msg.sceneId);
  }

  if (msg.type === 'save-credentials') {
    log('Saving credentials to clientStorage...');
    try {
      await figma.clientStorage.setAsync('supabase_project_id', msg.projectId);
      await figma.clientStorage.setAsync('supabase_anon_key', msg.anonKey);
      await figma.clientStorage.setAsync('default_storyboard_id', msg.storyboardId || '');

      figma.ui.postMessage({
        type: 'credentials-saved',
        success: true
      });
      log('Credentials saved successfully');
    } catch (error: any) {
      log('Error saving credentials:', error);
      figma.ui.postMessage({
        type: 'credentials-saved',
        success: false,
        error: error.message || 'Unknown error'
      });
    }
  }

  if (msg.type === 'clear-credentials') {
    log('Clearing credentials from clientStorage...');
    try {
      await figma.clientStorage.deleteAsync('supabase_project_id');
      await figma.clientStorage.deleteAsync('supabase_anon_key');
      await figma.clientStorage.deleteAsync('default_storyboard_id');

      figma.ui.postMessage({
        type: 'credentials-cleared',
        success: true
      });
      log('Credentials cleared successfully');
    } catch (error: any) {
      log('Error clearing credentials:', error);
      figma.ui.postMessage({
        type: 'credentials-cleared',
        success: false,
        error: error.message || 'Unknown error'
      });
    }
  }

  if (msg.type === 'cancel') {
    log('Canceling...');
    sceneManager.clear();
    figma.closePlugin();
  }
};
