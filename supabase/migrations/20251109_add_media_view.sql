-- Create a view that combines scene data with media information
-- This provides backward compatibility while using the new media table

CREATE OR REPLACE VIEW public.scene_with_media AS
SELECT
    s.key as scene_key,
    s.value->>'id' as id,
    s.value->>'storyboardId' as storyboard_id,
    s.value->>'sceneNumber' as scene_number,
    s.value->>'shotType' as shot_type,
    s.value->>'description' as description,
    s.value->>'dialogue' as dialogue,
    s.value->>'notes' as notes,
    s.value->>'duration' as duration,
    s.value->>'imageUrl' as legacy_image_url, -- Keep old field
    s.value->>'mediaId' as media_id, -- New field
    s.value->>'createdAt' as created_at,
    s.value->>'updatedAt' as updated_at,
    -- Media fields from joined table
    m.id as media_uuid,
    m.type as media_type,
    m.url as media_url,
    m.preview_url as media_preview_url,
    m.status as media_status,
    m.prompt as media_prompt,
    m.width as media_width,
    m.height as media_height,
    -- Use media URL if available, otherwise fall back to legacy imageUrl
    COALESCE(m.url, s.value->>'imageUrl') as display_url,
    CASE
        WHEN m.id IS NOT NULL THEN 'media_table'
        WHEN s.value->>'imageUrl' IS NOT NULL THEN 'legacy_field'
        ELSE 'no_media'
    END as media_source
FROM kv_store_7ee7668a s
LEFT JOIN public.media m ON m.scene_id = s.value->>'id'
WHERE s.key LIKE 'scene:%'
AND (m.deleted_at IS NULL OR m.id IS NULL);

-- Create function to get media for a scene (prioritizes media table over legacy field)
CREATE OR REPLACE FUNCTION get_scene_media(scene_id_param TEXT)
RETURNS TABLE(
    url TEXT,
    type VARCHAR(20),
    preview_url TEXT,
    source VARCHAR(20)
) AS $$
BEGIN
    -- First try to get from media table
    RETURN QUERY
    SELECT
        m.url,
        m.type,
        m.preview_url,
        'media_table'::VARCHAR(20) as source
    FROM public.media m
    WHERE m.scene_id = scene_id_param
    AND m.deleted_at IS NULL
    AND m.status = 'completed'
    ORDER BY m.created_at DESC
    LIMIT 1;

    -- If no media found, try legacy imageUrl
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            s.value->>'imageUrl' as url,
            'image'::VARCHAR(20) as type,
            NULL::TEXT as preview_url,
            'legacy_field'::VARCHAR(20) as source
        FROM kv_store_7ee7668a s
        WHERE s.key = 'scene:' || scene_id_param
        AND s.value->>'imageUrl' IS NOT NULL
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to update scene with media_id
CREATE OR REPLACE FUNCTION update_scene_media_id(
    scene_id_param TEXT,
    media_id_param UUID
) RETURNS VOID AS $$
DECLARE
    current_value JSONB;
    scene_key TEXT;
BEGIN
    scene_key := 'scene:' || split_part(scene_id_param, ':', 1) || ':' || split_part(scene_id_param, ':', 2);

    -- Get current scene value
    SELECT value INTO current_value
    FROM kv_store_7ee7668a
    WHERE key = scene_key;

    IF current_value IS NOT NULL THEN
        -- Add media_id to the scene JSON
        current_value := jsonb_set(current_value, '{mediaId}', to_jsonb(media_id_param::TEXT));

        -- Update the scene
        UPDATE kv_store_7ee7668a
        SET value = current_value
        WHERE key = scene_key;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON VIEW public.scene_with_media IS 'View combining scene data with media information, supporting both legacy imageUrl and new media table';
COMMENT ON FUNCTION get_scene_media IS 'Gets media for a scene, prioritizing media table over legacy imageUrl field';
COMMENT ON FUNCTION update_scene_media_id IS 'Updates a scene JSON to include a media_id reference';