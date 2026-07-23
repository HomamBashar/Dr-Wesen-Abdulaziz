import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Zap, Printer, CheckCircle2, Users } from "lucide-react";
import HistoryComparison from "@/components/HistoryComparison";
import OpticalCalculator from "@/components/OpticalCalculator";

/**
 * Shared examination form used by both Secretary and Doctor.
 * All state is managed by the parent via the `live` object from useLivePatient.
 */
const EYE_COLS = [
  { key: 'ucva', label: 'UCVA' },
  { key: 'sph',  label: 'SPH' },
  { key: 'cyl',  label: 'CYL' },
  { key: 'ax',   label: 'AX' },
  { key: 'bcva', label: 'BCVA' },
  { key: 'near', label: 'NEAR' },
  { key: 'iop',  label: 'IOP' },
];

const ExamForm = forwardRef(function ExamForm({
  patient, live, shortcuts = [],
  onSaveOnly, onSavePrint, saving,
  otherEditorPresent = false,
  // Only ever passed by DoctorPage. When present, a private note section is
  // rendered — never rendered for the secretary, since the prop is simply
  // absent on her page.
  doctorPrivateNote, onDoctorPrivateNoteChange,
}, ref) {
  const { data, update, updateMany, setFocusedField } = live;

  const applyNormal = () => {
    const normalEyeValues = {
      ucva: "6/6", sph: "0.00", cyl: "0.00", ax: "0",
      bcva: "6/6", near: "N6", iop: "14",
    };
    const eyeUpdates = ["right_eye", "left_eye"].flatMap((eye) =>
      Object.entries(normalEyeValues).map(([key, value]) => ({
        path: `${eye}.${key}`, value,
      }))
    );
    updateMany([
      ...eyeUpdates,
      { path: "right_eye.lid", value: "Normal" },
      { path: "right_eye.cornea", value: "Normal" },
      { path: "right_eye.lens", value: "Normal" },
      { path: "right_eye.retina", value: "Normal" },
      { path: "left_eye.lid", value: "Normal" },
      { path: "left_eye.cornea", value: "Normal" },
      { path: "left_eye.lens", value: "Normal" },
      { path: "left_eye.retina", value: "Normal" },
    ]);
  };

  const insertShortcut = (text) => {
    const next = data.prescription ? `${data.prescription}\n${text}` : text;
    update("prescription", next);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Patient header */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[#1F2937] dark:text-slate-100">{patient?.name}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {patient?.age} سنة • {patient?.date}
            {otherEditorPresent && (
              <span className="ms-3 inline-flex items-center gap-1 text-emerald-600 text-xs">
                <Users className="w-3 h-3" /> يتم التعديل من الجهاز الآخر
              </span>
            )}
          </p>
        </div>
        <Button
          data-testid="quick-normal-button"
          onClick={applyNormal}
          variant="outline"
          className="border-[#0B6E4F] text-[#0B6E4F] hover:bg-[#F0FDF4] gap-2"
        >
          <Zap className="w-4 h-4" />
          Normal (نقرة واحدة)
        </Button>
      </div>

      <div className="p-6">
        {/* Eye exam table */}
        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">قياسات النظر</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-[#5B3A7D] text-white text-xs font-semibold p-2 w-10 rounded-tr-lg"></th>
                {EYE_COLS.map((c, i) => (
                  <th key={c.key} className={`bg-[#5B3A7D] text-white text-xs font-semibold p-2 ${i === EYE_COLS.length - 1 ? 'rounded-tl-lg' : ''}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['right_eye', 'left_eye'].map((eye, idx) => (
                <tr key={eye}>
                  <td className={`bg-[#5B3A7D] text-white text-center font-bold text-lg ${idx === 1 ? 'rounded-br-lg' : ''}`}>
                    {eye === 'right_eye' ? 'R' : 'L'}
                  </td>
                  {EYE_COLS.map((c) => {
                    const path = `${eye}.${c.key}`;
                    return (
                      <td key={c.key} className="border border-slate-100 dark:border-slate-800 p-1">
                        <input
                          data-testid={`${eye === 'right_eye' ? 'right' : 'left'}-eye-${c.key}-input`}
                          value={data[eye][c.key] || ""}
                          onChange={(e) => update(path, e.target.value)}
                          onFocus={() => setFocusedField(path)}
                          onBlur={() => setFocusedField(null)}
                          maxLength={50}
                          className="w-full text-center text-sm text-[#1F2937] dark:text-slate-100 bg-transparent border-0 focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-800 p-2 rounded"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <OpticalCalculator rightEye={data.right_eye} leftEye={data.left_eye} age={patient?.age} />

        <HistoryComparison patientId={patient?.id} currentData={data} />

        {/* Lid/Cornea/Lens/Retina */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          {['lid', 'cornea', 'lens', 'retina'].map(field => {
            const path = `right_eye.${field}`;
            return (
              <div key={field}>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase block mb-1.5">
                  {field}
                </label>
                <Input
                  data-testid={`exam-${field}-input`}
                  value={data.right_eye[field] || ""}
                  onChange={(e) => {
                    updateMany([
                      { path: `right_eye.${field}`, value: e.target.value },
                      { path: `left_eye.${field}`, value: e.target.value },
                    ]);
                  }}
                  onFocus={() => setFocusedField(path)}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Normal"
                  className="h-10 text-sm"
                />
              </div>
            );
          })}
        </div>

        {/* Shortcuts row */}
        {shortcuts.length > 0 && (
          <div className="mt-6">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
              اختصارات سريعة
            </label>
            <div className="flex flex-wrap gap-2">
              {shortcuts.map(s => (
                <button
                  key={s.id}
                  type="button"
                  data-testid={`shortcut-inline-${s.id}`}
                  onClick={() => insertShortcut(s.text)}
                  style={{ background: s.color || '#5B3A7D' }}
                  className="text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                  title={s.text}
                >
                  {s.text.length > 30 ? s.text.substring(0, 30) + '…' : s.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Text sections */}
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">التشخيص</label>
            <Textarea
              data-testid="diagnosis-textarea"
              value={data.diagnosis}
              onChange={(e) => update("diagnosis", e.target.value)}
              onFocus={() => setFocusedField("diagnosis")}
              onBlur={() => setFocusedField(null)}
              rows={2}
              maxLength={5000}
              className="resize-none"
              placeholder="التشخيص السريري..."
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
              الوصفة الطبية
            </label>
            <Textarea
              data-testid="prescription-textarea"
              value={data.prescription}
              onChange={(e) => update("prescription", e.target.value)}
              onFocus={() => setFocusedField("prescription")}
              onBlur={() => setFocusedField(null)}
              rows={5}
              maxLength={10000}
              className="resize-none font-mono text-sm"
              placeholder="Rx..."
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">ملاحظات</label>
            <Textarea
              data-testid="notes-textarea"
              value={data.notes}
              onChange={(e) => update("notes", e.target.value)}
              onFocus={() => setFocusedField("notes")}
              onBlur={() => setFocusedField(null)}
              rows={2}
              maxLength={5000}
              className="resize-none"
              placeholder="ملاحظات إضافية..."
            />
          </div>

          {/* Secretary's internal note — visible to both roles, NEVER
              printed and NEVER shown to the patient. */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4">
            <label className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-2">
              ملاحظة السكرتيرة (داخلية، لا تُطبع ولا يراها المريض)
            </label>
            <Textarea
              data-testid="secretary-note-textarea"
              value={data.secretary_note}
              onChange={(e) => update("secretary_note", e.target.value)}
              onFocus={() => setFocusedField("secretary_note")}
              onBlur={() => setFocusedField(null)}
              rows={2}
              maxLength={2000}
              className="resize-none bg-white dark:bg-slate-900"
              placeholder="مثال: المريض متأخر عن موعده، أو له تحسس من دواء معيّن..."
            />
          </div>

          {/* Doctor's private note — only ever rendered on DoctorPage. */}
          {onDoctorPrivateNoteChange && (
            <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/30 p-4">
              <label className="text-xs font-bold text-[#5B3A7D] dark:text-violet-400 uppercase tracking-wider block mb-2">
                ملاحظتي الخاصة (تراها أنتِ فقط، لا تُطبع ولا تراها السكرتيرة)
              </label>
              <Textarea
                data-testid="doctor-private-note-textarea"
                value={doctorPrivateNote}
                onChange={(e) => onDoctorPrivateNoteChange(e.target.value)}
                rows={2}
                maxLength={2000}
                className="resize-none bg-white dark:bg-slate-900"
                placeholder="ملاحظة شخصية خاصة بك حول هذه الحالة..."
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
          {onSaveOnly && (
            <Button
              data-testid="save-patient-button"
              onClick={onSaveOnly}
              disabled={saving}
              variant="outline"
              className="flex-1 h-14 text-base font-semibold"
            >
              <CheckCircle2 className="w-5 h-5 ms-2" />
              حفظ فقط
            </Button>
          )}
          {onSavePrint && (
            <Button
              data-testid="save-print-button"
              onClick={onSavePrint}
              disabled={saving}
              className="flex-1 h-14 text-base font-semibold bg-[#5B3A7D] hover:bg-[#4A2E68]"
            >
              <Printer className="w-5 h-5 ms-2" />
              حفظ + طباعة الوصفة
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

export default ExamForm;
