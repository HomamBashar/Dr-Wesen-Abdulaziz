import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, { logout } from "@/lib/api";
import useWebSocket from "@/hooks/useWebSocket";
import useLivePatient from "@/hooks/useLivePatient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { UserPlus, LogOut, Eye, RefreshCw, Send, ArrowLeft, Printer, CheckCircle2, Archive, CalendarPlus, CalendarClock, Trash2, UserCheck, Search, Settings } from "lucide-react";
import ExamForm from "@/components/ExamForm";
import PrescriptionTemplate from "@/components/PrescriptionTemplate";
import SettingsDialog from "@/components/SettingsDialog";
import ThemeToggle from "@/components/ThemeToggle";

const STATUS_LABELS = {
  pending: 'في الانتظار',
  in_exam: 'داخل الفحص',
  surgery_prep: 'تحضير عملية',
  completed: 'تم الفحص',
};

const formatWaitingTime = (createdAt) => {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (diff < 1) return 'الآن';
  if (diff < 60) return `${diff} د`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}س ${m}د`;
};

const formatAppointment = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dateStr = d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
  const timeStr = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} - ${timeStr}`;
};

const SecretaryPage = () => {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [patients, setPatients] = useState([]);
  const [shortcuts, setShortcuts] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [appointmentToCancel, setAppointmentToCancel] = useState(null);
  const [patientToDelete, setPatientToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [otherEditorPresent, setOtherEditorPresent] = useState(false);
  const [tick, setTick] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const navigate = useNavigate();

  // Appointments (future bookings / follow-up visits)
  const [appointments, setAppointments] = useState([]);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [apptName, setApptName] = useState("");
  const [apptAge, setApptAge] = useState("");
  const [apptDate, setApptDate] = useState("");
  const [apptTime, setApptTime] = useState("");
  const [apptNote, setApptNote] = useState("");
  const [bookingSaving, setBookingSaving] = useState(false);

  const today = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const fetchPatients = useCallback(async (search = "") => {
    try {
      const params = { limit: 100 };
      if (search.trim()) params.search = search.trim();
      const { data } = await apiClient.get('/patients', { params });
      setPatients(data.items.filter(p => p.status !== 'completed' && p.status !== 'scheduled'));
    } catch (e) { /* silent */ }
  }, []);

  const fetchAppointments = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/patients', { params: { status: 'scheduled', limit: 100 } });
      const sorted = [...data.items].sort((a, b) =>
        new Date(a.appointment_date || 0) - new Date(b.appointment_date || 0)
      );
      setAppointments(sorted);
    } catch (e) { /* silent */ }
  }, []);

  const fetchShortcuts = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/shortcuts');
      setShortcuts(data);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => { fetchPatients(); fetchShortcuts(); fetchAppointments(); }, [fetchPatients, fetchShortcuts, fetchAppointments]);

  // Live search: re-query as the secretary types, with a short debounce
  // so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { fetchPatients(searchTerm); }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, fetchPatients]);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const handleWsMessage = useCallback((msg) => {
    if (msg.event === "patient_field_edit") {
      // Remote user is editing this patient live
      if (msg.patient_id === selectedPatient?.id) {
        live.applyRemoteEdit(msg.patient_id, msg.path, msg.value);
        setOtherEditorPresent(true);
        clearTimeout(window.__otherEditorTimer);
        window.__otherEditorTimer = setTimeout(() => setOtherEditorPresent(false), 3000);
      }
    } else if (['patient_created', 'patient_updated', 'patient_deleted', 'appointment_created'].includes(msg.event)) {
      fetchPatients(searchTerm);
      fetchAppointments();
      if (msg.event === 'patient_deleted' && msg.data?.id === selectedPatient?.id) {
        setSelectedPatient(null);
      }
    } else if (msg.event === 'shortcut_changed') {
      fetchShortcuts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatient?.id, fetchPatients, fetchAppointments, fetchShortcuts, searchTerm]);

  const { send } = useWebSocket(handleWsMessage);
  const live = useLivePatient({ patient: selectedPatient, sendWs: send });

  const handleAddPatient = async (e) => {
    e.preventDefault();
    if (!name.trim() || !age) { toast.error("الاسم والعمر مطلوبان"); return; }
    setSaving(true);
    try {
      await apiClient.post('/patients', {
        name: name.trim(), age: parseInt(age), date: today
      });
      toast.success("تم إرسال المريض للطبيبة");
      setName(""); setAge("");
      fetchPatients();
    } catch (err) {
      toast.error(err.response?.data?.detail || "خطأ في الإرسال");
    } finally { setSaving(false); }
  };

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    if (!apptName.trim() || !apptAge || !apptDate || !apptTime) {
      toast.error("الاسم والعمر والتاريخ والوقت مطلوبون"); return;
    }
    setBookingSaving(true);
    try {
      await apiClient.post('/patients', {
        name: apptName.trim(), age: parseInt(apptAge), date: today,
        status: 'scheduled',
        appointment_date: `${apptDate}T${apptTime}`,
        appointment_note: apptNote.trim(),
      });
      toast.success("تم حجز الموعد");
      setApptName(""); setApptAge(""); setApptDate(""); setApptTime(""); setApptNote("");
      setShowBookingForm(false);
      fetchAppointments();
    } catch (err) {
      toast.error(err.response?.data?.detail || "خطأ في حجز الموعد");
    } finally { setBookingSaving(false); }
  };

  const handlePatientArrived = async (appt) => {
    try {
      await apiClient.put(`/patients/${appt.id}`, { status: 'pending' });
      toast.success(`${appt.name} أصبح بغرفة الانتظار`);
      fetchAppointments();
      fetchPatients();
    } catch (e) { toast.error("خطأ في تحديث الحالة"); }
  };

  const handleCancelAppointment = async () => {
    if (!appointmentToCancel) return;
    try {
      await apiClient.delete(`/patients/${appointmentToCancel.id}`);
      toast.success("تم إلغاء الموعد");
      setAppointmentToCancel(null);
      fetchAppointments();
    } catch (e) { toast.error("خطأ في إلغاء الموعد"); }
  };

  const handleDeletePatient = async () => {
    if (!patientToDelete) return;
    try {
      await apiClient.delete(`/patients/${patientToDelete.id}`);
      toast.success("تم حذف المريض");
      if (selectedPatient?.id === patientToDelete.id) setSelectedPatient(null);
      setPatientToDelete(null);
      fetchPatients();
    } catch (e) { toast.error("خطأ في حذف المريض"); }
  };

  const handleSelectPatient = (p) => setSelectedPatient(p);
  const handleBack = () => setSelectedPatient(null);

  const handleSaveOnly = async () => {
    if (!selectedPatient) return;
    setSaving(true);
    try {
      await apiClient.put(`/patients/${selectedPatient.id}`, {
        ...live.data, status: 'completed'
      });
      toast.success("تم الحفظ");
      setSelectedPatient(null);
      fetchPatients();
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
          fetchPatients();
        }, 500);
      }, 300);
    } catch (e) { toast.error("خطأ في الحفظ"); }
    finally { setSaving(false); }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  const waitingCount = patients.filter(p => p.status === 'pending').length;
  const inExamCount = patients.filter(p => p.status === 'in_exam').length;

  return (
    <div className="min-h-screen bg-[#FAFBFC] dark:bg-slate-950">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 no-print">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedPatient && (
              <Button
                data-testid="back-to-list-button"
                variant="ghost" size="icon"
                onClick={handleBack}
              >
                <ArrowLeft className="w-5 h-5 rtl-flip" />
              </Button>
            )}
            <div className="w-10 h-10 rounded-full bg-[#5B3A7D] flex items-center justify-center">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#1F2937] dark:text-slate-100">عيادة الدكتورة وسن عبدالعزيز رشيد لطب العيون</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">واجهة السكرتير</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
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

      {/* View mode: exam form or dashboard */}
      {selectedPatient ? (
        <main className="max-w-5xl mx-auto px-6 py-6 no-print">
          <ExamForm
            patient={selectedPatient}
            live={live}
            shortcuts={shortcuts}
            onSaveOnly={handleSaveOnly}
            onSavePrint={handleSaveAndPrint}
            saving={saving}
            otherEditorPresent={otherEditorPresent}
          />
        </main>
      ) : (
        <main className="max-w-6xl mx-auto px-6 py-8 no-print space-y-6">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Registration */}
          <section>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-[#F3ECFA] flex items-center justify-center">
                  <UserPlus className="w-6 h-6 text-[#5B3A7D]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#1F2937] dark:text-slate-100">مريض جديد</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{today}</p>
                </div>
              </div>

              <form onSubmit={handleAddPatient} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">اسم المريض</label>
                  <Input
                    data-testid="secretary-patient-name-input"
                    value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="أدخل الاسم الكامل"
                    className="h-12 text-base" maxLength={200} autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">العمر</label>
                  <Input
                    data-testid="secretary-patient-age-input"
                    type="number" value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="السن بالسنوات"
                    className="h-12 text-base" min="0" max="150"
                  />
                </div>
                <Button
                  data-testid="secretary-submit-button"
                  type="submit" disabled={saving}
                  className="w-full h-14 text-base font-semibold bg-[#5B3A7D] hover:bg-[#4A2E68] rounded-xl"
                >
                  <Send className="w-5 h-5 ms-2" />
                  {saving ? "جاري الإرسال..." : "إرسال إلى الطبيبة"}
                </Button>
              </form>
            </div>
          </section>

          {/* Waiting Room */}
          <section>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 min-h-full">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-[#1F2937] dark:text-slate-100">غرفة الانتظار</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span className="text-amber-600 font-semibold">{waitingCount}</span> منتظر
                    {' • '}
                    <span className="text-blue-600 font-semibold">{inExamCount}</span> بالفحص
                  </p>
                </div>
                <Button
                  data-testid="refresh-patients-button"
                  variant="ghost" size="icon"
                  onClick={() => fetchPatients(searchTerm)}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400 dark:text-slate-500" />
                <Input
                  data-testid="waiting-room-search-input"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ابحث بالاسم..."
                  className="h-10 ps-9 text-sm"
                />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">اضغط على مريض لفتح ملفه ومساعدة الدكتورة</p>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {patients.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                    <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{searchTerm.trim() ? "لا توجد نتائج مطابقة" : "لا يوجد مرضى حالياً"}</p>
                  </div>
                ) : (
                  patients.map((p) => (
                    <div key={p.id} className="relative group">
                      <button
                        data-testid={`waiting-patient-${p.id}`}
                        onClick={() => handleSelectPatient(p)}
                        className="w-full text-right p-4 pe-12 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#5B3A7D] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-[#1F2937] dark:text-slate-100">{p.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {p.age} سنة • {formatWaitingTime(p.created_at)}
                            </p>
                          </div>
                          <span className={`text-xs px-3 py-1 rounded-full font-medium status-${p.status}`}>
                            {STATUS_LABELS[p.status] || p.status}
                          </span>
                        </div>
                      </button>
                      <Button
                        data-testid={`delete-patient-button-${p.id}`}
                        size="icon" variant="ghost"
                        className="absolute top-1/2 -translate-y-1/2 start-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); setPatientToDelete(p); }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Upcoming Appointments */}
        <section>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EAF6EC] flex items-center justify-center">
                  <CalendarClock className="w-5 h-5 text-[#2E7D32]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#1F2937] dark:text-slate-100">المواعيد القادمة</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="font-semibold text-[#5B3A7D]">{appointments.length}</span> موعد محجوز
                  </p>
                </div>
              </div>
              <Button
                data-testid="toggle-booking-form-button"
                variant={showBookingForm ? "outline" : "default"}
                size="sm"
                onClick={() => setShowBookingForm(v => !v)}
                className={!showBookingForm ? "bg-[#5B3A7D] hover:bg-[#4A2E68]" : ""}
              >
                <CalendarPlus className="w-4 h-4 ms-1" />
                {showBookingForm ? "إلغاء" : "حجز موعد جديد"}
              </Button>
            </div>

            {showBookingForm && (
              <form
                onSubmit={handleBookAppointment}
                className="grid sm:grid-cols-2 gap-3 p-4 mb-4 bg-[#FAF7FC] rounded-xl border border-[#E0D5EC]"
              >
                <Input
                  data-testid="appt-name-input"
                  value={apptName} onChange={(e) => setApptName(e.target.value)}
                  placeholder="اسم المريض" className="h-11" maxLength={200}
                />
                <Input
                  data-testid="appt-age-input"
                  type="number" value={apptAge} onChange={(e) => setApptAge(e.target.value)}
                  placeholder="العمر" className="h-11" min="0" max="150"
                />
                <Input
                  data-testid="appt-date-input"
                  type="date" value={apptDate} onChange={(e) => setApptDate(e.target.value)}
                  className="h-11"
                />
                <Input
                  data-testid="appt-time-input"
                  type="time" value={apptTime} onChange={(e) => setApptTime(e.target.value)}
                  className="h-11"
                />
                <Input
                  data-testid="appt-note-input"
                  value={apptNote} onChange={(e) => setApptNote(e.target.value)}
                  placeholder="ملاحظة (اختياري) - مثلاً: مراجعة بعد عملية"
                  className="h-11 sm:col-span-2"
                />
                <Button
                  data-testid="appt-submit-button"
                  type="submit" disabled={bookingSaving}
                  className="sm:col-span-2 h-11 bg-[#2E7D32] hover:bg-[#256428]"
                >
                  {bookingSaving ? "جاري الحجز..." : "تأكيد الحجز"}
                </Button>
              </form>
            )}

            {appointments.length === 0 ? (
              <div className="text-center py-10 text-slate-400 dark:text-slate-500">
                <CalendarClock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد مواعيد محجوزة حالياً</p>
              </div>
            ) : (
              <div className="space-y-2">
                {appointments.map((a) => (
                  <div
                    key={a.id}
                    data-testid={`appointment-item-${a.id}`}
                    className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800"
                  >
                    <div>
                      <p className="font-semibold text-[#1F2937] dark:text-slate-100">{a.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {a.age} سنة • <span className="text-[#2E7D32] font-medium">{formatAppointment(a.appointment_date)}</span>
                      </p>
                      {a.appointment_note && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{a.appointment_note}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        data-testid={`appt-arrived-button-${a.id}`}
                        size="sm" variant="outline"
                        onClick={() => handlePatientArrived(a)}
                      >
                        <UserCheck className="w-4 h-4 ms-1" />
                        المريض وصل
                      </Button>
                      <Button
                        data-testid={`appt-cancel-button-${a.id}`}
                        size="sm" variant="ghost"
                        onClick={() => setAppointmentToCancel(a)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        </main>
      )}

      {/* Print template (hidden except when printing) */}
      <div className="print-container">
        <PrescriptionTemplate patient={selectedPatient} examData={live.data} />
      </div>

      <AlertDialog open={!!appointmentToCancel} onOpenChange={(open) => !open && setAppointmentToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الموعد</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من إلغاء موعد {appointmentToCancel?.name}؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-cancel-appointment-button">تراجع</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-cancel-appointment-button"
              onClick={handleCancelAppointment}
              className="bg-red-600 hover:bg-red-700"
            >
              إلغاء الموعد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

export default SecretaryPage;
