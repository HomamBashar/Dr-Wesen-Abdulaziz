import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, { logout, getRole } from "@/lib/api";
import useWebSocket from "@/hooks/useWebSocket";
import useLivePatient from "@/hooks/useLivePatient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { LogOut, Eye, Search, ArrowLeft, Printer, Archive, Calendar, Pencil, Trash2, Settings } from "lucide-react";
import ExamForm from "@/components/ExamForm";
import PrescriptionTemplate from "@/components/PrescriptionTemplate";
import PrintPreviewModal from "@/components/PrintPreviewModal";
import SettingsDialog from "@/components/SettingsDialog";
import ThemeToggle from "@/components/ThemeToggle";

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

const RecordsPage = () => {
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [recordsSkip, setRecordsSkip] = useState(0);
  const RECORDS_PAGE_SIZE = 50;
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [editingPatient, setEditingPatient] = useState(null);
  const [saving, setSaving] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigate = useNavigate();
  const role = getRole();

  const fetchRecords = useCallback(async (search = "", skip = 0, append = false) => {
    setLoading(true);
    try {
      const params = { status: "completed", limit: RECORDS_PAGE_SIZE, skip };
      if (search.trim()) params.search = search.trim();
      const { data } = await apiClient.get("/patients", { params });
      setRecords(prev => append ? [...prev, ...data.items] : data.items);
      setTotalRecords(data.total);
      setRecordsSkip(skip);
    } catch (e) {
      toast.error("خطأ في جلب السجل");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMoreRecords = () => {
    fetchRecords(searchTerm, recordsSkip + RECORDS_PAGE_SIZE, true);
  };

  // Initial load (immediate), then live search as the user types (debounced).
  useEffect(() => { fetchRecords(""); }, [fetchRecords]);

  useEffect(() => {
    const t = setTimeout(() => { fetchRecords(searchTerm); }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, fetchRecords]);

  // Live refresh: reflect new/edited/deleted completed records immediately,
  // without needing a manual refresh button.
  const handleWsMessage = useCallback((msg) => {
    if (msg.event === "patient_field_edit") {
      if (msg.patient_id === editingPatient?.id) {
        live.applyRemoteEdit(msg.patient_id, msg.path, msg.value);
      }
    } else if (["patient_created", "patient_updated", "patient_deleted"].includes(msg.event)) {
      fetchRecords(searchTerm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRecords, searchTerm, editingPatient?.id]);

  const { send } = useWebSocket(handleWsMessage);
  const live = useLivePatient({ patient: editingPatient, sendWs: send });

  const handleLogout = () => { logout(); navigate("/login"); };
  const handleBackToApp = () => navigate(role === "doctor" ? "/doctor" : "/secretary");

  const handlePrint = (record) => {
    setSelected(record);
    setTimeout(() => window.print(), 150);
  };

  const handleEdit = (record) => setEditingPatient(record);
  const handleCloseEdit = () => setEditingPatient(null);

  // Same rationale as DoctorPage: kept fully separate from the shared
  // live-sync snapshot so it's never sent from a secretary session.
  const [doctorNote, setDoctorNote] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showNotesInPrint, setShowNotesInPrint] = useState(true);
  const doctorNoteSaveTimer = useRef(null);
  useEffect(() => {
    setDoctorNote(editingPatient?.doctor_private_note || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPatient?.id]);

  const handleDoctorNoteChange = (value) => {
    setDoctorNote(value);
    if (doctorNoteSaveTimer.current) clearTimeout(doctorNoteSaveTimer.current);
    const pid = editingPatient?.id;
    if (!pid) return;
    doctorNoteSaveTimer.current = setTimeout(async () => {
      try {
        await apiClient.put(`/patients/${pid}`, { doctor_private_note: value });
      } catch (e) { /* silent */ }
    }, 500);
  };

  const handleDeleteRecord = async () => {
    if (!recordToDelete) return;
    try {
      await apiClient.delete(`/patients/${recordToDelete.id}`);
      toast.success("تم حذف السجل");
      setRecordToDelete(null);
      fetchRecords(searchTerm);
    } catch (e) { toast.error("خطأ في حذف السجل"); }
  };

  const handleSaveEdit = async () => {
    if (!editingPatient) return;
    setSaving(true);
    try {
      await apiClient.put(`/patients/${editingPatient.id}`, {
        ...live.data, status: "completed",
      });
      toast.success("تم حفظ التعديلات");
      setEditingPatient(null);
      fetchRecords(searchTerm);
    } catch (e) {
      toast.error("خطأ في حفظ التعديلات");
    } finally { setSaving(false); }
  };

  const handleSaveEditAndPrint = async () => {
    if (!editingPatient) return;
    setSaving(true);
    try {
      await apiClient.put(`/patients/${editingPatient.id}`, {
        ...live.data, status: "completed",
      });
      toast.success("تم الحفظ - جاري الطباعة");
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          setEditingPatient(null);
          fetchRecords(searchTerm);
        }, 500);
      }, 300);
    } catch (e) {
      toast.error("خطأ في حفظ التعديلات");
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-[#FAFBFC] dark:bg-ink-950">
      <header className="bg-white dark:bg-ink-900 border-b border-slate-200 dark:border-ink-700 sticky top-0 z-10 no-print">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              data-testid="back-to-app-button"
              variant="ghost" size="icon"
              onClick={handleBackToApp}
            >
              <ArrowLeft className="w-5 h-5 rtl-flip" />
            </Button>
            <div className="w-10 h-10 rounded-full bg-[#5B3A7D] flex items-center justify-center">
              <Archive className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#1F2937] dark:text-ink-50">سجل المرضى</h1>
              <p className="text-xs text-slate-500 dark:text-ink-300">الحالات المكتملة</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button data-testid="open-settings-button" variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings className="w-4 h-4 ms-1" />
              <span className="text-sm">الإعدادات</span>
            </Button>
            <ThemeToggle />
            <Button data-testid="logout-button" variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 ms-1" />
              <span className="text-sm">خروج</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Edit mode: reuse the shared exam form */}
      {editingPatient ? (
        <main className="w-full max-w-[1800px] mx-auto px-6 lg:px-10 py-6 no-print">
          <div className="mb-4">
            <Button
              data-testid="cancel-edit-record-button"
              variant="ghost" size="sm"
              onClick={handleCloseEdit}
            >
              <ArrowLeft className="w-4 h-4 ms-1 rtl-flip" />
              رجوع للسجل بدون حفظ
            </Button>
          </div>
          <ExamForm
            patient={editingPatient}
            live={live}
            shortcuts={[]}
            onSaveOnly={handleSaveEdit}
            onSavePrint={handleSaveEditAndPrint}
            onPreviewPrint={() => setPreviewOpen(true)}
            saving={saving}
            {...(role === 'doctor' ? {
              doctorPrivateNote: doctorNote,
              onDoctorPrivateNoteChange: handleDoctorNoteChange,
            } : {})}
          />
        </main>
      ) : (
      <main className="max-w-6xl mx-auto px-6 py-8 no-print">
        <div className="bg-white dark:bg-ink-900 rounded-2xl border border-slate-200 dark:border-ink-700 p-6 mb-6">
          <div className="relative">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400 dark:text-ink-300" />
            <Input
              data-testid="records-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم..."
              className="h-11 ps-9 text-base"
            />
          </div>
        </div>

        <div className="bg-white dark:bg-ink-900 rounded-2xl border border-slate-200 dark:border-ink-700 overflow-hidden">
          {loading ? (
            <div className="text-center py-16 text-slate-400 dark:text-ink-300">جاري التحميل...</div>
          ) : records.length === 0 ? (
            <div className="text-center py-16 text-slate-400 dark:text-ink-300">
              <Archive className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">لا توجد سجلات مطابقة</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {records.map((r) => (
                <div
                  key={r.id}
                  data-testid={`record-item-${r.id}`}
                  className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-ink-800 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-[#1F2937] dark:text-ink-50">{r.name}</p>
                    <p className="text-xs text-slate-500 dark:text-ink-300 mt-0.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {r.age} سنة • {formatDate(r.updated_at || r.created_at)}
                    </p>
                    {r.diagnosis && (
                      <p className="text-xs text-slate-400 dark:text-ink-300 mt-1 truncate max-w-md">
                        {r.diagnosis}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      data-testid={`edit-record-button-${r.id}`}
                      variant="outline" size="sm"
                      onClick={() => handleEdit(r)}
                    >
                      <Pencil className="w-4 h-4 ms-1" />
                      تعديل
                    </Button>
                    <Button
                      data-testid={`print-record-button-${r.id}`}
                      variant="outline" size="sm"
                      onClick={() => handlePrint(r)}
                    >
                      <Printer className="w-4 h-4 ms-1" />
                      طباعة
                    </Button>
                    <Button
                      data-testid={`delete-record-button-${r.id}`}
                      variant="outline" size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                      onClick={() => setRecordToDelete(r)}
                    >
                      <Trash2 className="w-4 h-4 ms-1" />
                      حذف
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && records.length < totalRecords && (
          <div className="text-center mt-6">
            <Button
              data-testid="load-more-records-button"
              variant="outline"
              onClick={loadMoreRecords}
            >
              تحميل المزيد ({records.length} من {totalRecords})
            </Button>
          </div>
        )}
      </main>
      )}

      <div className="print-container">
        <PrescriptionTemplate
          patient={editingPatient || selected}
          examData={editingPatient ? live.data : selected}
          showNotes={showNotesInPrint}
        />
      </div>

      {editingPatient && (
        <PrintPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          patient={editingPatient}
          examData={live.data}
          showNotes={showNotesInPrint}
          onShowNotesChange={setShowNotesInPrint}
          printing={saving}
          onConfirmPrint={async () => {
            setPreviewOpen(false);
            await handleSaveEditAndPrint();
          }}
        />
      )}

      <AlertDialog open={!!recordToDelete} onOpenChange={(open) => !open && setRecordToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف السجل</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف سجل {recordToDelete?.name}؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-record-button">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-record-button"
              onClick={handleDeleteRecord}
              className="bg-red-600 hover:bg-red-700"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};

export default RecordsPage;
