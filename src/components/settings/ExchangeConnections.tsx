import { useState } from 'react';
import { ExchangeName, EXCHANGE_CONFIGS } from '@/types/trading';
import { useExchanges } from '@/hooks/useExchanges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RefreshCw, Link2, Unlink, ExternalLink, Eye, EyeOff, CheckCircle2, XCircle, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ExchangeConnections() {
  const { exchanges, loading, syncing, testing, connectExchange, disconnectExchange, toggleFutures, syncBalances, getExchangeBalance, testConnection } = useExchanges();
  const [connectingExchange, setConnectingExchange] = useState<ExchangeName | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleTestConnection = async () => {
    if (!connectingExchange || !apiKey || !apiSecret) return;
    
    const config = EXCHANGE_CONFIGS.find(c => c.name === connectingExchange);
    setIsTesting(true);
    setTestResult(null);
    
    const result = await testConnection(
      connectingExchange,
      apiKey,
      apiSecret,
      config?.requiresPassphrase ? passphrase : undefined
    );
    
    setTestResult(result);
    setIsTesting(false);
  };

  const handleConnect = async () => {
    if (!connectingExchange) return;
    
    const config = EXCHANGE_CONFIGS.find(c => c.name === connectingExchange);
    setIsConnecting(true);
    
    await connectExchange(
      connectingExchange,
      apiKey,
      apiSecret,
      config?.requiresPassphrase ? passphrase : undefined
    );
    
    resetForm();
    setIsConnecting(false);
  };

  const resetForm = () => {
    setApiKey('');
    setApiSecret('');
    setPassphrase('');
    setConnectingExchange(null);
    setDialogOpen(false);
    setTestResult(null);
    setShowSecret(false);
  };

  const getExchangeData = (name: ExchangeName) => {
    return exchanges.find(e => e.exchange === name);
  };

  const maskApiKey = (key: string | null) => {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return `${key.slice(0, 4)}••••${key.slice(-4)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Exchange Connections</h2>
        <Button 
          onClick={syncBalances} 
          disabled={syncing}
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          Sync Balances
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {EXCHANGE_CONFIGS.map((config) => {
          const exchangeData = getExchangeData(config.name);
          const isConnected = exchangeData?.is_connected || false;
          const balance = exchangeData ? getExchangeBalance(exchangeData.id) : 0;
          const lastSync = exchangeData?.last_balance_sync 
            ? new Date(exchangeData.last_balance_sync).toLocaleString() 
            : null;

          return (
            <Card key={config.name} className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{config.logo}</span>
                    <CardTitle className="text-lg text-foreground">{config.displayName}</CardTitle>
                  </div>
                  <Badge variant={isConnected ? 'default' : 'secondary'} className={isConnected ? 'bg-primary text-primary-foreground' : ''}>
                    {isConnected ? 'Connected' : 'Not Connected'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isConnected && exchangeData && (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">USDT Balance</span>
                        <span className="font-mono text-foreground">${balance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">API Key</span>
                        <span className="font-mono text-muted-foreground">{maskApiKey(exchangeData.api_key_encrypted)}</span>
                      </div>
                      {lastSync && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Last Synced</span>
                          <span className="text-muted-foreground">{lastSync}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Futures Trading</span>
                      <Switch 
                        checked={exchangeData?.futures_enabled || false}
                        onCheckedChange={(checked) => toggleFutures(exchangeData.id, checked)}
                        disabled={!config.supportsFutures}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        variant="destructive" 
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={() => disconnectExchange(exchangeData.id)}
                      >
                        <Unlink className="h-3 w-3" />
                        Disconnect
                      </Button>
                    </div>
                  </>
                )}

                {!isConnected && (
                  <Dialog open={dialogOpen && connectingExchange === config.name} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) resetForm();
                  }}>
                    <DialogTrigger asChild>
                      <Button 
                        className="w-full gap-2"
                        onClick={() => setConnectingExchange(config.name)}
                      >
                        <Link2 className="h-4 w-4" />
                        Connect
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <span className="text-2xl">{config.logo}</span>
                          Connect {config.displayName}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>API Key</Label>
                          <Input
                            placeholder="Enter your API key"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="bg-secondary border-border font-mono text-sm"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label>API Secret</Label>
                          <div className="relative">
                            <Input
                              type={showSecret ? 'text' : 'password'}
                              placeholder="Enter your API secret"
                              value={apiSecret}
                              onChange={(e) => setApiSecret(e.target.value)}
                              className="bg-secondary border-border font-mono text-sm pr-10"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full"
                              onClick={() => setShowSecret(!showSecret)}
                            >
                              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>

                        {config.requiresPassphrase && (
                          <div className="space-y-2">
                            <Label>Passphrase</Label>
                            <Input
                              type="password"
                              placeholder="Enter your passphrase"
                              value={passphrase}
                              onChange={(e) => setPassphrase(e.target.value)}
                              className="bg-secondary border-border font-mono text-sm"
                            />
                          </div>
                        )}

                        <a 
                          href={config.apiDocsUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          How to get API keys
                        </a>

                        {/* Test Result Display */}
                        {testResult && (
                          <div className={cn(
                            "p-3 rounded-lg flex items-center gap-2 text-sm",
                            testResult.success 
                              ? "bg-primary/10 text-primary" 
                              : "bg-destructive/10 text-destructive"
                          )}>
                            {testResult.success ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                            {testResult.message}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button 
                            variant="outline"
                            className="flex-1 gap-2"
                            onClick={handleTestConnection}
                            disabled={!apiKey || !apiSecret || isTesting}
                          >
                            {isTesting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Zap className="h-4 w-4" />
                            )}
                            {isTesting ? 'Testing...' : 'Test Connection'}
                          </Button>
                          <Button 
                            className="flex-1"
                            onClick={handleConnect}
                            disabled={!apiKey || !apiSecret || isConnecting}
                          >
                            {isConnecting ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            {testResult?.success ? 'Save & Connect' : 'Connect Exchange'}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
