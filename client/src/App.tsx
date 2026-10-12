import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FieldHelpContext } from "@/components/FieldHelp";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useState, useCallback, lazy, Suspense } from "react";

// Pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Assets = lazy(() => import("./pages/Assets"));
const Custody = lazy(() => import("./pages/Custody"));
const Transfers = lazy(() => import("./pages/Transfers"));
const Exclusions = lazy(() => import("./pages/Exclusions"));
const Warranty = lazy(() => import("./pages/Warranty"));
const Depreciation = lazy(() => import("./pages/Depreciation"));
const Clearance = lazy(() => import("./pages/Clearance"));
const Archive = lazy(() => import("./pages/Archive"));
const Reports = lazy(() => import("./pages/Reports"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const Settings = lazy(() => import("./pages/Settings"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Tracking = lazy(() => import("./pages/Tracking"));
const InventoryCount = lazy(() => import("./pages/InventoryCount"));
const BrowseAssets = lazy(() => import("./pages/BrowseAssets"));
import Login from "./pages/Login";
const EmployeePortal = lazy(() => import("./pages/EmployeePortal"));

function AuthGate({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();
  const [location, navigate] = useLocation();
  const { data: user, isLoading, error } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [loginKey, setLoginKey] = useState(0);

  const handleLoginSuccess = useCallback(() => {
    // A different user may not have access to the previous user's page.
    navigate("/", { replace: true });
    // بعد تسجيل الدخول الناجح، نعيد جلب بيانات المستخدم
    utils.auth.me.invalidate();
    setLoginKey(prev => prev + 1);
  }, [utils, navigate]);

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

  const helpRoute = ["/depreciation", "/warranty", "/transfers", "/settings"].includes(location.replace(/\/+$/, ""));
  return <FieldHelpContext.Provider value={helpRoute && user.fieldHelpEnabled === true}>{children}</FieldHelpContext.Provider>;
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
        <Route path="/warranty" component={Warranty} />
        <Route path="/depreciation" component={Depreciation} />
        <Route path="/clearance" component={Clearance} />
        <Route path="/archive" component={Archive} />
        <Route path="/reports" component={Reports} />
        {(user?.role === "owner" || user?.role === "admin") && <Route path="/users" component={UsersPage} />}
        {(user?.role === "owner" || user?.role === "admin" || user?.role === "accounting_manager" || user?.role === "accountant") && <Route path="/settings" component={Settings} />}
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
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center" role="status"><Loader2 className="w-6 h-6 animate-spin ml-2" />جاري تحميل الشاشة...</div>}>
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
