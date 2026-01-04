import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { TradingProvider } from "@/contexts/TradingContext";
import DashboardPage from "@/pages/Dashboard";
import PortfolioPage from "@/pages/Portfolio";
import AnalyticsPage from "@/pages/Analytics";
import PositionsPage from "@/pages/Positions";
import SettingsPage from "@/pages/Settings";
import RiskManagementPage from "@/pages/RiskManagement";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <TradingProvider>
        <div className="dark">
          <Toaster />
          <Sonner 
            position="top-right"
            toastOptions={{
              style: {
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              },
            }}
            closeButton
          />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<MainLayout><DashboardPage /></MainLayout>} />
              <Route path="/portfolio" element={<MainLayout><PortfolioPage /></MainLayout>} />
              <Route path="/analytics" element={<MainLayout><AnalyticsPage /></MainLayout>} />
              <Route path="/positions" element={<MainLayout><PositionsPage /></MainLayout>} />
              <Route path="/risk-management" element={<MainLayout><RiskManagementPage /></MainLayout>} />
              <Route path="/settings" element={<MainLayout><SettingsPage /></MainLayout>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </div>
      </TradingProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;