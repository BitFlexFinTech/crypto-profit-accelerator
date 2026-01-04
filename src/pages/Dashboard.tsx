import { StatsCards } from '@/components/dashboard/StatsCards';
import { PositionsPanel } from '@/components/dashboard/PositionsPanel';
import { PnLCharts } from '@/components/dashboard/PnLCharts';
import { BotControls } from '@/components/dashboard/BotControls';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Monitor your trading bot performance</p>
        </div>
        <BotControls />
      </div>

      <StatsCards />
      
      <div className="grid gap-6 lg:grid-cols-2">
        <PositionsPanel />
        <PnLCharts />
      </div>
    </div>
  );
}
