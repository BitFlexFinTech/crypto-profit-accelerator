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
import { RefreshCw, Link2, Unlink, ExternalLink, Eye, EyeOff } from 'lucide-react';

export function ExchangeConnections() {
  const { exchanges, loading, syncing, connectExchange, disconnectExchange, toggleFutures, syncBalances, getExchangeBalance } = useExchanges();
  const [connectingExchange, setConnectingExchange] = useState<ExchangeName | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleConnect = async () => {
    if (!connectingExchange) return;
    
    const config = EXCHANGE_CONFIGS.find(c => c.name === connectingExchange);
    
    await connectExchange(
      connectingExchange,
      apiKey,
      apiSecret,
      config?.requiresPassphrase ? passphrase : undefined
    );
    
    setApiKey('');
    setApiSecret('');
    setPassphrase('');
    setConnectingExchange(null);
    setDialogOpen(false);
  };

  const getExchangeData = (name: ExchangeName) => {
    return exchanges.find(e => e.exchange === name);
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
                {isConnected && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">USDT Balance</span>
                      <span className="font-mono text-foreground">${balance.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Futures Trading</span>
                      <Switch 
                        checked={exchangeData?.futures_enabled || false}
                        onCheckedChange={(checked) => exchangeData && toggleFutures(exchangeData.id, checked)}
                        disabled={!config.supportsFutures}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        variant="destructive" 
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={() => exchangeData && disconnectExchange(exchangeData.id)}
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
                    if (!open) setConnectingExchange(null);
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

                        <Button 
                          className="w-full"
                          onClick={handleConnect}
                          disabled={!apiKey || !apiSecret}
                        >
                          Connect Exchange
                        </Button>
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
