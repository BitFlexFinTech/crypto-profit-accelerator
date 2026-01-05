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
import { RateLimitStatusPanel } from '@/components/dashboard/cards/RateLimitStatusPanel';
import { TradeExecutionSpeedPanel } from '@/components/dashboard/cards/TradeExecutionSpeedPanel';
import { SafeModeOverlay } from '@/components/dashboard/SafeModeOverlay';

export default function DashboardPage() {
  return (
    <>
    <SafeModeOverlay />
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Compact Header - 40px */}
      <div className="h-10 flex-shrink-0 flex items-center justify-between px-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-foreground">Dashboard</h1>
          <EngineStatus />
          <ConnectionStatus />
        </div>
        <div className="flex items-center gap-2">
          <GlobalSyncButton />
          <BotControls />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Content - Stats + 2x2 Grid */}
        <div className="flex-1 flex flex-col p-1.5 gap-1.5 min-h-0 min-w-0">
          {/* Compact Stats Row - 56px */}
          <div className="flex-shrink-0 h-14">
            <StatsCards compact />
          </div>

          {/* Main 2x2 Grid - fills remaining space */}
          <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-1.5 min-h-0">
            <div className="min-h-0 overflow-hidden">
              <RealTimePnL />
            </div>
            <div className="min-h-0 overflow-hidden">
              <TradeVelocityDashboard />
            </div>
            <div className="min-h-0 overflow-hidden">
              <LiveSignals />
            </div>
            <div className="min-h-0 overflow-hidden">
              <PositionsPanel />
            </div>
          </div>
        </div>

        {/* Right Panel - Trade Execution Log + Performance */}
        <div className="w-64 flex-shrink-0 border-l border-border overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden">
            <TradeExecutionLogPanel />
          </div>
          <div className="h-44 border-t border-border overflow-hidden">
            <RateLimitStatusPanel />
          </div>
          <div className="h-48 border-t border-border overflow-hidden">
            <TradeExecutionSpeedPanel />
          </div>
        </div>
      </div>
    </div>
    </>
  );
}