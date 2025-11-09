import { useState, useEffect } from 'react'
import './styles/index.scss'
import { Scene, StoryboardV2, Character } from '../plugin/types'

type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface Notification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface PostgresChangePayload {
  data: {
    type: 'INSERT' | 'UPDATE' | 'DELETE';
    record?: { value: Scene | Character };
    old_record?: { value: Scene | Character };
    old?: unknown;
    columns?: unknown;
  };
}

function App() {
    const [projectId, setProjectId] = useState(import.meta.env.VITE_SUPABASE_PROJECT_ID || '')
    const [publicAnonKey, setPublicAnonKey] = useState(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
    const [storyboards, setStoryboards] = useState<StoryboardV2[]>([])
    const [selectedStoryboardId, setSelectedStoryboardId] = useState(import.meta.env.VITE_DEFAULT_STORYBOARD_ID || '')
    const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('disconnected')
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingStoryboards, setIsLoadingStoryboards] = useState(false)
    const [_ws, setWs] = useState<WebSocket | null>(null)
    const [previousScenes, setPreviousScenes] = useState<Map<string, Scene>>(new Map())
    const [credentialsSaved, setCredentialsSaved] = useState(false)
    const [settingsExpanded, setSettingsExpanded] = useState(false)
    const [imageQueueCount, setImageQueueCount] = useState<number>(0)
    const [videoQueueCount, setVideoQueueCount] = useState<number>(0)
    const [isLoadingQueues, setIsLoadingQueues] = useState(false)
    const [selectionContext, setSelectionContext] = useState<{
        count: number;
        hasImage: boolean;
        imageUrl?: string;
        sceneId?: string;
    }>({ count: 0, hasImage: false })
    const [promptText, setPromptText] = useState('')
    const [isGenerating, setIsGenerating] = useState(false)
    const [isProcessingQueue, setIsProcessingQueue] = useState(false)
    const [videoPromptText, setVideoPromptText] = useState('')
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
    const [isProcessingVideoQueue, setIsProcessingVideoQueue] = useState(false)
    const [figmaContext, setFigmaContext] = useState<string>('')
    const [isExtractingContext, setIsExtractingContext] = useState(false)
    const [includeContextInPrompt, setIncludeContextInPrompt] = useState(false)

    // Request credentials from plugin on mount
    useEffect(() => {
        console.log('[UI] Requesting saved credentials from plugin...')
        parent.postMessage({
            pluginMessage: { type: 'load-credentials' }
        }, '*')
    }, [])

    useEffect(() => {
        window.onmessage = (event) => {
            const msg = event.data.pluginMessage || {}
            const { type, status, message, sceneNumber } = msg

            switch (type) {
            case 'credentials-loaded':
                console.log('[UI] Credentials loaded from plugin storage')
                setProjectId(msg.projectId)
                setPublicAnonKey(msg.anonKey)
                setSelectedStoryboardId(msg.storyboardId)
                setCredentialsSaved(true)
                setSettingsExpanded(false) // Auto-collapse when credentials are loaded
                addNotification('Credentials loaded', 'success')
                break

            case 'credentials-saved':
                if (msg.success) {
                    setCredentialsSaved(true)
                    setSettingsExpanded(false) // Auto-collapse after saving
                    addNotification('Credentials saved ✓', 'success')
                } else {
                    addNotification(`Failed to save: ${msg.error}`, 'error')
                }
                break

            case 'credentials-cleared':
                if (msg.success) {
                    setCredentialsSaved(false)
                    setProjectId('')
                    setPublicAnonKey('')
                    setSelectedStoryboardId('')
                    setStoryboards([])
                    setSettingsExpanded(true) // Expand settings when cleared
                    addNotification('Credentials cleared', 'info')
                } else {
                    addNotification(`Failed to clear: ${msg.error}`, 'error')
                }
                break

            case 'realtime-status':
                setRealtimeStatus(status)
                break

            case 'sync-complete':
                setIsLoading(false)
                addNotification(message || `✓ Synced ${msg.sceneCount} scenes, ${msg.characterCount} characters`, 'success')

                // Save figmaNodeIds back to database
                if (msg.updatedScenes && Array.isArray(msg.updatedScenes)) {
                    saveFigmaNodeIds(msg.updatedScenes).catch(error => {
                        console.error('[UI] Error saving figmaNodeIds:', error)
                    })
                }
                break

            case 'sync-error':
                setIsLoading(false)
                addNotification(message, 'error')
                break

            case 'scene-inserted':
                addNotification(`Scene ${sceneNumber} inserted`, 'info')
                break

            case 'scene-updated':
                addNotification(`Scene ${sceneNumber} updated`, 'info')
                break

            case 'scene-deleted':
                addNotification('Scene deleted', 'info')
                break

            case 'realtime-error':
                addNotification(`Realtime error: ${message}`, 'error')
                break

            case 'selection-changed':
                console.log('[UI] Selection changed:', msg)
                setSelectionContext({
                    count: msg.count || 0,
                    hasImage: msg.hasImage || false,
                    imageUrl: msg.imageUrl,
                    sceneId: msg.sceneId
                })
                break

            case 'context-extracted':
                console.log('[UI] Context extracted:', msg)
                if (msg.context) {
                    // Format context as XML-like structure for safety
                    const contextStr = `<figma-context>
  <selection-count>${msg.context.selectionCount || 0}</selection-count>
  ${msg.context.metadata ? `<metadata>${JSON.stringify(msg.context.metadata).slice(0, 500)}</metadata>` : ''}
  ${msg.context.textContent ? `<text-content>${msg.context.textContent.slice(0, 300)}</text-content>` : ''}
  ${msg.context.pageContext ? `<page-info>${JSON.stringify(msg.context.pageContext).slice(0, 200)}</page-info>` : ''}
</figma-context>`
                    setFigmaContext(contextStr)
                    addNotification('Context extracted from Figma', 'success')
                } else {
                    setFigmaContext('')
                    addNotification('No context available', 'info')
                }
                setIsExtractingContext(false)
                break
            }
        }
    }, [])

    // Load storyboards on mount if credentials are available
    useEffect(() => {
        if (projectId && publicAnonKey) {
            loadStoryboards()
        }
    }, [projectId, publicAnonKey])

    // Expand settings by default if credentials are not saved
    useEffect(() => {
        if (!credentialsSaved && !projectId && !publicAnonKey) {
            setSettingsExpanded(true)
        }
    }, [credentialsSaved, projectId, publicAnonKey])

    // Fetch queue counts periodically
    useEffect(() => {
        if (!projectId || !publicAnonKey) {
            return
        }

        loadQueueCounts()

        // Refresh every 10 seconds
        const interval = setInterval(loadQueueCounts, 10000)
        return () => clearInterval(interval)
    }, [projectId, publicAnonKey])

    function addNotification(message: string, type: 'success' | 'error' | 'info') {
        const id = Date.now()
        setNotifications(prev => [...prev, { id, message, type }])

        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id))
        }, 3000)
    }

    async function loadStoryboards() {
        if (!projectId || !publicAnonKey) {
            return
        }

        setIsLoadingStoryboards(true)

        try {
            // PostgREST uses * as wildcard, but needs URL-encoding to avoid conflict with select=*
            const url = `https://${projectId}.supabase.co/rest/v1/kv_store_7ee7668a?key=like.storyboard_v2:%2A&select=*`

            console.log('[UI] Loading storyboards from:', url)

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'apikey': publicAnonKey,
                    'Authorization': `Bearer ${publicAnonKey}`
                }
            })

            if (!response.ok) {
                throw new Error(`Failed to load storyboards: ${response.status}`)
            }

            const data = await response.json()
            console.log('[UI] Storyboards data:', data)

            const storyboardsList: StoryboardV2[] = data.map((row: { value: StoryboardV2 }) => row.value)
            setStoryboards(storyboardsList)

            // Auto-select first storyboard if none selected
            if (storyboardsList.length > 0 && !selectedStoryboardId) {
                setSelectedStoryboardId(storyboardsList[0].id)
            }

        } catch (error: unknown) {
            console.error('[UI] Error loading storyboards:', error)
            const message = error instanceof Error ? error.message : 'Failed to load storyboards'
            addNotification(message, 'error')
        } finally {
            setIsLoadingStoryboards(false)
        }
    }

    async function loadQueueCounts() {
        if (!projectId || !publicAnonKey) {
            return
        }

        setIsLoadingQueues(true)

        try {
            // Fetch image queue count
            const imageCountUrl = `https://${projectId}.supabase.co/rest/v1/rpc/pgmq_count`
            const imageResponse = await fetch(imageCountUrl, {
                method: 'POST',
                headers: {
                    'apikey': publicAnonKey,
                    'Authorization': `Bearer ${publicAnonKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ queue_name: 'image_generation_queue' })
            })

            if (imageResponse.ok) {
                const imageCount = await imageResponse.json()
                setImageQueueCount(imageCount || 0)
                console.log('[UI] Image queue count:', imageCount)
            }

            // Fetch video queue count
            const videoCountUrl = `https://${projectId}.supabase.co/rest/v1/rpc/pgmq_count`
            const videoResponse = await fetch(videoCountUrl, {
                method: 'POST',
                headers: {
                    'apikey': publicAnonKey,
                    'Authorization': `Bearer ${publicAnonKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ queue_name: 'video_generation_queue' })
            })

            if (videoResponse.ok) {
                const videoCount = await videoResponse.json()
                setVideoQueueCount(videoCount || 0)
                console.log('[UI] Video queue count:', videoCount)
            }

        } catch (error: unknown) {
            console.error('[UI] Error loading queue counts:', error)
        } finally {
            setIsLoadingQueues(false)
        }
    }

    async function handleSync() {
        if (!projectId || !publicAnonKey || !selectedStoryboardId) {
            addNotification('Please select a storyboard', 'error')
            return
        }

        setIsLoading(true)

        try {
            // Fetch storyboard object
            const storyboardUrl = `https://${projectId}.supabase.co/rest/v1/kv_store_7ee7668a?key=eq.storyboard_v2:${selectedStoryboardId}&select=*`
            console.log('[UI] Fetching storyboard from:', storyboardUrl)

            const storyboardResponse = await fetch(storyboardUrl, {
                method: 'GET',
                headers: {
                    'apikey': publicAnonKey,
                    'Authorization': `Bearer ${publicAnonKey}`
                }
            })

            if (!storyboardResponse.ok) {
                throw new Error(`Failed to fetch storyboard: ${storyboardResponse.status}`)
            }

            const storyboardData = await storyboardResponse.json()
            const storyboard: StoryboardV2 | undefined = storyboardData.length > 0 ? storyboardData[0].value : undefined

            console.log('[UI] Storyboard:', storyboard)

            // Fetch scenes for selected storyboard
            const scenesUrl = `https://${projectId}.supabase.co/rest/v1/kv_store_7ee7668a?key=like.scene:${selectedStoryboardId}:%2A&select=*`
            console.log('[UI] Fetching scenes from:', scenesUrl)

            const scenesResponse = await fetch(scenesUrl, {
                method: 'GET',
                headers: {
                    'apikey': publicAnonKey,
                    'Authorization': `Bearer ${publicAnonKey}`
                }
            })

            if (!scenesResponse.ok) {
                throw new Error(`Failed to fetch scenes: ${scenesResponse.status}`)
            }

            const scenesData = await scenesResponse.json()
            const scenes: Scene[] = scenesData.map((row: { value: Scene }) => row.value)
            console.log('[UI] Parsed scenes:', scenes)

            // Fetch characters for selected storyboard
            const charactersUrl = `https://${projectId}.supabase.co/rest/v1/kv_store_7ee7668a?key=like.character:${selectedStoryboardId}:%2A&select=*`
            console.log('[UI] Fetching characters from:', charactersUrl)

            const charactersResponse = await fetch(charactersUrl, {
                method: 'GET',
                headers: {
                    'apikey': publicAnonKey,
                    'Authorization': `Bearer ${publicAnonKey}`
                }
            })

            if (!charactersResponse.ok) {
                throw new Error(`Failed to fetch characters: ${charactersResponse.status}`)
            }

            const charactersData = await charactersResponse.json()
            const characters: Character[] = charactersData.map((row: { value: Character }) => row.value)
            console.log('[UI] Parsed characters:', characters)

            // Build initial scene map
            const initialScenes = new Map<string, Scene>()
            for (const scene of scenes) {
                initialScenes.set(scene.id, scene)
            }
            setPreviousScenes(initialScenes)

            // Send data to plugin
            parent.postMessage({
                pluginMessage: {
                    type: 'sync-storyboard',
                    projectId,
                    publicAnonKey,
                    storyboardId: selectedStoryboardId,
                    storyboard,
                    scenes,
                    characters
                }
            }, '*')

            // Connect WebSocket for realtime updates
            connectWebSocket(projectId, publicAnonKey, selectedStoryboardId)

        } catch (error: unknown) {
            setIsLoading(false)
            const message = error instanceof Error ? error.message : 'Failed to sync'
            addNotification(message, 'error')
            console.error('[UI] Sync error:', error)
        }
    }

    async function saveFigmaNodeIds(updatedScenes: Array<{sceneId: string; figmaNodeId: string | undefined}>) {
        if (!projectId || !publicAnonKey || !selectedStoryboardId) {
            console.log('[UI] Cannot save figmaNodeIds - missing credentials')
            return
        }

        console.log('[UI] Saving figmaNodeIds to database:', updatedScenes.length)

        for (const {sceneId, figmaNodeId} of updatedScenes) {
            if (!figmaNodeId) {
                continue
            }

            try {
                // Fetch current scene data
                const sceneKey = `scene:${selectedStoryboardId}:${sceneId}`
                const fetchUrl = `https://${projectId}.supabase.co/rest/v1/kv_store_7ee7668a?key=eq.${sceneKey}&select=*`

                const fetchResponse = await fetch(fetchUrl, {
                    method: 'GET',
                    headers: {
                        'apikey': publicAnonKey,
                        'Authorization': `Bearer ${publicAnonKey}`
                    }
                })

                if (!fetchResponse.ok) {
                    console.error('[UI] Failed to fetch scene:', sceneId)
                    continue
                }

                const data = await fetchResponse.json()
                if (data.length === 0) {
                    console.error('[UI] Scene not found:', sceneId)
                    continue
                }

                const currentScene = data[0].value as Scene

                // Update scene with figmaNodeId
                const updatedScene = {
                    ...currentScene,
                    figmaNodeId,
                    updatedAt: new Date().toISOString()
                }

                // Save back to database
                const updateUrl = `https://${projectId}.supabase.co/rest/v1/kv_store_7ee7668a?key=eq.${sceneKey}`

                const updateResponse = await fetch(updateUrl, {
                    method: 'PATCH',
                    headers: {
                        'apikey': publicAnonKey,
                        'Authorization': `Bearer ${publicAnonKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        value: updatedScene
                    })
                })

                if (updateResponse.ok) {
                    console.log('[UI] ✓ Saved figmaNodeId for scene:', sceneId, figmaNodeId)
                } else {
                    console.error('[UI] Failed to update scene:', sceneId, updateResponse.status)
                }

            } catch (error) {
                console.error('[UI] Error saving figmaNodeId for scene:', sceneId, error)
            }
        }

        console.log('[UI] Finished saving figmaNodeIds')
    }

    function connectWebSocket(projectId: string, publicAnonKey: string, _storyboardId: string) {
        const wsUrl = `wss://${projectId}.supabase.co/realtime/v1/websocket?apikey=${publicAnonKey}&vsn=1.0.0`

        console.log('[UI] Connecting to WebSocket:', wsUrl)
        setRealtimeStatus('connecting')

        const websocket = new WebSocket(wsUrl)
        let messageRef = 0
        let heartbeatInterval: ReturnType<typeof setInterval> | null = null

        websocket.onopen = () => {
            console.log('[UI] WebSocket connected, readyState:', websocket.readyState)
            setRealtimeStatus('connected')

            // Start heartbeat (every 30 seconds)
            heartbeatInterval = setInterval(() => {
                if (websocket.readyState === WebSocket.OPEN) {
                    messageRef++
                    const heartbeat = {
                        event: 'heartbeat',
                        topic: 'phoenix',
                        payload: {},
                        ref: messageRef.toString()
                    }
                    console.log('[UI] Sending heartbeat:', heartbeat)
                    websocket.send(JSON.stringify(heartbeat))
                } else {
                    console.log('[UI] Heartbeat skipped, readyState:', websocket.readyState)
                }
            }, 30000)

            // Join channel to listen for scene changes
            // Note: Realtime doesn't support 'like' operator, so we subscribe to all table changes
            // and filter on client side in handlePostgresChange()
            messageRef++
            const channelTopic = `realtime:public:kv_store_7ee7668a`
            const joinMessage = {
                event: 'phx_join',
                topic: channelTopic,
                payload: {
                    config: {
                        postgres_changes: [
                            {
                                event: '*',
                                schema: 'public',
                                table: 'kv_store_7ee7668a'
                                // No filter - Realtime only supports: eq, neq, lt, lte, gt, gte, in
                                // We'll filter by key pattern in handlePostgresChange()
                            }
                        ]
                    }
                },
                ref: messageRef.toString()
            }
            console.log('[UI] Sending join message for scenes:', joinMessage)
            websocket.send(JSON.stringify(joinMessage))
            console.log('[UI] Join message sent, waiting for response...')
        }

        websocket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data)
                console.log('[UI] WebSocket message received:', message)

                const { event: eventType, topic, payload, ref } = message
                console.log('[UI] Message details:', { eventType, topic, payload, ref })

                if (eventType === 'phx_reply') {
                    console.log('[UI] Join reply:', payload)
                    if (payload.status === 'ok') {
                        console.log('[UI] ✅ Successfully joined channel!')
                        console.log('[UI] Response details:', payload.response)
                    } else {
                        console.error('[UI] ❌ Failed to join channel:', payload)
                    }
                } else if (eventType === 'postgres_changes') {
                    console.log('[UI] 🔄 Postgres change detected!')
                    console.log('[UI] Full postgres_changes payload:', payload)
                    handlePostgresChange(payload)
                } else if (eventType === 'system') {
                    console.log('[UI] 📡 System message:', payload)
                } else {
                    console.log('[UI] ⚠️ Unhandled event type:', eventType, 'payload:', payload)
                }
            } catch (error) {
                console.error('[UI] Error parsing WebSocket message:', error, event.data)
            }
        }

        websocket.onerror = (error) => {
            console.error('[UI] WebSocket error:', error)
            setRealtimeStatus('error')
        }

        websocket.onclose = (event) => {
            console.log('[UI] WebSocket closed:', {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean
            })
            setRealtimeStatus('disconnected')
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval)
            }
        }

        setWs(websocket)
    }

    function handlePostgresChange(payload: PostgresChangePayload) {
        try {
            const change = payload.data
            console.log('[UI] Postgres change:', change)

            if (!change || !change.type) {
                console.log('[UI] ❌ Invalid change payload - missing type')
                return
            }

            const changeType = change.type // INSERT, UPDATE, DELETE
            const record = change.record

            // Handle DELETE separately (no record.value for deleted rows)
            if (changeType === 'DELETE') {
                console.log('[UI] DELETE event - full change object:', JSON.stringify(change, null, 2))
                console.log('[UI] DELETE event - available keys:', Object.keys(change))

                const oldRecord = change.old_record
                if (!oldRecord || !oldRecord.value) {
                    console.log('[UI] ❌ No old_record found for DELETE')
                    console.log('[UI] Checking alternative fields - old:', change.old)
                    console.log('[UI] Checking alternative fields - columns:', change.columns)
                    return
                }

                const deletedScene: Scene = oldRecord.value
                console.log('[UI] Scene deleted:', deletedScene.id)

                // Remove from previous scenes map
                const updatedScenes = new Map(previousScenes)
                updatedScenes.delete(deletedScene.id)
                setPreviousScenes(updatedScenes)

                // Notify plugin
                parent.postMessage({
                    pluginMessage: {
                        type: 'scene-deleted',
                        sceneId: deletedScene.id
                    }
                }, '*')
                addNotification('Scene deleted', 'info')
                return
            }

            // Handle INSERT and UPDATE
            if (!record || !record.value) {
                console.log('[UI] ❌ No record or value found in change')
                return
            }

            const scene: Scene = record.value
            console.log('[UI] Scene data:', scene)

            if (changeType === 'INSERT') {
                console.log('[UI] Scene inserted:', scene.id)

                // Add to previous scenes map
                const updatedScenes = new Map(previousScenes)
                updatedScenes.set(scene.id, scene)
                setPreviousScenes(updatedScenes)

                // Notify plugin
                parent.postMessage({
                    pluginMessage: {
                        type: 'scene-inserted',
                        scene
                    }
                }, '*')
                addNotification(`Scene ${scene.sceneNumber} added`, 'success')

            } else if (changeType === 'UPDATE') {
                console.log('[UI] Scene updated:', scene.id)

                // Update in previous scenes map
                const updatedScenes = new Map(previousScenes)
                updatedScenes.set(scene.id, scene)
                setPreviousScenes(updatedScenes)

                // Notify plugin
                parent.postMessage({
                    pluginMessage: {
                        type: 'scene-updated',
                        scene
                    }
                }, '*')
                addNotification(`Scene ${scene.sceneNumber} updated`, 'info')
            }

        } catch (error) {
            console.error('[UI] Error handling postgres change:', error)
        }
    }

    function handleSaveCredentials() {
        if (!projectId || !publicAnonKey) {
            addNotification('Please enter Project ID and Anon Key', 'error')
            return
        }

        parent.postMessage({
            pluginMessage: {
                type: 'save-credentials',
                projectId,
                anonKey: publicAnonKey,
                storyboardId: selectedStoryboardId
            }
        }, '*')
    }

    function handleClearCredentials() {
        parent.postMessage({
            pluginMessage: { type: 'clear-credentials' }
        }, '*')
    }

    function handleClose() {
        parent.postMessage({
            pluginMessage: { type: 'cancel' }
        }, '*')
    }

    async function handleGenerateImage() {
        if (!projectId || !publicAnonKey) {
            addNotification('Please configure credentials', 'error')
            return
        }

        // Use selectedStoryboardId or generate a generic one
        const storyboardId = selectedStoryboardId || `generic-${Date.now()}`

        if (!promptText.trim()) {
            addNotification('Please enter a prompt', 'error')
            return
        }

        setIsGenerating(true)

        try {
            const message: any = {
                storyboardId: storyboardId,
                prompt: promptText.trim()
            }

            // If scene is selected, add sceneId
            if (selectionContext.sceneId) {
                message.sceneId = selectionContext.sceneId
            }

            // If image is selected, use image-to-image mode
            if (selectionContext.hasImage && selectionContext.imageUrl) {
                message.sourceImageUrl = selectionContext.imageUrl
                message.editMode = 'image-to-image'
            }

            console.log('[UI] Enqueuing image generation:', message)

            const response = await fetch(
                `https://${projectId}.supabase.co/rest/v1/rpc/pgmq_send`,
                {
                    method: 'POST',
                    headers: {
                        'apikey': publicAnonKey,
                        'Authorization': `Bearer ${publicAnonKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        queue_name: 'image_generation_queue',
                        message: message
                    })
                }
            )

            if (!response.ok) {
                throw new Error(`Failed to enqueue: ${response.status}`)
            }

            const msgId = await response.json()
            console.log('[UI] Image generation enqueued, msg_id:', msgId)

            addNotification(
                selectionContext.hasImage
                    ? '✓ Image edit enqueued'
                    : '✓ Image generation enqueued',
                'success'
            )

            // Clear prompt
            setPromptText('')

            // Refresh queue counts
            loadQueueCounts()

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to enqueue'
            addNotification(message, 'error')
            console.error('[UI] Error enqueuing image:', error)
        } finally {
            setIsGenerating(false)
        }
    }

    // Process image queue by invoking Edge Function
    const processImageQueue = async () => {
        setIsProcessingQueue(true)

        try {
            const response = await fetch(
                `https://${projectId}.supabase.co/functions/v1/process-image-generation`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${publicAnonKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            )

            if (!response.ok) {
                throw new Error(`Failed to process queue: ${response.status}`)
            }

            const result = await response.json()
            console.log('[UI] Queue processed:', result)

            if (result.processed > 0) {
                addNotification(`✓ Processed ${result.processed} image${result.processed > 1 ? 's' : ''}`, 'success')
            } else {
                addNotification('Queue is empty', 'info')
            }

            // Refresh queue counts
            loadQueueCounts()

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to process queue'
            addNotification(message, 'error')
            console.error('[UI] Error processing queue:', error)
        } finally {
            setIsProcessingQueue(false)
        }
    }

    // Generate video from prompt
    const handleGenerateVideo = async () => {
        const storyboardId = selectedStoryboardId || `generic-${Date.now()}`

        if (!videoPromptText.trim()) {
            addNotification('Please enter a prompt', 'error')
            return
        }

        if (!projectId || !publicAnonKey) {
            addNotification('Please configure credentials', 'error')
            return
        }

        setIsGeneratingVideo(true)

        try {
            const message: any = {
                storyboardId: storyboardId,
                prompt: videoPromptText.trim()
            }

            // Add Figma context if enabled
            if (includeContextInPrompt && figmaContext) {
                message.context = figmaContext
            }

            // If scene is selected, add sceneId
            if (selectionContext.sceneId) {
                message.sceneId = selectionContext.sceneId
            }

            // If image is selected, use image as reference
            if (selectionContext.hasImage && selectionContext.imageUrl) {
                message.sourceImageUrl = selectionContext.imageUrl
                message.editMode = 'image-to-video'
            }

            console.log('[UI] Enqueuing video generation:', message)

            const response = await fetch(
                `https://${projectId}.supabase.co/rest/v1/rpc/pgmq_send`,
                {
                    method: 'POST',
                    headers: {
                        'apikey': publicAnonKey,
                        'Authorization': `Bearer ${publicAnonKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        queue_name: 'video_generation_queue',
                        message: message
                    })
                }
            )

            if (!response.ok) {
                throw new Error(`Failed to enqueue: ${response.status}`)
            }

            const msgId = await response.json()
            console.log('[UI] Video generation enqueued, msg_id:', msgId)

            addNotification(
                selectionContext.hasImage
                    ? '✓ Image-to-video enqueued'
                    : '✓ Video generation enqueued',
                'success'
            )

            // Clear prompt
            setVideoPromptText('')

            // Refresh queue counts
            loadQueueCounts()

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to enqueue'
            addNotification(message, 'error')
            console.error('[UI] Error enqueuing video:', error)
        } finally {
            setIsGeneratingVideo(false)
        }
    }

    // Process video queue by invoking Edge Function
    const processVideoQueue = async () => {
        setIsProcessingVideoQueue(true)

        try {
            const response = await fetch(
                `https://${projectId}.supabase.co/functions/v1/process-video-generation`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${publicAnonKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            )

            if (!response.ok) {
                throw new Error(`Failed to process queue: ${response.status}`)
            }

            const result = await response.json()
            console.log('[UI] Video queue processed:', result)

            if (result.processed > 0) {
                addNotification(`✓ Processed ${result.processed} video${result.processed > 1 ? 's' : ''}`, 'success')
            } else {
                addNotification('Video queue is empty', 'info')
            }

            // Refresh queue counts
            loadQueueCounts()

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to process video queue'
            addNotification(message, 'error')
            console.error('[UI] Error processing video queue:', error)
        } finally {
            setIsProcessingVideoQueue(false)
        }
    }

    // Extract context from Figma selection
    const handleExtractContext = () => {
        setIsExtractingContext(true)
        parent.postMessage({ pluginMessage: { type: 'extract-context' } }, '*')
    }

    const statusConfig = {
        disconnected: { label: 'Disconnected', color: '#6B7280', dot: '⚫' },
        connecting: { label: 'Connecting...', color: '#F59E0B', dot: '🔄' },
        connected: { label: 'Live Sync Active', color: '#10B981', dot: '🟢' },
        error: { label: 'Connection Error', color: '#EF4444', dot: '🔴' }
    }

    const currentStatus = statusConfig[realtimeStatus]

    return (
        <div className="app">
            <div className="header">
                <h2>SuperStoryboard Sync</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="status-indicator" style={{ color: currentStatus.color }}>
                        <span className="status-dot">{currentStatus.dot}</span>
                        <span className="status-label">{currentStatus.label}</span>
                    </div>
                    <button
                        className="settings-toggle"
                        onClick={() => setSettingsExpanded(!settingsExpanded)}
                        title={settingsExpanded ? 'Hide settings' : 'Show settings'}
                    >
                        ⚙️
                    </button>
                </div>
            </div>

            <div className={`settings-section ${settingsExpanded ? 'expanded' : 'collapsed'}`}>
                <div className="settings-content">
                    <div className="form-group">
                        <label htmlFor="projectId">Supabase Project ID</label>
                        <input
                            id="projectId"
                            type="text"
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
                            placeholder="imvfmhobawvpgcfsqhid"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="publicAnonKey">Public Anon Key</label>
                        <input
                            id="publicAnonKey"
                            type="password"
                            value={publicAnonKey}
                            onChange={(e) => setPublicAnonKey(e.target.value)}
                            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={handleSaveCredentials}
                            disabled={!projectId || !publicAnonKey}
                            style={{
                                flex: 1,
                                padding: '8px 16px',
                                fontSize: '12px',
                                fontWeight: 500,
                                borderRadius: '4px',
                                border: 'none',
                                cursor: !projectId || !publicAnonKey ? 'not-allowed' : 'pointer',
                                backgroundColor: !projectId || !publicAnonKey ? '#cccccc' : '#18A0FB',
                                color: 'white',
                                opacity: !projectId || !publicAnonKey ? 0.5 : 1
                            }}
                        >
                            {credentialsSaved ? '✓ Saved' : 'Save Credentials'}
                        </button>
                        <button
                            onClick={handleClearCredentials}
                            disabled={!credentialsSaved}
                            style={{
                                flex: 1,
                                padding: '8px 16px',
                                fontSize: '12px',
                                fontWeight: 500,
                                borderRadius: '4px',
                                border: 'none',
                                cursor: !credentialsSaved ? 'not-allowed' : 'pointer',
                                backgroundColor: !credentialsSaved ? '#f0f0f0' : '#e0e0e0',
                                color: !credentialsSaved ? '#999' : '#333',
                                opacity: !credentialsSaved ? 0.5 : 1
                            }}
                        >
                Clear
                        </button>
                    </div>
                </div>
            </div>

            <div className="form">

                <div className="form-group">
                    <label htmlFor="storyboard">Select Storyboard</label>
                    {isLoadingStoryboards ? (
                        <p style={{ fontSize: '12px', color: '#666' }}>Loading storyboards...</p>
                    ) : storyboards.length === 0 ? (
                        <p style={{ fontSize: '12px', color: '#666' }}>No storyboards found</p>
                    ) : (
                        <select
                            id="storyboard"
                            value={selectedStoryboardId}
                            onChange={(e) => setSelectedStoryboardId(e.target.value)}
                        >
                            <option value="">-- Select a storyboard --</option>
                            {storyboards.map((storyboard) => (
                                <option key={storyboard.id} value={storyboard.id}>
                                    {storyboard.name} ({storyboard.id})
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={handleSync}
                        disabled={isLoading || !selectedStoryboardId}
                        style={{
                            flex: 1,
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: 500,
                            borderRadius: '4px',
                            border: 'none',
                            cursor: isLoading || !selectedStoryboardId ? 'not-allowed' : 'pointer',
                            backgroundColor: isLoading || !selectedStoryboardId ? '#cccccc' : '#18A0FB',
                            color: 'white',
                            opacity: isLoading || !selectedStoryboardId ? 0.5 : 1
                        }}
                    >
                        {isLoading ? 'Syncing...' : 'Sync Storyboard'}
                    </button>
                    <button
                        onClick={handleClose}
                        style={{
                            flex: 1,
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: 500,
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: '#e0e0e0',
                            color: '#333'
                        }}
                    >
            Close
                    </button>
                </div>
            </div>

            {/* Selection Context & Image Generation */}
            {projectId && publicAnonKey && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Selection Context */}
                    <div style={{
                        backgroundColor: '#f5f5f5',
                        borderRadius: '6px',
                        padding: '12px',
                        border: '1px solid #e0e0e0'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                            <span style={{ fontSize: '16px' }}>
                                {selectionContext.count === 0 ? '⚪' : selectionContext.count === 1 && selectionContext.hasImage ? '🖼️' : '🔵'}
                            </span>
                            <span style={{ fontWeight: 500 }}>
                                {selectionContext.count === 0 && 'Nothing selected'}
                                {selectionContext.count === 1 && selectionContext.hasImage && 'Image selected (edit mode)'}
                                {selectionContext.count === 1 && !selectionContext.hasImage && '1 object selected'}
                                {selectionContext.count > 1 && `${selectionContext.count} objects selected`}
                            </span>
                        </div>
                        {selectionContext.sceneId && (
                            <div style={{ marginTop: '6px', fontSize: '11px', color: '#666', paddingLeft: '24px' }}>
                                Scene: {selectionContext.sceneId}
                            </div>
                        )}
                    </div>

                    {/* Prompt Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label htmlFor="promptInput" style={{ fontSize: '12px', fontWeight: 500, color: '#666' }}>
                            {selectionContext.hasImage ? 'Edit Image Prompt' : 'Generate Image Prompt'}
                        </label>
                        <textarea
                            id="promptInput"
                            value={promptText}
                            onChange={(e) => setPromptText(e.target.value)}
                            placeholder={
                                selectionContext.hasImage
                                    ? 'Describe how to modify the image...'
                                    : 'Describe the image to generate...'
                            }
                            rows={3}
                            style={{
                                width: '100%',
                                padding: '8px',
                                fontSize: '12px',
                                fontFamily: 'inherit',
                                border: '1px solid #e0e0e0',
                                borderRadius: '4px',
                                resize: 'vertical'
                            }}
                        />
                        <button
                            onClick={handleGenerateImage}
                            disabled={isGenerating || !promptText.trim()}
                            style={{
                                width: '100%',
                                padding: '10px 16px',
                                fontSize: '13px',
                                fontWeight: 600,
                                borderRadius: '4px',
                                border: 'none',
                                cursor: (isGenerating || !promptText.trim()) ? 'not-allowed' : 'pointer',
                                backgroundColor: (isGenerating || !promptText.trim()) ? '#cccccc' : '#18A0FB',
                                color: 'white',
                                opacity: (isGenerating || !promptText.trim()) ? 0.5 : 1
                            }}
                        >
                            {isGenerating ? 'Enqueuing...' : selectionContext.hasImage ? '✏️ Edit Image' : '🎨 Generate Image'}
                        </button>
                    </div>
                </div>
            )}

            {/* Video Generation */}
            {projectId && publicAnonKey && (
                <div style={{
                    backgroundColor: '#f5f5f5',
                    borderRadius: '6px',
                    padding: '12px',
                    border: '1px solid #e0e0e0'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label htmlFor="videoPromptInput" style={{ fontSize: '12px', fontWeight: 500, color: '#666' }}>
                            {selectionContext.hasImage ? 'Image-to-Video Prompt' : 'Generate Video Prompt'}
                        </label>
                        <textarea
                            id="videoPromptInput"
                            value={videoPromptText}
                            onChange={(e) => setVideoPromptText(e.target.value)}
                            placeholder={
                                selectionContext.hasImage
                                    ? 'Describe how to animate this image...'
                                    : 'Describe the video to generate...'
                            }
                            rows={3}
                            style={{
                                width: '100%',
                                padding: '8px',
                                fontSize: '12px',
                                fontFamily: 'inherit',
                                border: '1px solid #e0e0e0',
                                borderRadius: '4px',
                                resize: 'vertical'
                            }}
                        />

                        {/* Context inclusion checkbox */}
                        {figmaContext && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666' }}>
                                <input
                                    type="checkbox"
                                    checked={includeContextInPrompt}
                                    onChange={(e) => setIncludeContextInPrompt(e.target.checked)}
                                />
                                Include Figma context in prompt ({figmaContext.length} chars)
                            </label>
                        )}

                        <button
                            onClick={handleGenerateVideo}
                            disabled={isGeneratingVideo || !videoPromptText.trim()}
                            style={{
                                width: '100%',
                                padding: '10px 16px',
                                fontSize: '13px',
                                fontWeight: 600,
                                borderRadius: '4px',
                                border: 'none',
                                cursor: (isGeneratingVideo || !videoPromptText.trim()) ? 'not-allowed' : 'pointer',
                                backgroundColor: (isGeneratingVideo || !videoPromptText.trim()) ? '#cccccc' : '#18A0FB',
                                color: 'white',
                                opacity: (isGeneratingVideo || !videoPromptText.trim()) ? 0.5 : 1
                            }}
                        >
                            {isGeneratingVideo ? 'Enqueuing...' : selectionContext.hasImage ? '🎬 Image to Video' : '🎬 Generate Video'}
                        </button>
                    </div>
                </div>
            )}

            {/* Context Extraction */}
            {projectId && publicAnonKey && (
                <div style={{
                    backgroundColor: '#f5f5f5',
                    borderRadius: '6px',
                    padding: '12px',
                    border: '1px solid #e0e0e0'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 600, margin: 0, marginBottom: '4px' }}>Figma Context</h3>
                            <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>
                                Extract context from selected Figma elements
                            </p>
                        </div>
                        <button
                            onClick={handleExtractContext}
                            disabled={isExtractingContext}
                            style={{
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: 500,
                                borderRadius: '4px',
                                border: 'none',
                                cursor: isExtractingContext ? 'not-allowed' : 'pointer',
                                backgroundColor: isExtractingContext ? '#cccccc' : '#6B7280',
                                color: 'white'
                            }}
                        >
                            {isExtractingContext ? '📡 Extracting...' : '📡 Extract Context'}
                        </button>
                    </div>
                    {figmaContext && (
                        <div style={{
                            marginTop: '8px',
                            padding: '8px',
                            backgroundColor: 'white',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            color: '#333',
                            maxHeight: '100px',
                            overflow: 'auto'
                        }}>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {figmaContext}
                            </pre>
                        </div>
                    )}
                </div>
            )}

            {/* Queue Status */}
            {projectId && publicAnonKey && (
                <div style={{
                    backgroundColor: '#f5f5f5',
                    borderRadius: '6px',
                    padding: '12px',
                    border: '1px solid #e0e0e0'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h3 style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>Generation Queues</h3>
                        {isLoadingQueues && <span style={{ fontSize: '14px' }}>⟳</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px',
                            backgroundColor: 'white',
                            borderRadius: '4px',
                            fontSize: '12px'
                        }}>
                            <span style={{ fontSize: '16px' }}>🎨</span>
                            <span style={{ flex: 1 }}>Images</span>
                            <span style={{
                                fontWeight: 600,
                                color: '#18A0FB',
                                backgroundColor: '#E3F2FD',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                minWidth: '24px',
                                textAlign: 'center'
                            }}>
                                {imageQueueCount}
                            </span>
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px',
                            backgroundColor: 'white',
                            borderRadius: '4px',
                            fontSize: '12px'
                        }}>
                            <span style={{ fontSize: '16px' }}>🎬</span>
                            <span style={{ flex: 1 }}>Videos</span>
                            <span style={{
                                fontWeight: 600,
                                color: '#18A0FB',
                                backgroundColor: '#E3F2FD',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                minWidth: '24px',
                                textAlign: 'center'
                            }}>
                                {videoQueueCount}
                            </span>
                        </div>
                    </div>
                    {/* Process Queue Button */}
                    {imageQueueCount > 0 && (
                        <button
                            onClick={processImageQueue}
                            disabled={isProcessingQueue}
                            style={{
                                width: '100%',
                                padding: '8px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: isProcessingQueue ? '#ccc' : '#FF6B35',
                                color: 'white',
                                cursor: isProcessingQueue ? 'not-allowed' : 'pointer',
                                marginTop: '8px'
                            }}
                        >
                            {isProcessingQueue ? '⏳ Processing...' : '⚡ Process Image Queue'}
                        </button>
                    )}
                    {/* Process Video Queue Button */}
                    {videoQueueCount > 0 && (
                        <button
                            onClick={processVideoQueue}
                            disabled={isProcessingVideoQueue}
                            style={{
                                width: '100%',
                                padding: '8px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: isProcessingVideoQueue ? '#ccc' : '#9333EA',
                                color: 'white',
                                cursor: isProcessingVideoQueue ? 'not-allowed' : 'pointer',
                                marginTop: '8px'
                            }}
                        >
                            {isProcessingVideoQueue ? '⏳ Processing...' : '⚡ Process Video Queue'}
                        </button>
                    )}
                    <div style={{ marginTop: '8px', fontSize: '10px', color: '#999', textAlign: 'center' }}>
                        Auto-refreshes every 10s
                    </div>
                </div>
            )}

            <div className="notifications">
                {notifications.map(notification => (
                    <div
                        key={notification.id}
                        className={`notification notification-${notification.type}`}
                    >
                        {notification.message}
                    </div>
                ))}
            </div>

            <div className="info">
                <p className="info-text">
          This plugin syncs storyboards from your web app with real-time updates.
                </p>
            </div>
        </div>
    )
}

export default App