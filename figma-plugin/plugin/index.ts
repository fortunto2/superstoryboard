// SuperStoryboard Figma Plugin - Real-time Sync
/// <reference types="@figma/plugin-typings" />

import { Scene, StoryboardV2, Character, Act } from './types'

const DEBUG = true

function log(...args: unknown[]) {
    if (DEBUG) {
        console.log('[SuperStoryboard]', ...args)
    }
}

// ============================================================================
// SCENE MANAGER
// ============================================================================

class SceneManager {
    private sceneNodeMap: Map<string, SceneNode>
    private scenesFrame: FrameNode | null = null
    private actFrames: Map<number, FrameNode> = new Map()
    private acts: Act[] = []

    constructor() {
        this.sceneNodeMap = new Map()
    }

    setActs(acts: Act[]) {
        this.acts = acts
        log('Acts structure set:', acts)
    }

    createScenesFrame(): FrameNode {
        log('Creating main scenes frame...')

        const frame = figma.createFrame()
        frame.name = '📝 SCENES'
        frame.x = 50
        frame.y = 50
        frame.resize(3000, 800)
        frame.fills = [] // Transparent background

        figma.currentPage.appendChild(frame)
        this.scenesFrame = frame

        log('Main scenes frame created')
        return frame
    }

    createActFrames(): void {
        if (!this.scenesFrame || this.acts.length === 0) {
            log('Skipping act frames - no scenes frame or acts defined')
            return
        }

        log('Creating act subframes...')

        const actColors = {
            1: { h: 30, s: 0.8, l: 0.75, name: '🟧 Act 1' },  // Orange
            2: { h: 120, s: 0.7, l: 0.7, name: '🟩 Act 2' },  // Green
            3: { h: 280, s: 0.7, l: 0.75, name: '🟪 Act 3' }  // Purple
        }

        let offsetX = 100

        for (const act of this.acts) {
            const actColor = actColors[act.number as keyof typeof actColors]
            if (!actColor) continue

            const actFrame = figma.createFrame()
            actFrame.name = `${actColor.name}: ${act.name}`
            actFrame.x = offsetX
            actFrame.y = 100
            actFrame.resize(800, 600)

            // Semi-transparent background
            const bgColor = this.hslToRgb(actColor.h, actColor.s, actColor.l)
            actFrame.fills = [{
                type: 'SOLID',
                color: bgColor,
                opacity: 0.1
            }]

            this.scenesFrame.appendChild(actFrame)
            this.actFrames.set(act.number, actFrame)

            offsetX += 900 // Space between act frames
            log(`Created act frame: ${act.name}`)
        }
    }

    async createScene(scene: Scene): Promise<void> {
        log('Creating scene:', scene.id)

        try {
            const isFigJam = figma.editorType === 'figjam'
            let node: SceneNode

            if (isFigJam) {
                // Create sticky note in FigJam
                node = figma.createSticky()
                node.text.characters = this.formatSceneText(scene)
                node.x = (scene.sceneNumber - 1) * 300
                node.y = 100

                // Get color by act number
                const actColors = {
                    1: { h: 30, s: 0.8, l: 0.75 },   // Orange
                    2: { h: 120, s: 0.7, l: 0.7 },   // Green
                    3: { h: 280, s: 0.7, l: 0.75 }   // Purple
                }

                const actNumber = scene.actNumber || 1
                const actColor = actColors[actNumber as keyof typeof actColors] || actColors[1]
                const color = this.hslToRgb(actColor.h, actColor.s, actColor.l)

                node.fills = [{
                    type: 'SOLID',
                    color: color
                }]

                // Add to act frame if exists, otherwise to scenes frame
                const actFrame = this.actFrames.get(actNumber)
                if (actFrame) {
                    actFrame.appendChild(node)
                } else if (this.scenesFrame) {
                    this.scenesFrame.appendChild(node)
                } else {
                    figma.currentPage.appendChild(node)
                }
            } else {
                // Create frame in Figma (fonts already loaded)
                const frame = figma.createFrame()
                frame.name = `Scene ${scene.sceneNumber}: ${scene.shotType}`
                frame.resize(250, 350)
                frame.x = (scene.sceneNumber - 1) * 300
                frame.y = 100

                // Add text (Inter Regular already loaded)
                const text = figma.createText()
                text.characters = this.formatSceneText(scene)
                text.fontSize = 12
                text.x = 10
                text.y = 10
                text.resize(230, text.height)

                frame.appendChild(text)
                node = frame
            }

            // Store node reference
            this.sceneNodeMap.set(scene.id, node)
            log('Scene created successfully:', scene.id)

        } catch (error) {
            log('Error creating scene:', error)
            throw error
        }
    }

