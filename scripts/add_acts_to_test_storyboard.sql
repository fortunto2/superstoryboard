-- Add Acts structure to test storyboard and assign actNumber to scenes
-- Run this in Supabase SQL Editor

-- Step 1: Update storyboard metadata with acts structure
-- Replace YOUR_STORYBOARD_ID with your actual storyboard ID
DO $$
DECLARE
    storyboard_key text := 'storyboard_v2:YOUR_STORYBOARD_ID';
    current_data jsonb;
BEGIN
    -- Get current storyboard data
    SELECT value INTO current_data
    FROM kv_store_7ee7668a
    WHERE key = storyboard_key;

    -- Update with acts structure
    UPDATE kv_store_7ee7668a
    SET value = jsonb_set(
        current_data,
        '{metadata,acts}',
        '[
            {
                "number": 1,
                "name": "Setup",
                "description": "Introduction and setup",
                "color": "#FF6B35",
                "sceneRange": [1, 3]
            },
            {
                "number": 2,
                "name": "Confrontation",
                "description": "Main conflict and development",
                "color": "#4ECDC4",
                "sceneRange": [4, 7]
            },
            {
                "number": 3,
                "name": "Resolution",
                "description": "Climax and resolution",
                "color": "#C77DFF",
                "sceneRange": [8, 10]
            }
        ]'::jsonb,
        true
    )
    WHERE key = storyboard_key;

    RAISE NOTICE 'Storyboard metadata updated with acts';
END $$;


-- Step 2: Assign actNumber to scenes based on scene number
-- This assigns:
-- - Scenes 1-3 → Act 1
-- - Scenes 4-7 → Act 2
-- - Scenes 8-10 → Act 3
DO $$
DECLARE
    scene_record RECORD;
    scene_data jsonb;
    scene_number int;
    act_number int;
BEGIN
    FOR scene_record IN
        SELECT key, value
        FROM kv_store_7ee7668a
        WHERE key LIKE 'scene:YOUR_STORYBOARD_ID:%'
    LOOP
        scene_data := scene_record.value;
        scene_number := (scene_data->>'sceneNumber')::int;

        -- Determine act number based on scene number
        IF scene_number >= 1 AND scene_number <= 3 THEN
            act_number := 1;
        ELSIF scene_number >= 4 AND scene_number <= 7 THEN
            act_number := 2;
        ELSIF scene_number >= 8 AND scene_number <= 10 THEN
            act_number := 3;
        ELSE
            act_number := 1; -- Default to Act 1
        END IF;

        -- Update scene with actNumber
        UPDATE kv_store_7ee7668a
        SET value = jsonb_set(
            scene_data,
            '{actNumber}',
            to_jsonb(act_number),
            true
        )
        WHERE key = scene_record.key;

        RAISE NOTICE 'Updated scene % with actNumber: %', scene_number, act_number;
    END LOOP;
END $$;


-- Step 3: Verify the changes
-- Check storyboard acts
SELECT
    key,
    value->'metadata'->'acts' as acts_structure
FROM kv_store_7ee7668a
WHERE key = 'storyboard_v2:YOUR_STORYBOARD_ID';

-- Check scene actNumbers
SELECT
    key,
    value->>'sceneNumber' as scene_num,
    value->>'actNumber' as act_num,
    value->>'shotType' as shot_type
FROM kv_store_7ee7668a
WHERE key LIKE 'scene:YOUR_STORYBOARD_ID:%'
ORDER BY (value->>'sceneNumber')::int;
