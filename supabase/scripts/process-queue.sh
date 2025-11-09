#!/bin/bash

# Process image generation queue
# Usage: ./process-queue.sh [images|videos]

SUPABASE_URL="https://imvfmhobawvpgcfsqhid.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltdmZtaG9iYXd2cGdjZnNxaGlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MDAwMjAsImV4cCI6MjA3ODE3NjAyMH0.mDtHEnvy0z6VdAR4xdFLIoxgu6fGl_gcifGoocfLTXk"

MODE=${1:-images}

if [ "$MODE" = "images" ]; then
  echo "🎨 Processing image generation queue..."
  FUNCTION="process-image-generation"
elif [ "$MODE" = "videos" ]; then
  echo "🎬 Processing video generation queue..."
  FUNCTION="process-video-generation"
else
  echo "Usage: $0 [images|videos]"
  exit 1
fi

echo "Invoking Edge Function: $FUNCTION"
echo ""

curl -X POST \
  "$SUPABASE_URL/functions/v1/$FUNCTION" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  | jq '.'

echo ""
echo "✅ Done!"