    async updateScene(scene: Scene): Promise<void> {
        log('Updating scene:', scene.id)

        const node = this.sceneNodeMap.get(scene.id)
        if (!node) {
            log('Scene node not found, creating new one')
            await this.createScene(scene)
            return
        }

        try {
            const isFigJam = figma.editorType === 'figjam'
            const formattedText = this.formatSceneText(scene)

            if (isFigJam && node.type === 'STICKY') {
                node.text.characters = formattedText
            } else if (node.type === 'FRAME') {
                // Update frame name
                node.name = `Scene ${scene.sceneNumber}: ${scene.shotType}`

                // Find and update text node
                const textNode = node.findChild((child) => child.type === 'TEXT') as TextNode
                if (textNode) {
                    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
                    textNode.characters = formattedText
                }
            }

            log('Scene updated successfully:', scene.id)

        } catch (error) {
            log('Error updating scene:', error)
            throw error
        }
    }

    deleteScene(sceneId: string): void {
        log('Deleting scene:', sceneId)

        const node = this.sceneNodeMap.get(sceneId)
        if (!node) {
            log('Scene node not found')
            return
        }

        try {
            node.remove()
            this.sceneNodeMap.delete(sceneId)
            log('Scene deleted successfully:', sceneId)
        } catch (error) {
            log('Error deleting scene:', error)
            throw error
        }
    }

    createConnectors(scenes: Scene[]): void {
        log('Creating connectors for scenes...')

        // Only create connectors in FigJam
        if (figma.editorType !== 'figjam') {
            log('Skipping connectors - not in FigJam')
            return
        }

        for (const scene of scenes) {
            // Skip if no connections defined
            if (!scene.nextScenes || scene.nextScenes.length === 0) {
                continue
            }

            const currentNode = this.sceneNodeMap.get(scene.id)
            if (!currentNode) {
                log('Warning: Node not found for scene', scene.id)
                continue
            }

            // Create connector to each next scene
            for (const nextSceneId of scene.nextScenes) {
                const nextNode = this.sceneNodeMap.get(nextSceneId)

                if (!nextNode) {
                    log('Warning: Next scene node not found:', nextSceneId)
                    continue
                }

                try {
                    const connector = figma.createConnector()
                    connector.strokeWeight = 4

                    connector.connectorStart = {
                        endpointNodeId: currentNode.id,
                        magnet: 'AUTO'
                    }

                    connector.connectorEnd = {
                        endpointNodeId: nextNode.id,
                        magnet: 'AUTO'
                    }

                    log(`Created connector: ${scene.id} → ${nextSceneId}`)
                } catch (error) {
                    log('Error creating connector:', error)
                }
            }
        }

        log('Connectors creation complete')
    }

    private formatSceneText(scene: Scene): string {
    // Better formatting with bold Unicode and hierarchy
        let text = `${this.toBold(`SCENE ${scene.sceneNumber}`)}\n`
        text += `${this.toBold(scene.shotType.toUpperCase())}\n\n`
        text += `${scene.description}\n`

        if (scene.dialogue) {
            text += `\n💬 "${scene.dialogue}"\n`
        }

        if (scene.notes) {
            text += `\n📝 ${this.toSmall(scene.notes)}\n`
        }

        text += `\n⏱ ${scene.duration}`

        return text
    }

    private toBold(text: string): string {
    // Convert ASCII to Unicode bold characters
        const boldMap: Record<string, string> = {
            'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛',
            'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣',
            'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫',
            'Y': '𝗬', 'Z': '𝗭',
            'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵',
            'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽',
            'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅',
            'y': '𝘆', 'z': '𝘇',
            '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳',
            '8': '𝟴', '9': '𝟵'
        }

        return text.split('').map(char => boldMap[char] || char).join('')
    }

