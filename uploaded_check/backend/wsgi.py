"""
نقطة دخول WSGI لاستضافة PythonAnywhere.

PythonAnywhere (الخطة المجانية) تدعم فقط تطبيقات WSGI، بينما تطبيقنا مبني بـ FastAPI
وهو إطار ASGI. هذا الملف يستخدم مكتبة a2wsgi لتحويل تطبيق FastAPI (ASGI) إلى شكل
متوافق مع WSGI بدون أي تعديل على منطق server.py نفسه.

لا تحتاج لتشغيل هذا الملف يدوياً - PythonAnywhere يستدعيه تلقائياً عبر
متغير `application` الموجود بالأسفل (هذا هو الاسم القياسي الذي يبحث عنه WSGI).
"""
import asyncio
from a2wsgi import ASGIMiddleware
from server import app as _asgi_app, init_db

# مهم جداً: عند التشغيل عبر WSGI (وليس uvicorn)، لا يتم استدعاء حدث
# "lifespan" الخاص بـ FastAPI تلقائياً، وبالتالي init_db() لن تُستدعى أبداً
# وستفشل كل العمليات لاحقاً بخطأ "no such table: patients".
# لذلك نستدعيها هنا يدوياً مرة واحدة عند تحميل هذا الملف (init_db آمنة
# للاستدعاء المتكرر لأنها تستخدم CREATE TABLE IF NOT EXISTS).
asyncio.run(init_db())

application = ASGIMiddleware(_asgi_app)
