# CORS Fix for Figma Plugin Edge Functions

## Problem
Figma plugins run with `origin: null` which causes CORS errors when calling Supabase Edge Functions.

## Quick Solution 1: Use Supabase RPC instead of Edge Function

Instead of calling Edge Function directly, trigger processing via database function:

```typescript
// In plugin UI
const processQueue = async () => {
  // Instead of calling Edge Function, insert a trigger record
  await supabase.from('process_triggers').insert({
    function: 'process-image-generation',
    triggered_at: new Date().toISOString()
  })
}
```

## Quick Solution 2: Use Supabase CLI to Deploy with CORS

```bash
# 1. Save this as supabase/functions/process-image-generation/index.ts
# (with CORS headers added)

# 2. Deploy using Supabase CLI
cd /Users/rustam/projects/superstoryboard
supabase functions deploy process-image-generation

# 3. If that fails, try with --no-verify-jwt flag
supabase functions deploy process-image-generation --no-verify-jwt
```

## Quick Solution 3: Call via Supabase REST API

Use Supabase's built-in REST API instead of direct Edge Function calls:

```typescript
// Create a database function that calls the Edge Function
CREATE OR REPLACE FUNCTION public.trigger_image_processing()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT net.http_post(
    'https://imvfmhobawvpgcfsqhid.supabase.co/functions/v1/process-image-generation',
    '{}',
    '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  ) INTO result;

  RETURN result;
END;
$$;

// Then call from plugin
const { data, error } = await supabase.rpc('trigger_image_processing')
```

## Solution 4: Process on Queue Insert (Best)

Since we already detect queue changes every 10 seconds, just auto-process when count > 0:

```typescript
// Already implemented in plugin!
// When queue count > 0, show button to process
// OR auto-process in the background
```

## Manual Deploy Instructions

If MCP deploy fails, deploy manually:

```bash
# 1. Create the function file locally
mkdir -p supabase/functions/process-image-generation
cat > supabase/functions/process-image-generation/index.ts << 'EOF'
// Your function code with CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  // ... rest of function
});
EOF

# 2. Deploy
supabase functions deploy process-image-generation
```

## Current Workaround

The plugin now has a **"⚡ Process Image Queue"** button that appears when queue has items. This is the simplest solution for now.