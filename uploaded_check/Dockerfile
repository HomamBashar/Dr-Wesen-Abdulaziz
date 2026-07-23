# ============================================
# عيادة الدكتورة وسناء عبد العزيز لطب العيون - Dockerfile للنشر
# ============================================
# يبني الواجهة الأمامية (React) ثم يقدّمها من نفس
# خادم FastAPI الخلفي، فيصبح التطبيق موقعاً واحداً
# بعنوان واحد (لا حاجة لإعداد CORS معقد).

# ---- المرحلة 1: بناء React ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY frontend/ ./
# فارغ = روابط API نسبية (نفس عنوان الموقع)
ENV REACT_APP_BACKEND_URL=""
RUN yarn build

# ---- المرحلة 2: Python + تقديم الملفات المبنية ----
FROM python:3.11-slim
WORKDIR /app

COPY backend/requirements-deploy.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/server.py ./
COPY --from=frontend-build /app/frontend/build ./frontend_build

# منفذ افتراضي (Render/Railway يمرران PORT تلقائياً)
ENV PORT=8001
EXPOSE 8001

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
