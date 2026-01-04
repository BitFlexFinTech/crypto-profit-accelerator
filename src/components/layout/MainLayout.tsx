import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Settings, 
  Zap, 
  PieChart,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/portfolio', label: 'Portfolio', icon: Wallet },
  { path: '/analytics', label: 'Analytics', icon: PieChart },
  { path: '/positions', label: 'Positions', icon: TrendingUp },
  { path: '/risk-management', label: 'Risk', icon: Shield },
  { path: '/settings', label: 'Settings', icon: Settings },
];

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="h-screen bg-background dark flex overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "bg-sidebar-background border-r border-sidebar-border transition-all duration-300 flex flex-col flex-shrink-0",
        sidebarCollapsed ? "w-14" : "w-48"
      )}>
        {/* Logo */}
        <div className="h-10 flex items-center justify-between px-3 border-b border-sidebar-border flex-shrink-0">
          {!sidebarCollapsed && (
            <Link to="/" className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-sidebar-primary" />
              <span className="text-sm font-bold text-sidebar-foreground">HFT Bot</span>
            </Link>
          )}
          {sidebarCollapsed && (
            <Link to="/" className="mx-auto">
              <Zap className="h-5 w-5 text-sidebar-primary" />
            </Link>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 px-1.5 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start gap-2 h-8 transition-all",
                    sidebarCollapsed ? "px-0 justify-center" : "px-2",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="truncate text-xs">{item.label}</span>
                  )}
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Collapse Button */}
        <div className="p-1.5 border-t border-sidebar-border flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn(
              "w-full h-7 text-sidebar-foreground hover:bg-sidebar-accent/50",
              sidebarCollapsed ? "justify-center" : "justify-end"
            )}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
}