import { StatsCards } from '@/components/dashboard/StatsCards';
import { PositionsPanel } from '@/components/dashboard/PositionsPanel';
import { BotControls } from '@/components/dashboard/BotControls';
import { LiveSignals } from '@/components/dashboard/LiveSignals';
import { ConnectionStatus } from '@/components/dashboard/ConnectionStatus';
import { EngineStatus } from '@/components/dashboard/EngineStatus';
import { MarketScanner } from '@/components/dashboard/cards/MarketScanner';
import { TradeFlow } from '@/components/dashboard/cards/TradeFlow';
import { ExecutionSpeed } from '@/components/dashboard/cards/ExecutionSpeed';
import { VolatilityScanner } from '@/components/dashboard/cards/VolatilityScanner';
import { TradeTiming } from '@/components/dashboard/cards/TradeTiming';
import { LoopMonitor } from '@/components/dashboard/cards/LoopMonitor';
import { GlobalSyncButton } from '@/components/dashboard/GlobalSyncButton';
import { RealTimePnL } from '@/components/dashboard/cards/RealTimePnL';
import { SignalDebugPanel } from '@/components/dashboard/cards/SignalDebugPanel';
import { TradeVelocityChart } from '@/components/dashboard/cards/TradeVelocityChart';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <EngineStatus />
            <ConnectionStatus />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <GlobalSyncButton />
          <BotControls />
        </div>
      </div>

      <StatsCards />
      
      {/* Signal Debug Panel - Full Width */}
      <SignalDebugPanel />
      
      {/* Real-time P&L + Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <RealTimePnL />
        <TradeVelocityChart />
        <MarketScanner />
        <TradeFlow />
        <ExecutionSpeed />
        <VolatilityScanner />
        <TradeTiming />
        <LoopMonitor />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PositionsPanel />
        <LiveSignals />
      </div>
    </div>
  );
}
