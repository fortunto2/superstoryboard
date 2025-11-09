import React, { useState } from 'react';
import { ImageGenerationService } from '../services/imageGeneration';
import { createClient } from '@supabase/supabase-js';

interface ImageGeneratorProps {
  storyboardId: string;
  projectId: string;
  anonKey: string;
}

export const ImageGenerator: React.FC<ImageGeneratorProps> = ({
  storyboardId,
  projectId,
  anonKey
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [queueStatus, setQueueStatus] = useState({ image: 0, video: 0 });

  // Initialize Supabase client and service
  const supabase = createClient(
    `https://${projectId}.supabase.co`,
    anonKey
  );
  const imageService = new ImageGenerationService(supabase, projectId, anonKey);

  /**
   * Generate image with instant processing
   */
  const handleGenerateImage = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    try {
      // This will:
      // 1. Add to queue
      // 2. Immediately trigger Edge Function
      // 3. Process happens instantly (no waiting!)
      await imageService.generateImage({
        storyboardId,
        prompt,
        sceneNumber: Date.now() // Use timestamp as scene number for demo
      });

      // Update queue status
      const status = await imageService.getQueueStatus();
      setQueueStatus(status);

      alert('Image generation started! Processing immediately...');
      setPrompt('');
    } catch (error) {
      console.error('Generation failed:', error);
      alert('Failed to generate image');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Generate video with instant processing
   */
  const handleGenerateVideo = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    try {
      await imageService.generateVideo({
        storyboardId,
        prompt,
        sceneNumber: Date.now()
      });

      const status = await imageService.getQueueStatus();
      setQueueStatus(status);

      alert('Video generation started! Processing immediately...');
      setPrompt('');
    } catch (error) {
      console.error('Generation failed:', error);
      alert('Failed to generate video');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Check queue status
   */
  const checkQueueStatus = async () => {
    try {
      const status = await imageService.getQueueStatus();
      setQueueStatus(status);
    } catch (error) {
      console.error('Failed to check queue:', error);
    }
  };

  return (
    <div style={{ padding: '16px' }}>
      <h3>AI Generation (Instant Processing!)</h3>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your scene..."
        style={{
          width: '100%',
          height: '80px',
          marginBottom: '8px',
          padding: '8px',
          borderRadius: '4px',
          border: '1px solid #ccc'
        }}
        disabled={loading}
      />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={handleGenerateImage}
          disabled={loading || !prompt.trim()}
          style={{
            flex: 1,
            padding: '8px',
            backgroundColor: '#3ECF8E',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading || !prompt.trim() ? 0.5 : 1
          }}
        >
          {loading ? 'Processing...' : '🎨 Generate Image'}
        </button>

        <button
          onClick={handleGenerateVideo}
          disabled={loading || !prompt.trim()}
          style={{
            flex: 1,
            padding: '8px',
            backgroundColor: '#FF6B6B',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading || !prompt.trim() ? 0.5 : 1
          }}
        >
          {loading ? 'Processing...' : '🎬 Generate Video'}
        </button>
      </div>

      <div style={{
        padding: '12px',
        backgroundColor: '#f5f5f5',
        borderRadius: '4px',
        marginBottom: '8px'
      }}>
        <h4 style={{ margin: '0 0 8px 0' }}>Queue Status</h4>
        <div>📷 Images in queue: {queueStatus.image}</div>
        <div>🎬 Videos in queue: {queueStatus.video}</div>
        <button
          onClick={checkQueueStatus}
          style={{
            marginTop: '8px',
            padding: '4px 8px',
            fontSize: '12px',
            backgroundColor: '#e0e0e0',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Refresh Status
        </button>
      </div>

      <div style={{
        padding: '8px',
        backgroundColor: '#d4f4dd',
        borderRadius: '4px',
        fontSize: '12px',
        color: '#0d7a2e'
      }}>
        ✨ <strong>Instant Processing Active!</strong><br/>
        Images and videos are processed immediately after queuing.
        No more waiting for cron jobs!
      </div>
    </div>
  );
};