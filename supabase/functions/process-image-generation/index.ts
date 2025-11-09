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
    sceneId: string
    storyboardId: string
    prompt: string
    sceneNumber?: number
  }
}

// Обработка одного сообщения
async function processMessage(
  message: QueueMessage,
  supabase: any,
  geminiApiKey: string
) {
  const { sceneId, storyboardId, prompt } = message.message

  console.log(`Processing scene ${sceneId}: "${prompt}"`)

  try {
    // Генерация изображения через Google Gemini SDK
    const ai = new GoogleGenAI({ apiKey: geminiApiKey })

    const contents = [
      {
        text: `Generate a professional storyboard image: ${prompt}. Style: cinematic, detailed, high quality.`
      }
    ]

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
    const fileName = `${storyboardId}/${sceneId}_${Date.now()}.png`
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

    // Обновляем сцену в базе данных
    const sceneKey = `scene:${storyboardId}:${sceneId}`

    const { data: sceneData } = await supabase
      .from('kv_store_7ee7668a')
      .select('value')
      .eq('key', sceneKey)
      .single()

    if (sceneData) {
      const updatedScene = {
        ...sceneData.value,
        imageUrl,
        updatedAt: new Date().toISOString()
      }

      await supabase
        .from('kv_store_7ee7668a')
        .update({ value: updatedScene })
        .eq('key', sceneKey)

      console.log('Scene updated with image URL')
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
