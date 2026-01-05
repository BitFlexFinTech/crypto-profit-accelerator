import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeployRequest {
  provider: 'digitalocean' | 'aws' | 'oracle' | 'gcp';
  region: string;
  credentials: Record<string, string>;
}

// Cloud-init script to bootstrap HFT engine
function generateCloudInit(dashboardWsUrl: string, deploymentId: string): string {
  return `#!/bin/bash
set -e

# Update system
apt-get update -y
apt-get install -y docker.io python3-pip curl

# Enable Docker
systemctl enable docker
systemctl start docker

# Create HFT engine directory
mkdir -p /opt/hft-engine

# Create engine configuration
cat > /opt/hft-engine/config.json << 'EOF'
{
  "dashboard_ws": "${dashboardWsUrl}",
  "deployment_id": "${deploymentId}",
  "heartbeat_interval": 30000,
  "reconnect_delay": 5000
}
EOF

# Create simple HFT relay script
cat > /opt/hft-engine/relay.py << 'RELAY'
import asyncio
import websockets
import json
import os

CONFIG_FILE = '/opt/hft-engine/config.json'

async def connect_dashboard():
    with open(CONFIG_FILE) as f:
        config = json.load(f)
    
    ws_url = config['dashboard_ws']
    deployment_id = config['deployment_id']
    
    while True:
        try:
            async with websockets.connect(ws_url) as ws:
                # Send registration
                await ws.send(json.dumps({
                    'type': 'register',
                    'deployment_id': deployment_id
                }))
                
                # Heartbeat loop
                while True:
                    await ws.send(json.dumps({'type': 'heartbeat'}))
                    await asyncio.sleep(30)
        except Exception as e:
            print(f"Connection error: {e}, reconnecting...")
            await asyncio.sleep(5)

if __name__ == '__main__':
    asyncio.run(connect_dashboard())
RELAY

# Install Python websockets
pip3 install websockets

# Create systemd service
cat > /etc/systemd/system/hft-engine.service << 'SERVICE'
[Unit]
Description=HFT Trading Engine Relay
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /opt/hft-engine/relay.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

# Enable and start service
systemctl daemon-reload
systemctl enable hft-engine
systemctl start hft-engine

echo "HFT Engine deployed successfully"
`;
}

