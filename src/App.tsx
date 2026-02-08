import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import Login from "./pages/Login";
import Dashboard from "./pages/app/Dashboard";
import Expenses from "./pages/app/Expenses";
import Reports from "./pages/app/Reports";
import ReportDetail from "./pages/app/ReportDetail";
import SettingsProfile from "./pages/app/SettingsProfile";
import SettingsPassword from "./pages/app/SettingsPassword";
import SettingsPolicy from "./pages/app/SettingsPolicy";
import SettingsTeam from "./pages/app/SettingsTeam";
import Advances from "./pages/app/Advances";
import Support from "./pages/app/Support";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isBootstrapping } = useAuth();
  
  if (isLoading || isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }
  
  if (user) {
    return <Navigate to="/app/dashboard" replace />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/app/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/app/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
      <Route path="/app/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/app/reports/:id" element={<ProtectedRoute><ReportDetail /></ProtectedRoute>} />
      <Route path="/app/settings/profile" element={<ProtectedRoute><SettingsProfile /></ProtectedRoute>} />
      <Route path="/app/settings/password" element={<ProtectedRoute><SettingsPassword /></ProtectedRoute>} />
      <Route path="/app/settings/policy" element={<ProtectedRoute><SettingsPolicy /></ProtectedRoute>} />
      <Route path="/app/settings/team" element={<ProtectedRoute><SettingsTeam /></ProtectedRoute>} />
      <Route path="/app/advances" element={<ProtectedRoute><Advances /></ProtectedRoute>} />
      <Route path="/app/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
