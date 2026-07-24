# 👁️ عيادة الدكتورة وسن عبدالعزيز رشيد لطب العيون

**نظام إدارة عيادة متكامل** — تسجيل المرضى، الفحص الطبي، الروشتات، والأرشفة، مع مزامنة فورية بين جهاز السكرتيرة وجهاز الطبيبة.

الطبيبة الاستشارية: **د. وسن عبدالعزيز رشيد**

---

## ✨ ما الذي يقدّمه التطبيق

| الميزة | الوصف |
|---|---|
| 🖥️ **واجهتان منفصلتان** | `/secretary` لتسجيل المرضى الجدد، و`/doctor` لإجراء الفحص وكتابة الروشتة |
| ⚡ **تحديث فوري (Realtime)** | عبر WebSocket — أي مريض جديد تسجّله السكرتيرة يظهر فوراً عند الطبيبة بدون تحديث الصفحة |
| 🔐 **مصادقة آمنة** | تسجيل دخول بـ PIN يُصدر جلسة JWT، بدل تخزين الرمز الخام في المتصفح |
| 📋 **سجل تدقيق كامل (Audit Trail)** | يُحفظ من عدّل، ماذا عدّل، ومتى — لكل عملية على بيانات مريض |
| 🗂️ **أرشيف المرضى** | صفحة `/records` لعرض والبحث في المرضى الذين اكتمل فحصهم |
| ⚙️ **اختصارات قابلة للتخصيص** | أزرار سريعة لتشخيصات وأدوية متكررة، تُضاف وتُعدَّل من الواجهة مباشرة |
| 💾 **نسخ احتياطي** | نقطة `GET /api/backup` لتحميل قاعدة البيانات كاملة في أي وقت، بالإضافة لتصدير CSV/JSON |
| 📊 **إحصائيات العيادة** | عدد المرضى، الحالات النشطة/المكتملة، وأكثر التشخيصات تكراراً |
| 🌐 **موقع واحد، عنوان واحد** | الواجهة الأمامية تُبنى وتُقدَّم من نفس خادم FastAPI — لا تعقيد CORS |

---

## 🏗️ البنية التقنية

```
┌─────────────────────────────────────────────┐
│              متصفح المستخدم                  │
│   /login  →  /secretary  أو  /doctor  →  /records │
└───────────────────┬─────────────────────────┘
                     │ HTTPS (عبر Caddy)
┌────────────────────▼────────────────────────┐
│   FastAPI (server.py)                        │
│   • مصادقة JWT (Bearer Token)                │
│   • REST API تحت /api                        │
│   • WebSocket /ws/updates للتحديث الفوري     │
│   • يقدّم أيضاً ملفات React المبنية           │
└────────────────────┬─────────────────────────┘
                     │ aiosqlite
┌────────────────────▼────────────────────────┐
│   SQLite (clinic.db)                         │
│   محفوظة في Docker Volume دائم               │
└───────────────────────────────────────────────┘
```

