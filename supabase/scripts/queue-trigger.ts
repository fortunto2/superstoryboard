#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Queue Trigger Script - Enqueue AI generation jobs
 *
 * Usage:
 *   # Image generation
 *   deno run --allow-net --allow-env queue-trigger.ts image "A hero on a cliff"
 *
 *   # Video generation
 *   deno run --allow-net --allow-env queue-trigger.ts video "Lion walking" --duration=8
 *
 *   # Image editing (from existing image)
 *   deno run --allow-net --allow-env queue-trigger.ts image-edit "Add dramatic lighting" --source=https://...
 *
 *   # Batch image generation
 *   deno run --allow-net --allow-env queue-trigger.ts batch-images prompts.json
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Load from environment or .env file
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://imvfmhobawvpgcfsqhid.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

if (!SUPABASE_ANON_KEY) {
  console.error("❌ SUPABASE_ANON_KEY not set");
  console.log("Set it in environment or create .env file");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface ImageMessage {
  storyboardId: string;
  sceneId?: string;
  characterId?: string;
  prompt: string;
  sourceImageUrl?: string; // For image-to-image editing
  editMode?: boolean;
}

interface VideoMessage {
  storyboardId: string;
  sceneId?: string;
  prompt: string;
  sourceImageUrl?: string; // For image-to-video
  aspectRatio?: "16:9" | "9:16";
  durationSeconds?: "4" | "6" | "8";
  resolution?: "720p" | "1080p";
}

async function enqueueImage(message: ImageMessage): Promise<void> {
  console.log("📸 Enqueueing image generation job...");
  console.log("   Prompt:", message.prompt);
  if (message.sourceImageUrl) {
    console.log("   Source:", message.sourceImageUrl);
    console.log("   Mode: Edit");
  }
  if (message.sceneId) console.log("   Scene:", message.sceneId);
  if (message.characterId) console.log("   Character:", message.characterId);

  const { data, error } = await supabase.rpc("pgmq_send", {
    queue_name: "image_generation_queue",
    message: message,
  });

  if (error) {
    console.error("❌ Error:", error);
    throw error;
  }

  console.log("✅ Message enqueued with ID:", data);
}

async function enqueueVideo(message: VideoMessage): Promise<void> {
  console.log("🎬 Enqueueing video generation job...");
  console.log("   Prompt:", message.prompt);
  if (message.sourceImageUrl) {
    console.log("   Source:", message.sourceImageUrl);
    console.log("   Mode: Image-to-Video");
  }
  if (message.sceneId) console.log("   Scene:", message.sceneId);
  console.log("   Duration:", message.durationSeconds || "8", "seconds");
  console.log("   Resolution:", message.resolution || "720p");
  console.log("   Aspect:", message.aspectRatio || "16:9");

  const { data, error } = await supabase.rpc("pgmq_send", {
    queue_name: "video_generation_queue",
    message: message,
  });

  if (error) {
    console.error("❌ Error:", error);
    throw error;
  }

  console.log("✅ Message enqueued with ID:", data);
}

async function batchImages(prompts: string[]): Promise<void> {
  console.log(`📸 Enqueueing ${prompts.length} image generation jobs...`);

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    await enqueueImage({
      storyboardId: "test-batch-001",
      sceneId: `scene-${i + 1}`,
      prompt: prompt,
    });
    console.log(`   [${i + 1}/${prompts.length}] Enqueued`);
  }

  console.log("✅ All messages enqueued");
}

// Parse command line arguments
const args = Deno.args;

if (args.length === 0) {
  console.log(`
Queue Trigger Script - Enqueue AI generation jobs

Usage:
  deno run --allow-net --allow-env queue-trigger.ts <command> [options]

Commands:
  image <prompt>              Generate image from text
  video <prompt>              Generate video from text
  image-edit <prompt>         Edit existing image
  batch-images <file.json>    Batch generate images from JSON file

Options:
  --storyboard=<id>           Storyboard ID (default: test-storyboard-001)
  --scene=<id>                Scene ID
  --character=<id>            Character ID
  --source=<url>              Source image URL (for editing/image-to-video)
  --duration=<4|6|8>          Video duration in seconds (default: 8)
  --resolution=<720p|1080p>   Video resolution (default: 720p)
  --aspect=<16:9|9:16>        Video aspect ratio (default: 16:9)

Examples:
  # Generate 3 images
  deno run --allow-net --allow-env queue-trigger.ts image "A hero on a cliff"
  deno run --allow-net --allow-env queue-trigger.ts image "A dragon in flight" --scene=scene-002
  deno run --allow-net --allow-env queue-trigger.ts image "Ancient temple" --character=hero-001

  # Generate video
  deno run --allow-net --allow-env queue-trigger.ts video "Lion walking through savannah"

  # Edit image
  deno run --allow-net --allow-env queue-trigger.ts image-edit "Add dramatic sunset" --source=https://...

  # Batch images from JSON
  echo '["Hero on cliff", "Dragon flying", "Temple entrance"]' > prompts.json
  deno run --allow-net --allow-env queue-trigger.ts batch-images prompts.json
`);
  Deno.exit(0);
}

const command = args[0];
const prompt = args[1];

// Parse options
const options: Record<string, string> = {};
for (let i = 2; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith("--")) {
    const [key, value] = arg.substring(2).split("=");
    options[key] = value;
  }
}

const storyboardId = options.storyboard || "test-storyboard-001";
const sceneId = options.scene;
const characterId = options.character;
const sourceImageUrl = options.source;

try {
  switch (command) {
    case "image": {
      if (!prompt) {
        console.error("❌ Prompt required");
        Deno.exit(1);
      }
      await enqueueImage({
        storyboardId,
        sceneId,
        characterId,
        prompt,
      });
      break;
    }

    case "image-edit": {
      if (!prompt) {
        console.error("❌ Prompt required");
        Deno.exit(1);
      }
      if (!sourceImageUrl) {
        console.error("❌ --source required for image editing");
        Deno.exit(1);
      }
      await enqueueImage({
        storyboardId,
        sceneId,
        characterId,
        prompt,
        sourceImageUrl,
        editMode: true,
      });
      break;
    }

    case "video": {
      if (!prompt) {
        console.error("❌ Prompt required");
        Deno.exit(1);
      }
      await enqueueVideo({
        storyboardId,
        sceneId,
        prompt,
        sourceImageUrl,
        durationSeconds: (options.duration as "4" | "6" | "8") || "8",
        resolution: (options.resolution as "720p" | "1080p") || "720p",
        aspectRatio: (options.aspect as "16:9" | "9:16") || "16:9",
      });
      break;
    }

    case "batch-images": {
      if (!prompt) {
        console.error("❌ JSON file path required");
        Deno.exit(1);
      }
      const fileContent = await Deno.readTextFile(prompt);
      const prompts = JSON.parse(fileContent);
      if (!Array.isArray(prompts)) {
        console.error("❌ JSON file must contain array of prompts");
        Deno.exit(1);
      }
      await batchImages(prompts);
      break;
    }

    default:
      console.error("❌ Unknown command:", command);
      console.log("Run without arguments to see usage");
      Deno.exit(1);
  }
} catch (error) {
  console.error("❌ Error:", error.message);
  Deno.exit(1);
}
