import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, ArrowUpDown, Clock, TrendingUp, Zap } from 'lucide-react';
import { useTrades } from '@/hooks/useTrades';

interface PairStats {
  symbol: string;
  totalTrades: number;
  winRate: number;
  avgProfit: number;
  avgDurationSec: number;
  speedScore: number;
}

type SortKey = 'speedScore' | 'winRate' | 'avgProfit' | 'avgDurationSec' | 'totalTrades';

export function PairPerformanceLeaderboard() {
  const { trades, loading } = useTrades();
  const [sortBy, setSortBy] = useState<SortKey>('speedScore');
  const [sortAsc, setSortAsc] = useState(false);

  const pairStats = useMemo((): PairStats[] => {
    const statsMap: Record<string, { profits: number[]; durations: number[]; wins: number; total: number }> = {};

    trades
      .filter(t => t.status === 'closed' && t.opened_at && t.closed_at)
      .forEach(t => {
        if (!statsMap[t.symbol]) {
          statsMap[t.symbol] = { profits: [], durations: [], wins: 0, total: 0 };
        }

        const duration = (new Date(t.closed_at!).getTime() - new Date(t.opened_at!).getTime()) / 1000;
        const profit = t.net_profit || 0;

        statsMap[t.symbol].profits.push(profit);
        statsMap[t.symbol].durations.push(duration);
        statsMap[t.symbol].total++;
        if (profit > 0) statsMap[t.symbol].wins++;
      });

    return Object.entries(statsMap).map(([symbol, data]) => {
      const avgProfit = data.profits.reduce((a, b) => a + b, 0) / data.profits.length;
      const avgDurationSec = data.durations.reduce((a, b) => a + b, 0) / data.durations.length;
      const winRate = data.total > 0 ? data.wins / data.total : 0;
      
      // Speed Score = winRate * (300 / avgDuration) - prioritizes fast winners
      // Clamped to 0-100 range
      const speedScore = avgDurationSec > 0 
        ? Math.min(100, Math.max(0, winRate * (300 / avgDurationSec) * 100))
        : 0;

      return {
        symbol,
        totalTrades: data.total,
        winRate,
        avgProfit,
        avgDurationSec,
        speedScore,
      };
    });
  }, [trades]);

  const sortedStats = useMemo(() => {
    return [...pairStats].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
  }, [pairStats, sortBy, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(key);
      setSortAsc(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const getWinRateColor = (rate: number): string => {
    if (rate >= 0.5) return 'text-primary';
    if (rate >= 0.4) return 'text-yellow-500';
    return 'text-destructive';
  };

  const getDurationColor = (seconds: number): string => {
    if (seconds < 300) return 'text-primary'; // Under 5 min = green
    if (seconds < 900) return 'text-yellow-500'; // 5-15 min = yellow
    return 'text-destructive'; // Over 15 min = red
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return <Badge className="bg-yellow-500/20 text-yellow-400">🥇</Badge>;
    if (index === 1) return <Badge className="bg-gray-400/20 text-gray-300">🥈</Badge>;
    if (index === 2) return <Badge className="bg-amber-600/20 text-amber-500">🥉</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">{index + 1}</Badge>;
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-foreground flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Pair Performance Leaderboard
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant={sortBy === 'speedScore' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSort('speedScore')}
            className="text-xs gap-1"
          >
            <Zap className="h-3 w-3" />
            Speed
          </Button>
          <Button
            variant={sortBy === 'winRate' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSort('winRate')}
            className="text-xs gap-1"
          >
            <TrendingUp className="h-3 w-3" />
            Win Rate
          </Button>
          <Button
            variant={sortBy === 'avgDurationSec' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSort('avgDurationSec')}
            className="text-xs gap-1"
          >
            <Clock className="h-3 w-3" />
            Time
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sortedStats.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No completed trades yet</p>
            <p className="text-sm mt-1">Performance data will appear after trades close</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground px-2 pb-1 border-b border-border">
              <div>Rank</div>
              <div>Pair</div>
              <div className="text-right cursor-pointer hover:text-foreground flex items-center justify-end gap-1" onClick={() => handleSort('totalTrades')}>
                Trades
                {sortBy === 'totalTrades' && <ArrowUpDown className="h-3 w-3" />}
              </div>
              <div className="text-right cursor-pointer hover:text-foreground flex items-center justify-end gap-1" onClick={() => handleSort('winRate')}>
                Win Rate
                {sortBy === 'winRate' && <ArrowUpDown className="h-3 w-3" />}
              </div>
              <div className="text-right cursor-pointer hover:text-foreground flex items-center justify-end gap-1" onClick={() => handleSort('avgDurationSec')}>
                Avg Time
                {sortBy === 'avgDurationSec' && <ArrowUpDown className="h-3 w-3" />}
              </div>
              <div className="text-right cursor-pointer hover:text-foreground flex items-center justify-end gap-1" onClick={() => handleSort('speedScore')}>
                Speed Score
                {sortBy === 'speedScore' && <ArrowUpDown className="h-3 w-3" />}
              </div>
            </div>

            {/* Rows */}
            {sortedStats.slice(0, 10).map((stat, index) => (
              <div 
                key={stat.symbol}
                className="grid grid-cols-6 gap-2 text-sm items-center px-2 py-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div>{getRankBadge(index)}</div>
                <div className="font-medium text-foreground">{stat.symbol}</div>
                <div className="text-right text-muted-foreground">{stat.totalTrades}</div>
                <div className={`text-right font-medium ${getWinRateColor(stat.winRate)}`}>
                  {(stat.winRate * 100).toFixed(0)}%
                </div>
                <div className={`text-right font-mono ${getDurationColor(stat.avgDurationSec)}`}>
                  {formatDuration(stat.avgDurationSec)}
                </div>
                <div className="text-right">
                  <Badge 
                    variant="outline" 
                    className={`font-mono ${stat.speedScore >= 50 ? 'border-primary text-primary' : stat.speedScore >= 25 ? 'border-yellow-500 text-yellow-500' : 'border-muted-foreground'}`}
                  >
                    {stat.speedScore.toFixed(0)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
