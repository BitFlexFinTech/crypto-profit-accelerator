import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Track connected VPS instances
const connectedVPS = new Map<string, WebSocket>();

// Message types
interface WSMessage {
  type: 'register' | 'heartbeat' | 'price_update' | 'trade_executed' | 'equity_update' | 'position_sync' | 'error' | 'execute_trade' | 'cancel_order' | 'sync_positions' | 'update_config';
  deployment_id?: string;
  data?: unknown;
}

serve(async (req) => {
  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Check for WebSocket upgrade
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response(JSON.stringify({
      status: 'ok',
      connectedVPS: connectedVPS.size,
      message: 'HFT WebSocket Relay - Use WebSocket connection'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { socket, response } = Deno.upgradeWebSocket(req);
    let deploymentId: string | null = null;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    socket.onopen = () => {
      console.log('[hft-ws] New WebSocket connection opened');
    };

    socket.onmessage = async (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        console.log('[hft-ws] Received message:', message.type);

        switch (message.type) {
          case 'register':
            // VPS instance registering with deployment ID
            deploymentId = message.deployment_id || null;
            if (deploymentId) {
              connectedVPS.set(deploymentId, socket);
              
              // Update deployment status in database
              await supabase
                .from('vps_deployments')
                .update({
                  websocket_connected: true,
                  last_heartbeat: new Date().toISOString()
                })
                .eq('id', deploymentId);

              socket.send(JSON.stringify({
                type: 'registered',
                deployment_id: deploymentId,
                timestamp: Date.now()
              }));

              console.log(`[hft-ws] VPS registered: ${deploymentId}`);
            }
            break;

          case 'heartbeat':
            // Update last heartbeat timestamp
            if (deploymentId) {
              await supabase
                .from('vps_deployments')
                .update({ last_heartbeat: new Date().toISOString() })
                .eq('id', deploymentId);
            }
            
            socket.send(JSON.stringify({
              type: 'heartbeat_ack',
              timestamp: Date.now()
            }));
            break;

          case 'price_update':
            // Forward price updates to subscribed dashboard clients
            console.log('[hft-ws] Price update:', message.data);
            // In production, broadcast to dashboard WebSocket clients
            break;

          case 'trade_executed':
            // Trade confirmation from VPS
            console.log('[hft-ws] Trade executed:', message.data);
            // Update trade records in database
            break;

          case 'equity_update':
            // Live equity update from VPS
            console.log('[hft-ws] Equity update:', message.data);
            break;

          case 'position_sync':
            // Position sync from VPS
            console.log('[hft-ws] Position sync:', message.data);
            break;

          case 'error':
            // Error from VPS engine
            console.error('[hft-ws] VPS error:', message.data);
            break;

          // Dashboard -> VPS commands
          case 'execute_trade':
            console.log('[hft-ws] Execute trade command:', message.data);
            // Forward to appropriate VPS instance
            break;

          case 'cancel_order':
            console.log('[hft-ws] Cancel order command:', message.data);
            break;

          case 'sync_positions':
            console.log('[hft-ws] Sync positions command');
            break;

          case 'update_config':
            console.log('[hft-ws] Update config command:', message.data);
            break;

          default:
            console.log('[hft-ws] Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('[hft-ws] Message parse error:', error);
        socket.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    };

    socket.onclose = async () => {
      console.log(`[hft-ws] WebSocket closed: ${deploymentId || 'unknown'}`);
      
      if (deploymentId) {
        connectedVPS.delete(deploymentId);
        
        // Update deployment status
        await supabase
          .from('vps_deployments')
          .update({ websocket_connected: false })
          .eq('id', deploymentId);
      }
    };

    socket.onerror = (error) => {
      console.error('[hft-ws] WebSocket error:', error);
    };

    return response;
  } catch (error) {
    console.error('[hft-ws] Upgrade error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to upgrade WebSocket connection'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
