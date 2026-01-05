import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  get_optimal_region, 
  getRegionDisplayName, 
  PROVIDER_COSTS,
  type CloudProvider
} from '@/services/RegionMapper';
import { supabase } from '@/integrations/supabase/client';
import { useExchanges } from '@/hooks/useExchanges';
import { useVPSDeployments } from '@/hooks/useVPSDeployments';
import { 
  Server, 
  Cloud, 
  Zap, 
  Check, 
  Loader2, 
  MapPin,
  DollarSign,
  Wifi,
  AlertCircle,
  Power,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface ProviderCredentials {
  digitalocean: { apiToken: string };
  aws: { accessKeyId: string; secretAccessKey: string };
  oracle: { tenancyOcid: string; userOcid: string; privateKey: string };
  gcp: { serviceAccountJson: string };
}

type DeploymentStatus = 'idle' | 'deploying' | 'success' | 'error';

export function VPSInfrastructure() {
  const { exchanges } = useExchanges();
  const { deployments, refetch: refetchDeployments } = useVPSDeployments();
  
  const connectedExchanges = exchanges
    .filter(e => e.is_connected)
    .map(e => e.exchange);

  const [selectedProvider, setSelectedProvider] = useState<CloudProvider>('digitalocean');
  const [credentials, setCredentials] = useState<ProviderCredentials>({
    digitalocean: { apiToken: '' },
    aws: { accessKeyId: '', secretAccessKey: '' },
    oracle: { tenancyOcid: '', userOcid: '', privateKey: '' },
    gcp: { serviceAccountJson: '' }
  });
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const optimalRegion = get_optimal_region(connectedExchanges, selectedProvider);
  const providerCost = PROVIDER_COSTS[selectedProvider];

  const activeDeployments = deployments.filter(d => d.status === 'running');

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
        toast.success('VPS deployed successfully!');
        refetchDeployments();
        // Reset after 3 seconds
        setTimeout(() => setDeploymentStatus('idle'), 3000);
      } else {
        throw new Error(data.error || 'Deployment failed');
      }
    } catch (err) {
      setDeploymentStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error occurred');
      toast.error('Deployment failed');
    }
  };

  const handleTerminate = async (deploymentId: string) => {
    try {
      const { error } = await supabase
        .from('vps_deployments')
        .update({ 
          status: 'terminated', 
          terminated_at: new Date().toISOString(),
          termination_reason: 'Manual termination'
        })
        .eq('id', deploymentId);

      if (error) throw error;
      toast.success('VPS terminated');
      refetchDeployments();
    } catch {
      toast.error('Failed to terminate VPS');
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
              <Label htmlFor="do-token" className="text-xs">API Token</Label>
              <Input
                id="do-token"
                type="password"
                placeholder="dop_v1_..."
                value={credentials.digitalocean.apiToken}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  digitalocean: { apiToken: e.target.value }
                }))}
                className="bg-background font-mono text-sm h-9"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                DigitalOcean → API → Generate New Token
              </p>
            </div>
          </div>
        );

      case 'aws':
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor="aws-key" className="text-xs">Access Key ID</Label>
              <Input
                id="aws-key"
                type="password"
                placeholder="AKIA..."
                value={credentials.aws.accessKeyId}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  aws: { ...prev.aws, accessKeyId: e.target.value }
                }))}
                className="bg-background font-mono text-sm h-9"
              />
            </div>
            <div>
              <Label htmlFor="aws-secret" className="text-xs">Secret Access Key</Label>
              <Input
                id="aws-secret"
                type="password"
                placeholder="Enter secret key"
                value={credentials.aws.secretAccessKey}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  aws: { ...prev.aws, secretAccessKey: e.target.value }
                }))}
                className="bg-background font-mono text-sm h-9"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                AWS Console → IAM → Security Credentials
              </p>
            </div>
          </div>
        );

      case 'oracle':
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor="oracle-tenancy" className="text-xs">Tenancy OCID</Label>
              <Input
                id="oracle-tenancy"
                type="password"
                placeholder="ocid1.tenancy.oc1..."
                value={credentials.oracle.tenancyOcid}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  oracle: { ...prev.oracle, tenancyOcid: e.target.value }
                }))}
                className="bg-background font-mono text-sm h-9"
              />
            </div>
            <div>
              <Label htmlFor="oracle-user" className="text-xs">User OCID</Label>
              <Input
                id="oracle-user"
                type="password"
                placeholder="ocid1.user.oc1..."
                value={credentials.oracle.userOcid}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  oracle: { ...prev.oracle, userOcid: e.target.value }
                }))}
                className="bg-background font-mono text-sm h-9"
              />
            </div>
            <div>
              <Label htmlFor="oracle-key" className="text-xs">API Private Key (PEM)</Label>
              <Textarea
                id="oracle-key"
                placeholder="-----BEGIN PRIVATE KEY-----"
                value={credentials.oracle.privateKey}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  oracle: { ...prev.oracle, privateKey: e.target.value }
                }))}
                className="bg-background font-mono text-[10px] h-20"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Free tier available! Oracle Cloud → Identity → API Keys
              </p>
            </div>
          </div>
        );

      case 'gcp':
        return (
          <div className="space-y-3">
            <div>
              <Label htmlFor="gcp-json" className="text-xs">Service Account JSON</Label>
              <Textarea
                id="gcp-json"
                placeholder='{"type": "service_account", ...}'
                value={credentials.gcp.serviceAccountJson}
                onChange={(e) => setCredentials(prev => ({
                  ...prev,
                  gcp: { serviceAccountJson: e.target.value }
                }))}
                className="bg-background font-mono text-[10px] h-24"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                GCP Console → IAM → Service Accounts → Create Key (JSON)
              </p>
            </div>
          </div>
        );
    }
  };

  const renderProviderIcon = (provider: CloudProvider) => {
    switch (provider) {
      case 'digitalocean': return <span className="text-base">🌊</span>;
      case 'aws': return <span className="text-base">☁️</span>;
      case 'oracle': return <span className="text-base">🔴</span>;
      case 'gcp': return <span className="text-base">🌈</span>;
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Server className="h-5 w-5 text-primary" />
          VPS Infrastructure
        </CardTitle>
        <CardDescription>
          Deploy and manage HFT engine instances with one-click cloud deployment
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Active Deployments */}
        {activeDeployments.length > 0 && (
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">Active Instances</Label>
            <div className="space-y-2">
              {activeDeployments.map((deployment) => (
                <div
                  key={deployment.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {deployment.provider} - {deployment.region_city || deployment.region}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {deployment.ip_address || 'Provisioning...'} • 
                        Started {deployment.created_at && formatDistanceToNow(new Date(deployment.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                      <Wifi className="w-2.5 h-2.5 mr-1" />
                      Running
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleTerminate(deployment.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Separator className="bg-border" />
          </div>
        )}

        {/* Auto-Selected Region Banner */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{optimalRegion.flag}</span>
                  <span className="font-medium text-sm text-foreground">
                    {optimalRegion.city}, {optimalRegion.country}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Based on {connectedExchanges.length > 0 
                    ? connectedExchanges.join(' + ')
                    : 'default configuration'
                  } • Est. latency: {optimalRegion.latencyEstimate}
                </p>
              </div>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                <Zap className="w-2.5 h-2.5 mr-1" />
                Auto-selected
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Provider Tabs */}
        <Tabs value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as CloudProvider)}>
          <TabsList className="grid grid-cols-4 w-full h-9">
            <TabsTrigger value="digitalocean" className="gap-1.5 text-xs">
              {renderProviderIcon('digitalocean')} DigitalOcean
            </TabsTrigger>
            <TabsTrigger value="aws" className="gap-1.5 text-xs">
              {renderProviderIcon('aws')} AWS
            </TabsTrigger>
            <TabsTrigger value="oracle" className="gap-1.5 text-xs">
              {renderProviderIcon('oracle')} Oracle
            </TabsTrigger>
            <TabsTrigger value="gcp" className="gap-1.5 text-xs">
              {renderProviderIcon('gcp')} GCP
            </TabsTrigger>
          </TabsList>

          {['digitalocean', 'aws', 'oracle', 'gcp'].map((provider) => (
            <TabsContent key={provider} value={provider} className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Credentials Card */}
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground">
                    {provider === 'digitalocean' ? 'DigitalOcean' : 
                     provider === 'aws' ? 'Amazon Web Services' :
                     provider === 'oracle' ? 'Oracle Cloud' : 'Google Cloud Platform'} Credentials
                  </Label>
                  {renderCredentialInputs()}
                </div>

                {/* Instance Details */}
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground">Instance Configuration</Label>
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <MapPin className="w-3 h-3" /> Region
                      </span>
                      <span className="font-mono text-xs text-foreground">
                        {getRegionDisplayName(optimalRegion.code, selectedProvider)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Server className="w-3 h-3" /> Specs
                      </span>
                      <span className="text-xs text-foreground">{providerCost.specs}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <DollarSign className="w-3 h-3" /> Est. Cost
                      </span>
                      <span className="font-medium text-foreground">
                        {providerCost.monthly === 0 ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">FREE</Badge>
                        ) : (
                          `$${providerCost.monthly}/mo`
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Wifi className="w-3 h-3" /> Latency
                      </span>
                      <Badge variant="outline" className="bg-primary/10 text-primary text-[10px]">
                        {optimalRegion.latencyEstimate}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {/* Deployment Status */}
        {deploymentStatus === 'success' && (
          <Card className="bg-emerald-500/10 border-emerald-500/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <Check className="w-5 h-5 text-emerald-400" />
                <p className="text-sm font-medium text-emerald-400">Deployment initiated successfully!</p>
              </div>
            </CardContent>
          </Card>
        )}

        {deploymentStatus === 'error' && errorMessage && (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive">Deployment Failed</p>
                  <p className="text-xs text-muted-foreground">{errorMessage}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Deploy Button */}
        <Button
          className="w-full"
          disabled={!isCredentialsValid() || deploymentStatus === 'deploying'}
          onClick={handleDeploy}
        >
          {deploymentStatus === 'deploying' ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Deploying to {optimalRegion.city}...
            </>
          ) : (
            <>
              <Cloud className="w-4 h-4 mr-2" />
              Deploy HFT Engine
            </>
          )}
        </Button>

        <p className="text-center text-[10px] text-muted-foreground">
          Credentials are encrypted and never stored. VPS auto-connects to this dashboard.
        </p>
      </CardContent>
    </Card>
  );
}