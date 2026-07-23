import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { changePin } from "@/lib/api";

const SettingsDialog = ({ open, onOpenChange }) => {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setCurrentPin(""); setNewPin(""); setConfirmPin("");
  };

  const handleClose = (val) => {
    if (!val) resetForm();
    onOpenChange(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentPin || !newPin || !confirmPin) {
      toast.error("جميع الحقول مطلوبة"); return;
    }
    if (!/^\d+$/.test(newPin)) {
      toast.error("الرمز الجديد يجب أن يتكون من أرقام فقط"); return;
    }
    if (newPin.length < 4) {
      toast.error("الرمز الجديد يجب أن يتكون من 4 أرقام على الأقل"); return;
    }
    if (newPin !== confirmPin) {
      toast.error("الرمز الجديد وتأكيده غير متطابقين"); return;
    }
    setSaving(true);
    try {
      await changePin(currentPin, newPin);
      // The session JWT is independent of the PIN value, so the current
      // token/session stays valid — no need to touch it here.
      toast.success("تم تغيير الرمز بنجاح");
      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "خطأ في تغيير الرمز");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#5B3A7D]" />
            الإعدادات - تغيير رمز الدخول
          </DialogTitle>
          <DialogDescription>
            أدخل رمزك الحالي ثم الرمز الجديد الذي تريده. سيتم تحديثه لك فقط.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-ink-200 mb-2">الرمز الحالي</label>
            <Input
              data-testid="settings-current-pin-input"
              type="password" inputMode="numeric" maxLength={20}
              value={currentPin} onChange={(e) => setCurrentPin(e.target.value)}
              placeholder="••••" className="h-12 text-center tracking-[0.3em] font-mono"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-ink-200 mb-2">الرمز الجديد</label>
            <Input
              data-testid="settings-new-pin-input"
              type="password" inputMode="numeric" maxLength={20}
              value={newPin} onChange={(e) => setNewPin(e.target.value)}
              placeholder="••••" className="h-12 text-center tracking-[0.3em] font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-ink-200 mb-2">تأكيد الرمز الجديد</label>
            <Input
              data-testid="settings-confirm-pin-input"
              type="password" inputMode="numeric" maxLength={20}
              value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="••••" className="h-12 text-center tracking-[0.3em] font-mono"
            />
          </div>
          <DialogFooter>
            <Button
              data-testid="settings-save-pin-button"
              type="submit" disabled={saving}
              className="w-full h-11 bg-[#5B3A7D] hover:bg-[#4A2E68]"
            >
              {saving ? "جاري الحفظ..." : "حفظ الرمز الجديد"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
