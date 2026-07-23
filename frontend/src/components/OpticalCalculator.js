import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Calculator, ArrowLeftRight, Lightbulb } from "lucide-react";
import { sphericalEquivalent, transpose, suggestLensType } from "@/lib/opticalCalc";

const EyeCalcRow = ({ label, eyeData, age, onOpenDetails }) => {
  const se = useMemo(
    () => sphericalEquivalent(eyeData?.sph, eyeData?.cyl),
    [eyeData?.sph, eyeData?.cyl]
  );

  if (se === null) return null;

  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="font-semibold text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-[#1F2937] dark:text-slate-100">
        SE: <span className="font-mono font-semibold">{se >= 0 ? '+' : ''}{se.toFixed(2)}</span>
      </span>
      <button
        type="button"
        data-testid={`optical-calc-details-${label === 'R' ? 'right' : 'left'}`}
        onClick={() => onOpenDetails(label, eyeData, age)}
        className="text-[#5B3A7D] dark:text-violet-400 hover:underline flex items-center gap-1"
      >
        <Calculator className="w-3 h-3" /> تفاصيل
      </button>
    </div>
  );
};

/**
 * Live optical calculators for the eye exam table:
 * - Instant Spherical-Equivalent readout per eye as SPH/CYL are typed.
 * - A details dialog per eye with plus/minus-cylinder transposition and
 *   rough lens-type suggestions based on the numbers.
 * Purely a calculation aid; never writes back into the exam data.
 */
const OpticalCalculator = ({ rightEye, leftEye, age }) => {
  const [details, setDetails] = useState(null); // { label, eyeData }

  const openDetails = (label, eyeData) => setDetails({ label, eyeData });
  const closeDetails = () => setDetails(null);

  const transposed = details ? transpose(details.eyeData?.sph, details.eyeData?.cyl, details.eyeData?.ax) : null;
  const suggestions = details ? suggestLensType({ sph: details.eyeData?.sph, cyl: details.eyeData?.cyl, age }) : [];

  const hasAnyValue = sphericalEquivalent(rightEye?.sph, rightEye?.cyl) !== null
    || sphericalEquivalent(leftEye?.sph, leftEye?.cyl) !== null;

  if (!hasAnyValue) return null;

  return (
    <div className="mt-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 px-3 py-2 space-y-1.5">
      <EyeCalcRow label="R" eyeData={rightEye} age={age} onOpenDetails={openDetails} />
      <EyeCalcRow label="L" eyeData={leftEye} age={age} onOpenDetails={openDetails} />

      <Dialog open={!!details} onOpenChange={(o) => !o && closeDetails()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#5B3A7D] dark:text-violet-400" />
              حاسبة العدسات — عين {details?.label === 'R' ? 'اليمنى' : 'اليسرى'}
            </DialogTitle>
            <DialogDescription>
              نتائج حسابية توضيحية لمساعدتك على اتخاذ القرار السريري، وليست بديلاً عن تقييمك.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                <ArrowLeftRight className="w-3.5 h-3.5" /> تحويل الصيغة (Transposition)
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">القيمة الحالية</p>
                  <p className="font-mono text-[#1F2937] dark:text-slate-100">
                    SPH {details?.eyeData?.sph || '0.00'} / CYL {details?.eyeData?.cyl || '0.00'} × {details?.eyeData?.ax || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">الصيغة المقابلة</p>
                  <p className="font-mono font-semibold text-[#5B3A7D] dark:text-violet-400">
                    SPH {transposed?.sph || '—'} / CYL {transposed?.cyl || '—'} × {transposed?.ax || '—'}
                  </p>
                </div>
              </div>
            </div>

            {suggestions.length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5" /> اقتراحات نوع العدسة
                </p>
                <ul className="space-y-2">
                  {suggestions.map((s, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-semibold text-[#1F2937] dark:text-slate-100">{s.label}</span>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.note}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OpticalCalculator;
