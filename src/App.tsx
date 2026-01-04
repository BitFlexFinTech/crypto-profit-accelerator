import { useState, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { SetupWizard } from "@/components/wizard/SetupWizard";
import { useSetupProgress } from "@/hooks/useSetupProgress";
import DashboardPage from "@/pages/Dashboard";
import PositionsPage from "@/pages/Positions";
import HistoryPage from "@/pages/History";
import SettingsPage from "@/pages/Settings";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function AppContent() {
  const { progress, loading } = useSetupProgress();
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    if (!loading && progress && !progress.is_completed) {
      setShowWizard(true);
    }
  }, [loading, progress]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center dark">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (showWizard) {
    return <SetupWizard onComplete={() => setShowWizard(false)} />;
  }

  return (
    <Routes>
      <Route path="/" element={<MainLayout><DashboardPage /></MainLayout>} />
      <Route path="/positions" element={<MainLayout><PositionsPage /></MainLayout>} />
      <Route path="/history" element={<MainLayout><HistoryPage /></MainLayout>} />
      <Route path="/settings" element={<MainLayout><SettingsPage /></MainLayout>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <div className="dark">
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </div>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
