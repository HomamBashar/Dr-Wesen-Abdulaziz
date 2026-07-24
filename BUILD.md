# دليل تحويل التطبيق إلى ملف تنفيذي (.exe)

## نظرة عامة

هذا الدليل يشرح كيفية تحويل تطبيق عيادة د. وسن عبدالعزيز رشيد إلى **ملف تنفيذي مستقل** (`DrWesenClinic.exe`) يمكن توزيعه على أجهزة السكرتير والدكتورة **بدون كشف الكود المصدري**.

**النتيجة النهائية:**
- مجلد `DrWesenClinic/` يحتوي على `DrWesenClinic.exe` + ملفات مساندة
- عند تشغيل `.exe`: يبدأ Backend + يفتح المتصفح تلقائياً
- الكود مضغوط داخل `.exe` (يحتاج أدوات متخصصة لاستخراجه)
- قاعدة البيانات تُنشأ تلقائياً في مجلد `data/` بجوار `.exe`

---

## المتطلبات (على جهاز البناء فقط)

- **Python 3.9+**: https://www.python.org/downloads/
- **Node.js 18+**: https://nodejs.org/
- **Yarn**: بعد Node.js، شغّل `npm install -g yarn`
- **Git** (اختياري): https://git-scm.com/

---

## طريقة 1: بناء تلقائي (موصى بها)

### على ويندوز:

افتح **Command Prompt** كمسؤول (Run as Administrator) وشغّل:

```cmd
cd C:\path\to\project
scripts\build-windows.bat
```

سيقوم السكربت بـ:
1. بناء واجهة React (`yarn build`)
2. تثبيت مكتبات Python + PyInstaller
3. تنظيف البناء السابق
4. تجميع كل شيء في ملف تنفيذي واحد

**النتيجة**: `backend/dist/DrWesenClinic/DrWesenClinic.exe`

### على ماك/لينوكس:

```bash
cd /path/to/project
chmod +x scripts/build-unix.sh
./scripts/build-unix.sh
```

**النتيجة**: `backend/dist/DrWesenClinic/DrWesenClinic`

---

## طريقة 2: بناء يدوي (خطوة بخطوة)

إذا فشل السكربت التلقائي، شغّل الأوامر يدوياً:

### الخطوة 1: بناء الواجهة الأمامية

```bash
cd frontend
yarn install
```

**مهم**: عيّن متغير البيئة ليكون فارغاً (لاستخدام روابط نسبية):

**ويندوز (CMD):**
```cmd
set REACT_APP_BACKEND_URL=
yarn build
```

**ماك/لينوكس:**
```bash
REACT_APP_BACKEND_URL="" yarn build
```

### الخطوة 2: تثبيت PyInstaller

```bash
cd ../backend
pip install -r requirements.txt
pip install pyinstaller
```

### الخطوة 3: تجميع التطبيق

```bash
pyinstaller app.spec --clean --noconfirm
```

النتيجة في: `backend/dist/DrWesenClinic/`

### الخطوة 4: نسخ ملف الإعدادات

```bash
# ويندوز
copy .env.example dist\DrWesenClinic\.env

# ماك/لينوكس
cp .env.example dist/DrWesenClinic/.env
```

---

## قبل التوزيع - إعدادات مهمة

### 1. تغيير رمز الدخول (PIN)

افتح ملف `DrWesenClinic/.env` وغيّر:
```env
CLINIC_PIN=7823   # ضع رمزاً سرياً خاصاً بالعيادة
```

### 2. إعداد قاعدة البيانات

اترك `DATABASE_PATH` فارغاً لاستخدام `data/clinic.db` بجوار `.exe`:
```env
DATABASE_PATH=
```

أو حدد مسار Google Drive للمزامنة التلقائية:
```env
DATABASE_PATH=C:\Users\USERNAME\My Drive\Dr-Wesen Backup\clinic.db
```

### 3. اختبار قبل التوزيع

- شغّل `DrWesenClinic.exe`
- تحقق من فتح المتصفح على `http://localhost:8001/`
- سجّل دخولاً بـ PIN وأدخل مريض تجريبي
- تأكد من إنشاء ملف `data/clinic.db`

---

