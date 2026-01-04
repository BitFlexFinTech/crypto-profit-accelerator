import { StatsCards } from '@/components/dashboard/StatsCards';
import { PositionsPanel } from '@/components/dashboard/PositionsPanel';
import { BotControls } from '@/components/dashboard/BotControls';
import { LiveSignals } from '@/components/dashboard/LiveSignals';
import { ConnectionStatus } from '@/components/dashboard/ConnectionStatus';
import { EngineStatus } from '@/components/dashboard/EngineStatus';
import { GlobalSyncButton } from '@/components/dashboard/GlobalSyncButton';
import { RealTimePnL } from '@/components/dashboard/cards/RealTimePnL';
import { TradeExecutionLogPanel } from '@/components/dashboard/cards/TradeExecutionLogPanel';
import { TradeVelocityDashboard } from '@/components/dashboard/cards/TradeVelocityDashboard';

export default function DashboardPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header - Fixed 48px */}
      <div className="flex-shrink-0 h-12 flex items-center justify-between px-3 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-foreground">Dashboard</h1>
          <div className="flex items-center gap-1.5">
            <EngineStatus />
            <ConnectionStatus />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GlobalSyncButton />
          <BotControls />
        </div>
      </div>

      {/* Main Content - Fixed layout, no scroll */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Content Area - 2x2 Grid */}
        <div className="flex-1 flex flex-col p-2 gap-2 overflow-hidden min-w-0">
          {/* Stats Row - Compact */}
          <div className="flex-shrink-0">
            <StatsCards />
          </div>

          {/* Main Grid - 2x2 layout */}
          <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-2">
            <RealTimePnL />
            <TradeVelocityDashboard />
            <LiveSignals />
            <PositionsPanel />
          </div>
        </div>

        {/* Right Panel - Trade Execution Log (Full Height) */}
        <div className="w-72 flex-shrink-0 border-l border-border flex flex-col overflow-hidden">
          <TradeExecutionLogPanel />
        </div>
      </div>
    </div>
  );
}