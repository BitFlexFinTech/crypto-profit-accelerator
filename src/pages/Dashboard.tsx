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
import { VPSStatusPanel } from '@/components/dashboard/cards/VPSStatusPanel';
import { VPSAutoScalingPanel } from '@/components/dashboard/cards/VPSAutoScalingPanel';
import { VPSDeploymentHistory } from '@/components/dashboard/cards/VPSDeploymentHistory';
import { VPSLatencyChart } from '@/components/dashboard/cards/VPSLatencyChart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

        {/* Right Panel - Trade Execution Log + VPS Monitoring */}
        <div className="w-72 flex-shrink-0 border-l border-border overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden">
            <TradeExecutionLogPanel />
          </div>
          
          {/* VPS Monitoring Tabs */}
          <div className="flex-shrink-0 border-t border-border overflow-hidden">
            <Tabs defaultValue="status" className="h-full">
              <TabsList className="w-full grid grid-cols-4 h-7 rounded-none border-b border-border bg-transparent">
                <TabsTrigger value="status" className="text-[10px] h-6 rounded-none data-[state=active]:bg-muted">Status</TabsTrigger>
                <TabsTrigger value="latency" className="text-[10px] h-6 rounded-none data-[state=active]:bg-muted">Latency</TabsTrigger>
                <TabsTrigger value="scaling" className="text-[10px] h-6 rounded-none data-[state=active]:bg-muted">Scaling</TabsTrigger>
                <TabsTrigger value="history" className="text-[10px] h-6 rounded-none data-[state=active]:bg-muted">History</TabsTrigger>
              </TabsList>
              <div className="h-[280px] overflow-auto">
                <TabsContent value="status" className="mt-0 p-1">
                  <VPSStatusPanel />
                </TabsContent>
                <TabsContent value="latency" className="mt-0 p-1">
                  <VPSLatencyChart />
                </TabsContent>
                <TabsContent value="scaling" className="mt-0 p-1">
                  <VPSAutoScalingPanel />
                </TabsContent>
                <TabsContent value="history" className="mt-0 p-1">
                  <VPSDeploymentHistory />
                </TabsContent>
              </div>
            </Tabs>
          </div>
          
          <div className="h-28 border-t border-border overflow-hidden">
            <RateLimitStatusPanel />
          </div>
          <div className="h-32 border-t border-border overflow-hidden">
            <TradeExecutionSpeedPanel />
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
