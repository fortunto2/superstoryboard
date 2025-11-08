// SuperStoryboard Figma Plugin - Real-time Sync
/// <reference types="@figma/plugin-typings" />

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[SuperStoryboard]', ...args);
  }
}

// ============================================================================
// INTERFACES
// ============================================================================

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

// ============================================================================
// SCENE MANAGER
// ============================================================================

class SceneManager {
  private sceneNodeMap: Map<string, SceneNode>;

  constructor() {
    this.sceneNodeMap = new Map();
  }

  async createScene(scene: StoryboardScene): Promise<void> {
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

  async updateScene(scene: StoryboardScene): Promise<void> {
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

  private formatSceneText(scene: StoryboardScene): string {
    return `Scene ${scene.sceneNumber}\n` +
           `Shot: ${scene.shotType}\n\n` +
           `${scene.description}\n\n` +
           (scene.dialogue ? `"${scene.dialogue}"\n\n` : '') +
           (scene.notes ? `Notes: ${scene.notes}\n\n` : '') +
           `Duration: ${scene.duration}`;
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
  }
}

// ============================================================================
// MAIN PLUGIN LOGIC
// ============================================================================

const sceneManager = new SceneManager();

figma.showUI(__html__, { width: 400, height: 500 });

figma.ui.onmessage = async (msg) => {
  log('Received message from UI:', msg.type);

  if (msg.type === 'sync-storyboard') {
    try {
      const storyboardId = msg.storyboardId.trim();

      log('Starting sync...', { storyboardId });

      // Clear existing scenes
      sceneManager.clear();

      // Check if storyboard data was passed from UI
      if (!msg.storyboardData) {
        throw new Error('No storyboard data received from UI');
      }

      const storyboardData: StoryboardData = msg.storyboardData;
      log('Received storyboard from UI:', storyboardData);

      // Load fonts once before creating scenes
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
      log('Fonts loaded successfully');

      // Create initial scenes
      for (const scene of storyboardData.scenes) {
        await sceneManager.createScene(scene);
      }

      figma.ui.postMessage({
        type: 'sync-complete',
        sceneCount: storyboardData.scenes.length
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

  if (msg.type === 'cancel') {
    log('Canceling...');
    sceneManager.clear();
    figma.closePlugin();
  }
};