    private toSmall(text: string): string {
    // Convert ASCII to Unicode small capitals
        const smallMap: Record<string, string> = {
            'A': 'ᴀ', 'B': 'ʙ', 'C': 'ᴄ', 'D': 'ᴅ', 'E': 'ᴇ', 'F': 'ꜰ', 'G': 'ɢ', 'H': 'ʜ',
            'I': 'ɪ', 'J': 'ᴊ', 'K': 'ᴋ', 'L': 'ʟ', 'M': 'ᴍ', 'N': 'ɴ', 'O': 'ᴏ', 'P': 'ᴘ',
            'Q': 'ǫ', 'R': 'ʀ', 'S': 's', 'T': 'ᴛ', 'U': 'ᴜ', 'V': 'ᴠ', 'W': 'ᴡ', 'X': 'x',
            'Y': 'ʏ', 'Z': 'ᴢ'
        }

        return text.split('').map(char => smallMap[char.toUpperCase()] || char).join('')
    }

    private hslToRgb(h: number, s: number, l: number): RGB {
    // Convert HSL to RGB for Figma fills
        const c = (1 - Math.abs(2 * l - 1)) * s
        const x = c * (1 - Math.abs((h / 60) % 2 - 1))
        const m = l - c / 2

        let r = 0, g = 0, b = 0

        if (h >= 0 && h < 60) {
            r = c; g = x; b = 0
        } else if (h >= 60 && h < 120) {
            r = x; g = c; b = 0
        } else if (h >= 120 && h < 180) {
            r = 0; g = c; b = x
        } else if (h >= 180 && h < 240) {
            r = 0; g = x; b = c
        } else if (h >= 240 && h < 300) {
            r = x; g = 0; b = c
        } else if (h >= 300 && h < 360) {
            r = c; g = 0; b = x
        }

        return {
            r: r + m,
            g: g + m,
            b: b + m
        }
    }

    clear(): void {
        for (const [sceneId, node] of this.sceneNodeMap) {
            try {
                node.remove()
            } catch (error) {
                log('Error removing node:', sceneId, error)
            }
        }
        this.sceneNodeMap.clear()

        // Remove act frames
        for (const [actNumber, actFrame] of this.actFrames) {
            try {
                actFrame.remove()
            } catch (error) {
                log('Error removing act frame:', actNumber, error)
            }
        }
        this.actFrames.clear()

        // Remove scenes frame
        if (this.scenesFrame) {
            try {
                this.scenesFrame.remove()
            } catch (error) {
                log('Error removing scenes frame:', error)
            }
            this.scenesFrame = null
        }
    }
}

// ============================================================================
// CHARACTER MANAGER
// ============================================================================

class CharacterManager {
    private characterNodeMap: Map<string, SceneNode>
    private charactersFrame: FrameNode | null = null

    constructor() {
        this.characterNodeMap = new Map()
    }

    createCharactersFrame(): FrameNode {
        log('Creating characters frame...')

        const frame = figma.createFrame()
        frame.name = '👥 CHARACTERS'
        frame.x = 50
        frame.y = 900  // Below scenes frame
        frame.resize(2000, 400)
        frame.fills = []  // Transparent background

        figma.currentPage.appendChild(frame)
        this.charactersFrame = frame

        log('Characters frame created')
        return frame
    }

    async createCharacter(character: Character): Promise<void> {
        log('Creating character:', character.id)

        try {
            const isFigJam = figma.editorType === 'figjam'
            if (!isFigJam) {
                log('Characters only supported in FigJam')
                return
            }

            // Create sticky note for character
            const node = figma.createSticky()
            node.text.characters = this.formatCharacterText(character)

            // Position
            if (character.position) {
                node.x = character.position.x
                node.y = character.position.y
            } else {
                // Auto-position based on character count
                const charCount = this.characterNodeMap.size
                node.x = charCount * 350
                node.y = 100
            }

            // Blue color for characters
            const blueColor = { r: 0.3, g: 0.6, b: 0.9 }  // Blue
            node.fills = [{
                type: 'SOLID',
                color: blueColor
            }]

            // Add to characters frame if it exists
            if (this.charactersFrame) {
                this.charactersFrame.appendChild(node)
            } else {
                figma.currentPage.appendChild(node)
            }

            // Store node reference
            this.characterNodeMap.set(character.id, node)
            log('Character created successfully:', character.id)

        } catch (error) {
            log('Error creating character:', error)
            throw error
        }
    }

    async updateCharacter(character: Character): Promise<void> {
        log('Updating character:', character.id)

        const node = this.characterNodeMap.get(character.id)
        if (!node) {
            log('Character node not found, creating new one')
            await this.createCharacter(character)
            return
        }

        try {
            if (node.type === 'STICKY') {
                node.text.characters = this.formatCharacterText(character)
            }
            log('Character updated successfully:', character.id)
        } catch (error) {
            log('Error updating character:', error)
            throw error
        }
    }

