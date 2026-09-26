import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useState, useCallback } from "react";

// Pages
import Dashboard from "./pages/Dashboard";
import Assets from "./pages/Assets";
import Custody from "./pages/Custody";
import Transfers from "./pages/Transfers";
import Exclusions from "./pages/Exclusions";
import Clearance from "./pages/Clearance";
import Archive from "./pages/Archive";
import Reports from "./pages/Reports";
import UsersPage from "./pages/UsersPage";
import Settings from "./pages/Settings";
import AuditLog from "./pages/AuditLog";
import Tracking from "./pages/Tracking";
import InventoryCount from "./pages/InventoryCount";
import BrowseAssets from "./pages/BrowseAssets";
import Login from "./pages/Login";
import EmployeePortal from "./pages/EmployeePortal";

function AuthGate({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();
  const { data: user, isLoading, error } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [loginKey, setLoginKey] = useState(0);

  const handleLoginSuccess = useCallback(() => {
    // بعد تسجيل الدخول الناجح، نعيد جلب بيانات المستخدم
    utils.auth.me.invalidate();
    setLoginKey(prev => prev + 1);
  }, [utils]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">جاري تحميل النظام...</p>
        </div>
      </div>
    );
  }

  // إذا لم يكن هناك مستخدم مسجل، نعرض صفحة تسجيل الدخول
  if (!user) {
    return <Login key={loginKey} onLoginSuccess={handleLoginSuccess} />;
  }

  return <>{children}</>;
}

function Router() {
  const { data: user } = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  if (user?.role === "employee") {
    return <AuthGate><Switch><Route path="/my-items" component={EmployeePortal} /><Route path="/" component={EmployeePortal} /><Route component={EmployeePortal} /></Switch></AuthGate>;
  }
  return (
    <AuthGate>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/assets" component={Assets} />
        <Route path="/custody" component={Custody} />
        <Route path="/transfers" component={Transfers} />
        <Route path="/exclusions" component={Exclusions} />
        <Route path="/clearance" component={Clearance} />
        <Route path="/archive" component={Archive} />
        <Route path="/reports" component={Reports} />
        {(user?.role === "owner" || user?.role === "admin") && <Route path="/users" component={UsersPage} />}
        {(user?.role === "owner" || user?.role === "admin") && <Route path="/settings" component={Settings} />}
        <Route path="/audit-log" component={AuditLog} />
        <Route path="/tracking" component={Tracking} />
        <Route path="/inventory-count" component={InventoryCount} />
        <Route path="/browse-assets" component={BrowseAssets} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AuthGate>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
