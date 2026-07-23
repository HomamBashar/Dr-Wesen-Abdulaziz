# نشر عيادة د. وسناء عبد العزيز مجاناً بشكل دائم على Oracle Cloud

هذا خيار **مجاني فعلاً مدى الحياة** (Oracle Cloud "Always Free")، بدون بطاقة تُخصم منها أي مبلغ. المقابل: الإعداد أصعب من Render لأنك تدير سيرفر لينكس حقيقياً بنفسك (تماماً كجهاز السيرفر المحلي في الدليل الأصلي، لكنه الآن يعمل 24 ساعة في مركز بيانات Oracle بدلاً من جهاز العيادة).

**خذ وقتك في هذا الدليل** — استغرق مني اختباره فعلياً، وسأشرح كل خطوة بالتفصيل. إن تعثرت بأي خطوة، انسخ لي رسالة الخطأ وسأساعدك.

---

## الجزء 1: إنشاء الحساب والسيرفر

### 1. أنشئ حساب Oracle Cloud
اذهب إلى [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) واضغط **Start for free**.

- تحتاج بطاقة ائتمان/دفع للتحقق من الهوية فقط — Oracle يحجز 1$ مؤقتاً كتحقق ثم يرجعه، **ولا تُخصم أي رسوم** طالما بقيت ضمن حدود "Always Free"
- اختر بلدك بدقة، وأدخل بياناتك الحقيقية (Oracle يرفض أحياناً حسابات ببيانات غير متطابقة)
- قد يستغرق التفعيل من دقائق إلى ساعات

### 2. أنشئ السيرفر (Compute Instance)
من القائمة الجانبية: **Compute > Instances > Create Instance**

- **Name**: `dr-wesen-abdulaziz`
- **Image**: اختر **Ubuntu 24.04**
- **Shape**: اضغط **Change Shape**، اختر:
  - **Ampere (ARM)** → **VM.Standard.A1.Flex**
  - اضبط: **2 OCPU / 12 GB Memory** (هذا كافٍ جداً لتطبيقك، وضمن الحد المجاني)
- **Boot Volume**: فعّل "Specify a custom boot volume size" واجعله **50 GB**
- **Add SSH keys**: اختر **Generate a key pair for me**، ثم اضغط **Save Private Key** و **Save Public Key** واحفظهما في مكان آمن على جهازك (ستحتاج المفتاح الخاص Private Key للدخول لاحقاً)
- اضغط **Create**

> ⚠️ **إذا ظهرت رسالة "Out of capacity"**: هذا شائع مع سعة ARM المجانية. جرّب:
> 1. غيّر **Availability Domain** (AD-1, AD-2, AD-3) من نفس الصفحة وأعد المحاولة
> 2. جرّب في أوقات مختلفة من اليوم
> 3. إن استمرت المشكلة، كخيار بديل استخدم Shape **VM.Standard.E2.1.Micro** (AMD، مجاني دائماً أيضاً لكن أضعف: 1GB رام) — سيعمل تطبيقك عليه لكن أبطأ قليلاً

### 3. اسمح بالوصول عبر الإنترنت (Security List)
من صفحة السيرفر بعد إنشائه: اضغط على اسم **Subnet** الظاهر، ثم **Security Lists** > اسم القائمة الافتراضية > **Add Ingress Rules**

أضف قاعدة جديدة:
- **Source CIDR**: `0.0.0.0/0`
- **IP Protocol**: TCP
- **Destination Port Range**: `80`

اضغط **Add Ingress Rules**.

### 4. احصل على عنوان IP العام
في صفحة تفاصيل السيرفر، ستجد **Public IP Address** — احفظه (مثلاً `129.146.xx.xx`).

---

## الجزء 2: الاتصال بالسيرفر وتجهيزه

### 5. اتصل عبر SSH

**على ويندوز**: استخدم PowerShell أو Windows Terminal:
```powershell
ssh -i "C:\path\to\your-key.key" ubuntu@129.146.xx.xx
```

**على ماك/لينكس**:
```bash
chmod 400 ~/Downloads/ssh-key.key
ssh -i ~/Downloads/ssh-key.key ubuntu@129.146.xx.xx
```
> استبدل `129.146.xx.xx` بـ IP سيرفرك الفعلي، ومسار المفتاح بمكان حفظه.