    deleteCharacter(characterId: string): void {
        log('Deleting character:', characterId)

        const node = this.characterNodeMap.get(characterId)
        if (!node) {
            log('Character node not found')
            return
        }

        try {
            node.remove()
            this.characterNodeMap.delete(characterId)
            log('Character deleted successfully:', characterId)
        } catch (error) {
            log('Error deleting character:', error)
            throw error
        }
    }

    private formatCharacterText(character: Character): string {
        let text = `👤 ${this.toBold(character.name.toUpperCase())}\n\n`
        text += `${character.description}\n`

        if (character.imageUrl) {
            text += `\n🖼️ [Image reference]\n`
        }

        return text
    }

    private toBold(text: string): string {
        const boldMap: Record<string, string> = {
            'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛',
            'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣',
            'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫',
            'Y': '𝗬', 'Z': '𝗭',
            'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵',
            'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽',
            'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅',
            'y': '𝘆', 'z': '𝘇',
            '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳',
            '8': '𝟴', '9': '𝟵'
        }
        return text.split('').map(char => boldMap[char] || char).join('')
    }

    clear(): void {
        for (const [characterId, node] of this.characterNodeMap) {
            try {
                node.remove()
            } catch (error) {
                log('Error removing character node:', characterId, error)
            }
        }
        this.characterNodeMap.clear()

        if (this.charactersFrame) {
            try {
                this.charactersFrame.remove()
            } catch (error) {
                log('Error removing characters frame:', error)
            }
            this.charactersFrame = null
        }
    }
}

// ============================================================================
// MAIN PLUGIN LOGIC
// ============================================================================

const sceneManager = new SceneManager()
const characterManager = new CharacterManager()

figma.showUI(__html__, { width: 400, height: 500 })