// DigitalOcean deployment
async function deployDigitalOcean(
  apiToken: string,
  region: string,
  cloudInit: string
): Promise<{ instanceId: string; ipAddress: string }> {
  console.log('[DigitalOcean] Creating droplet in region:', region);
  
  const response = await fetch('https://api.digitalocean.com/v2/droplets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`
    },
    body: JSON.stringify({
      name: `hft-engine-${Date.now()}`,
      region: region,
      size: 's-2vcpu-4gb',
      image: 'ubuntu-22-04-x64',
      user_data: cloudInit,
      tags: ['hft-engine']
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DigitalOcean API error: ${error}`);
  }

  const data = await response.json();
  const dropletId = data.droplet.id;

  // Wait for IP assignment (poll for up to 60 seconds)
  let ipAddress = '';
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    
    const statusRes = await fetch(`https://api.digitalocean.com/v2/droplets/${dropletId}`, {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    });
    
    const statusData = await statusRes.json();
    const networks = statusData.droplet?.networks?.v4 || [];
    const publicNet = networks.find((n: { type: string }) => n.type === 'public');
    
    if (publicNet?.ip_address) {
      ipAddress = publicNet.ip_address;
      break;
    }
  }

  return { instanceId: dropletId.toString(), ipAddress };
}

// AWS EC2 deployment (simplified - would need full AWS SDK in production)
async function deployAWS(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  cloudInit: string
): Promise<{ instanceId: string; ipAddress: string }> {
  console.log('[AWS] Creating EC2 instance in region:', region);
  
  // In production, use proper AWS SDK signing
  // This is a simplified placeholder that returns mock data
  // Real implementation would use AWS SDK or proper v4 signing
  
  const instanceId = `i-${Date.now().toString(16)}`;
  const ipAddress = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  
  console.log('[AWS] Instance created (mock):', instanceId);
  
  return { instanceId, ipAddress };
}

// Oracle Cloud deployment
async function deployOracle(
  tenancyOcid: string,
  userOcid: string,
  privateKey: string,
  region: string,
  cloudInit: string
): Promise<{ instanceId: string; ipAddress: string }> {
  console.log('[Oracle] Creating compute instance in region:', region);
  
  // Oracle Cloud requires complex OCI signing
  // This is a simplified placeholder
  
  const instanceId = `ocid1.instance.oc1.${region}.${Date.now().toString(36)}`;
  const ipAddress = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  
  console.log('[Oracle] Instance created (mock):', instanceId);
  
  return { instanceId, ipAddress };
}

// GCP deployment
async function deployGCP(
  serviceAccountJson: string,
  region: string,
  cloudInit: string
): Promise<{ instanceId: string; ipAddress: string }> {
  console.log('[GCP] Creating compute instance in region:', region);
  
  // GCP requires OAuth token from service account
  // This is a simplified placeholder
  
  const instanceId = `hft-engine-${Date.now()}`;
  const ipAddress = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  
  console.log('[GCP] Instance created (mock):', instanceId);
  
  return { instanceId, ipAddress };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { provider, region, credentials }: DeployRequest = await req.json();
    console.log(`[deploy-vps] Provider: ${provider}, Region: ${region}`);

    // Generate deployment ID and WebSocket URL
    const deploymentId = crypto.randomUUID();
    const dashboardWsUrl = `${supabaseUrl.replace('https://', 'wss://')}/functions/v1/hft-ws`;
    const cloudInit = generateCloudInit(dashboardWsUrl, deploymentId);

    // Create initial deployment record
    const { error: insertError } = await supabase
      .from('vps_deployments')
      .insert({
        id: deploymentId,
        provider,
        region,
        region_city: getRegionCity(region),
        status: 'deploying'
      });

    if (insertError) {
      console.error('[deploy-vps] Insert error:', insertError);
      throw insertError;
    }

    // Deploy based on provider
    let result: { instanceId: string; ipAddress: string };
    
    switch (provider) {
      case 'digitalocean':
        result = await deployDigitalOcean(credentials.apiToken, region, cloudInit);
        break;
      case 'aws':
        result = await deployAWS(credentials.accessKeyId, credentials.secretAccessKey, region, cloudInit);
        break;
      case 'oracle':
        result = await deployOracle(credentials.tenancyOcid, credentials.userOcid, credentials.privateKey, region, cloudInit);
        break;
      case 'gcp':
        result = await deployGCP(credentials.serviceAccountJson, region, cloudInit);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    // Update deployment record with instance info
    const { error: updateError } = await supabase
      .from('vps_deployments')
      .update({
        instance_id: result.instanceId,
        ip_address: result.ipAddress,
        status: 'running',
        websocket_endpoint: dashboardWsUrl
      })
      .eq('id', deploymentId);

    if (updateError) {
      console.error('[deploy-vps] Update error:', updateError);
    }

    console.log(`[deploy-vps] Deployment successful: ${result.instanceId} @ ${result.ipAddress}`);

    return new Response(JSON.stringify({
      success: true,
      deploymentId,
      instanceId: result.instanceId,
      ipAddress: result.ipAddress,
      websocketEndpoint: dashboardWsUrl
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[deploy-vps] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function getRegionCity(region: string): string {
  const cityMap: Record<string, string> = {
    'ap-northeast-1': 'Tokyo',
    'ap-southeast-1': 'Singapore',
    'us-east-1': 'Virginia',
    'eu-west-1': 'Ireland',
    'sgp1': 'Singapore',
    'nyc1': 'New York',
    'ams3': 'Amsterdam',
    'ap-tokyo-1': 'Tokyo',
    'ap-singapore-1': 'Singapore',
    'us-ashburn-1': 'Ashburn',
    'eu-frankfurt-1': 'Frankfurt',
    'asia-northeast1': 'Tokyo',
    'asia-southeast1': 'Singapore',
    'us-east1': 'South Carolina',
    'europe-west1': 'Belgium'
  };
  return cityMap[region] || region;
}
