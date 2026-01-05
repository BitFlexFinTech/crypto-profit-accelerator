import { ExchangeConnections } from '@/components/settings/ExchangeConnections';
import { TradingConfig } from '@/components/settings/TradingConfig';
import { LatencyThresholds } from '@/components/settings/LatencyThresholds';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function SettingsPage() {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Fixed Header */}
      <div className="flex-shrink-0 h-12 border-b border-border px-4 flex items-center bg-card/50">
        <div>
          <h1 className="text-lg font-bold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground">Exchange connections and trading configuration</p>
        </div>
      </div>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <ExchangeConnections />
          
          <Separator className="bg-border" />
          
          <TradingConfig />
          
          <Separator className="bg-border" />
          
          <LatencyThresholds />
        </div>
      </ScrollArea>
    </div>
  );
}