import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface VideoMessage {
  storyboardId: string;
  sceneId?: string;
  characterId?: string;
  prompt: string;
  sourceImageUrl?: string;  // For image-to-video
  aspectRatio?: "16:9" | "9:16" | "1:1";
  durationSeconds?: "4" | "6" | "8";
  resolution?: "720p" | "1080p";
  negativePrompt?: string;
}

interface QueueMessage {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: VideoMessage;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Google Generative AI API key
    const geminiApiKey = Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
    }

    const queueName = "video_generation_queue";
    console.log(`Processing video generation queue: ${queueName}`);

    // Read messages from queue (visibility timeout: 600 seconds = 10 minutes)
    const { data: messages, error } = await supabase
      .rpc("pgmq_read", {
        queue_name: queueName,
        vt: 600, // 10 minutes visibility timeout
        qty: 1, // Process one video at a time due to long generation time
      }) as { data: QueueMessage[] | null; error: any };

    if (error) {
      console.error("Error reading from queue:", error);
      throw error;
    }

    if (!messages || messages.length === 0) {
      console.log("No messages in queue");
      return new Response(
        JSON.stringify({ message: "No messages in queue", processed: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Found ${messages.length} message(s) to process`);

    const results = [];

    // Process each message
    for (const message of messages) {
      console.log(`Processing message ${message.msg_id}:`, message.message);

      try {
        const {
          storyboardId,
          sceneId,
          characterId,
          prompt,
          sourceImageUrl,
          aspectRatio,
          durationSeconds,
          resolution,
          negativePrompt
        } = message.message;

        const entityId = sceneId || characterId || `video-${Date.now()}`;
        const entityType = sceneId ? 'scene' : characterId ? 'character' : 'generic';
        const mode = sourceImageUrl ? 'image-to-video' : 'text-to-video';

        console.log(`Generating video with VEO 3.1 (${mode})...`);
        console.log(`Entity type: ${entityType}, ID: ${entityId}`);
        console.log(`Prompt: ${prompt}`);
        if (sourceImageUrl) {
          console.log(`Source image: ${sourceImageUrl}`);
        }

        // Prepare request for VEO 3.1 REST API
        // Always use 8 seconds duration (required for 1080p, works for all resolutions)
        const VIDEO_DURATION = 8;

        const requestBody: any = {
          instances: [{
            prompt: prompt,
            ...(negativePrompt && { negativePrompt }),
          }],
          parameters: {
            aspectRatio: aspectRatio || "16:9",
            resolution: resolution || "720p",
            durationSeconds: VIDEO_DURATION,
          },
        };

        // Add source image if provided (experimental - might not work)
        if (sourceImageUrl) {
          console.log("Fetching source image for image-to-video...");

          try {
            const imageResponse = await fetch(sourceImageUrl);
            const imageBlob = await imageResponse.blob();
            const imageBuffer = await imageBlob.arrayBuffer();
            const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

            // Try to add image to request (format might need adjustment)
            requestBody.instances[0].image = {
              bytesBase64Encoded: imageBase64,
              mimeType: imageBlob.type || 'image/png'
            };

            console.log("Image added to request (experimental)");
          } catch (imgError) {
            console.log("Failed to add image, continuing with text-to-video:", imgError);
          }
        }

        // Try VEO models with fallback
        let operationName: string;
        let modelUsed: string;

        // Try VEO models - Fast models only (full VEO 3.1 reserved for VIP plans)
        const models = [
          { name: "veo-3.1-fast-generate-preview", label: "VEO 3.1 Fast", removeResolution: false },
          { name: "veo-3.0-fast-generate-001", label: "VEO 3.0 Fast", removeResolution: false },
          { name: "veo-2.0-generate-001", label: "VEO 2.0", removeResolution: true } // VEO 2.0 doesn't support resolution param
          // Full VEO 3.1 will be added for VIP plans: { name: "veo-3.1-generate-preview", label: "VEO 3.1 Full" }
        ];

        let lastError: Error | null = null;

        for (const model of models) {
          try {
            const veoEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:predictLongRunning`;

            // Adjust request for VEO 2.0 (remove resolution parameter)
            const modelRequestBody = { ...requestBody };
            if (model.removeResolution) {
              delete modelRequestBody.parameters.resolution;
              console.log(`${model.label}: Removed resolution parameter (not supported)`);
            }

            console.log(`Calling ${model.label} API...`);
            const veoResponse = await fetch(veoEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": geminiApiKey,
              },
              body: JSON.stringify(modelRequestBody),
            });

            const veoData = await veoResponse.json();

            if (!veoResponse.ok) {
              console.error(`${model.label} API error:`, veoData);

              // If quota exceeded, try next model
              if (veoResponse.status === 429) {
                console.log(`Quota exceeded for ${model.label}, trying next model...`);
                lastError = new Error(`${model.label} quota exceeded`);
                continue;
              }

              // For other errors, also try next model unless it's the last one
              lastError = new Error(`${model.label} failed: ${veoResponse.status} - ${JSON.stringify(veoData)}`);
              continue;
            }

            operationName = veoData.name;
            modelUsed = model.label;
            console.log(`Successfully started with ${modelUsed}`);
            break; // Success, exit loop

          } catch (error) {
            lastError = error as Error;

            // If this is the last model, throw the error
            if (model === models[models.length - 1]) {
              throw lastError;
            }
          }
        }

        if (!operationName!) {
          throw lastError || new Error("Failed to start video generation");
        }
        console.log(`Video generation started. Operation: ${operationName}`);

        // Poll for completion (max 6 minutes)
        const maxAttempts = 36; // 36 * 10s = 6 minutes
        let attempts = 0;
        let videoUrl = null;

        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
          attempts++;

          console.log(`Polling operation status... (attempt ${attempts}/${maxAttempts})`);

          // Check status
          const statusResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
            {
              headers: {
                "x-goog-api-key": geminiApiKey,
              },
            }
          );

          const statusData = await statusResponse.json();

          if (statusData.done) {
            if (statusData.error) {
              throw new Error(`Video generation failed: ${statusData.error.message}`);
            }

            // Try different paths where video URL might be
            videoUrl =
              statusData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
              statusData.response?.generatedSamples?.[0]?.video?.uri ||
              statusData.response?.video?.uri ||
              statusData.response?.predictions?.[0]?.uri;

            if (!videoUrl) {
              console.log("Response structure:", JSON.stringify(statusData.response, null, 2));
              throw new Error("No video URL in response");
            }

            console.log(`Video generation completed with ${modelUsed}!`);
            console.log(`Video URL: ${videoUrl}`);
            break;
          }
        }

        if (!videoUrl) {
          throw new Error("Video generation timed out after 6 minutes");
        }

        // Download video (with API key for authentication)
        console.log("Downloading video...");
        const videoResponse = await fetch(videoUrl, {
          headers: {
            "x-goog-api-key": geminiApiKey,
          },
        });

        if (!videoResponse.ok) {
          throw new Error(`Failed to download video: ${videoResponse.status}`);
        }

        const videoBlob = await videoResponse.blob();
        const videoBuffer = await videoBlob.arrayBuffer();
        const videoBytes = new Uint8Array(videoBuffer);

        console.log(`Downloaded video: ${videoBytes.length} bytes`);

        // Generate unique filename
        const timestamp = Date.now();
        const fileName = `${storyboardId}/${entityType}-${entityId}_${timestamp}.mp4`;

        console.log(`Uploading to Supabase Storage: ${fileName}`);

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("storyboard-videos")
          .upload(fileName, videoBytes, {
            contentType: "video/mp4",
            upsert: false,
          });

        if (uploadError) {
          console.error("Storage upload error:", uploadError);
          throw uploadError;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("storyboard-videos")
          .getPublicUrl(fileName);

        const publicVideoUrl = urlData.publicUrl;
        console.log(`Video uploaded successfully: ${publicVideoUrl}`);

        // Update scene or character in database (if exists)
        let entityKey: string | null = null;

        if (sceneId) {
          entityKey = `scene:${storyboardId}:${sceneId}`;
        } else if (characterId) {
          entityKey = `character:${storyboardId}:${characterId}`;
        }

        if (entityKey) {
          const { data: entityData, error: entityError } = await supabase
            .from("kv_store_7ee7668a")
            .select("value")
            .eq("key", entityKey)
            .single();

          if (!entityError && entityData) {
            console.log(`Updating ${entityType} ${entityId} with video URL`);
            const updatedEntity = {
              ...entityData.value,
              videoUrl: publicVideoUrl,
              videoGeneratedAt: new Date().toISOString(),
              videoModel: modelUsed,
            };

            await supabase
              .from("kv_store_7ee7668a")
              .update({ value: updatedEntity })
              .eq("key", entityKey);

            console.log(`${entityType} updated with video URL`);
          }
        }

        // Delete message from queue (successfully processed)
        console.log(`Deleting message ${message.msg_id} from queue`);
        const { error: deleteError } = await supabase
          .rpc("pgmq_delete", {
            queue_name: queueName,
            msg_id: message.msg_id,
          });

        if (deleteError) {
          console.error("Error deleting message from queue:", deleteError);
        }

        results.push({
          success: true,
          sceneId,
          characterId,
          videoUrl: publicVideoUrl,
          msg_id: message.msg_id,
          model: modelUsed,
        });

        console.log(`✓ Successfully processed message ${message.msg_id}`);
      } catch (error) {
        console.error(`✗ Error processing message ${message.msg_id}:`, error);
        results.push({
          success: false,
          sceneId: message.message.sceneId,
          characterId: message.message.characterId,
          error: error.message,
          msg_id: message.msg_id,
        });
        // Message will be re-processed after visibility timeout expires
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} message(s)`,
        processed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});