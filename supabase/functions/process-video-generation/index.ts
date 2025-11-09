import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai@0.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface VideoMessage {
  storyboardId: string;
  sceneId: string;
  prompt: string;
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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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
        const { storyboardId, sceneId, prompt, aspectRatio, durationSeconds, resolution } = message.message;

        // Initialize Google GenAI
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });

        console.log(`Generating video with Veo 3.1 Fast for scene ${sceneId}...`);
        console.log(`Prompt: ${prompt}`);
        console.log(`Parameters: ${aspectRatio || "16:9"} @ ${resolution || "720p"}, ${durationSeconds || "8"}s`);

        // Start video generation (asynchronous operation)
        let operation = await ai.models.generateVideos({
          model: "veo-3.1-fast-generate-preview",
          prompt: prompt,
          aspectRatio: aspectRatio || "16:9",
          resolution: resolution || "720p",
          durationSeconds: durationSeconds || "8",
        });

        console.log(`Video generation started. Operation name: ${operation.name}`);

        // Poll for completion (max 6 minutes according to docs)
        const maxAttempts = 36; // 36 * 10s = 6 minutes
        let attempts = 0;

        while (!operation.done && attempts < maxAttempts) {
          console.log(`Polling operation status... (attempt ${attempts + 1}/${maxAttempts})`);
          await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds

          operation = await ai.operations.getVideosOperation({ operation });
          attempts++;
        }

        if (!operation.done) {
          throw new Error("Video generation timed out after 6 minutes");
        }

        console.log("Video generation completed!");

        // Get generated video
        const generatedVideo = operation.response?.generatedVideos?.[0];
        if (!generatedVideo?.video) {
          throw new Error("No video in operation response");
        }

        console.log(`Downloading video file: ${generatedVideo.video.name}`);

        // Download video from Google
        const videoData = await ai.files.download({
          file: generatedVideo.video,
        });

        // Convert video data to Uint8Array
        const videoBytes = new Uint8Array(await videoData.arrayBuffer());
        console.log(`Downloaded video: ${videoBytes.length} bytes`);

        // Generate unique filename
        const timestamp = Date.now();
        const fileName = `${storyboardId}/${sceneId}_${timestamp}.mp4`;

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

        // Update scene in database (if exists)
        const sceneKey = `scene:${storyboardId}:${sceneId}`;
        const { data: sceneData, error: sceneError } = await supabase
          .from("kv_store_7ee7668a")
          .select("value")
          .eq("key", sceneKey)
          .single();

        if (!sceneError && sceneData) {
          console.log(`Updating scene ${sceneId} with video URL`);
          const updatedScene = {
            ...sceneData.value,
            videoUrl: videoUrl,
            videoGeneratedAt: new Date().toISOString(),
          };

          await supabase
            .from("kv_store_7ee7668a")
            .update({ value: updatedScene })
            .eq("key", sceneKey);
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
