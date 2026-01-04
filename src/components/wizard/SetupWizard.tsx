import { useState } from 'react';
import { useSetupProgress } from '@/hooks/useSetupProgress';
import { useExchanges } from '@/hooks/useExchanges';
import { useBotSettings } from '@/hooks/useBotSettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EXCHANGE_CONFIGS, ExchangeName } from '@/types/trading';
import { 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Zap, 
  Shield, 
  TrendingUp,
  AlertTriangle,
  Loader2
} from 'lucide-react';

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { progress, updateStep, completeSetup } = useSetupProgress();
  const { connectExchange, exchanges, syncBalances, syncing } = useExchanges();
  const { settings, updateSettings } = useBotSettings();
  
  const [currentStep, setCurrentStep] = useState(progress?.current_step || 1);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [apiCredentials, setApiCredentials] = useState<Record<string, { apiKey: string; apiSecret: string; passphrase?: string }>>({});

  const totalSteps = 4;
  const progressPercent = (currentStep / totalSteps) * 100;

  const handleNext = () => {
    const nextStep = Math.min(currentStep + 1, totalSteps);
    setCurrentStep(nextStep);
    updateStep(nextStep);
  };

  const handleBack = () => {
    const prevStep = Math.max(currentStep - 1, 1);
    setCurrentStep(prevStep);
    updateStep(prevStep);
  };

  const handleComplete = async () => {
    await completeSetup();
    onComplete();
  };

  const handleConnectExchange = async (exchange: ExchangeName) => {
    const creds = apiCredentials[exchange];
    if (!creds?.apiKey || !creds?.apiSecret) return;

    setConnecting(exchange);
    try {
      await connectExchange(exchange, creds.apiKey, creds.apiSecret, creds.passphrase);
      await syncBalances();
    } finally {
      setConnecting(null);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
          <Zap className="w-12 h-12 text-primary" />
        </div>
      </div>
      
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Welcome to HFT Trading Bot
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your AI-powered high-frequency trading assistant. Let's get you set up in just a few steps.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 text-left max-w-2xl mx-auto">
        <Card className="bg-secondary/50 border-border">
          <CardContent className="pt-4">
            <TrendingUp className="h-8 w-8 text-primary mb-2" />
            <h3 className="font-semibold text-foreground">AI Analysis</h3>
            <p className="text-sm text-muted-foreground">
              Intelligent pair analysis powered by advanced AI
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-secondary/50 border-border">
          <CardContent className="pt-4">
            <Zap className="h-8 w-8 text-primary mb-2" />
            <h3 className="font-semibold text-foreground">Fast Execution</h3>
            <p className="text-sm text-muted-foreground">
              Sub-second trade execution across 6 exchanges
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-secondary/50 border-border">
          <CardContent className="pt-4">
            <Shield className="h-8 w-8 text-primary mb-2" />
            <h3 className="font-semibold text-foreground">Risk Control</h3>
            <p className="text-sm text-muted-foreground">
              Built-in safety limits and paper trading mode
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 max-w-md mx-auto">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="text-left">
            <p className="text-sm font-medium text-destructive">Risk Disclaimer</p>
            <p className="text-xs text-muted-foreground mt-1">
              Trading cryptocurrencies carries significant risk. Only trade with funds you can afford to lose. Past performance does not guarantee future results.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Connect Your Exchanges
        </h2>
        <p className="text-muted-foreground">
          Add API keys for the exchanges you want to trade on. At least one is required.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EXCHANGE_CONFIGS.map((config) => {
          const exchange = exchanges.find(e => e.exchange === config.name);
          const isConnected = exchange?.is_connected;
          const creds = apiCredentials[config.name] || { apiKey: '', apiSecret: '' };

          return (
            <Card 
              key={config.name}
              className={`bg-secondary/50 border-border transition-all ${isConnected ? 'ring-2 ring-primary' : ''}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{config.logo}</span>
                    <CardTitle className="text-lg">{config.displayName}</CardTitle>
                  </div>
                  {isConnected && (
                    <Badge className="bg-primary text-primary-foreground">
                      <Check className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {!isConnected ? (
                  <>
                    <div>
                      <Label htmlFor={`${config.name}-api`} className="text-xs">API Key</Label>
                      <Input
                        id={`${config.name}-api`}
                        type="password"
                        placeholder="Enter API key"
                        value={creds.apiKey}
                        onChange={(e) => setApiCredentials(prev => ({
                          ...prev,
                          [config.name]: { ...prev[config.name], apiKey: e.target.value }
                        }))}
                        className="bg-background"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${config.name}-secret`} className="text-xs">API Secret</Label>
                      <Input
                        id={`${config.name}-secret`}
                        type="password"
                        placeholder="Enter API secret"
                        value={creds.apiSecret}
                        onChange={(e) => setApiCredentials(prev => ({
                          ...prev,
                          [config.name]: { ...prev[config.name], apiSecret: e.target.value }
                        }))}
                        className="bg-background"
                      />
                    </div>
                    {config.requiresPassphrase && (
                      <div>
                        <Label htmlFor={`${config.name}-passphrase`} className="text-xs">Passphrase</Label>
                        <Input
                          id={`${config.name}-passphrase`}
                          type="password"
                          placeholder="Enter passphrase"
                          value={creds.passphrase || ''}
                          onChange={(e) => setApiCredentials(prev => ({
                            ...prev,
                            [config.name]: { ...prev[config.name], passphrase: e.target.value }
                          }))}
                          className="bg-background"
                        />
                      </div>
                    )}
                    <Button
                      className="w-full"
                      disabled={!creds.apiKey || !creds.apiSecret || connecting === config.name}
                      onClick={() => handleConnectExchange(config.name)}
                    >
                      {connecting === config.name ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Connect'
                      )}
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {config.supportsFutures ? 'Spot & Futures ready' : 'Spot trading ready'}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {exchanges.filter(e => e.is_connected).length} of {EXCHANGE_CONFIGS.length} exchanges connected
      </p>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Configure Trading Settings
        </h2>
        <p className="text-muted-foreground">
          Set your trading parameters and risk limits
        </p>
      </div>

      {settings && (
        <div className="max-w-2xl mx-auto space-y-6">
          <Card className="bg-secondary/50 border-border">
            <CardHeader>
              <CardTitle className="text-lg">Trading Mode</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Paper Trading (Simulated)</Label>
                  <p className="text-sm text-muted-foreground">
                    Practice without real money
                  </p>
                </div>
                <Switch
                  checked={settings.is_paper_trading}
                  onCheckedChange={(checked) => updateSettings({ is_paper_trading: checked })}
                />
              </div>
              {!settings.is_paper_trading && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  <p className="text-sm text-destructive">
                    ⚠️ Live trading uses real funds. Proceed with caution.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-secondary/50 border-border">
            <CardHeader>
              <CardTitle className="text-lg">Order Size</CardTitle>
              <CardDescription>Set min/max order size per trade</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Minimum: ${settings.min_order_size}</Label>
                <Slider
                  value={[settings.min_order_size]}
                  min={100}
                  max={500}
                  step={10}
                  onValueChange={([val]) => updateSettings({ min_order_size: val })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Maximum: ${settings.max_order_size}</Label>
                <Slider
                  value={[settings.max_order_size]}
                  min={200}
                  max={1000}
                  step={10}
                  onValueChange={([val]) => updateSettings({ max_order_size: val })}
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-secondary/50 border-border">
            <CardHeader>
              <CardTitle className="text-lg">Profit Targets</CardTitle>
              <CardDescription>Target profit per trade before closing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Spot Trades: ${settings.spot_profit_target}</Label>
                <Slider
                  value={[settings.spot_profit_target]}
                  min={0.5}
                  max={10}
                  step={0.5}
                  onValueChange={([val]) => updateSettings({ spot_profit_target: val })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Futures Trades: ${settings.futures_profit_target}</Label>
                <Slider
                  value={[settings.futures_profit_target]}
                  min={1}
                  max={20}
                  step={0.5}
                  onValueChange={([val]) => updateSettings({ futures_profit_target: val })}
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-secondary/50 border-border">
            <CardHeader>
              <CardTitle className="text-lg">Risk Limits</CardTitle>
              <CardDescription>Safety controls to protect your capital</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Daily Loss Limit: ${settings.daily_loss_limit}</Label>
                <Slider
                  value={[settings.daily_loss_limit]}
                  min={10}
                  max={500}
                  step={10}
                  onValueChange={([val]) => updateSettings({ daily_loss_limit: val })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Max Open Positions: {settings.max_open_positions}</Label>
                <Slider
                  value={[settings.max_open_positions]}
                  min={1}
                  max={20}
                  step={1}
                  onValueChange={([val]) => updateSettings({ max_open_positions: val })}
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-secondary/50 border-border">
            <CardHeader>
              <CardTitle className="text-lg">AI Aggressiveness</CardTitle>
              <CardDescription>How aggressive should the AI be?</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {(['conservative', 'balanced', 'aggressive'] as const).map((level) => (
                  <Button
                    key={level}
                    variant={settings.ai_aggressiveness === level ? 'default' : 'outline'}
                    onClick={() => updateSettings({ ai_aggressiveness: level })}
                    className="capitalize"
                  >
                    {level}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                {settings.ai_aggressiveness === 'conservative' && '🛡️ Fewer trades, higher confidence signals only'}
                {settings.ai_aggressiveness === 'balanced' && '⚖️ Moderate trade frequency, balanced risk/reward'}
                {settings.ai_aggressiveness === 'aggressive' && '🚀 More trades, accepts lower confidence signals'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
          <Check className="w-12 h-12 text-primary" />
        </div>
      </div>
      
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          You're All Set! 🎉
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your trading bot is configured and ready to go. Here's a summary of your setup:
        </p>
      </div>

      <div className="max-w-md mx-auto space-y-3 text-left">
        <Card className="bg-secondary/50 border-border">
          <CardContent className="pt-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Exchanges Connected</span>
              <span className="font-medium text-foreground">{exchanges.filter(e => e.is_connected).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trading Mode</span>
              <Badge variant={settings?.is_paper_trading ? 'secondary' : 'default'}>
                {settings?.is_paper_trading ? '📝 Paper' : '💰 Live'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order Size</span>
              <span className="font-medium text-foreground">${settings?.min_order_size} - ${settings?.max_order_size}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">AI Mode</span>
              <span className="font-medium text-foreground capitalize">{settings?.ai_aggressiveness}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Daily Loss Limit</span>
              <span className="font-medium text-foreground">${settings?.daily_loss_limit}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        Click "Start Trading" to open the dashboard. You can start the bot manually when you're ready.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 dark">
      <div className="w-full max-w-4xl">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {[1, 2, 3, 4].map((step) => (
              <div 
                key={step}
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  step <= currentStep 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {step < currentStep ? <Check className="h-4 w-4" /> : step}
              </div>
            ))}
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>Welcome</span>
            <span>Exchanges</span>
            <span>Settings</span>
            <span>Complete</span>
          </div>
        </div>

        {/* Step content */}
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
          </CardContent>
        </Card>

        {/* Navigation buttons */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          {currentStep < totalSteps ? (
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleComplete} className="bg-primary">
              <Zap className="h-4 w-4 mr-2" />
              Start Trading
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
