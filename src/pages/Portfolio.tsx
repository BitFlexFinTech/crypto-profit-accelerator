import { useTrading } from '@/contexts/TradingContext';
import { PortfolioSummary } from '@/components/portfolio/PortfolioSummary';
import { ExchangeBreakdown } from '@/components/portfolio/ExchangeBreakdown';
import { HoldingsTable } from '@/components/portfolio/HoldingsTable';
import { AllocationChart } from '@/components/portfolio/AllocationChart';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function PortfolioPage() {
  const { loading } = useTrading();

  if (loading) {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <div className="flex-shrink-0 h-12 border-b border-border px-4 flex items-center">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Fixed Header */}
      <div className="flex-shrink-0 h-12 border-b border-border px-4 flex items-center bg-card/50">
        <div>
          <h1 className="text-lg font-bold text-foreground">Portfolio Holdings</h1>
          <p className="text-xs text-muted-foreground">Real-time portfolio across all exchanges</p>
        </div>
      </div>
      
      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <PortfolioSummary />
          
          <div className="grid gap-4 lg:grid-cols-2">
            <ExchangeBreakdown />
            <AllocationChart />
          </div>
          
          <HoldingsTable />
        </div>
      </ScrollArea>
    </div>
  );
}