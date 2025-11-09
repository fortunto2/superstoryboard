#!/usr/bin/env node

/**
 * Test which VEO models are working
 */

const API_KEY = 'AIzaSyCmcc-306zse3N5hmw8vV5udPl3gtS6QYw';

async function testModel(modelName, modelLabel) {
  console.log(`\n🔧 Testing ${modelLabel} (${modelName})...`);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predictLongRunning`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_KEY,
        },
        body: JSON.stringify({
          instances: [{
            prompt: 'A quick test: colorful abstract shapes moving',
          }],
          parameters: {
            aspectRatio: '16:9',
            resolution: '720p',
            durationSeconds: 8,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        console.log(`   ❌ QUOTA EXCEEDED - ${data.error?.message || 'Rate limit reached'}`);
      } else if (response.status === 404) {
        console.log(`   ❌ MODEL NOT FOUND - Model doesn't exist or wrong name`);
      } else {
        console.log(`   ❌ ERROR ${response.status}: ${data.error?.message || JSON.stringify(data)}`);
      }
      return false;
    }

    console.log(`   ✅ WORKING! Operation: ${data.name}`);

    // Cancel the operation to not waste quota
    try {
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${data.name}:cancel`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': API_KEY,
          },
        }
      );
      console.log(`   🛑 Operation cancelled to save quota`);
    } catch (err) {
      // Ignore cancel errors
    }

    return true;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Testing VEO Models Availability');
  console.log('===================================');
  console.log(`API Key: ${API_KEY.substring(0, 15)}...`);

  const models = [
    { name: "veo-3.1-generate-preview", label: "VEO 3.1" },
    { name: "veo-3.1-fast-generate-preview", label: "VEO 3.1 Fast" },
    { name: "veo-3.0-fast-generate-001", label: "VEO 3.0 Fast" },
    { name: "veo-2.0-generate-001", label: "VEO 2.0" },
    // Also test if these exist
    { name: "veo-generate-001", label: "VEO 1.0" },
    { name: "veo-3.0-generate-001", label: "VEO 3.0 Standard" },
  ];

  const results = [];

  for (const model of models) {
    const works = await testModel(model.name, model.label);
    results.push({ ...model, works });

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n\n📊 SUMMARY');
  console.log('==========');
  console.log('\n✅ Working models:');
  results.filter(r => r.works).forEach(r => {
    console.log(`   - ${r.label} (${r.name})`);
  });

  console.log('\n❌ Not working:');
  results.filter(r => !r.works).forEach(r => {
    console.log(`   - ${r.label} (${r.name})`);
  });
}

main().catch(console.error);