figma.ui.onmessage = async (msg) => {
    log('Received message from UI:', msg.type)

    if (msg.type === 'load-credentials') {
        try {
            const savedProjectId = await figma.clientStorage.getAsync('supabase_project_id')
            const savedAnonKey = await figma.clientStorage.getAsync('supabase_anon_key')
            const savedStoryboardId = await figma.clientStorage.getAsync('default_storyboard_id')

            log('Loaded saved credentials from clientStorage')
            figma.ui.postMessage({
                type: 'credentials-loaded',
                projectId: savedProjectId || '',
                anonKey: savedAnonKey || '',
                storyboardId: savedStoryboardId || ''
            })
        } catch (error) {
            log('Error loading credentials:', error)
        }
        return
    }

    if (msg.type === 'sync-storyboard') {
        try {
            const storyboardId = msg.storyboardId.trim()

            log('Starting sync...', { storyboardId })

            // Clear existing scenes and characters
            sceneManager.clear()
            characterManager.clear()

            // Check if scenes array was passed from UI
            if (!msg.scenes || !Array.isArray(msg.scenes)) {
                throw new Error('No scenes array received from UI')
            }

            const scenes: Scene[] = msg.scenes
            const characters: Character[] = msg.characters || []
            const storyboard: StoryboardV2 | undefined = msg.storyboard

            log('Received data from UI:', {
                scenes: scenes.length,
                characters: characters.length,
                hasStoryboard: !!storyboard
            })

            // Load fonts once before creating scenes
            await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
            await figma.loadFontAsync({ family: 'Inter', style: 'Medium' })
            log('Fonts loaded successfully')

            // FigJam-only setup
            if (figma.editorType === 'figjam') {
                // Create main scenes frame
                sceneManager.createScenesFrame()

                // Set up acts structure if available
                if (storyboard?.metadata?.acts && storyboard.metadata.acts.length > 0) {
                    sceneManager.setActs(storyboard.metadata.acts)
                    sceneManager.createActFrames()
                    log('Act frames created:', storyboard.metadata.acts.length)
                }

                // Create characters frame
                characterManager.createCharactersFrame()
            }

            // Create initial scenes
            for (const scene of scenes) {
                await sceneManager.createScene(scene)
            }

            // Create characters
            for (const character of characters) {
                await characterManager.createCharacter(character)
            }

            // Create connectors between scenes (FigJam only)
            sceneManager.createConnectors(scenes)

            figma.ui.postMessage({
                type: 'sync-complete',
                sceneCount: scenes.length,
                characterCount: characters.length
            })

            // Realtime connection is handled by UI (WebSocket from browser)
            log('Initial sync complete, waiting for realtime updates from UI...')

        } catch (error: unknown) {
            log('Sync error:', error)
            const message = error instanceof Error ? error.message : 'Unknown error'
            figma.ui.postMessage({
                type: 'sync-error',
                message
            })
            figma.ui.postMessage({
                type: 'realtime-status',
                status: 'error'
            })
        }
    }

    if (msg.type === 'scene-inserted') {
        log('Scene inserted from UI:', msg.scene)
        await sceneManager.createScene(msg.scene)
    }

    if (msg.type === 'scene-updated') {
        log('Scene updated from UI:', msg.scene)
        await sceneManager.updateScene(msg.scene)
    }

    if (msg.type === 'scene-deleted') {
        log('Scene deleted from UI:', msg.sceneId)
        sceneManager.deleteScene(msg.sceneId)
    }

    if (msg.type === 'character-inserted') {
        log('Character inserted from UI:', msg.character)
        await characterManager.createCharacter(msg.character)
    }

    if (msg.type === 'character-updated') {
        log('Character updated from UI:', msg.character)
        await characterManager.updateCharacter(msg.character)
    }

    if (msg.type === 'character-deleted') {
        log('Character deleted from UI:', msg.characterId)
        characterManager.deleteCharacter(msg.characterId)
    }

    if (msg.type === 'save-credentials') {
        log('Saving credentials to clientStorage...')
        try {
            await figma.clientStorage.setAsync('supabase_project_id', msg.projectId)
            await figma.clientStorage.setAsync('supabase_anon_key', msg.anonKey)
            await figma.clientStorage.setAsync('default_storyboard_id', msg.storyboardId || '')

            figma.ui.postMessage({
                type: 'credentials-saved',
                success: true
            })
            log('Credentials saved successfully')
        } catch (error: unknown) {
            log('Error saving credentials:', error)
            const message = error instanceof Error ? error.message : 'Unknown error'
            figma.ui.postMessage({
                type: 'credentials-saved',
                success: false,
                error: message
            })
        }
    }

    if (msg.type === 'clear-credentials') {
        log('Clearing credentials from clientStorage...')
        try {
            await figma.clientStorage.deleteAsync('supabase_project_id')
            await figma.clientStorage.deleteAsync('supabase_anon_key')
            await figma.clientStorage.deleteAsync('default_storyboard_id')

            figma.ui.postMessage({
                type: 'credentials-cleared',
                success: true
            })
            log('Credentials cleared successfully')
        } catch (error: unknown) {
            log('Error clearing credentials:', error)
            const message = error instanceof Error ? error.message : 'Unknown error'
            figma.ui.postMessage({
                type: 'credentials-cleared',
                success: false,
                error: message
            })
        }
    }

    if (msg.type === 'test-image') {
        log('Testing image generation...')
        try {
            // Create image from URL (random image from picsum.photos)
            const imageUrl = 'https://picsum.photos/400/300'
            log('Loading image from:', imageUrl)

            const image = await figma.createImageAsync(imageUrl)
            log('Image loaded successfully, hash:', image.hash)

            // Get image dimensions
            const { width, height } = await image.getSizeAsync()
            log('Image size:', width, 'x', height)

            // Create rectangle node
            const rect = figma.createRectangle()
            rect.resize(width, height)
            rect.x = 100
            rect.y = 100
            rect.name = '🎨 Test Image'

            // Apply image fill
            rect.fills = [{
                type: 'IMAGE',
                imageHash: image.hash,
                scaleMode: 'FILL'
            }]

            // Add to current page
            figma.currentPage.appendChild(rect)

            // Select the created node
            figma.currentPage.selection = [rect]
            figma.viewport.scrollAndZoomIntoView([rect])

            figma.ui.postMessage({
                type: 'sync-complete',
                message: `✅ Test image created! (${width}x${height})`
            })

            log('Test image created successfully')
        } catch (error: unknown) {
            log('Error creating test image:', error)
            const message = error instanceof Error ? error.message : 'Unknown error'
            figma.ui.postMessage({
                type: 'sync-error',
                message: `Failed to create image: ${message}`
            })
        }
    }

    if (msg.type === 'cancel') {
        log('Canceling...')
        sceneManager.clear()
        figma.closePlugin()
    }
}