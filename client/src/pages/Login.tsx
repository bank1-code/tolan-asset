/*
 * Design: Calm Luxury - صفحة تسجيل الدخول
 * تسجيل دخول مستقل بكلمة مرور واسم مستخدم (بدون OAuth)
 */
import { Button } from "@/components/ui/button";
import { IMAGE_URLS } from "@/lib/data";
import { trpc } from "@/lib/trpc";
import { Building2, Eye, EyeOff, Lock, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface LoginProps {
  onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const loginMut = trpc.localAuth.login.useMutation({
    onSuccess: () => {
      toast.success("تم تسجيل الدخول بنجاح");
      onLoginSuccess();
    },
    onError: (err) => {
      toast.error(err.message || "اسم المستخدم أو كلمة المرور غير صحيحة");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast.error("يرجى إدخال اسم المستخدم");
      return;
    }
    if (!password.trim()) {
      toast.error("يرجى إدخال كلمة المرور");
      return;
    }
    loginMut.mutate({ username: username.trim(), password });
  };

  return (
    <div className="min-h-screen flex" dir="rtl">
      {/* Right side - Login form */}
      <div className="w-full lg:w-[480px] flex flex-col justify-center px-8 lg:px-14 bg-card">
        <div className="w-full max-w-sm mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-foreground">إدارة العهد والأصول</h1>
              <p className="text-[11px] text-muted-foreground">نظام سحابي متكامل</p>
            </div>
          </div>

          {/* Welcome */}
          <div className="mb-8">
            <h2 className="text-2xl font-extrabold text-foreground mb-1">مرحباً بك</h2>
            <p className="text-sm text-muted-foreground">
              قم بتسجيل الدخول للوصول إلى لوحة التحكم
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">اسم المستخدم</label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  className="w-full h-11 pr-10 pl-4 rounded-lg bg-muted/40 border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  className="w-full h-11 pr-10 pl-10 rounded-lg bg-muted/40 border border-border text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-sm font-bold shadow-lg shadow-primary/20"
              disabled={loginMut.isPending}
            >
              {loginMut.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  جاري الدخول...
                </span>
              ) : (
                "تسجيل الدخول"
              )}
            </Button>
          </form>

          <p className="text-[10px] text-muted-foreground/60 text-center mt-8">
            نظام إدارة العهد والأصول - الإصدار 2.0
          </p>
        </div>
      </div>

      {/* Left side - Background image */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <img
          src={IMAGE_URLS.loginBg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-card/20 to-transparent" />
        <div className="relative z-10 flex flex-col justify-end p-12">
          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-6 max-w-md shadow-xl">
            <h3 className="text-lg font-extrabold text-foreground mb-2">
              إدارة ذكية لأصولك
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              نظام سحابي متكامل لإدارة الأصول والعهد والموظفين مع تتبع كامل
              لجميع العمليات وتقارير تفصيلية.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
