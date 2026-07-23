import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { verifyPin, setSession } from "@/lib/api";

const LoginPage = () => {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pin) { toast.error("أدخل الرمز"); return; }
    setLoading(true);
    try {
      const { role, access_token } = await verifyPin(pin);
      setSession(access_token, role);
      toast.success(role === 'doctor' ? "مرحباً د.وسن" : "مرحباً بك");
      navigate(role === 'doctor' ? "/doctor" : "/secretary", { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.detail || "رمز غير صحيح");
      setPin("");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#FAFBFC] dark:bg-slate-950 flex flex-col">
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-[#5B3A7D] flex items-center justify-center mx-auto mb-4">
              <Eye className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[#1F2937] dark:text-slate-100">عيادة الدكتورة وسن عبدالعزيز رشيد لطب العيون</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">د. وسن عبدالعزيز رشيد</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 text-center">
                أدخل رمز الدخول
              </label>
              <Input
                data-testid="pin-input"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                className="h-16 text-2xl text-center tracking-[0.5em] font-mono"
                autoFocus
                maxLength={20}
              />
            </div>

            <Button
              data-testid="pin-submit-button"
              type="submit"
              disabled={loading}
              className="w-full h-14 text-base font-semibold bg-[#5B3A7D] hover:bg-[#4A2E68] rounded-xl"
            >
              {loading ? "جاري التحقق..." : "دخول"}
            </Button>

            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
              الرمز يحدد تلقائياً واجهة السكرتير أو الطبيبة
            </p>
          </form>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
        © 2026 عيادة الدكتورة وسن عبدالعزيز رشيد لطب العيون
      </footer>
    </div>
  );
};

export default LoginPage;
