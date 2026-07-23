import { useState, useEffect, useCallback } from "react";
import apiClient from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { History, TrendingUp, TrendingDown, Minus, X } from "lucide-react";

const EYE_ROWS = [
  { key: 'ucva', label: 'UCVA' },
  { key: 'sph', label: 'SPH' },
  { key: 'cyl', label: 'CYL' },
  { key: 'ax', label: 'AX' },
  { key: 'bcva', label: 'BCVA' },
  { key: 'near', label: 'NEAR' },
  { key: 'iop', label: 'IOP' },
  { key: 'lid', label: 'Lid' },
  { key: 'cornea', label: 'Cornea' },
  { key: 'lens', label: 'Lens' },
  { key: 'retina', label: 'Retina' },
];

const formatDate = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ar-EG", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return iso;
  }
};

/** Compares two eye-field values and returns a change indicator.
 * Numeric-looking values (SPH/CYL/AX/IOP) are compared numerically so that
 * e.g. "-1.00" -> "-1.50" is flagged as a worsening myopia shift, not just
 * "different". Non-numeric values (VA fractions, free text) fall back to a
 * plain equal/different comparison. */
const compareValue = (oldVal, newVal) => {
  const o = (oldVal || '').trim();
  const n = (newVal || '').trim();
  if (o === n) return 'same';
  if (!o || !n) return 'different';
  const of = parseFloat(o);
  const nf = parseFloat(n);
  if (!Number.isNaN(of) && !Number.isNaN(nf)) {
    if (nf > of) return 'up';
    if (nf < of) return 'down';
    return 'same';
  }
  return 'different';
};

const ChangeIcon = ({ status }) => {
  if (status === 'up') return <TrendingUp className="w-3 h-3 text-amber-500" />;
  if (status === 'down') return <TrendingDown className="w-3 h-3 text-sky-500" />;
  if (status === 'different') return <span className="w-3 h-3 inline-block rounded-full bg-violet-400" />;
  return <Minus className="w-3 h-3 text-slate-300 dark:text-ink-600" />;
};

const EyeColumn = ({ title, data, compareAgainst }) => (
  <div className="flex-1 min-w-0">
    <h4 className="text-xs font-bold text-slate-500 dark:text-ink-400 uppercase tracking-wider mb-2 text-center">{title}</h4>
    <div className="rounded-lg border border-slate-200 dark:border-ink-700 overflow-hidden">
      {EYE_ROWS.map((row, i) => {
        const val = data?.[row.key] || '—';
        const status = compareAgainst ? compareValue(compareAgainst[row.key], data?.[row.key]) : null;
        return (
          <div
            key={row.key}
            className={`flex items-center justify-between px-3 py-1.5 text-sm ${i % 2 === 0 ? 'bg-slate-50 dark:bg-ink-800/60' : 'bg-white dark:bg-ink-900'}`}
          >
            <span className="text-slate-400 dark:text-ink-500 text-xs">{row.label}</span>
            <span className="flex items-center gap-1.5 font-medium text-[#1F2937] dark:text-ink-50">
              {compareAgainst && <ChangeIcon status={status} />}
              {val}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

/**
 * Side-by-side comparison of the current exam against a previously
 * completed visit for the same patient (matched by exact name).
 * Read-only: this never mutates `live`, it's purely for the doctor/secretary
 * to review progression at a glance.
 */
const HistoryComparison = ({ patientId, currentData }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const fetchHistory = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/patients/${patientId}/history`);
      setHistory(data.history || []);
      if (data.history?.length) setSelectedId(data.history[0].id);
    } catch (e) {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (open) fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId]);

  if (!patientId) return null;

  const selected = history.find(h => h.id === selectedId);

  return (
    <div className="mt-4">
      {!open ? (
        <Button
          data-testid="open-history-comparison-button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-2 text-[#5B3A7D] dark:text-violet-400 border-[#5B3A7D]/30 dark:border-violet-900 hover:bg-[#5B3A7D]/5"
        >
          <History className="w-4 h-4" />
          مقارنة بالفحوصات السابقة
        </Button>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-ink-700 bg-white dark:bg-ink-900 p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#5B3A7D] dark:text-violet-400" />
              <h3 className="text-sm font-bold text-[#1F2937] dark:text-ink-50">مقارنة السجلات السابقة</h3>
            </div>
            <div className="flex items-center gap-2">
              {history.length > 0 && (
                <Select value={selectedId || ''} onValueChange={setSelectedId}>
                  <SelectTrigger data-testid="history-visit-select" className="h-8 w-56 text-xs">
                    <SelectValue placeholder="اختر زيارة سابقة" />
                  </SelectTrigger>
                  <SelectContent>
                    {history.map(h => (
                      <SelectItem key={h.id} value={h.id} className="text-xs">
                        {formatDate(h.updated_at || h.created_at)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                data-testid="close-history-comparison-button"
                variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => setOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-10 text-sm text-slate-400 dark:text-ink-500">جاري التحميل...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-400 dark:text-ink-500">
              لا توجد زيارات سابقة مكتملة لهذا المريض
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-400 dark:text-ink-500 uppercase">زيارة سابقة</p>
                  <p className="text-sm font-semibold text-[#1F2937] dark:text-ink-50">
                    {formatDate(selected?.updated_at || selected?.created_at)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-[#0B6E4F] dark:text-emerald-400 uppercase">الزيارة الحالية</p>
                  <p className="text-sm font-semibold text-[#1F2937] dark:text-ink-50">اليوم</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <EyeColumn title="R (يمين)" data={selected?.right_eye} />
                  <EyeColumn title="L (يسار)" data={selected?.left_eye} />
                </div>
                <div className="space-y-4">
                  <EyeColumn title="R (يمين)" data={currentData?.right_eye} compareAgainst={selected?.right_eye} />
                  <EyeColumn title="L (يسار)" data={currentData?.left_eye} compareAgainst={selected?.left_eye} />
                </div>
              </div>

              {(selected?.diagnosis || currentData?.diagnosis) && (
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-ink-700">
                  <div>
                    <p className="text-xs font-bold text-slate-400 dark:text-ink-500 uppercase mb-1">التشخيص (سابق)</p>
                    <p className="text-sm text-slate-600 dark:text-ink-200">{selected?.diagnosis || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 dark:text-ink-500 uppercase mb-1">التشخيص (حالي)</p>
                    <p className="text-sm text-slate-600 dark:text-ink-200">{currentData?.diagnosis || '—'}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 dark:border-ink-700 text-xs text-slate-400 dark:text-ink-500">
                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-amber-500" /> ارتفاع بالقيمة</span>
                <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-sky-500" /> انخفاض بالقيمة</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 inline-block rounded-full bg-violet-400" /> تغيّر نصي</span>
                <span className="flex items-center gap-1"><Minus className="w-3 h-3 text-slate-300 dark:text-ink-600" /> بدون تغيير</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default HistoryComparison;
