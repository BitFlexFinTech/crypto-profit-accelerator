import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  showLive?: boolean;
  syncTime?: number;
  className?: string;
}

export function StatCard({ 
  title, 
  value, 
  subtitle,
  icon: Icon, 
  trend = 'neutral',
  showLive,
  syncTime,
  className 
}: StatCardProps) {
  const trendColor = trend === 'up' ? 'text-primary' : trend === 'down' ? 'text-destructive' : 'text-foreground';
  
  return (
    <Card className={cn(
      "bg-card border-border relative overflow-hidden",
      "hover:border-primary/30 transition-colors",
      className
    )}>
      {/* Gradient accent line */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-accent opacity-60" />
      
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-muted-foreground truncate">{title}</p>
              {showLive && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary live-pulse" />
                </span>
              )}
              {syncTime !== undefined && (
                <span className="text-[10px] text-muted-foreground tabular-nums">{syncTime}s</span>
              )}
            </div>
            <p className={cn("text-xl font-bold tabular-nums", trendColor)}>
              {value}
            </p>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className={cn(
            "p-2 rounded-lg",
            trend === 'up' ? 'bg-primary/10' : 
            trend === 'down' ? 'bg-destructive/10' : 
            'bg-secondary'
          )}>
            <Icon className={cn(
              "h-4 w-4",
              trend === 'up' ? 'text-primary' : 
              trend === 'down' ? 'text-destructive' : 
              'text-muted-foreground'
            )} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
