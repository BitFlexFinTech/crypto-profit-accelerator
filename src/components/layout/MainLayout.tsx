import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  TrendingUp, 
  History, 
  Settings, 
  Zap, 
  BarChart3,
  PieChart,
  Wallet,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/portfolio', label: 'Portfolio', icon: Wallet },
  { path: '/analytics', label: 'Analytics', icon: PieChart },
  { path: '/charts', label: 'Charts', icon: BarChart3 },
  { path: '/positions', label: 'Positions', icon: TrendingUp },
  { path: '/history', label: 'History', icon: History },
  { path: '/settings', label: 'Settings', icon: Settings },
];

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background dark flex">
      {/* Sidebar */}
      <aside className={cn(
        "bg-sidebar-background border-r border-sidebar-border transition-all duration-300 flex flex-col",
        sidebarCollapsed ? "w-16" : "w-56"
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          {!sidebarCollapsed && (
            <Link to="/" className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-sidebar-primary" />
              <span className="text-lg font-bold text-sidebar-foreground">HFT Bot</span>
            </Link>
          )}
          {sidebarCollapsed && (
            <Link to="/" className="mx-auto">
              <Zap className="h-6 w-6 text-sidebar-primary" />
            </Link>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-3 transition-all",
                    sidebarCollapsed ? "px-0 justify-center" : "px-3",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Collapse Button */}
        <div className="p-2 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn(
              "w-full text-sidebar-foreground hover:bg-sidebar-accent/50",
              sidebarCollapsed ? "justify-center" : "justify-end"
            )}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
