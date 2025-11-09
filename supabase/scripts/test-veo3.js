#!/usr/bin/env node

/**
 * Test script for VEO 3.1 video generation via REST API
 */

const API_KEY = 'AIzaSyCmcc-№№№№№№№№№№№№№№№№№№№№№№№№№'; // Replace with your actual API key

async function generateVideo(prompt, options = {}) {
  console.log('🎬 Starting video generation with VEO 3.1...');
  console.log('📝 Prompt:', prompt);
  console.log('⚙️ Options:', options);

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY,
      },
      body: JSON.stringify({
        instances: [{
          prompt: prompt,
          ...(options.negativePrompt && {
            negativePrompt: options.negativePrompt,
          }),
        }],
        parameters: {
          aspectRatio: options.aspectRatio || '16:9',
          resolution: options.resolution || '720p',
          durationSeconds: Number.parseInt(options.duration || '8'),
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('❌ Error:', data);
    throw new Error(`Video generation failed: ${response.status}`);
  }

  console.log('✅ Operation started:', data.name);
  return data.name;
}

async function checkStatus(operationName) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
    {
      headers: {
        'x-goog-api-key': API_KEY,
      },
    }
  );

  const data = await response.json();
  return data;
}

async function waitForCompletion(operationName, maxAttempts = 60) {
  console.log('\n⏳ Waiting for video generation...');

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    const status = await checkStatus(operationName);

    if (status.done) {
      if (status.error) {
        console.error('❌ Generation failed:', status.error.message);
        return null;
      }

      // Try different paths where video URL might be
      const videoUrl =
        status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
        status.response?.generatedSamples?.[0]?.video?.uri ||
        status.response?.video?.uri ||
        status.response?.predictions?.[0]?.uri;

      if (videoUrl) {
        console.log('✅ Video completed!');
        console.log('📹 Video URL:', videoUrl);
        return videoUrl;
      } else {
        console.log('⚠️ Video completed but no URL found');
        console.log('Response structure:', JSON.stringify(status.response, null, 2));
        return null;
      }
    }

    process.stdout.write(`   Attempt ${i + 1}/${maxAttempts}...\r`);
  }

  console.log('\n⏱️ Timeout - video still processing');
  return null;
}

async function downloadVideo(videoUrl, filename) {
  console.log('\n📥 Downloading video...');

  const response = await fetch(videoUrl);
  const buffer = await response.arrayBuffer();

  // Use dynamic import for fs
  const { promises: fs } = await import('fs');

  await fs.writeFile(filename, Buffer.from(buffer));
  console.log(`✅ Video saved as: ${filename}`);

  const stats = await fs.stat(filename);
  console.log(`   File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

async function testTextToVideo() {
  console.log('\n🎬 Testing Text-to-Video with VEO 3.1');
  console.log('=====================================\n');

  try {
    // Generate video
    const operationName = await generateVideo(
      'A majestic lion walking across the African savanna at golden hour, cinematic quality',
      {
        duration: '4',
        aspectRatio: '16:9',
        resolution: '720p'
      }
    );

    // Wait for completion
    const videoUrl = await waitForCompletion(operationName);

    if (videoUrl) {
      // Download the video
      const filename = `veo3-test-${Date.now()}.mp4`;
      await downloadVideo(videoUrl, filename);
      return filename;
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function testImageToVideo() {
  console.log('\n🎬 Testing Image-to-Video with VEO 3.1');
  console.log('=======================================\n');

  console.log('⚠️ Note: Image-to-video might require different API endpoint or format');
  console.log('   This is experimental and may not work with current endpoint\n');

  try {
    // Fetch a test image and convert to base64
    const imageUrl = 'https://images.unsplash.com/photo-1517849845537-4d257902454a?w=800';
    console.log('📸 Source image:', imageUrl);

    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');

    // Try to generate video from image
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_KEY,
        },
        body: JSON.stringify({
          instances: [{
            prompt: 'Make the dog run and wag its tail happily',
            image: {
              bytesBase64Encoded: imageBase64,
              mimeType: 'image/jpeg'
            }
          }],
          parameters: {
            aspectRatio: '16:9',
            resolution: '720p',
            durationSeconds: 4,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Image-to-video not supported or wrong format:', data);
      return null;
    }

    console.log('✅ Operation started:', data.name);

    // Wait for completion
    const videoUrl = await waitForCompletion(data.name);

    if (videoUrl) {
      const filename = `veo3-img2vid-${Date.now()}.mp4`;
      await downloadVideo(videoUrl, filename);
      return filename;
    }
  } catch (error) {
    console.error('❌ Image-to-video test failed:', error.message);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'text';

  console.log('🚀 VEO 3.1 Video Generation Test');
  console.log('=================================');
  console.log(`API Key: ${API_KEY.substring(0, 10)}...`);

  if (mode === 'text' || mode === 'both') {
    await testTextToVideo();
  }

  if (mode === 'image' || mode === 'both') {
    await testImageToVideo();
  }

  console.log('\n✅ Tests completed!');
}

main().catch(console.error);