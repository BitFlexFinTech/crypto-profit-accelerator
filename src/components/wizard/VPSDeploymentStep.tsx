import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { 
  get_optimal_region, 
  getRegionDisplayName, 
  PROVIDER_COSTS,
  type CloudProvider,
  type RegionConfig
} from '@/services/RegionMapper';
import { supabase } from '@/integrations/supabase/client';
import { 
  Server, 
  Cloud, 
  Zap, 
  Check, 
  Loader2, 
  MapPin,
  DollarSign,
  Wifi,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface VPSDeploymentStepProps {
  connectedExchanges: string[];
  onDeploymentComplete?: (deploymentId: string) => void;
}

interface ProviderCredentials {
  digitalocean: { apiToken: string };
  aws: { accessKeyId: string; secretAccessKey: string };
  oracle: { tenancyOcid: string; userOcid: string; privateKey: string };
  gcp: { serviceAccountJson: string };
}

type DeploymentStatus = 'idle' | 'deploying' | 'success' | 'error';

export function VPSDeploymentStep({ connectedExchanges, onDeploymentComplete }: VPSDeploymentStepProps) {
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider>('digitalocean');
  const [credentials, setCredentials] = useState<ProviderCredentials>({
    digitalocean: { apiToken: '' },
    aws: { accessKeyId: '', secretAccessKey: '' },
    oracle: { tenancyOcid: '', userOcid: '', privateKey: '' },
    gcp: { serviceAccountJson: '' }
  });
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus>('idle');
  const [deploymentResult, setDeploymentResult] = useState<{ ip?: string; wsEndpoint?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const optimalRegion = get_optimal_region(connectedExchanges, selectedProvider);
  const providerCost = PROVIDER_COSTS[selectedProvider];

  const handleDeploy = async () => {
    setDeploymentStatus('deploying');
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke('deploy-vps', {
        body: {
          provider: selectedProvider,
          region: optimalRegion.code,
          credentials: credentials[selectedProvider]
        }
      });

      if (error) throw error;

      if (data.success) {
        setDeploymentStatus('success');
        setDeploymentResult({
          ip: data.ipAddress,
          wsEndpoint: data.websocketEndpoint
        });
        toast.success('VPS deployed successfully!');
        onDeploymentComplete?.(data.deploymentId);
      } else {
        throw new Error(data.error || 'Deployment failed');
      }
    } catch (err) {
      setDeploymentStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error occurred');
      toast.error('Deployment failed');
    }
  };

  const isCredentialsValid = (): boolean => {
    switch (selectedProvider) {
      case 'digitalocean':
        return credentials.digitalocean.apiToken.length > 10;
      case 'aws':
        return credentials.aws.accessKeyId.length > 10 && credentials.aws.secretAccessKey.length > 10;
      case 'oracle':
        return credentials.oracle.tenancyOcid.length > 10 && credentials.oracle.userOcid.length > 10;
      case 'gcp':
        return credentials.gcp.serviceAccountJson.length > 50;
      default:
        return false;
    }
  };

  const renderCredentialInputs = () => {
    switch (selectedProvider) {
      case 'digitalocean':
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor="do-token">API Token</Label>
              <Input
                id="do-token"
                type="password"
                placeholder="dop_v1_..."
                value={credentials.digitalocean.apiToken}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  digitalocean: { apiToken: e.target.value }
                }))}
                className="bg-background font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Get your token from DigitalOcean → API → Generate New Token
              </p>
            </div>
          </div>
        );

      case 'aws':
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor="aws-key">Access Key ID</Label>
              <Input
                id="aws-key"
                type="password"
                placeholder="AKIA..."
                value={credentials.aws.accessKeyId}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  aws: { ...prev.aws, accessKeyId: e.target.value }
                }))}
                className="bg-background font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="aws-secret">Secret Access Key</Label>
              <Input
                id="aws-secret"
                type="password"
                placeholder="Enter secret key"
                value={credentials.aws.secretAccessKey}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  aws: { ...prev.aws, secretAccessKey: e.target.value }
                }))}
                className="bg-background font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Get from AWS Console → IAM → Security Credentials
              </p>
            </div>
          </div>
        );

      case 'oracle':
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor="oracle-tenancy">Tenancy OCID</Label>
              <Input
                id="oracle-tenancy"
                type="password"
                placeholder="ocid1.tenancy.oc1..."
                value={credentials.oracle.tenancyOcid}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  oracle: { ...prev.oracle, tenancyOcid: e.target.value }
                }))}
                className="bg-background font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="oracle-user">User OCID</Label>
              <Input
                id="oracle-user"
                type="password"
                placeholder="ocid1.user.oc1..."
                value={credentials.oracle.userOcid}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  oracle: { ...prev.oracle, userOcid: e.target.value }
                }))}
                className="bg-background font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="oracle-key">API Private Key (PEM)</Label>
              <Textarea
                id="oracle-key"
                placeholder="-----BEGIN PRIVATE KEY-----"
                value={credentials.oracle.privateKey}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  oracle: { ...prev.oracle, privateKey: e.target.value }
                }))}
                className="bg-background font-mono text-xs h-24"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Free tier available! Get from Oracle Cloud → Identity → API Keys
              </p>
            </div>
          </div>
        );

      case 'gcp':
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor="gcp-json">Service Account JSON</Label>
              <Textarea
                id="gcp-json"
                placeholder='{"type": "service_account", ...}'
                value={credentials.gcp.serviceAccountJson}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  gcp: { serviceAccountJson: e.target.value }
                }))}
                className="bg-background font-mono text-xs h-32"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Get from GCP Console → IAM → Service Accounts → Create Key (JSON)
              </p>
            </div>
          </div>
        );
    }
  };

  const renderProviderIcon = (provider: CloudProvider) => {
    switch (provider) {
      case 'digitalocean': return <span className="text-lg">🌊</span>;
      case 'aws': return <span className="text-lg">☁️</span>;
      case 'oracle': return <span className="text-lg">🔴</span>;
      case 'gcp': return <span className="text-lg">🌈</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Deploy HFT Engine
        </h2>
        <p className="text-muted-foreground">
          One-click VPS deployment with automatic region selection for minimal latency
        </p>
      </div>

      {/* Auto-Selected Region Banner */}
      <Card className="bg-primary/10 border-primary/30">
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{optimalRegion.flag}</span>
                <span className="font-semibold text-foreground">
                  Recommended: {optimalRegion.city}, {optimalRegion.country}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Based on {connectedExchanges.length > 0 
                  ? connectedExchanges.join(' + ') + ' connection'
                  : 'default configuration'
                } • Expected latency: {optimalRegion.latencyEstimate}
              </p>
            </div>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              <Zap className="w-3 h-3 mr-1" />
              Optimized
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Provider Tabs */}
      <Tabs value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as CloudProvider)}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="digitalocean" className="gap-2">
            {renderProviderIcon('digitalocean')} DigitalOcean
          </TabsTrigger>
          <TabsTrigger value="aws" className="gap-2">
            {renderProviderIcon('aws')} AWS
          </TabsTrigger>
          <TabsTrigger value="oracle" className="gap-2">
            {renderProviderIcon('oracle')} Oracle
          </TabsTrigger>
          <TabsTrigger value="gcp" className="gap-2">
            {renderProviderIcon('gcp')} GCP
          </TabsTrigger>
        </TabsList>

        {['digitalocean', 'aws', 'oracle', 'gcp'].map((provider) => (
          <TabsContent key={provider} value={provider} className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Credentials Card */}
              <Card className="bg-secondary/50 border-border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {renderProviderIcon(provider as CloudProvider)}
                    {provider === 'digitalocean' ? 'DigitalOcean' : 
                     provider === 'aws' ? 'Amazon Web Services' :
                     provider === 'oracle' ? 'Oracle Cloud' : 'Google Cloud Platform'}
                  </CardTitle>
                  <CardDescription>
                    Enter your {provider === 'digitalocean' ? 'API token' : 'credentials'} to deploy
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {renderCredentialInputs()}
                </CardContent>
              </Card>

              {/* Instance Details Card */}
              <Card className="bg-secondary/50 border-border">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Server className="w-5 h-5" />
                    Instance Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> Region
                    </span>
                    <span className="font-mono text-sm">
                      {getRegionDisplayName(optimalRegion.code, selectedProvider)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Server className="w-4 h-4" /> Specs
                    </span>
                    <span className="text-sm">{providerCost.specs}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <DollarSign className="w-4 h-4" /> Est. Cost
                    </span>
                    <span className="font-semibold">
                      {providerCost.monthly === 0 ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">FREE</Badge>
                      ) : (
                        `$${providerCost.monthly}/mo`
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Wifi className="w-4 h-4" /> Latency
                    </span>
                    <Badge variant="outline" className="bg-primary/10 text-primary">
                      {optimalRegion.latencyEstimate}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Deployment Status */}
      {deploymentStatus === 'success' && deploymentResult && (
        <Card className="bg-green-500/10 border-green-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-green-400">Deployment Successful!</p>
                <div className="text-sm text-muted-foreground space-y-1 mt-1">
                  <p>IP Address: <span className="font-mono">{deploymentResult.ip}</span></p>
                  <p>WebSocket: <span className="font-mono text-xs">{deploymentResult.wsEndpoint}</span></p>
                </div>
              </div>
              <Badge className="bg-green-500/20 text-green-400">
                <Wifi className="w-3 h-3 mr-1" />
                Connected
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {deploymentStatus === 'error' && errorMessage && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <AlertCircle className="w-6 h-6 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Deployment Failed</p>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deploy Button */}
      <div className="flex justify-center">
        <Button
          size="lg"
          className="w-full max-w-md"
          disabled={!isCredentialsValid() || deploymentStatus === 'deploying' || deploymentStatus === 'success'}
          onClick={handleDeploy}
        >
          {deploymentStatus === 'deploying' ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Deploying to {optimalRegion.city}...
            </>
          ) : deploymentStatus === 'success' ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Deployed Successfully
            </>
          ) : (
            <>
              <Cloud className="w-4 h-4 mr-2" />
              Connect & Deploy
            </>
          )}
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Your credentials are encrypted and never stored. The VPS will auto-connect to this dashboard.
      </p>
    </div>
  );
}
