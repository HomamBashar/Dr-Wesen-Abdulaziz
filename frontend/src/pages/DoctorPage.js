import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, { logout } from "@/lib/api";
import useWebSocket from "@/hooks/useWebSocket";
import useLivePatient from "@/hooks/useLivePatient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Search, Plus, Edit2, Save, Trash2, LogOut, Eye, Bell, X, Archive, Settings } from "lucide-react";
import ExamForm from "@/components/ExamForm";
import PrescriptionTemplate from "@/components/PrescriptionTemplate";
import SettingsDialog from "@/components/SettingsDialog";
import ThemeToggle from "@/components/ThemeToggle";

const COLOR_PALETTE = [
  "#5B3A7D", "#0B6E4F", "#2A9D8F", "#D97706",
  "#DC2626", "#0891B2", "#7C3AED", "#4B5563",
];

const DoctorPage = () => {
  const [pendingPatients, setPendingPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [shortcuts, setShortcuts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [newShortcut, setNewShortcut] = useState("");
  const [newColor, setNewColor] = useState(COLOR_PALETTE[0]);
  const [editingShortcut, setEditingShortcut] = useState(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [bellRinging, setBellRinging] = useState(false);
  const [otherEditorPresent, setOtherEditorPresent] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigate = useNavigate();

  const fetchPendingPatients = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/patients', { params: { limit: 100 } });
      setPendingPatients(data.items.filter(p => p.status !== 'completed'));
    } catch (e) { /* silent */ }
  }, []);

  const fetchShortcuts = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/shortcuts');
      setShortcuts(data);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => { fetchPendingPatients(); fetchShortcuts(); }, [fetchPendingPatients, fetchShortcuts]);

  const handleWsMessage = useCallback((msg) => {
    if (msg.event === "patient_field_edit") {
      if (msg.patient_id === selectedPatient?.id) {
        live.applyRemoteEdit(msg.patient_id, msg.path, msg.value);
        setOtherEditorPresent(true);
        clearTimeout(window.__doctorEditorTimer);
        window.__doctorEditorTimer = setTimeout(() => setOtherEditorPresent(false), 3000);
      }
    } else if (msg.event === 'patient_created') {
      fetchPendingPatients();
      setNotifCount(c => c + 1);
      setBellRinging(true);
      setTimeout(() => setBellRinging(false), 3000);
      toast.info(`🔔 مريض جديد: ${msg.data?.name || ''}`);
    } else if (['patient_updated', 'patient_deleted'].includes(msg.event)) {
      fetchPendingPatients();
      if (msg.event === 'patient_deleted' && msg.data?.id === selectedPatient?.id) {
        setSelectedPatient(null);
      }
    } else if (msg.event === 'shortcut_changed') {
      fetchShortcuts();
    }
    // `live` is intentionally excluded: it's a fresh object every render,
    // and this callback only needs its (stable) methods, not to be
    // recreated on every keystroke elsewhere in the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatient?.id, fetchPendingPatients, fetchShortcuts]);

  const { send } = useWebSocket(handleWsMessage);
  const live = useLivePatient({ patient: selectedPatient, sendWs: send });

  // Doctor's private note is deliberately kept OUT of the shared
  // useLivePatient auto-save (which always sends a full snapshot): that
  // snapshot is also used on SecretaryPage, and the backend rejects any
  // attempt by the secretary role to write doctor_private_note. Keeping it
  // as fully separate state/save logic guarantees it's never sent from a
  // non-doctor context and never broadcast over the shared WS channel.
  const [doctorNote, setDoctorNote] = useState("");
  const doctorNoteSaveTimer = useRef(null);
  useEffect(() => {
    setDoctorNote(selectedPatient?.doctor_private_note || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatient?.id]);

  const handleDoctorNoteChange = (value) => {
    setDoctorNote(value);
    if (doctorNoteSaveTimer.current) clearTimeout(doctorNoteSaveTimer.current);
    const pid = selectedPatient?.id;
    if (!pid) return;
    doctorNoteSaveTimer.current = setTimeout(async () => {
      try {
        await apiClient.put(`/patients/${pid}`, { doctor_private_note: value });
      } catch (e) { /* silent */ }
    }, 500);
  };

  const clearNotifications = () => { setNotifCount(0); setBellRinging(false); };

  const searchPatients = useCallback(async (term) => {
    if (!term.trim()) { fetchPendingPatients(); return; }
    try {
      const { data } = await apiClient.get('/patients', { params: { search: term.trim(), limit: 100 } });
      setPendingPatients(data.items);
    } catch (e) { toast.error("خطأ في البحث"); }
  }, [fetchPendingPatients]);

  useEffect(() => {
    const t = setTimeout(() => { searchPatients(searchTerm); }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, searchPatients]);

  const selectPatient = async (patient) => {
    setSelectedPatient(patient);
    if (patient.status === 'pending') {
      try {
        await apiClient.patch(`/patients/${patient.id}/status`, { status: 'in_exam' });
      } catch (e) { /* silent */ }
    }
    clearNotifications();
  };

  const handleSaveOnly = async () => {
    if (!selectedPatient) return;
    setSaving(true);
    try {
      await apiClient.put(`/patients/${selectedPatient.id}`, {
        ...live.data, status: 'completed'
      });
      toast.success("تم الحفظ");
      setSelectedPatient(null);
      fetchPendingPatients();
    } catch (e) { toast.error("خطأ في الحفظ"); }
    finally { setSaving(false); }
  };

  const handleSaveAndPrint = async () => {
    if (!selectedPatient) return;
    setSaving(true);
    try {
      await apiClient.put(`/patients/${selectedPatient.id}`, {
        ...live.data, status: 'completed'
      });
      toast.success("تم الحفظ - جاري الطباعة");
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          setSelectedPatient(null);
          fetchPendingPatients();
        }, 500);
      }, 300);
    } catch (e) { toast.error("خطأ في الحفظ"); }
    finally { setSaving(false); }
  };

  const handleAddShortcut = async () => {
    if (!newShortcut.trim()) { toast.error("النص مطلوب"); return; }
    try {
      await apiClient.post('/shortcuts', { text: newShortcut.trim(), color: newColor });
      toast.success("تمت الإضافة");
      setNewShortcut(""); setNewColor(COLOR_PALETTE[0]);
      setAddDialogOpen(false);
      fetchShortcuts();
    } catch (e) { toast.error("خطأ"); }
  };

  const handleUpdateShortcut = async () => {
    if (!editingShortcut?.text?.trim()) return;
    try {
      await apiClient.put(`/shortcuts/${editingShortcut.id}`, {
        text: editingShortcut.text.trim(), color: editingShortcut.color || COLOR_PALETTE[0]
      });
      setEditingShortcut(null);
      fetchShortcuts();
    } catch (e) { toast.error("خطأ"); }
  };

  const handleDeleteShortcut = async (id) => {
    try { await apiClient.delete(`/shortcuts/${id}`); fetchShortcuts(); }
    catch (e) { toast.error("خطأ"); }
  };

  const handleDeletePatient = async () => {
    if (!patientToDelete) return;
    try {
      await apiClient.delete(`/patients/${patientToDelete.id}`);
      toast.success("تم حذف المريض");
      if (selectedPatient?.id === patientToDelete.id) setSelectedPatient(null);
      setPatientToDelete(null);
      fetchPendingPatients();
    } catch (e) { toast.error("خطأ في حذف المريض"); }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div className="min-h-screen bg-[#FAFBFC] dark:bg-slate-950">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 no-print">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#5B3A7D] flex items-center justify-center">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#1F2937] dark:text-slate-100">عيادة د. وسن عبدالعزيز رشيد</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">د. وسن عبدالعزيز رشيد</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="notification-bell"
              onClick={clearNotifications}
              className="relative w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
            >
              <Bell className={`w-5 h-5 text-[#5B3A7D] ${bellRinging ? 'bell-ringing' : ''}`} />
              {notifCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>
            <Button
              data-testid="open-records-button"
              variant="ghost" size="sm"
              onClick={() => navigate("/records")}
            >
              <Archive className="w-4 h-4 ms-1" />
              <span className="text-sm">السجل</span>
            </Button>
            <Button
              data-testid="open-settings-button"
              variant="ghost" size="sm"
              onClick={() => setSettingsOpen(true)}
            >
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

      <div className="max-w-7xl mx-auto px-6 py-6 no-print">
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Sidebar */}
          <aside className="lg:col-span-4 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">قائمة الانتظار</h2>
                <div className="relative mt-3">
                  <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400 dark:text-slate-500" />
                  <Input
                    data-testid="search-patient-input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="بحث..."
                    className="h-9 ps-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                {pendingPatients.length === 0 ? (
                  <p className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">{searchTerm.trim() ? "لا توجد نتائج مطابقة" : "لا يوجد مرضى"}</p>
                ) : (
                  pendingPatients.map((p) => (
                    <div key={p.id} className="relative group">
                      <button
                        data-testid={`patient-item-${p.id}`}
                        onClick={() => selectPatient(p)}
                        className={`w-full text-right p-3 pe-10 rounded-xl border transition-all ${
                          selectedPatient?.id === p.id
                            ? 'bg-[#5B3A7D] text-white border-[#5B3A7D]'
                            : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <p className="font-semibold text-sm">{p.name}</p>
                        <p className={`text-xs mt-0.5 ${selectedPatient?.id === p.id ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                          {p.age} سنة
                        </p>
                      </button>
                      <Button
                        data-testid={`delete-patient-button-${p.id}`}
                        size="icon" variant="ghost"
                        className={`absolute top-1/2 -translate-y-1/2 start-1 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity ${
                          selectedPatient?.id === p.id ? 'hover:bg-white/20' : ''
                        }`}
                        onClick={(e) => { e.stopPropagation(); setPatientToDelete(p); }}
                      >
                        <Trash2 className={`w-3.5 h-3.5 ${selectedPatient?.id === p.id ? 'text-white' : 'text-red-500'}`} />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Shortcuts */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">الاختصارات</h2>
                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="add-shortcut-dialog-button" size="icon" variant="outline" className="h-8 w-8">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>اختصار جديد</DialogTitle>
                      <DialogDescription>سيظهر في الوصفة عند النقر عليه</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                      <Textarea
                        data-testid="new-shortcut-input"
                        value={newShortcut}
                        onChange={(e) => setNewShortcut(e.target.value)}
                        placeholder="مثال: قطرة ترطيب 4 مرات يومياً"
                        rows={3}
                      />
                      <div>
                        <label className="text-sm font-medium mb-2 block">اللون</label>
                        <div className="flex flex-wrap gap-2">
                          {COLOR_PALETTE.map(c => (
                            <button
                              key={c}
                              data-testid={`color-picker-${c}`}
                              type="button"
                              onClick={() => setNewColor(c)}
                              style={{ background: c }}
                              className={`w-9 h-9 rounded-full border-2 ${newColor === c ? 'border-slate-900 scale-110' : 'border-white'} transition-all`}
                            />
                          ))}
                        </div>
                      </div>
                      <Button
                        data-testid="save-new-shortcut-button"
                        onClick={handleAddShortcut}
                        className="w-full h-11 bg-[#5B3A7D] hover:bg-[#4A2E68]"
                      >
                        حفظ
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {shortcuts.length === 0 ? (
                  <p className="text-center text-slate-400 dark:text-slate-500 py-4 text-xs">اضغط + لإضافة اختصار</p>
                ) : (
                  shortcuts.map((s) => (
                    editingShortcut?.id === s.id ? (
                      <div key={s.id} className="flex gap-1">
                        <Input
                          data-testid={`edit-shortcut-input-${s.id}`}
                          value={editingShortcut.text}
                          onChange={(e) => setEditingShortcut({ ...editingShortcut, text: e.target.value })}
                          className="flex-1 h-9"
                        />
                        <Button data-testid={`save-shortcut-button-${s.id}`} size="icon" variant="outline" className="h-9 w-9" onClick={handleUpdateShortcut}>
                          <Save className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditingShortcut(null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div key={s.id} className="flex items-center gap-1 group">
                        <button
                          data-testid={`shortcut-button-${s.id}`}
                          onClick={() => {
                            const cur = live.data.prescription || '';
                            live.update("prescription", cur ? `${cur}\n${s.text}` : s.text);
                          }}
                          disabled={!selectedPatient}
                          style={{ background: s.color || '#5B3A7D' }}
                          className="flex-1 text-right px-3 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity truncate disabled:opacity-50"
                        >
                          {s.text}
                        </button>
                        <Button data-testid={`edit-shortcut-button-${s.id}`} size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={() => setEditingShortcut(s)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button data-testid={`delete-shortcut-button-${s.id}`} size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={() => handleDeleteShortcut(s.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    )
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="lg:col-span-8">
            {selectedPatient ? (
              <ExamForm
                patient={selectedPatient}
                live={live}
                shortcuts={shortcuts}
                onSaveOnly={handleSaveOnly}
                onSavePrint={handleSaveAndPrint}
                saving={saving}
                otherEditorPresent={otherEditorPresent}
                doctorPrivateNote={doctorNote}
                onDoctorPrivateNoteChange={handleDoctorNoteChange}
              />
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-16 text-center">
                <Eye className="w-20 h-20 mx-auto text-slate-200 mb-4" />
                <p className="text-lg text-slate-500 dark:text-slate-400 mb-1">اختر مريضاً لبدء الفحص</p>
                <p className="text-sm text-slate-400 dark:text-slate-500">من القائمة على اليمين</p>
              </div>
            )}
          </main>
        </div>
      </div>

      <div className="print-container">
        <PrescriptionTemplate patient={selectedPatient} examData={live.data} />
      </div>

      <AlertDialog open={!!patientToDelete} onOpenChange={(open) => !open && setPatientToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المريض</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف {patientToDelete?.name}؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-patient-button">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-patient-button"
              onClick={handleDeletePatient}
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

export default DoctorPage;
