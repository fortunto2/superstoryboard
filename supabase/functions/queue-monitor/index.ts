import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Queue Monitor - проверяет очереди каждые 10 секунд и вызывает обработчики
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Queue Monitor started - checking every 10 seconds for 50 seconds");

    const startTime = Date.now();
    const maxRunTime = 50 * 1000; // 50 секунд (оставляем 10 секунд запас)
    let cycles = 0;

    while (Date.now() - startTime < maxRunTime) {
      cycles++;

      // Проверяем очередь изображений
      const { data: imageQueue } = await supabase
        .rpc("pgmq_metrics", { queue_name: "image_generation_queue" });

      if (imageQueue?.[0]?.queue_length > 0) {
        console.log(`Found ${imageQueue[0].queue_length} images to process`);

        // Вызываем Edge Function для обработки
        await fetch(`${supabaseUrl}/functions/v1/process-image-generation`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
      }

      // Проверяем очередь видео
      const { data: videoQueue } = await supabase
        .rpc("pgmq_metrics", { queue_name: "video_generation_queue" });

      if (videoQueue?.[0]?.queue_length > 0) {
        console.log(`Found ${videoQueue[0].queue_length} videos to process`);

        await fetch(`${supabaseUrl}/functions/v1/process-video-generation`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
      }

      // Ждем 10 секунд перед следующей проверкой
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    // Перед завершением запускаем новый экземпляр
    console.log(`Completed ${cycles} cycles, scheduling next monitor`);

    // Запускаем себя же через 5 секунд (чтобы был небольшой overlap)
    setTimeout(async () => {
      await fetch(`${supabaseUrl}/functions/v1/queue-monitor`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
    }, 5000);

    return new Response(
      JSON.stringify({
        message: "Monitor completed",
        cycles,
        runtime: Math.round((Date.now() - startTime) / 1000),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Monitor error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});