**Backend:** Python 3.11 · FastAPI · SQLite (aiosqlite) · PyJWT · slowapi (Rate Limiting)
**Frontend:** React 19 · React Router 7 · Tailwind CSS · shadcn/ui · TanStack Query
**النشر:** Docker · Caddy (HTTPS تلقائي عبر Let's Encrypt) · أي خادم Ubuntu (VPS)

---

## 📁 هيكل المشروع

```
Dr-Wesen-Abdulaziz/
├── backend/
│   ├── server.py              # التطبيق الكامل: مصادقة، API، WebSocket
│   ├── requirements.txt       # جميع الاعتمادات (تطوير محلي)
│   ├── requirements-deploy.txt# نسخة مصغّرة للنشر السحابي فقط
│   ├── launcher.py            # نقطة تشغيل عند التحزيم كـ exe سطح مكتب
│   └── app.spec                # إعداد PyInstaller
├── frontend/
│   └── src/
│       ├── pages/              # LoginPage, SecretaryPage, DoctorPage, RecordsPage
│       ├── components/         # ExamForm, PrescriptionTemplate, SettingsDialog...
│       ├── components/ui/      # مكتبة shadcn/ui (46 مكوّناً جاهزاً)
│       ├── hooks/               # useWebSocket, useLivePatient, usePolling
│       └── lib/api.js           # طبقة الاتصال بالـ API (JWT Bearer)
├── Dockerfile                  # يبني الواجهة + الخادم كصورة واحدة
├── docker-compose.yml          # يشغّل التطبيق + Caddy معاً
├── Caddyfile                   # إعداد HTTPS التلقائي
├── .env.example                # نموذج متغيرات البيئة
└── DEPLOY*.md / ORACLE_DEPLOY.md / GITHUB.md   # أدلة نشر تفصيلية
```

---

## 🚀 التشغيل محلياً (للتطوير)

### المتطلبات
- Python 3.11+
- Node.js 20+ و Yarn

### الخطوات
```bash
# 1) الباك إند
cd backend
pip install -r requirements.txt
cp .env.example .env          # عدّل SECRETARY_PIN / DOCTOR_PIN / JWT_SECRET_KEY
uvicorn server:app --reload --port 8001

# 2) الفرونت إند (نافذة طرفية أخرى)
cd frontend
yarn install
yarn start                     # يفتح على http://localhost:3000
```

---

## ☁️ النشر على الإنترنت

المشروع جاهز للنشر بأكثر من طريقة، حسب ميزانيتك وخبرتك:

| الدليل | الطريقة | التكلفة |
|---|---|---|
| [`DEPLOY.md`](./DEPLOY.md) | Render (نشر تلقائي من GitHub، بدون خبرة سيرفرات) | ~7$/شهرياً |
| [`ORACLE_DEPLOY.md`](./ORACLE_DEPLOY.md) | Oracle Cloud (خادم Ubuntu كامل بيدك) | مجاني مدى الحياة |
| **خادم VPS عام** (DigitalOcean، إلخ) | نفس خطوات `ORACLE_DEPLOY.md` تقريباً — Docker + Caddy | حسب المزوّد |

**النشر بأمر واحد على أي خادم Ubuntu فيه Docker:**
```bash
git clone https://github.com/HomamBashar/Dr-Wesen-Abdulaziz.git && cd Dr-Wesen-Abdulaziz
cp .env.example .env && nano .env      # ضع رموز PIN ومفتاح JWT
docker compose up -d --build
```
التطبيق يعمل بعدها على المنفذ 80 (وعلى HTTPS تلقائياً إن أضفت نطاق DuckDNS في `.env`).

---

## 🔒 الأمان

- **مصادقة JWT**: تسجيل الدخول عبر `POST /api/login` يُصدر توكن موقّع، يُرسل كـ `Authorization: Bearer <token>` مع كل طلب — وليس PIN خام كما في الإصدارات المبكرة.
- **WebSocket محمي**: الاتصال الفوري `/ws/updates` يتحقق من نفس التوكن قبل قبول الاتصال.
- **Rate Limiting**: عبر `slowapi` لمنع محاولات تخمين الدخول المتكررة.
- **Audit Trail**: كل تعديل على بيانات مريض يُسجَّل (من، ماذا، متى) ولا يمكن حذفه من الواجهة.
- **HTTPS إلزامي في الإنتاج**: عبر Caddy مع شهادة Let's Encrypt مجانية تتجدد تلقائياً.

> ⚠️ **قبل أي نشر فعلي**: غيّر `SECRETARY_PIN`, `DOCTOR_PIN`, و`JWT_SECRET_KEY` في `.env` عن القيم الافتراضية. لا ترفع ملف `.env` نفسه إلى GitHub (موجود مسبقاً في `.gitignore`).

---

## 📡 مرجع الـ API

جميع النقاط تحت البادئة `/api` وتتطلب `Authorization: Bearer <token>` ما عدا `/api/login`.

| Method | Endpoint | الوصف |
|---|---|---|
| `POST` | `/api/login` | تسجيل الدخول بـ PIN، يُرجع JWT |
| `POST` | `/api/change-pin` | تغيير رمز الدخول |
| `GET` | `/api/patients` | قائمة المرضى (Pagination + فلترة) |
| `POST` | `/api/patients` | تسجيل مريض جديد |
| `GET` | `/api/patients/{id}` | تفاصيل مريض |
| `PUT` | `/api/patients/{id}` | تحديث بيانات/فحص مريض |
| `PATCH` | `/api/patients/{id}/status` | تغيير حالة المريض (نشط/مكتمل) |
| `DELETE` | `/api/patients/{id}` | حذف مريض |
| `GET` | `/api/shortcuts` | قائمة الاختصارات |
| `POST` \| `PUT` \| `DELETE` | `/api/shortcuts[/{id}]` | إدارة الاختصارات |
| `GET` | `/api/stats` | إحصائيات العيادة |
| `GET` | `/api/export/patients` | تصدير بيانات المرضى (CSV/JSON) |
| `GET` | `/api/backup` | تحميل نسخة احتياطية كاملة لقاعدة البيانات |
| `GET` | `/api/health` | فحص صحة الخادم |
| `WS` | `/ws/updates` | اتصال فوري لتحديث الواجهات بين الأجهزة |

---

## 🛠️ حل المشاكل الشائعة

| المشكلة | الحل |
|---|---|
| البناء يفشل بسبب صفحات مفقودة | تأكد أن `frontend/src/pages/` يحتوي الملفات الأربعة؛ راجع `git status` للتأكد من عدم استبعادها بالخطأ |
| "رمز الدخول غير صحيح" | تحقق من `SECRETARY_PIN`/`DOCTOR_PIN` في `.env`، وأعد تشغيل الحاوية بعد أي تعديل |
| لا يعمل WebSocket خلف Caddy | تأكد أن `Caddyfile` يستخدم `reverse_proxy` (يدعم WS تلقائياً) وأن المنفذ 443 مفتوح |
| شهادة HTTPS لا تصدر | تأكد أن نطاق DuckDNS يشير لـ IP الخادم الصحيح، وأن المنفذين 80 و443 مفتوحين فعلياً على جدار حماية مزوّد الاستضافة |

---

## 📄 الرخصة والملكية

مشروع خاص لعيادة الدكتورة وسن عبدالعزيز رشيد لطب العيون. جميع الحقوق محفوظة.
