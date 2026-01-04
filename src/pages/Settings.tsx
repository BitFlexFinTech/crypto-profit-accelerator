import { ExchangeConnections } from '@/components/settings/ExchangeConnections';
import { TradingConfig } from '@/components/settings/TradingConfig';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your exchange connections and trading configuration</p>
      </div>

      <ExchangeConnections />
      
      <Separator className="bg-border" />
      
      <TradingConfig />
    </div>
  );
}