### 6. ثبّت Docker
داخل السيرفر (بعد الاتصال)، انسخ والصق كل سطر:
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```
ثم اخرج وأعد الاتصال (`exit` ثم SSH مجدداً) كي يسري تفعيل صلاحيات Docker.

### 7. مهم جداً: افتح المنفذ 80 على جدار حماية أوبنتو نفسه
صور Ubuntu على Oracle فيها جدار حماية إضافي على مستوى النظام (غير لوحة Security List). بدونه لن يعمل شيء حتى لو ضبطت الخطوة 3 بشكل صحيح:
```bash
sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save
```

---

## الجزء 3: تحميل ونشر التطبيق

### 8. انقل المشروع للسيرفر
أسهل طريقة: ارفع مشروعك على GitHub (كما اقترحت سابقاً)، ثم على السيرفر:
```bash
git clone https://github.com/HomamBashar/Dr-Wesen-Abdulaziz.git
cd Dr-Wesen-Abdulaziz
```

### 9. أنشئ ملف الإعدادات
```bash
cp .env.example .env
nano .env
```
عدّل القيم:
```
SECRETARY_PIN=your-secretary-pin-here
DOCTOR_PIN=your-doctor-pin-here
```
احفظ (`Ctrl+O` ثم `Enter`) واخرج (`Ctrl+X`).

### 10. شغّل التطبيق
```bash
docker compose up -d --build
```
أول بناء يأخذ 3-5 دقائق (يبني الواجهة والخادم). تابع السجل بـ:
```bash
docker compose logs -f
```
(اضغط `Ctrl+C` للخروج من متابعة السجل — التطبيق يستمر بالعمل بالخلفية)

### 11. جرّبه!
افتح من أي متصفح، بأي جهاز، بأي مكان بالعالم:
```
http://129.146.xx.xx
```
(استبدل بـ IP سيرفرك)

---

## الاستمرارية والنسخ الاحتياطي

- **إعادة تشغيل السيرفر**: Docker مضبوط `restart: unless-stopped`، فسيعمل تلقائياً بعد أي إعادة إقلاع للسيرفر
- **قاعدة البيانات محفوظة دائماً** في مجلد Docker Volume خارج الحاوية — تحديث الكود لاحقاً لن يمسحها
- **نسخة احتياطية**: نفس نقطة `/api/backup` التي أضفناها تعمل هنا أيضاً:
  ```
  http://129.146.xx.xx/api/backup
  ```
  (تحتاج ترويسة `X-Clinic-PIN` — الأسهل تحميلها عبر أداة مثل Postman، أو أطلب مني إضافة زر تحميل داخل صفحة السجل)

### للتحديث لاحقاً بعد أي تعديل بالكود:
```bash
cd Dr-Wesen-Abdulaziz
git pull
docker compose up -d --build
```

---

## 🔒 تفعيل HTTPS مجاناً عبر نطاق DuckDNS

بما أن لديك نطاق DuckDNS جاهزاً، يمكنك الحصول على HTTPS حقيقي (قفل أخضر، بدون تحذيرات المتصفح) مجاناً بالكامل عبر Caddy. هذا مضاف جاهزاً في هذا المشروع (`Caddyfile` + `docker-compose.yml`).

### 1. تأكد أن نطاق DuckDNS يشير لـ IP سيرفرك
من لوحة [duckdns.org](https://www.duckdns.org)، تأكد أن الحقل بجانب نطاقك يطابق Public IP لسيرفر Oracle (`129.146.xx.xx`). إن اختلف، حدّثه واضغط **update ip**.

### 2. افتح المنفذ 443 (بالإضافة إلى 80)
**في Oracle Security List** (نفس الخطوة 3 سابقاً): أضف قاعدة Ingress جديدة لنفس الطريقة لكن بمنفذ `443` بدل `80`.

**في جدار حماية أوبنتو نفسه** (نفس الخطوة 7):
```bash
sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 3. أضف نطاقك لملف `.env`
```bash
nano .env
```
أضف/عدّل السطر:
```
DUCKDNS_DOMAIN=your-subdomain.duckdns.org
```
احفظ واخرج.

### 4. أعد التشغيل
```bash
docker compose up -d --build
```
Caddy سيتصل تلقائياً بـ Let's Encrypt، يصدر شهادة، ويجدّدها كل 90 يوماً بدون أي تدخل منك.

### 5. جرّبه
```
https://your-subdomain.duckdns.org
```
يفتح مباشرة بـ HTTPS، ويُعيد توجيه أي زيارة عبر `http://` تلقائياً إلى `https://`.

> **ملاحظة**: أول تشغيل بعد إضافة Caddy قد يحتاج دقيقة إضافية لإصدار الشهادة. إن ظهر خطأ شهادة، انتظر دقيقة وأعد تحميل الصفحة، أو راجع `docker compose logs caddy`.

---

## ملخص الملفات المستخدمة في هذا النشر
- `Dockerfile` — يبني الواجهة والخادم معاً
- `docker-compose.yml` — يشغّل الحاوية مع حفظ دائم للبيانات
- `.env` (تنشئه أنت، غير مرفوع على GitHub) — يحتوي رموز PIN
- `backend/requirements-deploy.txt` — متطلبات Python المصغّرة
