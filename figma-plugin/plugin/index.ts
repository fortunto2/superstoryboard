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
    private imageNodeMap: Map<string, RectangleNode>
    private scenesFrame: SectionNode | null = null
    private actFrames: Map<number, SectionNode> = new Map()
    private acts: Act[] = []

    constructor() {
        this.sceneNodeMap = new Map()
        this.imageNodeMap = new Map()
    }

    setActs(acts: Act[]) {
        this.acts = acts
        log('Acts structure set:', acts)
    }

    findExistingNode(nodeId: string): StickyNode | null {
        // Find existing sticky note by Figma node ID
        try {
            const node = figma.getNodeById(nodeId)
            if (node && node.type === 'STICKY') {
                return node as StickyNode
            }
        } catch (_error) {
            log('Node not found:', nodeId)
        }
        return null
    }

    initializeFromCanvas(): void {
        // Scan canvas for existing sticky notes with scene data
        // This is called before sync to preserve existing nodes
        log('Initializing from canvas...')

        // Clear old references first
        this.scenesFrame = null
        this.actFrames.clear()

        const scenesSection = figma.currentPage.findChild(node => node.name === '📝 SCENES') as SectionNode | null
        if (scenesSection && !scenesSection.removed) {
            this.scenesFrame = scenesSection
            log('Found existing SCENES section')

            // Find act sections
            scenesSection.findAll(node => node.type === 'SECTION' && node.name.startsWith('🟧')).forEach(section => {
                const sectionNode = section as SectionNode
                if (!sectionNode.removed) {
                    this.actFrames.set(1, sectionNode)
                    log('Found existing Act 1 section')
                }
            })
            scenesSection.findAll(node => node.type === 'SECTION' && node.name.startsWith('🟩')).forEach(section => {
                const sectionNode = section as SectionNode
                if (!sectionNode.removed) {
                    this.actFrames.set(2, sectionNode)
                    log('Found existing Act 2 section')
                }
            })
            scenesSection.findAll(node => node.type === 'SECTION' && node.name.startsWith('🟪')).forEach(section => {
                const sectionNode = section as SectionNode
                if (!sectionNode.removed) {
                    this.actFrames.set(3, sectionNode)
                    log('Found existing Act 3 section')
                }
            })
        } else {
            log('No existing SCENES section found, will create new')
        }
    }

    createScenesFrame(): SectionNode {
        log('Creating main scenes section...')

        const section = figma.createSection()
        section.name = '📝 SCENES'
        section.x = 50
        section.y = 50

        // Set large size to contain all acts (wider for 1.5x sticky cards)
        // Will be auto-adjusted by FigJam based on content
        section.resizeWithoutConstraints(12000, 1600)

        section.fills = [] // Transparent background

        figma.currentPage.appendChild(section)
        this.scenesFrame = section

        log('Main scenes section created (8000x1500px)')
        return section
    }

    createActSections(): void {
        if (!this.scenesFrame || this.scenesFrame.removed || this.acts.length === 0) {
            log('Skipping act sections - no valid scenes section or acts defined')
            return
        }

        log('Creating act sections...')

        const actColors = {
            1: { h: 30, s: 0.8, l: 0.75, name: '🟧 Act 1' },  // Orange
            2: { h: 120, s: 0.7, l: 0.7, name: '🟩 Act 2' },  // Green
            3: { h: 280, s: 0.7, l: 0.75, name: '🟪 Act 3' }  // Purple
        }

        // Constants for spacing calculations (same as in createNewScene)
        const STICKY_WIDTH = 600  // 1.5x wider
        const STICKY_SPACING = 50
        const SECTION_PADDING = 100
        const ACT_SECTION_GAP = 300  // Gap between act sections
        const IMAGE_HEIGHT = 300  // Scene image height (1.5x)
        const IMAGE_MARGIN = 20  // Gap between image and sticky
        const STICKY_HEIGHT_ESTIMATE = 800  // Estimated max sticky note height
        const SECTION_VERTICAL_PADDING = 200  // Top + bottom padding

        let offsetX = 100

        for (const act of this.acts) {
            const actColor = actColors[act.number as keyof typeof actColors]
            if (!actColor) continue

            // Calculate dynamic size based on scene count in this act
            // Default to 5 scenes if sceneRange not defined, otherwise use actual range
            let scenesInAct = 5  // Default assumption
            if (act.sceneRange && act.sceneRange.length === 2) {
                scenesInAct = act.sceneRange[1] - act.sceneRange[0] + 1
            }

            // Width needed for this act = padding + (scenes * (width + spacing)) + padding
            const actWidth = (SECTION_PADDING * 2) + (scenesInAct * (STICKY_WIDTH + STICKY_SPACING))
            // Height: image + margin + sticky + padding (updated for larger image)
            const actHeight = IMAGE_HEIGHT + IMAGE_MARGIN + STICKY_HEIGHT_ESTIMATE + SECTION_VERTICAL_PADDING

            const actSection = figma.createSection()
            actSection.name = `${actColor.name}: ${act.name}`
            actSection.x = offsetX
            actSection.y = 100

            // Set size BEFORE adding to parent
            actSection.resizeWithoutConstraints(actWidth, actHeight)

            // Semi-transparent background
            const bgColor = this.hslToRgb(actColor.h, actColor.s, actColor.l)
            actSection.fills = [{
                type: 'SOLID',
                color: bgColor,
                opacity: 0.1
            }]

            this.scenesFrame.appendChild(actSection)
            this.actFrames.set(act.number, actSection)

            offsetX += actWidth + ACT_SECTION_GAP

            log(`Created act section: ${act.name} (${scenesInAct} scenes, ${actWidth}x${actHeight}px)`)
        }
    }

    async createOrUpdateScene(scene: Scene): Promise<string | undefined> {
        log('Creating or updating scene:', scene.id)

        // Try to find existing node if figmaNodeId is provided
        let existingNode: StickyNode | null = null
        if (scene.figmaNodeId) {
            existingNode = this.findExistingNode(scene.figmaNodeId)
            if (existingNode) {
                log('Found existing node, updating:', scene.figmaNodeId)
                await this.updateExistingScene(existingNode, scene)
                this.sceneNodeMap.set(scene.id, existingNode)
                return scene.figmaNodeId
            } else {
                log('Node ID provided but not found, creating new:', scene.figmaNodeId)
            }
        }

        // Create new node
        return await this.createNewScene(scene)
    }

    private async createNewScene(scene: Scene): Promise<string | undefined> {
        log('Creating new scene:', scene.id)

        try {
            const isFigJam = figma.editorType === 'figjam'
            let node: SceneNode
            let imageNode: RectangleNode | null = null

            if (isFigJam) {
                // Ensure scenes frame exists
                if (!this.scenesFrame) {
                    this.createScenesFrame()
                }

                // Ensure act frames exist if acts are defined
                if (this.acts.length > 0 && this.actFrames.size === 0) {
                    this.createActSections()
                }

                // Spacing constants
                const STICKY_WIDTH = 600  // 1.5x wider
                const STICKY_SPACING = 50
                const SECTION_PADDING = 100
                const IMAGE_WIDTH = 450  // 1.5x wider (matches sticky proportion)
                const IMAGE_HEIGHT = 300  // 1.5x taller (keep aspect ratio)
                const IMAGE_MARGIN = 20  // Gap between image and sticky

                // Add to act section if exists, otherwise to scenes section
                const actNumber = scene.actNumber || 1
                const actSection = this.actFrames.get(actNumber)

                // Count scenes in this act to position them
                const actSceneCount = this.getSceneCountInAct(actNumber)

                // Calculate base position
                const baseX = SECTION_PADDING + (actSceneCount * (STICKY_WIDTH + STICKY_SPACING))
                const baseY = 100

                // Create image if imageUrl exists
                if (scene.imageUrl) {
                    try {
                        imageNode = await this.createSceneImage(scene.imageUrl, IMAGE_WIDTH, IMAGE_HEIGHT)
                        imageNode.name = `🎨 Image: Scene ${scene.sceneNumber}`
                        log('Scene image created from:', scene.imageUrl)
                    } catch (error) {
                        log('Failed to load scene image:', error)
                    }
                }

                // Create sticky note in FigJam
                const stickyNode = figma.createSticky()
                stickyNode.text.characters = this.formatSceneText(scene)

                // Apply color (uses scene.color if set, otherwise act color)
                this.applySceneColor(stickyNode, scene)

                // Try to make sticky wider by setting minimum width
                // StickyNode doesn't support resize(), but may support size constraints
                try {
                    stickyNode.minWidth = STICKY_WIDTH
                    log('Set sticky minWidth to:', STICKY_WIDTH)
                } catch (error) {
                    log('Could not set sticky minWidth:', error)
                }

                // Position nodes based on whether we have an image
                const stickyY = imageNode ? baseY + IMAGE_HEIGHT + IMAGE_MARGIN : baseY

                // Check if act section exists and wasn't removed
                if (actSection && !actSection.removed) {
                    // Add image to section if exists
                    if (imageNode) {
                        actSection.appendChild(imageNode)
                        imageNode.x = baseX
                        imageNode.y = baseY
                        log('Added image at relative position', baseX, baseY)
                    }

                    // Add sticky to section
                    actSection.appendChild(stickyNode)
                    stickyNode.x = baseX
                    stickyNode.y = stickyY
                    log('Added to act section:', actNumber, 'at relative position', baseX, stickyY)
                } else if (this.scenesFrame && !this.scenesFrame.removed) {
                    // Add image to scenes section if exists
                    if (imageNode) {
                        this.scenesFrame.appendChild(imageNode)
                        imageNode.x = baseX
                        imageNode.y = baseY
                    }

                    // Add sticky to scenes section
                    this.scenesFrame.appendChild(stickyNode)
                    stickyNode.x = baseX
                    stickyNode.y = stickyY
                    log('Added to scenes section at relative position', baseX, stickyY)
                } else {
                    // Fallback to current page if sections were deleted
                    if (imageNode) {
                        figma.currentPage.appendChild(imageNode)
                        imageNode.x = baseX
                        imageNode.y = baseY
                    }

                    figma.currentPage.appendChild(stickyNode)
                    stickyNode.x = baseX
                    stickyNode.y = stickyY
                    log('Added to current page (no valid sections)')
                }

                node = stickyNode
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

            // Store node references
            this.sceneNodeMap.set(scene.id, node)
            if (imageNode) {
                this.imageNodeMap.set(scene.id, imageNode)
            }
            log('Scene created successfully:', scene.id)

            // Return Figma node ID
            return node.id

        } catch (error) {
            log('Error creating scene:', error)
            throw error
        }
    }

    private async updateExistingScene(node: StickyNode, scene: Scene): Promise<void> {
        log('Updating existing scene node:', scene.id)

        try {
            // Read current color before updating
            const currentColor = this.getNodeColor(node)

            // Update text
            node.text.characters = this.formatSceneText(scene)

            // Update color: use scene.color if set, otherwise keep current, fallback to act color
            if (scene.color) {
                // Scene has explicit color saved
                this.applySceneColor(node, scene)
            } else if (currentColor) {
                // Keep existing color by saving it to scene object
                log('Preserving existing color:', currentColor)
                // Color stays as is
            } else {
                // No saved color and no current color, use act color
                this.applySceneColor(node, scene)
            }

            log('Scene updated successfully:', scene.id)

        } catch (error) {
            log('Error updating scene:', error)
            throw error
        }
    }

    async updateScene(scene: Scene): Promise<void> {
        log('Updating scene:', scene.id)

        const node = this.sceneNodeMap.get(scene.id)
        if (!node) {
            log('Scene node not found, creating new one')
            await this.createOrUpdateScene(scene)
            return
        }

        try {
            const isFigJam = figma.editorType === 'figjam'
            const formattedText = this.formatSceneText(scene)

            if (isFigJam && node.type === 'STICKY') {
                node.text.characters = formattedText

                // Handle image update
                await this.updateSceneImage(scene, node)
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

    private async updateSceneImage(scene: Scene, stickyNode: StickyNode): Promise<void> {
        // Priority: Check mediaId first, then fall back to imageUrl
        let imageUrl = scene.imageUrl

        // If scene has mediaId, it might have a better/newer URL from media table
        // For now, we'll use imageUrl directly since Edge Function updates both
        // In future, we could fetch from media table via API

        if (!imageUrl) {
            log('No imageUrl for scene:', scene.id)
            return
        }

        const IMAGE_WIDTH = 450
        const IMAGE_HEIGHT = 300
        const IMAGE_MARGIN = 20

        // Check if image node already exists
        let imageNode = this.imageNodeMap.get(scene.id)

        if (imageNode && !imageNode.removed) {
            // Update existing image
            log('Updating existing image for scene:', scene.id)
            try {
                const newImageNode = await this.createSceneImage(scene.imageUrl, IMAGE_WIDTH, IMAGE_HEIGHT)
                newImageNode.name = `🎨 Image: Scene ${scene.sceneNumber}`

                // Position new image at same location as old one
                newImageNode.x = imageNode.x
                newImageNode.y = imageNode.y

                // Add to same parent
                const parent = imageNode.parent
                if (parent) {
                    parent.appendChild(newImageNode)
                }

                // Remove old image
                imageNode.remove()

                // Update reference
                this.imageNodeMap.set(scene.id, newImageNode)
                log('Image updated successfully')

            } catch (error) {
                log('Failed to update image:', error)
            }
        } else {
            // Create new image
            log('Creating new image for scene:', scene.id)
            try {
                const newImageNode = await this.createSceneImage(scene.imageUrl, IMAGE_WIDTH, IMAGE_HEIGHT)
                newImageNode.name = `🎨 Image: Scene ${scene.sceneNumber}`

                // Position image above sticky
                const parent = stickyNode.parent
                if (parent && parent.type === 'SECTION') {
                    parent.appendChild(newImageNode)
                    newImageNode.x = stickyNode.x
                    newImageNode.y = stickyNode.y - IMAGE_HEIGHT - IMAGE_MARGIN

                    // Move sticky down
                    stickyNode.y = stickyNode.y
                } else if (parent) {
                    parent.appendChild(newImageNode)
                    newImageNode.x = stickyNode.x
                    newImageNode.y = stickyNode.y - IMAGE_HEIGHT - IMAGE_MARGIN
                }

                // Store reference
                this.imageNodeMap.set(scene.id, newImageNode)
                log('Image created successfully')

            } catch (error) {
                log('Failed to create image:', error)
            }
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
            // Remove sticky/frame node
            node.remove()
            this.sceneNodeMap.delete(sceneId)

            // Remove image node if exists
            const imageNode = this.imageNodeMap.get(sceneId)
            if (imageNode && !imageNode.removed) {
                imageNode.remove()
                this.imageNodeMap.delete(sceneId)
                log('Image node deleted for scene:', sceneId)
            }

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

    private rgbToHex(rgb: RGB): string {
        // Convert Figma RGB (0-1) to hex color
        const r = Math.round(rgb.r * 255)
        const g = Math.round(rgb.g * 255)
        const b = Math.round(rgb.b * 255)
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    }

    private hexToRgb(hex: string): RGB | null {
        // Convert hex color to Figma RGB (0-1)
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        if (!result) {
            return null
        }
        return {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        }
    }

    private getNodeColor(node: SceneNode): string | null {
        // Get color from sticky note
        if (node.type === 'STICKY' && node.fills && typeof node.fills !== 'symbol') {
            const fills = node.fills as readonly Paint[]
            if (fills.length > 0) {
                const fill = fills[0]
                if (fill.type === 'SOLID') {
                    return this.rgbToHex(fill.color)
                }
            }
        }
        return null
    }

    private applySceneColor(node: StickyNode, scene: Scene): void {
        // Apply color: use scene.color if set, otherwise color by act
        let color: RGB

        if (scene.color) {
            // Use saved color
            const rgb = this.hexToRgb(scene.color)
            if (rgb) {
                color = rgb
                log('Using saved color:', scene.color)
            } else {
                log('Invalid color format, using act color:', scene.color)
                color = this.getActColor(scene.actNumber || 1)
            }
        } else {
            // Use act-based color
            color = this.getActColor(scene.actNumber || 1)
        }

        node.fills = [{
            type: 'SOLID',
            color: color
        }]
    }

    async createSceneImage(imageUrl: string, width: number, height: number): Promise<RectangleNode> {
        log('Creating scene image from URL:', imageUrl)

        try {
            // Fetch image from URL
            const response = await fetch(imageUrl)
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status}`)
            }

            // Convert to Uint8Array
            const arrayBuffer = await response.arrayBuffer()
            const imageBytes = new Uint8Array(arrayBuffer)

            // Create Figma image
            const image = figma.createImage(imageBytes)

            // Create rectangle to hold the image
            const rect = figma.createRectangle()
            rect.resize(width, height)

            // Apply image fill
            rect.fills = [{
                type: 'IMAGE',
                scaleMode: 'FILL',
                imageHash: image.hash
            }]

            // Add rounded corners
            rect.cornerRadius = 8

            log('Image created successfully')
            return rect

        } catch (error) {
            log('Error creating scene image:', error)
            throw error
        }
    }

    private getActColor(actNumber: number): RGB {
        // Get color by act number
        const actColors = {
            1: { h: 30, s: 0.8, l: 0.75 },   // Orange
            2: { h: 120, s: 0.7, l: 0.7 },   // Green
            3: { h: 280, s: 0.7, l: 0.75 }   // Purple
        }

        const actColor = actColors[actNumber as keyof typeof actColors] || actColors[1]
        return this.hslToRgb(actColor.h, actColor.s, actColor.l)
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

    private getSceneCountInAct(actNumber: number): number {
        // Count how many scenes are already in this act section
        let count = 0
        const targetSection = this.actFrames.get(actNumber)

        if (!targetSection || targetSection.removed) {
            return 0
        }

        // Check each node in the map
        for (const [sceneId, node] of this.sceneNodeMap) {
            try {
                // Check if node's parent is the target act section
                if (node.parent === targetSection) {
                    count++
                }
            } catch (error) {
                // Node might have been deleted, skip it
                continue
            }
        }

        log(`Act ${actNumber} has ${count} scenes`)
        return count
    }

    clear(): void {
        // Remove sticky/frame nodes
        for (const [sceneId, node] of this.sceneNodeMap) {
            try {
                node.remove()
            } catch (error) {
                log('Error removing node:', sceneId, error)
            }
        }
        this.sceneNodeMap.clear()

        // Remove image nodes
        for (const [sceneId, imageNode] of this.imageNodeMap) {
            try {
                imageNode.remove()
            } catch (error) {
                log('Error removing image node:', sceneId, error)
            }
        }
        this.imageNodeMap.clear()

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
    private charactersFrame: SectionNode | null = null

    constructor() {
        this.characterNodeMap = new Map()
    }

    initializeFromCanvas(): void {
        // Find existing characters section
        log('Initializing CharacterManager from canvas...')

        // Clear old reference first
        this.charactersFrame = null

        const charactersSection = figma.currentPage.findChild(node => node.name === '👥 CHARACTERS') as SectionNode | null
        if (charactersSection && !charactersSection.removed) {
            this.charactersFrame = charactersSection
            log('Found existing CHARACTERS section')
        } else {
            log('No existing CHARACTERS section found, will create new')
        }
    }

    createCharactersFrame(): SectionNode {
        log('Creating characters section...')

        const section = figma.createSection()
        section.name = '👥 CHARACTERS'
        section.x = 50
        section.y = 900  // Below scenes section

        // Set size for character cards (width for ~5 characters)
        section.resizeWithoutConstraints(2500, 600)

        section.fills = []  // Transparent background

        figma.currentPage.appendChild(section)
        this.charactersFrame = section

        log('Characters section created (2500x600px)')
        return section
    }

    async createCharacter(character: Character): Promise<void> {
        log('Creating character:', character.id)

        try {
            const isFigJam = figma.editorType === 'figjam'
            if (!isFigJam) {
                log('Characters only supported in FigJam')
                return
            }

            // Ensure characters frame exists
            if (!this.charactersFrame || this.charactersFrame.removed) {
                this.createCharactersFrame()
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

            // Add to characters frame if it exists and wasn't removed
            if (this.charactersFrame && !this.charactersFrame.removed) {
                this.charactersFrame.appendChild(node)
                log('Added to characters frame')
            } else {
                figma.currentPage.appendChild(node)
                log('Added to current page (no valid characters frame)')
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

            log('Starting smart sync...', { storyboardId })

            // Initialize from existing canvas (find existing frames and nodes)
            sceneManager.initializeFromCanvas()
            characterManager.initializeFromCanvas()

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
                // Set up acts structure if available
                if (storyboard?.metadata?.acts && storyboard.metadata.acts.length > 0) {
                    sceneManager.setActs(storyboard.metadata.acts)
                }
            }

            // Create or update scenes (preserves existing nodes and colors)
            const updatedScenes: Array<{sceneId: string; figmaNodeId: string | undefined}> = []
            for (const scene of scenes) {
                const figmaNodeId = await sceneManager.createOrUpdateScene(scene)
                if (figmaNodeId) {
                    updatedScenes.push({ sceneId: scene.id, figmaNodeId })
                }
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
                characterCount: characters.length,
                updatedScenes // Send back figmaNodeIds to save in database
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
        await sceneManager.createOrUpdateScene(msg.scene)
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

    if (msg.type === 'cancel') {
        log('Canceling...')
        sceneManager.clear()
        figma.closePlugin()
    }

    if (msg.type === 'insert-generated-media') {
        log('Inserting generated media:', msg.mediaUrl, msg.mediaType)

        try {
            const IMAGE_WIDTH = 450
            const IMAGE_HEIGHT = 300

            if (msg.mediaType === 'image') {
                // Create image from URL
                const imageNode = await sceneManager.createSceneImage(msg.mediaUrl, IMAGE_WIDTH, IMAGE_HEIGHT)
                imageNode.name = `🎨 Generated Image`

                // Try to find position context
                let targetX = 0
                let targetY = 0

                // Check current selection for position context
                if (figma.currentPage.selection.length > 0) {
                    const selected = figma.currentPage.selection[0]
                    if ('x' in selected && 'y' in selected && 'width' in selected && 'height' in selected) {
                        targetX = selected.x + selected.width + 50
                        targetY = selected.y
                    }
                }
                // Fallback: center of viewport
                else {
                    const viewport = figma.viewport.bounds
                    targetX = viewport.x + (viewport.width - IMAGE_WIDTH) / 2
                    targetY = viewport.y + (viewport.height - IMAGE_HEIGHT) / 2
                }

                // Add to current page
                figma.currentPage.appendChild(imageNode)
                imageNode.x = targetX
                imageNode.y = targetY

                // Select and zoom to the new image
                figma.currentPage.selection = [imageNode]
                figma.viewport.scrollAndZoomIntoView([imageNode])

                figma.ui.postMessage({
                    type: 'media-inserted',
                    success: true,
                    mediaType: 'image'
                })

                log('Image inserted at:', targetX, targetY)

            } else if (msg.mediaType === 'video') {
                // For videos, create a frame with preview image and play button
                const videoFrame = figma.createFrame()
                videoFrame.name = `🎬 Generated Video`
                videoFrame.resize(IMAGE_WIDTH, IMAGE_HEIGHT)

                // Add video preview if available
                if (msg.previewUrl) {
                    try {
                        const previewImage = await sceneManager.createSceneImage(msg.previewUrl, IMAGE_WIDTH, IMAGE_HEIGHT)
                        videoFrame.appendChild(previewImage)
                        previewImage.x = 0
                        previewImage.y = 0
                    } catch (error) {
                        log('Failed to load video preview:', error)
                    }
                }

                // Add play button overlay
                const playButton = figma.createEllipse()
                playButton.resize(60, 60)
                playButton.x = (IMAGE_WIDTH - 60) / 2
                playButton.y = (IMAGE_HEIGHT - 60) / 2
                playButton.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.7 }]
                videoFrame.appendChild(playButton)

                // Add play icon (triangle)
                const playIcon = figma.createPolygon()
                playIcon.pointCount = 3
                playIcon.resize(20, 25)
                playIcon.x = (IMAGE_WIDTH - 20) / 2 + 5
                playIcon.y = (IMAGE_HEIGHT - 25) / 2
                playIcon.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]
                playIcon.rotation = 90
                videoFrame.appendChild(playIcon)

                // Add video URL to frame name
                videoFrame.name = `🎬 Generated Video - ${msg.mediaUrl.slice(0, 50)}...`

                // Position using same logic as image
                let targetX = 0
                let targetY = 0

                if (figma.currentPage.selection.length > 0) {
                    const selected = figma.currentPage.selection[0]
                    if ('x' in selected && 'y' in selected && 'width' in selected && 'height' in selected) {
                        targetX = selected.x + selected.width + 50
                        targetY = selected.y
                    }
                } else {
                    const viewport = figma.viewport.bounds
                    targetX = viewport.x + (viewport.width - IMAGE_WIDTH) / 2
                    targetY = viewport.y + (viewport.height - IMAGE_HEIGHT) / 2
                }

                figma.currentPage.appendChild(videoFrame)
                videoFrame.x = targetX
                videoFrame.y = targetY

                // Select and zoom to the new video
                figma.currentPage.selection = [videoFrame]
                figma.viewport.scrollAndZoomIntoView([videoFrame])

                figma.ui.postMessage({
                    type: 'media-inserted',
                    success: true,
                    mediaType: 'video'
                })

                log('Video frame inserted at:', targetX, targetY)
            }

        } catch (error) {
            log('Error inserting media:', error)
            figma.ui.postMessage({
                type: 'media-inserted',
                success: false,
                error: 'Failed to insert media'
            })
        }
    }

    if (msg.type === 'extract-context') {
        log('Extracting Figma context...')

        try {
            const selection = figma.currentPage.selection
            const context: any = {
                selectionCount: selection.length,
                metadata: [],
                textContent: [],
                pageContext: {
                    pageName: figma.currentPage.name,
                    totalNodes: figma.currentPage.children.length
                }
            }

            // Extract metadata from selected nodes
            for (const node of selection.slice(0, 10)) { // Limit to 10 nodes for size
                const metadata: any = {
                    id: node.id,
                    name: node.name,
                    type: node.type
                }

                // Add position and size for relevant node types
                if ('x' in node && 'y' in node && 'width' in node && 'height' in node) {
                    metadata.x = Math.round(node.x)
                    metadata.y = Math.round(node.y)
                    metadata.width = Math.round(node.width)
                    metadata.height = Math.round(node.height)
                }

                context.metadata.push(metadata)

                // Extract text content
                if (node.type === 'TEXT') {
                    const textNode = node as TextNode
                    const chars = textNode.characters
                    if (chars && chars.length > 0) {
                        context.textContent.push(chars.slice(0, 200)) // Limit text length
                    }
                } else if ('text' in node) {
                    // Handle nodes with text property (like STICKY_NOTE, SHAPE_WITH_TEXT)
                    const textNode = node as any
                    if (textNode.text && textNode.text.characters) {
                        context.textContent.push(textNode.text.characters.slice(0, 200))
                    }
                }
            }

            // If no selection, extract context from viewport
            if (selection.length === 0) {
                const viewport = figma.viewport.bounds
                if (viewport) {
                    context.pageContext.viewport = {
                        x: Math.round(viewport.x),
                        y: Math.round(viewport.y),
                        width: Math.round(viewport.width),
                        height: Math.round(viewport.height)
                    }
                }

                // Find nodes in viewport (limited scan)
                const allNodes = figma.currentPage.findAll(n => true).slice(0, 50)
                for (const node of allNodes) {
                    if ('x' in node && 'y' in node && 'width' in node && 'height' in node) {
                        const nodeX = node.x as number
                        const nodeY = node.y as number
                        if (nodeX >= viewport.x && nodeX <= viewport.x + viewport.width &&
                            nodeY >= viewport.y && nodeY <= viewport.y + viewport.height) {

                            if (node.type === 'TEXT') {
                                const textContent = (node as TextNode).characters
                                if (textContent) {
                                    context.textContent.push(textContent.slice(0, 100))
                                }
                            } else if ('text' in node) {
                                // Handle nodes with text property
                                const textNode = node as any
                                if (textNode.text && textNode.text.characters) {
                                    context.textContent.push(textNode.text.characters.slice(0, 100))
                                }
                            }
                        }
                    }
                }
            }

            figma.ui.postMessage({
                type: 'context-extracted',
                context: context
            })

            log('Context extracted successfully')
        } catch (error) {
            log('Error extracting context:', error)
            figma.ui.postMessage({
                type: 'context-extracted',
                context: null,
                error: 'Failed to extract context'
            })
        }
    }
}

// ============================================================================
// SELECTION TRACKING
// ============================================================================

function analyzeSelection() {
    const selection = figma.currentPage.selection
    let hasImage = false
    let imageUrl: string | undefined
    let sceneId: string | undefined

    log('Analyzing selection:', selection.length, 'items')

    if (selection.length === 1) {
        const node = selection[0]

        // Check if it's an image rectangle
        if (node.type === 'RECTANGLE') {
            const fills = node.fills
            if (Array.isArray(fills)) {
                for (const fill of fills) {
                    if (fill.type === 'IMAGE') {
                        hasImage = true
                        // Try to get image URL from name pattern or related scene
                        log('Image rectangle found, checking for URL...')
                        break
                    }
                }
            }
        }

        // Try to extract sceneId from node name
        // Patterns: "🎨 Image: Scene 1", "Scene 1:", etc.
        const nameMatch = node.name.match(/Scene (\d+)/i)
        if (nameMatch) {
            sceneId = `scene-${nameMatch[1]}`
            log('Found sceneId from name:', sceneId)
        }
    }

    figma.ui.postMessage({
        type: 'selection-changed',
        count: selection.length,
        hasImage,
        imageUrl,
        sceneId
    })
}

// Listen for selection changes
figma.on('selectionchange', () => {
    log('Selection changed')
    analyzeSelection()
})

// Send initial selection state after UI loads
setTimeout(() => {
    log('Sending initial selection state')
    analyzeSelection()
}, 200)