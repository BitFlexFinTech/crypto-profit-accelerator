import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { useTrades } from "@/hooks/useTrades";
import { useMemo } from "react";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, startOfQuarter, endOfQuarter, subQuarters } from "date-fns";

interface PeriodData {
  profit: number;
  trades: number;
  winRate: number;
}

function calculatePeriodData(trades: any[], start: Date, end: Date): PeriodData {
  const periodTrades = trades.filter(t => {
    if (!t.closed_at || t.status !== 'closed') return false;
    const closeDate = new Date(t.closed_at);
    return closeDate >= start && closeDate <= end;
  });

  const profit = periodTrades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
  const wins = periodTrades.filter(t => (t.net_profit || 0) > 0).length;
  const winRate = periodTrades.length > 0 ? (wins / periodTrades.length) * 100 : 0;

  return { profit, trades: periodTrades.length, winRate };
}

interface ComparisonRowProps {
  label: string;
  current: PeriodData;
  previous: PeriodData;
}

function ComparisonRow({ label, current, previous }: ComparisonRowProps) {
  const profitChange = current.profit - previous.profit;
  const percentChange = previous.profit !== 0 
    ? ((profitChange / Math.abs(previous.profit)) * 100)
    : current.profit !== 0 ? 100 : 0;

  const getIcon = () => {
    if (profitChange > 0) return <TrendingUp className="h-3 w-3 text-green-500" />;
    if (profitChange < 0) return <TrendingDown className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {getIcon()}
      </div>
      
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">Previous</div>
          <div className={`text-sm font-mono ${previous.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            ${previous.profit.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">{previous.trades} trades</div>
        </div>
        
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">Current</div>
          <div className={`text-sm font-mono ${current.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            ${current.profit.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground">{current.trades} trades</div>
        </div>
      </div>
      
      <div className={`mt-2 text-xs text-center py-1 rounded ${
        profitChange > 0 ? 'bg-green-500/10 text-green-500' :
        profitChange < 0 ? 'bg-red-500/10 text-red-500' :
        'bg-muted text-muted-foreground'
      }`}>
        {profitChange >= 0 ? '+' : ''}{profitChange.toFixed(2)} ({percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}%)
      </div>
    </div>
  );
}

export function PeriodComparisonCard() {
  const { trades } = useTrades();
  const now = new Date();

  const comparisons = useMemo(() => {
    // Week comparison
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

    // Month comparison
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    // Quarter comparison
    const thisQuarterStart = startOfQuarter(now);
    const thisQuarterEnd = endOfQuarter(now);
    const lastQuarterStart = startOfQuarter(subQuarters(now, 1));
    const lastQuarterEnd = endOfQuarter(subQuarters(now, 1));

    return {
      weekly: {
        current: calculatePeriodData(trades, thisWeekStart, thisWeekEnd),
        previous: calculatePeriodData(trades, lastWeekStart, lastWeekEnd),
      },
      monthly: {
        current: calculatePeriodData(trades, thisMonthStart, thisMonthEnd),
        previous: calculatePeriodData(trades, lastMonthStart, lastMonthEnd),
      },
      quarterly: {
        current: calculatePeriodData(trades, thisQuarterStart, thisQuarterEnd),
        previous: calculatePeriodData(trades, lastQuarterStart, lastQuarterEnd),
      },
    };
  }, [trades, now]);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Period Comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ComparisonRow 
          label="Week over Week"
          current={comparisons.weekly.current}
          previous={comparisons.weekly.previous}
        />
        <ComparisonRow 
          label="Month over Month"
          current={comparisons.monthly.current}
          previous={comparisons.monthly.previous}
        />
        <ComparisonRow 
          label="Quarter over Quarter"
          current={comparisons.quarterly.current}
          previous={comparisons.quarterly.previous}
        />
      </CardContent>
    </Card>
  );
}