import { useState, useEffect } from 'react';
import './styles/index.scss';

type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface Notification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

function App() {
  const [projectId, setProjectId] = useState(import.meta.env.VITE_SUPABASE_PROJECT_ID || '');
  const [publicAnonKey, setPublicAnonKey] = useState(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
  const [storyboardId, setStoryboardId] = useState(import.meta.env.VITE_DEFAULT_STORYBOARD_ID || '');
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('disconnected');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [previousScenes, setPreviousScenes] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    window.onmessage = (event) => {
      const { type, status, message, sceneNumber } = event.data.pluginMessage || {};

      switch (type) {
        case 'realtime-status':
          setRealtimeStatus(status);
          break;

        case 'sync-complete':
          setIsLoading(false);
          addNotification(message, 'success');
          break;

        case 'sync-error':
          setIsLoading(false);
          addNotification(message, 'error');
          break;

        case 'scene-inserted':
          addNotification(`Scene ${sceneNumber} inserted`, 'info');
          break;

        case 'scene-updated':
          addNotification(`Scene ${sceneNumber} updated`, 'info');
          break;

        case 'scene-deleted':
          addNotification('Scene deleted', 'info');
          break;

        case 'realtime-error':
          addNotification(`Realtime error: ${message}`, 'error');
          break;
      }
    };
  }, []);

  function addNotification(message: string, type: 'success' | 'error' | 'info') {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  }

  async function handleSync() {
    if (!projectId || !publicAnonKey || !storyboardId) {
      addNotification('Please fill all fields', 'error');
      return;
    }

    setIsLoading(true);

    try {
      // Fetch storyboard data from UI (browser environment - works!)
      const url = `https://${projectId}.supabase.co/rest/v1/kv_store_7ee7668a?key=eq.storyboard:${storyboardId}&select=*`;

      console.log('[UI] Fetching storyboard from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': publicAnonKey,
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });

      console.log('[UI] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[UI] Error response:', errorText);
        throw new Error(`Failed to fetch: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('[UI] Storyboard data:', data);

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Storyboard not found');
      }

      const storyboardData = data[0].value;

      // Build initial scene map
      const initialScenes = new Map();
      for (const scene of storyboardData.scenes) {
        initialScenes.set(scene.id, scene);
      }
      setPreviousScenes(initialScenes);

      // Send storyboard data to plugin
      parent.postMessage({
        pluginMessage: {
          type: 'sync-storyboard',
          projectId,
          publicAnonKey,
          storyboardId,
          storyboardData // Pass the fetched data
        }
      }, '*');

      // Connect WebSocket for realtime updates
      connectWebSocket(projectId, publicAnonKey, storyboardId);

    } catch (error: any) {
      setIsLoading(false);
      addNotification(error.message || 'Failed to sync', 'error');
      console.error('[UI] Sync error:', error);
    }
  }

  function connectWebSocket(projectId: string, publicAnonKey: string, storyboardId: string) {
    const wsUrl = `wss://${projectId}.supabase.co/realtime/v1/websocket?apikey=${publicAnonKey}&vsn=1.0.0`;

    console.log('[UI] Connecting to WebSocket:', wsUrl);
    setRealtimeStatus('connecting');

    const websocket = new WebSocket(wsUrl);
    let messageRef = 0;
    let heartbeatInterval: any = null;

    websocket.onopen = () => {
      console.log('[UI] WebSocket connected, readyState:', websocket.readyState);
      setRealtimeStatus('connected');

      // Start heartbeat (every 30 seconds)
      heartbeatInterval = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          messageRef++;
          const heartbeat = {
            event: 'heartbeat',
            topic: 'phoenix',
            payload: {},
            ref: messageRef.toString()
          };
          console.log('[UI] Sending heartbeat:', heartbeat);
          websocket.send(JSON.stringify(heartbeat));
        } else {
          console.log('[UI] Heartbeat skipped, readyState:', websocket.readyState);
        }
      }, 30000);

      // Join channel with correct format
      messageRef++;
      const channelTopic = `realtime:public:kv_store_7ee7668a:key=eq.storyboard:${storyboardId}`;
      const joinMessage = {
        event: 'phx_join',
        topic: channelTopic,
        payload: {
          config: {
            postgres_changes: [
              {
                event: '*',
                schema: 'public',
                table: 'kv_store_7ee7668a',
                filter: `key=eq.storyboard:${storyboardId}`
              }
            ]
          }
        },
        ref: messageRef.toString()
      };
      console.log('[UI] Sending join message:', joinMessage);
      websocket.send(JSON.stringify(joinMessage));
      console.log('[UI] Join message sent, waiting for response...');
    };

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[UI] WebSocket message received:', message);

        const { event: eventType, topic, payload, ref } = message;
        console.log('[UI] Message details:', { eventType, topic, payload, ref });

        if (eventType === 'phx_reply') {
          console.log('[UI] Join reply:', payload);
          if (payload.status === 'ok') {
            console.log('[UI] ✅ Successfully joined channel!');
            console.log('[UI] Response details:', payload.response);
          } else {
            console.error('[UI] ❌ Failed to join channel:', payload);
          }
        } else if (eventType === 'postgres_changes') {
          console.log('[UI] 🔄 Postgres change detected!');
          console.log('[UI] Full postgres_changes payload:', payload);
          handlePostgresChange(payload);
        } else if (eventType === 'system') {
          console.log('[UI] 📡 System message:', payload);
        } else {
          console.log('[UI] ⚠️ Unhandled event type:', eventType, 'payload:', payload);
        }
      } catch (error) {
        console.error('[UI] Error parsing WebSocket message:', error, event.data);
      }
    };

    websocket.onerror = (error) => {
      console.error('[UI] WebSocket error:', error);
      setRealtimeStatus('error');
    };

    websocket.onclose = (event) => {
      console.log('[UI] WebSocket closed:', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      });
      setRealtimeStatus('disconnected');
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };

    setWs(websocket);
  }

  function handlePostgresChange(payload: any) {
    try {
      const change = payload.data;
      console.log('[UI] Postgres change:', change);

      if (!change || !change.type) {
        console.log('[UI] ❌ Invalid change payload - missing type');
        return;
      }

      const record = change.record;
      if (!record || !record.value) {
        console.log('[UI] ❌ No record or value found in change');
        return;
      }

      console.log('[UI] ✅ Valid storyboard update, processing scenes...');
      const storyboardData = record.value;
      const currentScenes = new Map();

      // Build current scene map
      for (const scene of storyboardData.scenes) {
        currentScenes.set(scene.id, scene);
      }

      // Detect changes
      for (const [sceneId, scene] of currentScenes) {
        if (!previousScenes.has(sceneId)) {
          // Scene inserted
          console.log('[UI] Scene inserted:', sceneId);
          parent.postMessage({
            pluginMessage: {
              type: 'scene-inserted',
              scene
            }
          }, '*');
          addNotification(`Scene ${scene.sceneNumber} added`, 'success');
        } else {
          // Check if updated
          const prevScene = previousScenes.get(sceneId);
          if (JSON.stringify(prevScene) !== JSON.stringify(scene)) {
            console.log('[UI] Scene updated:', sceneId);
            parent.postMessage({
              pluginMessage: {
                type: 'scene-updated',
                scene
              }
            }, '*');
            addNotification(`Scene ${scene.sceneNumber} updated`, 'info');
          }
        }
      }

      // Detect deleted scenes
      for (const [sceneId] of previousScenes) {
        if (!currentScenes.has(sceneId)) {
          console.log('[UI] Scene deleted:', sceneId);
          parent.postMessage({
            pluginMessage: {
              type: 'scene-deleted',
              sceneId
            }
          }, '*');
          addNotification('Scene deleted', 'info');
        }
      }

      // Update previous scenes
      setPreviousScenes(currentScenes);

    } catch (error) {
      console.error('[UI] Error handling postgres change:', error);
    }
  }

  function handleClose() {
    parent.postMessage({
      pluginMessage: { type: 'cancel' }
    }, '*');
  }

  const statusConfig = {
    disconnected: { label: 'Disconnected', color: '#6B7280', dot: '⚫' },
    connecting: { label: 'Connecting...', color: '#F59E0B', dot: '🔄' },
    connected: { label: 'Live Sync Active', color: '#10B981', dot: '🟢' },
    error: { label: 'Connection Error', color: '#EF4444', dot: '🔴' }
  };

  const currentStatus = statusConfig[realtimeStatus];

  return (
    <div className="app">
      <div className="header">
        <h2>SuperStoryboard Sync</h2>
        <div className="status-indicator" style={{ color: currentStatus.color }}>
          <span className="status-dot">{currentStatus.dot}</span>
          <span className="status-label">{currentStatus.label}</span>
        </div>
      </div>

      <div className="form">
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
            type="text"
            value={publicAnonKey}
            onChange={(e) => setPublicAnonKey(e.target.value)}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
          />
        </div>

        <div className="form-group">
          <label htmlFor="storyboardId">Storyboard ID</label>
          <input
            id="storyboardId"
            type="text"
            value={storyboardId}
            onChange={(e) => setStoryboardId(e.target.value)}
            placeholder="1762610415566"
          />
        </div>

        <div className="button-group">
          <button
            className="button-primary"
            onClick={handleSync}
            disabled={isLoading}
          >
            {isLoading ? 'Syncing...' : 'Sync Storyboard'}
          </button>
          <button
            className="button-secondary"
            onClick={handleClose}
          >
            Close
          </button>
        </div>
      </div>

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
  );
}

export default App;
