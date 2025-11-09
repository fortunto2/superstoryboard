-- Enqueue 3 test image generation jobs
-- Run this in Supabase SQL Editor or via psql

-- Image 1: Hero on cliff
SELECT pgmq.send(
  'image_generation_queue',
  jsonb_build_object(
    'storyboardId', 'test-batch-001',
    'sceneId', 'scene-001',
    'prompt', 'A cinematic hero standing on a dramatic cliff at golden hour, overlooking a vast fantasy landscape with mountains and waterfalls'
  )
) AS msg_id_1;

-- Image 2: Dragon in storm
SELECT pgmq.send(
  'image_generation_queue',
  jsonb_build_object(
    'storyboardId', 'test-batch-001',
    'sceneId', 'scene-002',
    'prompt', 'An ancient dragon soaring through storm clouds with lightning, epic fantasy art style, highly detailed'
  )
) AS msg_id_2;

-- Image 3: Ancient temple
SELECT pgmq.send(
  'image_generation_queue',
  jsonb_build_object(
    'storyboardId', 'test-batch-001',
    'sceneId', 'scene-003',
    'prompt', 'A mysterious ancient temple entrance covered in glowing mystical runes, surrounded by jungle vines, atmospheric lighting'
  )
) AS msg_id_3;

-- Check queue status
SELECT
  msg_id,
  enqueued_at,
  message->>'sceneId' as scene_id,
  left(message->>'prompt', 50) || '...' as prompt_preview
FROM pgmq.read('image_generation_queue', 30, 10);
