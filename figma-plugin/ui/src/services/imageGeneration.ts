import { SupabaseClient } from '@supabase/supabase-js';

interface ImageGenerationRequest {
  storyboardId: string;
  sceneId?: string;
  characterId?: string;
  prompt: string;
  sourceImageUrl?: string;
  editMode?: boolean;
  sceneNumber?: number;
}

export class ImageGenerationService {
  constructor(
    private supabase: SupabaseClient,
    private projectId: string,
    private anonKey: string
  ) {}

  /**
   * Add image generation job to queue AND immediately trigger processing
   */
  async generateImage(request: ImageGenerationRequest): Promise<void> {
    try {
      // 1. Add to PGMQ queue
      const { data, error } = await this.supabase.rpc('pgmq_send', {
        queue_name: 'image_generation_queue',
        msg: request
      });

      if (error) {
        throw new Error(`Failed to queue image generation: ${error.message}`);
      }

      console.log('Image generation queued:', data);

      // 2. Immediately trigger the Edge Function to process it
      // This ensures instant processing without waiting for cron job
      await this.triggerProcessing('image');

    } catch (error) {
      console.error('Image generation error:', error);
      throw error;
    }
  }

  /**
   * Add video generation job to queue AND immediately trigger processing
   */
  async generateVideo(request: ImageGenerationRequest): Promise<void> {
    try {
      // 1. Add to PGMQ queue
      const { data, error } = await this.supabase.rpc('pgmq_send', {
        queue_name: 'video_generation_queue',
        msg: request
      });

      if (error) {
        throw new Error(`Failed to queue video generation: ${error.message}`);
      }

      console.log('Video generation queued:', data);

      // 2. Immediately trigger the Edge Function
      await this.triggerProcessing('video');

    } catch (error) {
      console.error('Video generation error:', error);
      throw error;
    }
  }

  /**
   * Trigger Edge Function to process the queue immediately
   * No need to wait for cron job or polling interval!
   */
  private async triggerProcessing(type: 'image' | 'video'): Promise<void> {
    const functionName = type === 'image'
      ? 'process-image-generation'
      : 'process-video-generation';

    const url = `https://${this.projectId}.supabase.co/functions/v1/${functionName}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        // Don't throw error - queue will still be processed by cron job
        console.warn(`Edge Function trigger returned ${response.status}, queue will be processed by scheduled job`);
      } else {
        const result = await response.json();
        console.log(`Triggered ${functionName}:`, result);
      }
    } catch (error) {
      // Non-critical error - queue will still be processed eventually
      console.warn(`Failed to trigger ${functionName}:`, error);
    }
  }

  /**
   * Check queue status (optional)
   */
  async getQueueStatus(): Promise<{ image: number; video: number }> {
    const [imageQueue, videoQueue] = await Promise.all([
      this.supabase.rpc('pgmq_metrics', { queue_name: 'image_generation_queue' }),
      this.supabase.rpc('pgmq_metrics', { queue_name: 'video_generation_queue' })
    ]);

    return {
      image: imageQueue.data?.[0]?.queue_length || 0,
      video: videoQueue.data?.[0]?.queue_length || 0
    };
  }
}