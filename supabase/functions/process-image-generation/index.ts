/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from 'npm:@supabase/supabase-js@2'
import { GoogleGenAI } from 'npm:@google/genai'

// Интерфейс для сообщений из очереди
interface QueueMessage {
  msg_id: bigint
  read_ct: number
  vt: string
  enqueued_at: string
  message: {
    storyboardId: string
    sceneId?: string
    characterId?: string
    prompt: string
    sourceImageUrl?: string  // For image-to-image editing
    editMode?: boolean
    sceneNumber?: number
  }
}

// Обработка одного сообщения
async function processMessage(
  message: QueueMessage,
  supabase: any,
  geminiApiKey: string
) {
  const { sceneId, characterId, storyboardId, prompt, sourceImageUrl, editMode } = message.message

  const entityId = sceneId || characterId || `gen-${Date.now()}`
  const entityType = sceneId ? 'scene' : characterId ? 'character' : 'generic'

  console.log(`Processing ${entityType} ${entityId}: "${prompt}"`)
  if (sourceImageUrl) {
    console.log(`Edit mode: true, source: ${sourceImageUrl}`)
  }

  try {
    // Генерация изображения через Google Gemini SDK
    const ai = new GoogleGenAI({ apiKey: geminiApiKey })

    const contents: any[] = []

    // If editing mode with source image, add image to request
    if (sourceImageUrl && editMode) {
      // Fetch source image
      const imageResponse = await fetch(sourceImageUrl)
      const imageBlob = await imageResponse.blob()
      const imageBuffer = await imageBlob.arrayBuffer()
      const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)))

      contents.push({
        image: {
          inlineData: {
            data: imageBase64,
            mimeType: imageBlob.type || 'image/png'
          }
        }
      })
      contents.push({
        text: `Edit this storyboard image: ${prompt}. Maintain the composition and style.`
      })
    } else {
      // Text-to-image generation
      const styleHint = characterId
        ? 'Maintain character consistency, detailed character design'
        : 'Cinematic, detailed, high quality storyboard frame'

      contents.push({
        text: `Generate a professional storyboard image: ${prompt}. Style: ${styleHint}.`
      })
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents
    })

    // Ищем inlineData в ответе
    let imageData: string | null = null
    let mimeType = "image/png"

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageData = part.inlineData.data
        mimeType = part.inlineData.mimeType || "image/png"
        break
      }
    }

    if (!imageData) {
      throw new Error('No image generated in response')
    }

    // Конвертируем base64 в buffer для Deno
    const binaryString = atob(imageData)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Загружаем изображение в Supabase Storage
    const timestamp = Date.now()
    const fileName = `${storyboardId}/${entityType}-${entityId}_${timestamp}.png`
    const bucket = "storyboard-images"

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, bytes, {
        contentType: mimeType,
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      throw uploadError
    }

    // Получаем публичный URL
    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName)

    const imageUrl = publicUrlData.publicUrl

    console.log('Image uploaded:', imageUrl)

    // Обновляем сцену или персонажа в базе данных (если указаны)
    let entityKey: string | null = null

    if (sceneId) {
      entityKey = `scene:${storyboardId}:${sceneId}`
    } else if (characterId) {
      entityKey = `character:${storyboardId}:${characterId}`
    }

    if (entityKey) {
      const { data: entityData } = await supabase
        .from('kv_store_7ee7668a')
        .select('value')
        .eq('key', entityKey)
        .single()

      if (entityData) {
        console.log(`Updating ${entityType} with imageUrl`)
        const updatedEntity = {
          ...entityData.value,
          imageUrl,
          imageGeneratedAt: new Date().toISOString()
        }

        await supabase
          .from('kv_store_7ee7668a')
          .update({ value: updatedEntity })
          .eq('key', entityKey)

        console.log(`${entityType} updated with image URL`)
      }
    }

    // Удаляем сообщение из очереди (успешно обработано)
    const { error: deleteError } = await supabase
      .rpc('pgmq_delete', {
        queue_name: 'image_generation_queue',
        msg_id: message.msg_id
      })

    if (deleteError) {
      console.error(`Failed to delete message ${message.msg_id}:`, deleteError)
    } else {
      console.log(`Message ${message.msg_id} deleted from queue`)
    }

    return { success: true, sceneId, imageUrl }
  } catch (error) {
    console.error(`Error processing message ${message.msg_id}:`, error)
    throw error
  }
}

Deno.serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const geminiApiKey = Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY')

    if (!geminiApiKey) {
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not configured')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const queueName = 'image_generation_queue'

    // Читаем сообщения из очереди через прямой SQL вызов
    const { data: messages, error } = await supabase
      .rpc('pgmq_read', {
        queue_name: queueName,
        vt: 120,
        qty: 5
      })

    if (error) {
      console.error(`Error reading from ${queueName} queue:`, error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!messages || messages.length === 0) {
      console.log('No messages in queue')
      return new Response(JSON.stringify({
        message: 'No messages in queue',
        processed: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`Found ${messages.length} messages to process`)

    const results = []

    // Обрабатываем каждое сообщение
    for (const message of messages) {
      try {
        const result = await processMessage(
          message as QueueMessage,
          supabase,
          geminiApiKey
        )
        results.push(result)
      } catch (error) {
        console.error(`Error processing message ${message.msg_id}:`, error)
        results.push({
          success: false,
          msg_id: message.msg_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return new Response(JSON.stringify({
      message: `Processed ${messages.length} messages`,
      processed: messages.length,
      results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in main handler:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
