import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface LiveBadgeProps {
  isLive?: boolean;
  className?: string;
}

export function LiveBadge({ isLive = true, className }: LiveBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-xs gap-1.5 px-2 py-0.5",
        isLive 
          ? "bg-primary/10 text-primary border-primary/30" 
          : "bg-muted text-muted-foreground",
        className
      )}
    >
      <span className={cn(
        "w-1.5 h-1.5 rounded-full",
        isLive ? "bg-primary live-pulse" : "bg-muted-foreground"
      )} />
      {isLive ? 'Live' : 'Offline'}
    </Badge>
  );
}
