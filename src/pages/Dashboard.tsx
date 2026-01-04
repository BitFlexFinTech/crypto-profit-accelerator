import { StatsCards } from '@/components/dashboard/StatsCards';
import { PositionsPanel } from '@/components/dashboard/PositionsPanel';
import { PnLCharts } from '@/components/dashboard/PnLCharts';
import { BotControls } from '@/components/dashboard/BotControls';
import { LiveSignals } from '@/components/dashboard/LiveSignals';
import { ConnectionStatus } from '@/components/dashboard/ConnectionStatus';
import { EngineStatus } from '@/components/dashboard/EngineStatus';

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
        <BotControls />
      </div>

      <StatsCards />
      
      <div className="grid gap-6 lg:grid-cols-2">
        <PositionsPanel />
        <LiveSignals />
      </div>

      <PnLCharts />
    </div>
  );
}
