import { Elysia } from 'elysia';
import { Event } from '../models/Event';

interface WSClient {
  id: string;
  filters?: {
    currency?: string;
    impact?: string;
    minRelevance?: number;
  };
}

const clients = new Map<any, WSClient>();
let clientIdCounter = 0;

export const websocketRoutes = new Elysia()
  .ws('/ws/calendar', {
    open(ws) {
      const clientId = `client_${++clientIdCounter}`;
      clients.set(ws, { id: clientId });
      console.log(`✅ WebSocket client connected: ${clientId}`);

      // Send initial connection message
      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        message: 'Connected to Smart Money Calendar real-time updates',
      }));
    },

    message(ws, message: any) {
      try {
        const data = typeof message === 'string' ? JSON.parse(message) : message;
        const client = clients.get(ws);

        if (!client) return;

        // Handle different message types
        switch (data.type) {
          case 'subscribe':
            // Update client filters
            client.filters = data.filters || {};
            console.log(`📡 Client ${client.id} subscribed with filters:`, client.filters);
            ws.send(JSON.stringify({
              type: 'subscribed',
              filters: client.filters,
            }));
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
            break;

          default:
            ws.send(JSON.stringify({
              type: 'error',
              message: `Unknown message type: ${data.type}`,
            }));
        }
      } catch (error: any) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
        }));
      }
    },

    close(ws) {
      const client = clients.get(ws);
      if (client) {
        console.log(`❌ WebSocket client disconnected: ${client.id}`);
        clients.delete(ws);
      }
    },

    error(ws, error) {
      console.error('WebSocket error:', error);
      const client = clients.get(ws);
      if (client) {
        clients.delete(ws);
      }
    },
  });

/**
 * Broadcast event update to all connected clients
 */
export function broadcastEventUpdate(event: any, updateType: 'new' | 'update' | 'delete') {
  const message = JSON.stringify({
    type: 'event_update',
    updateType,
    event,
    timestamp: new Date().toISOString(),
  });

  let sentCount = 0;

  for (const [ws, client] of clients) {
    try {
      // Apply filters if client has them
      if (client.filters) {
        if (client.filters.currency && event.currency !== client.filters.currency) continue;
        if (client.filters.impact && event.impact !== client.filters.impact) continue;
        if (client.filters.minRelevance && event.aiRelevanceScore < client.filters.minRelevance) continue;
      }

      ws.send(message);
      sentCount++;
    } catch (error) {
      console.error(`Failed to send to client ${client.id}:`, error);
      clients.delete(ws);
    }
  }

  if (sentCount > 0) {
    console.log(`📢 Broadcasted ${updateType} event to ${sentCount} clients`);
  }
}

/**
 * Broadcast market alert
 */
export function broadcastAlert(alert: {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  event?: any;
}) {
  const message = JSON.stringify({
    type: 'alert',
    ...alert,
    timestamp: new Date().toISOString(),
  });

  let sentCount = 0;

  for (const [ws, client] of clients) {
    try {
      ws.send(message);
      sentCount++;
    } catch (error) {
      console.error(`Failed to send alert to client ${client.id}:`, error);
      clients.delete(ws);
    }
  }

  console.log(`🚨 Broadcasted alert to ${sentCount} clients`);
}

/**
 * Get connected clients count
 */
export function getConnectedClientsCount(): number {
  return clients.size;
}

/**
 * Monitor changes to Event collection and broadcast updates
 * Note: Change Streams require MongoDB replica set, using polling fallback
 */
export function setupEventMonitoring() {
  console.log('⚠️ MongoDB Change Streams require replica set - using polling fallback');
  console.log('📍 Polling for event updates every 30 seconds');
  
  // Fallback: Poll for recent updates every 30 seconds
  setInterval(async () => {
    try {
      const recentEvents = await Event.find({
        updatedAt: { $gte: new Date(Date.now() - 35000) }, // Last 35 seconds
      }).limit(10);

      if (recentEvents.length > 0) {
        for (const event of recentEvents) {
          broadcastEventUpdate(event, 'update');
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 30000);
}
