import { StatsCards } from '@/components/dashboard/StatsCards';
import { PositionsPanel } from '@/components/dashboard/PositionsPanel';
import { BotControls } from '@/components/dashboard/BotControls';
import { LiveSignals } from '@/components/dashboard/LiveSignals';
import { ConnectionStatus } from '@/components/dashboard/ConnectionStatus';
import { EngineStatus } from '@/components/dashboard/EngineStatus';
import { GlobalSyncButton } from '@/components/dashboard/GlobalSyncButton';
import { RealTimePnL } from '@/components/dashboard/cards/RealTimePnL';
import { TradeVelocityChart } from '@/components/dashboard/cards/TradeVelocityChart';
import { MarketScanner } from '@/components/dashboard/cards/MarketScanner';
import { TradeFlow } from '@/components/dashboard/cards/TradeFlow';
import { ExecutionSpeed } from '@/components/dashboard/cards/ExecutionSpeed';
import { VolatilityScanner } from '@/components/dashboard/cards/VolatilityScanner';
import { TradeTiming } from '@/components/dashboard/cards/TradeTiming';
import { LoopMonitor } from '@/components/dashboard/cards/LoopMonitor';
import { SignalDebugPanel } from '@/components/dashboard/cards/SignalDebugPanel';
import { TradeExecutionLogPanel } from '@/components/dashboard/cards/TradeExecutionLogPanel';
import { TradePerformancePanel } from '@/components/dashboard/cards/TradePerformancePanel';
import { PairPerformanceLeaderboard } from '@/components/dashboard/cards/PairPerformanceLeaderboard';
import { WebSocketStatusPanel } from '@/components/dashboard/cards/WebSocketStatusPanel';
import { TradeVelocityDashboard } from '@/components/dashboard/cards/TradeVelocityDashboard';

export default function DashboardPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header - Fixed */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-foreground">Dashboard</h1>
          <div className="flex items-center gap-2">
            <EngineStatus />
            <ConnectionStatus />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GlobalSyncButton />
          <BotControls />
        </div>
      </div>

      {/* Main Content - Scrollable Grid */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Stats Row - Full Width */}
        <StatsCards />
        
        {/* NEW: WebSocket Status & Trade Velocity Dashboard */}
        <div className="grid gap-3 lg:grid-cols-2">
          <WebSocketStatusPanel />
          <TradeVelocityDashboard />
        </div>
        
        {/* Performance Row */}
        <div className="grid gap-3 lg:grid-cols-2">
          <TradePerformancePanel />
          <PairPerformanceLeaderboard />
        </div>
        
        {/* Debug & Execution Panels - Collapsible Full Width */}
        <div className="grid gap-3 lg:grid-cols-2">
          <SignalDebugPanel />
          <TradeExecutionLogPanel />
        </div>
        
        {/* Real-time Cards Grid */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <RealTimePnL />
          <TradeVelocityChart />
          <MarketScanner />
          <TradeFlow />
        </div>
        
        {/* Secondary Cards Grid */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <ExecutionSpeed />
          <VolatilityScanner />
          <TradeTiming />
          <LoopMonitor />
        </div>

        {/* Positions & Signals */}
        <div className="grid gap-3 lg:grid-cols-2">
          <PositionsPanel />
          <LiveSignals />
        </div>
      </div>
    </div>
  );
}
