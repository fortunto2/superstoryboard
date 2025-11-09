import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";

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
  aspectRatio?: "16:9" | "9:16";
  durationSeconds?: "4" | "6" | "8";
  resolution?: "720p" | "1080p";
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
    // Video generation takes longer than images
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
        const { storyboardId, sceneId, characterId, prompt, sourceImageUrl, aspectRatio, durationSeconds, resolution } = message.message;

        const entityId = sceneId || characterId || `video-${Date.now()}`;
        const entityType = sceneId ? 'scene' : characterId ? 'character' : 'generic';
        const mode = sourceImageUrl ? 'image-to-video' : 'text-to-video';

        // Initialize Google GenAI (using Gemini API key directly)
        const ai = new GoogleGenAI({
          vertexai: false,  // Use Gemini API, not Vertex AI
          apiKey: geminiApiKey
        });

        console.log(`Generating video with Veo (${mode})...`);
        console.log(`Entity type: ${entityType}, ID: ${entityId}`);
        console.log(`Prompt: ${prompt}`);
        if (sourceImageUrl) {
          console.log(`Source image: ${sourceImageUrl}`);
        }

        // Prepare generation parameters based on mode
        let generateParams: any = {
          model: "veo-2.0-generate-001",  // Use the stable model
          prompt: prompt,
          config: {
            numberOfVideos: 1
          }
        };

        // Skip image-to-video for now - needs API format research
        if (sourceImageUrl) {
          console.log("Image-to-video mode not yet supported - using text-to-video instead");
          // TODO: Research correct format for image-to-video API
        }

        // Start video generation (asynchronous operation)
        let operation = await ai.models.generateVideos(generateParams);

        console.log(`Video generation started. Operation name: ${operation.name || 'unnamed'}`);

        // Poll for completion (max 6 minutes)
        const maxAttempts = 36; // 36 * 10s = 6 minutes
        let attempts = 0;

        while (!operation.done && attempts < maxAttempts) {
          console.log(`Polling operation status... (attempt ${attempts + 1}/${maxAttempts})`);
          await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds

          // Use the correct method from the example
          operation = await ai.operations.get({ operation: operation });
          attempts++;
        }

        if (!operation.done) {
          throw new Error("Video generation timed out after 6 minutes");
        }

        console.log("Video generation completed!");

        // Get generated videos array
        const videos = operation.response?.generatedVideos;
        if (!videos || videos.length === 0) {
          throw new Error("No videos generated");
        }

        const generatedVideo = videos[0];
        console.log(`Downloading video...`);

        // Download video using the SDK (like in local test)
        // Create a temporary file path for download
        const tempFileName = `/tmp/video-${Date.now()}.mp4`;

        let videoBytes: Uint8Array;

        try {
          // Download the video file
          await ai.files.download({
            file: generatedVideo,
            downloadPath: tempFileName
          });

          console.log(`Video downloaded to: ${tempFileName}`);

          // Read the downloaded file into memory
          videoBytes = await Deno.readFile(tempFileName);

          // Clean up temp file
          try {
            await Deno.remove(tempFileName);
          } catch (e) {
            console.log("Could not remove temp file:", e);
          }
        } catch (downloadError) {
          console.error("Error downloading video:", downloadError);
          throw new Error(`Failed to download video: ${downloadError.message}`);
        }

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

        const videoUrl = urlData.publicUrl;
        console.log(`Video uploaded successfully: ${videoUrl}`);

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
              videoUrl: videoUrl,
              videoGeneratedAt: new Date().toISOString(),
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
          videoUrl,
          msg_id: message.msg_id,
        });

        console.log(`✓ Successfully processed message ${message.msg_id}`);
      } catch (error) {
        console.error(`✗ Error processing message ${message.msg_id}:`, error);
        results.push({
          success: false,
          sceneId: message.message.sceneId,
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
