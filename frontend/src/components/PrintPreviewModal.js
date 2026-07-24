import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer } from "lucide-react";
import PrescriptionTemplate from "@/components/PrescriptionTemplate";

/**
 * Live preview of exactly what will print, before committing to paper.
 * Renders the real PrescriptionTemplate visibly (scaled down) instead of
 * the normally-hidden print-only copy, so what you see here is exactly
 * what comes out of the printer — same component, same data, same CSS.
 */
const PrintPreviewModal = ({
  open, onClose, patient, examData,
  showNotes, onShowNotesChange,
  onConfirmPrint, printing,
}) => {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Printer className="w-5 h-5 text-[#5B3A7D] dark:text-violet-400" />
            معاينة الوصفة قبل الطباعة
          </DialogTitle>
          <DialogDescription>
            هذا بالضبط ما سيخرج من الطابعة — تحقق منه، عدّل ما تريد، ثم اطبع.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2 border-b border-slate-200 dark:border-ink-700 mb-4">
          <Checkbox
            id="show-notes-toggle"
            checked={showNotes}
            onCheckedChange={onShowNotesChange}
          />
          <label htmlFor="show-notes-toggle" className="text-sm text-slate-600 dark:text-ink-300 cursor-pointer select-none">
            إظهار قسم "ملاحظات" العام في الورقة المطبوعة
          </label>
        </div>

        {/* Scaled-down live preview: the real print component, rendered
            visibly at ~65% size inside a bordered "paper sheet" so the
            proportions match reality, not an approximation. */}
        <div className="flex justify-center bg-slate-100 dark:bg-ink-950 rounded-xl p-6 overflow-hidden">
          <div
            className="bg-white shadow-lg origin-top"
            style={{ transform: "scale(0.65)", width: "148mm" }}
          >
            <PrescriptionTemplate patient={patient} examData={examData} showNotes={showNotes} />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onClose} disabled={printing}>
            إغلاق
          </Button>
          <Button
            data-testid="confirm-print-button"
            onClick={onConfirmPrint}
            disabled={printing}
            className="bg-[#5B3A7D] hover:bg-[#4A2E68] text-white gap-2"
          >
            <Printer className="w-4 h-4" />
            {printing ? "جاري الطباعة..." : "حفظ وطباعة الآن"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrintPreviewModal;