## توزيع التطبيق

### طريقة 1: ZIP بسيط

1. اضغط مجلد `DrWesenClinic/` بالكامل إلى ملف ZIP
2. أرسله عبر USB / WhatsApp / بريد إلكتروني
3. المستخدم يستخرج المجلد ويشغّل `DrWesenClinic.exe`

### طريقة 2: مثبّت احترافي (اختياري)

استخدم **Inno Setup** أو **NSIS** لإنشاء `.exe installer`:
- Inno Setup: https://jrsoftware.org/isinfo.php
- NSIS: https://nsis.sourceforge.io/

### إعداد الشبكة على جهاز السيرفر

بعد التوزيع، على **جهاز السيرفر** (الذي يحتوي على قاعدة البيانات):

1. اسمح للمنفذ 8001 في Firewall:
   ```cmd
   netsh advfirewall firewall add rule name="Dr Wesen Clinic" dir=in action=allow protocol=TCP localport=8001
   ```

2. احصل على IP الجهاز: `ipconfig`

3. على **الجهاز الآخر**: افتح المتصفح على `http://<SERVER-IP>:8001/`

**لا حاجة لتشغيل التطبيق على جهازين** - جهاز واحد يشغّل `.exe`، والآخر فقط يفتح المتصفح!

---

## استكشاف الأخطاء

### المشكلة: "Frontend build not found"
**الحل**: تأكد من تشغيل `yarn build` قبل PyInstaller. راجع أن مجلد `frontend/build/index.html` موجود.

### المشكلة: ".exe يفتح ويغلق فوراً"
**الحل**: افتح CMD وشغّل `DrWesenClinic.exe` من داخل CMD لرؤية الخطأ. عادةً يكون بسبب `.env` مفقود أو منفذ 8001 مستخدم.

### المشكلة: "ModuleNotFoundError" داخل .exe
**الحل**: أضف الوحدة المفقودة في `app.spec` تحت `hiddenimports`، ثم أعد البناء.

### المشكلة: حجم .exe كبير جداً (200MB+)
**الحل**: هذا طبيعي (يشمل Python interpreter + جميع المكتبات). يمكن تقليله بـ:
- تفعيل UPX ضغط (متضمن في `app.spec`)
- إضافة مكتبات ثقيلة إلى `excludes` في `app.spec`

### المشكلة: مضاد الفيروسات يمنع .exe
**الحل**: هذا شائع مع PyInstaller. الحلول:
- توقيع الملف رقمياً (Code Signing Certificate)
- إضافة استثناء في مضاد الفيروسات
- إبلاغ Microsoft Defender بأنه false positive

---

## بنية المخرجات النهائية

```
DrWesenClinic/
├── DrWesenClinic.exe          <-- الملف التنفيذي (يشغّله المستخدم)
├── .env                        <-- إعدادات (PIN, DATABASE_PATH)
├── _internal/                  <-- مكتبات Python (لا تُلمس)
│   ├── frontend_build/         <-- ملفات React المبنية
│   ├── base_library.zip
│   ├── python*.dll
│   └── ... (باقي التبعيات)
└── data/                       <-- ينشأ تلقائياً عند أول تشغيل
    └── clinic.db               <-- قاعدة بيانات المرضى
```

**ملاحظات:**
- ✅ مجلد `_internal/` يحتوي على الكود مضغوطاً - لا يمكن قراءته بسهولة
- ✅ ملف `.env` قابل للتعديل (لتغيير PIN دون إعادة بناء)
- ✅ `data/clinic.db` منفصل عن الكود - آمن للنسخ الاحتياطي

---

## ملاحظات أمنية

⚠️ **PyInstaller لا يوفر تشفيراً كاملاً للكود**. يمكن لخبراء استخراج الكود من الـ `.exe`. للحماية الكاملة:

1. **استخدم Cython** لتحويل الكود Python إلى C compiled (اختياري متقدم)
2. **وقّع الملف رقمياً** (Code Signing) لمنع تحذيرات الأمان
3. **راقب التوزيع**: لا ترفع `.exe` على مواقع عامة

للاستخدام الداخلي في عيادة واحدة، PyInstaller كافٍ تماماً.
