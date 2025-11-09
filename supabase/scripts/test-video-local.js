#!/usr/bin/env node

/**
 * Local test script for video generation with Google GenAI
 * Run: node test-video-local.js
 */

import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("❌ GOOGLE_GENERATIVE_AI_API_KEY not found in environment");
  process.exit(1);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTextToVideo() {
  console.log("\n🎬 Testing Text-to-Video Generation...");

  try {
    // Initialize client
    const ai = new GoogleGenAI({
      vertexai: false,  // Use Gemini API directly
      apiKey: GEMINI_API_KEY
    });

    // Generate video from text prompt
    console.log("📝 Prompt: A lion walking majestically across the savanna at sunset");

    let operation = await ai.models.generateVideos({
      model: "veo-2.0-generate-001",
      prompt: "A lion walking majestically across the savanna at sunset",
      config: {
        numberOfVideos: 1
      }
    });

    console.log(`⏳ Generation started. Operation: ${operation.name || 'unnamed'}`);
    console.log("   Polling for completion (this may take a few minutes)...");

    // Poll until complete
    let attempts = 0;
    while (!operation.done && attempts < 36) { // Max 6 minutes
      await delay(10000); // Wait 10s
      operation = await ai.operations.get({ operation });
      attempts++;
      process.stdout.write(`   Attempt ${attempts}/36...\r`);
    }

    if (!operation.done) {
      throw new Error("Video generation timed out");
    }

    console.log("\n✅ Video generation completed!");

    // Get the generated video
    const videos = operation.response?.generatedVideos;
    if (!videos || videos.length === 0) {
      throw new Error("No videos in response");
    }

    const video = videos[0];
    console.log("📥 Downloading video...");

    // Download the video to local file
    const fileName = `test-video-${Date.now()}.mp4`;
    await ai.files.download({
      file: video,
      downloadPath: fileName
    });

    console.log(`✅ Video saved as: ${fileName}`);
    const stats = await fs.stat(fileName);
    console.log(`   File size: ${stats.size} bytes`);

    return fileName;

  } catch (error) {
    console.error("❌ Text-to-Video failed:", error);
    console.error("   Error details:", error.message);
    if (error.response) {
      console.error("   Response:", error.response);
    }
    throw error;
  }
}

async function testImageToVideo() {
  console.log("\n🎬 Testing Image-to-Video Generation...");

  try {
    // Initialize client
    const ai = new GoogleGenAI({
      vertexai: false,
      apiKey: GEMINI_API_KEY
    });

    // Use a test image URL (you can replace with your own)
    const imageUrl = "https://images.unsplash.com/photo-1517849845537-4d257902454a?w=800"; // Sample dog image
    console.log(`📸 Source image: ${imageUrl}`);
    console.log("📝 Prompt: Make the dog run and wag its tail happily");

    // Fetch the image
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const imageBase64 = Buffer.from(arrayBuffer).toString('base64');

    // Generate video from image - try different structure
    let operation = await ai.models.generateVideos({
      model: "veo-2.0-generate-001",
      source: {
        prompt: "Make the dog run and wag its tail happily",
        image: {
          bytesBase64Encoded: imageBase64,
          mimeType: 'image/jpeg'
        }
      },
      config: {
        numberOfVideos: 1
      }
    });

    console.log(`⏳ Generation started. Operation: ${operation.name || 'unnamed'}`);
    console.log("   Polling for completion (this may take a few minutes)...");

    // Poll until complete
    let attempts = 0;
    while (!operation.done && attempts < 36) {
      await delay(10000);
      operation = await ai.operations.get({ operation });
      attempts++;
      process.stdout.write(`   Attempt ${attempts}/36...\r`);
    }

    if (!operation.done) {
      throw new Error("Video generation timed out");
    }

    console.log("\n✅ Video generation completed!");

    // Get the generated video
    const videos = operation.response?.generatedVideos;
    if (!videos || videos.length === 0) {
      throw new Error("No videos in response");
    }

    const video = videos[0];
    console.log("📥 Downloading video...");

    // Download the video
    const fileName = `test-image-to-video-${Date.now()}.mp4`;
    await ai.files.download({
      file: video,
      downloadPath: fileName
    });

    console.log(`✅ Video saved as: ${fileName}`);
    const stats = await fs.stat(fileName);
    console.log(`   File size: ${stats.size} bytes`);

    return fileName;

  } catch (error) {
    console.error("❌ Image-to-Video failed:", error);
    console.error("   Error details:", error.message);
    if (error.response) {
      console.error("   Response:", error.response);
    }
    throw error;
  }
}

// Main execution
async function main() {
  console.log("🚀 Google GenAI Video Generation Test");
  console.log("=====================================");

  const mode = process.argv[2] || "text";

  try {
    if (mode === "text") {
      await testTextToVideo();
    } else if (mode === "image") {
      await testImageToVideo();
    } else if (mode === "both") {
      await testTextToVideo();
      await testImageToVideo();
    } else {
      console.log("Usage: node test-video-local.js [text|image|both]");
      console.log("  text  - Test text-to-video generation (default)");
      console.log("  image - Test image-to-video generation");
      console.log("  both  - Test both modes");
    }
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  }

  console.log("\n✅ All tests completed successfully!");
}

// Run the test
main().catch(console.error);