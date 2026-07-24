# دليل رفع الكود إلى GitHub (Private Repository)

## الهدف
رفع الكود المصدري إلى **مستودع خاص (Private)** على GitHub لحفظه ومشاركته مع فريق التطوير فقط، بينما يحصل المستخدمون النهائيون (السكرتير/الدكتورة) على `.exe` فقط.

---

## الخطوة 1: إنشاء مستودع خاص على GitHub

1. اذهب إلى https://github.com/new
2. **Repository name**: `dr-wesen-abdulaziz` (أو أي اسم تفضله)
3. **Description**: `عيادة الدكتورة وسن عبدالعزيز رشيد لطب العيون - نظام إدارة المرضى`
4. ✅ **Private** (مهم جداً!)
5. ❌ لا تضف README/‏.gitignore/‏License (لدينا بالفعل)
6. اضغط **Create repository**

سيعطيك GitHub رابط المستودع، مثل:
```
https://github.com/HomamBashar/Dr-Wesen-Abdulaziz.git
```

---

## الخطوة 2: تثبيت وإعداد Git (لأول مرة فقط)

### تثبيت Git:
- ويندوز: https://git-scm.com/download/win
- ماك: `brew install git`
- لينوكس: `sudo apt install git`

### إعداد الهوية:
```bash
git config --global user.name "Your Full Name"
git config --global user.email "your-email@example.com"
```

### إعداد Personal Access Token (للمصادقة):
1. اذهب إلى https://github.com/settings/tokens
2. **Generate new token (classic)**
3. اختر صلاحيات: `repo` (كل الصلاحيات الخاصة بالمستودعات)
4. انسخ الـ Token (لن تتمكن من رؤيته مرة أخرى!)

عند git push، استخدم Token كـ password.

---

## الخطوة 3: أوامر Git للرفع (أول مرة)

من مجلد المشروع الرئيسي:

```bash
# انتقل لمجلد المشروع
cd C:\path\to\project

# تحقق من .gitignore (يمنع رفع البيانات الحساسة)
type .gitignore    # ويندوز
cat .gitignore     # ماك/لينوكس

# ابدأ Git repo
git init

# غيّر الفرع الرئيسي إلى main
git branch -M main

# أضف كل الملفات (سيتجاهل .gitignore الملفات الحساسة)
git add .

# تأكد أن ملفات .env وقاعدة البيانات لن تُرفع
git status | grep -E "\.env|\.db"
# يجب ألا تظهر أي نتائج!

# أول commit
git commit -m "Initial commit - Dr. Wesen Abdulaziz Eye Clinic v1.0"

# اربط المستودع البعيد (استبدل YOUR-USERNAME)
git remote add origin https://github.com/HomamBashar/Dr-Wesen-Abdulaziz.git

# ارفع الكود
git push -u origin main
```

عند الطلب، أدخل:
- **Username**: اسم مستخدم GitHub الخاص بك
- **Password**: Personal Access Token (وليس كلمة مرور GitHub)

---

## الخطوة 4: التحديثات المستقبلية

بعد أول رفع، للتحديثات:

```bash
# راجع التغييرات
git status

# أضف الملفات المعدّلة
git add .

# احفظ التغيير مع رسالة وصفية (اكتبها بالإنجليزية لتفادي مشاكل النسخ في PowerShell)
git commit -m "Add prescription printing feature"

# ارفع للـ GitHub
git push
```

---

## ما الذي يتم رفعه؟ (وما لا يتم)

### ✅ يتم رفعه:
- كل ملفات `.py` (Backend)
- كل ملفات `.js`, `.jsx` (Frontend)
- `package.json`, `requirements.txt`
- ملفات التوثيق (`README.md`, `BUILD.md`, `GITHUB.md`)
- سكربتات البناء (`scripts/`)
- ملف الإعدادات (`app.spec`)
- `.env.example` (قالب فقط)

### ❌ لا يتم رفعه (محمي بـ `.gitignore`):
- ❌ `backend/.env` (يحتوي على PIN الحقيقي)
- ❌ `backend/clinic.db` (سجلات المرضى الحساسة!)
- ❌ `frontend/build/` (ملفات مبنية)
- ❌ `node_modules/` (تبعيات)
- ❌ `dist/`, `build/` (مخرجات PyInstaller)
- ❌ `__pycache__/` (ملفات Python المؤقتة)

---

## قائمة أوامر Git السريعة (Cheat Sheet)

```bash
# أول رفع
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/REPO.git
git branch -M main
git push -u origin main

# تحديث (اكتب رسالة الالتزام بالإنجليزية دائماً لتفادي مشاكل النسخ في PowerShell)
git add .
git commit -m "Describe your change here in English"
git push

# تحديث الكود من GitHub
git pull

# رؤية السجل
git log --oneline

# التراجع عن آخر commit (قبل push)
git reset --soft HEAD~1

# رؤية الفروق قبل commit
git diff

# إنشاء فرع جديد للميزات
git checkout -b feature/print-prescription

# دمج الفرع في main
git checkout main
git merge feature/print-prescription
```

---

## سيناريو التطوير الموصى به

### للمطوّر (أنت):
1. تطوّر على جهازك الشخصي
2. تختبر محلياً
3. `git push` إلى GitHub Private
4. عند الاستقرار: تبني `.exe` عبر `scripts/build-windows.bat`
5. توزّع `.exe` فقط على أجهزة العيادة

### للمستخدمين (السكرتير/الدكتورة):
- يحصلون على مجلد `DrWesenClinic/` مضغوط فقط
- لا يرون الكود المصدري أبداً
- لا يحتاجون Python أو Node.js على أجهزتهم
- فقط: يستخرجون + يشغّلون `.exe`

---

## أمان إضافي للـ GitHub

### 1. تفعيل 2FA:
اذهب إلى https://github.com/settings/security وفعّل Two-Factor Authentication

### 2. مراجعة صلاحيات المتعاونين:
`Settings > Collaborators` - فقط الأشخاص الموثوق بهم

### 3. Branch Protection:
`Settings > Branches > Add rule` - يمنع الحذف/الإجبار على `main`

### 4. لا ترفع الأسرار أبداً:
تأكد من أن `git status` لا يظهر ملفات `.env` قبل الـ commit.

إذا رفعت `.env` بالخطأ:
```bash
# احذفه من الـ tracking
git rm --cached backend/.env
git commit -m "Remove sensitive .env"
git push

# غيّر PIN فوراً - يفترض أنه مكشوف!
```

---

## استرجاع المشروع على جهاز جديد

```bash
# استنسخ المستودع
git clone https://github.com/HomamBashar/Dr-Wesen-Abdulaziz.git
cd Dr-Wesen-Abdulaziz

# ثبّت تبعيات Backend
cd backend
pip install -r requirements.txt

# أنشئ ملف .env من القالب
copy .env.example .env     # ويندوز
# أو
cp .env.example .env       # ماك/لينوكس

# ثبّت تبعيات Frontend
cd ../frontend
yarn install

# شغّل التطبيق للتطوير
# نافذة 1:
cd ../backend && uvicorn server:app --reload --port 8001

# نافذة 2:
cd ../frontend && yarn start
```

---

## ملاحظات ختامية

- 🔒 **المستودع خاص (Private)**: لن يتمكن أحد من رؤيته إلا من تدعوه
- 🎯 **المستخدمون يحصلون على .exe فقط**: لا يعرفون شيئاً عن GitHub
- 📦 **الكود محفوظ سحابياً**: حتى لو تعطّل جهازك، الكود آمن
- 🔄 **التحديثات سهلة**: git push للتطوير، إعادة build للتوزيع
