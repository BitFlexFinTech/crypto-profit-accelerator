import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Grid3X3 } from "lucide-react";
import { useTrades } from "@/hooks/useTrades";
import { useMemo } from "react";
import { getDay, getHours } from "date-fns";

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface CellData {
  profit: number;
  count: number;
}

export function PnLHeatmap() {
  const { trades } = useTrades();

  const heatmapData = useMemo(() => {
    // Initialize 7x24 grid
    const grid: CellData[][] = DAYS.map(() => 
      HOURS.map(() => ({ profit: 0, count: 0 }))
    );

    trades
      .filter(t => t.status === 'closed' && t.closed_at)
      .forEach(t => {
        const closeDate = new Date(t.closed_at!);
        const day = getDay(closeDate);
        const hour = getHours(closeDate);
        
        grid[day][hour].profit += t.net_profit || 0;
        grid[day][hour].count += 1;
      });

    return grid;
  }, [trades]);

  // Find min/max for color scaling
  const { minProfit, maxProfit } = useMemo(() => {
    let min = 0, max = 0;
    heatmapData.forEach(row => {
      row.forEach(cell => {
        if (cell.profit < min) min = cell.profit;
        if (cell.profit > max) max = cell.profit;
      });
    });
    return { minProfit: min, maxProfit: max };
  }, [heatmapData]);

  const getCellColor = (profit: number, count: number) => {
    if (count === 0) return 'bg-muted/20';
    
    if (profit > 0) {
      const intensity = Math.min(profit / (maxProfit || 1), 1);
      if (intensity > 0.7) return 'bg-green-500';
      if (intensity > 0.4) return 'bg-green-500/70';
      return 'bg-green-500/40';
    } else if (profit < 0) {
      const intensity = Math.min(Math.abs(profit) / Math.abs(minProfit || 1), 1);
      if (intensity > 0.7) return 'bg-red-500';
      if (intensity > 0.4) return 'bg-red-500/70';
      return 'bg-red-500/40';
    }
    return 'bg-muted/30';
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Grid3X3 className="h-4 w-4 text-primary" />
          Trading Heatmap (P&L by Day & Hour)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          {/* Hour labels */}
          <div className="flex mb-1">
            <div className="w-10 flex-shrink-0" />
            {HOURS.filter((_, i) => i % 3 === 0).map(hour => (
              <div 
                key={hour} 
                className="text-[9px] text-muted-foreground text-center"
                style={{ width: '36px' }}
              >
                {hour.toString().padStart(2, '0')}
              </div>
            ))}
          </div>
          
          {/* Grid */}
          {DAYS.map((day, dayIndex) => (
            <div key={day} className="flex items-center mb-0.5">
              <div className="w-10 text-[10px] text-muted-foreground flex-shrink-0">
                {day}
              </div>
              <div className="flex gap-0.5">
                {HOURS.map(hour => {
                  const cell = heatmapData[dayIndex][hour];
                  return (
                    <Tooltip key={hour}>
                      <TooltipTrigger asChild>
                        <div 
                          className={`w-3 h-3 rounded-sm cursor-pointer transition-all hover:scale-125 ${getCellColor(cell.profit, cell.count)}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <div className="font-medium">{day} {hour.toString().padStart(2, '0')}:00</div>
                        <div className={cell.profit >= 0 ? 'text-green-500' : 'text-red-500'}>
                          P&L: ${cell.profit.toFixed(2)}
                        </div>
                        <div className="text-muted-foreground">
                          {cell.count} trade{cell.count !== 1 ? 's' : ''}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        
        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-red-500" />
            <span>Loss</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-muted/20" />
            <span>No trades</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <span>Profit</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}