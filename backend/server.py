from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from datetime import datetime, timezone, timedelta
import jwt
import aiosqlite
import asyncio
import os
import sys
import json
import logging
import secrets
import shutil
import time
import threading
import schedule
import csv
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, constr, conint
from typing import List, Optional, Set
import uuid
from contextlib import asynccontextmanager



def get_app_dir() -> Path:
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent
    return Path(__file__).parent


def get_bundle_dir() -> Path:
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS)
    return Path(__file__).parent


APP_DIR = get_app_dir()
BUNDLE_DIR = get_bundle_dir()

env_file = APP_DIR / '.env'
if not env_file.exists():
    env_file = BUNDLE_DIR / '.env'
load_dotenv(env_file)

_default_db = APP_DIR / 'data' / 'clinic.db'
_default_db.parent.mkdir(parents=True, exist_ok=True)
_env_db = os.environ.get('DATABASE_PATH', '').strip()
DATABASE_PATH = _env_db if _env_db else str(_default_db)
Path(DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
CLINIC_PIN = os.environ.get('CLINIC_PIN', '1234')
SECRETARY_PIN = os.environ.get('SECRETARY_PIN', '1234')
DOCTOR_PIN = os.environ.get('DOCTOR_PIN', '4321')
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()]

# In-memory cache of current PINs, loaded from DB at startup and kept in sync
# whenever a PIN is changed via the settings endpoint. The DB (not the .env file)
# is the source of truth once the app has started, so changes apply immediately
# without needing a container restart.
_pin_cache = {'secretary': SECRETARY_PIN, 'doctor': DOCTOR_PIN}


async def load_pin_cache():
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute("SELECT key, value FROM settings WHERE key IN ('secretary_pin','doctor_pin')") as cursor:
            rows = await cursor.fetchall()
    for key, value in rows:
        if key == 'secretary_pin':
            _pin_cache['secretary'] = value
        elif key == 'doctor_pin':
            _pin_cache['doctor'] = value


def get_role_for_pin(pin: str) -> Optional[str]:
    """Return 'secretary' or 'doctor' if PIN matches, else None."""
    if not pin:
        return None
    if secrets.compare_digest(pin, _pin_cache['secretary']):
        return 'secretary'
    if secrets.compare_digest(pin, _pin_cache['doctor']):
        return 'doctor'
    # Legacy fallback (single PIN, pre-role-split installs)
    if secrets.compare_digest(pin, CLINIC_PIN):
        return 'secretary'
    return None

limiter = Limiter(key_func=get_remote_address)


# ============ JWT Configuration ============
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

async def ensure_column(db, table: str, column: str, coltype: str):
    """Add a column if it doesn't exist (idempotent migration)."""
    async with db.execute(f"PRAGMA table_info({table})") as cursor:
        cols = {row[1] async for row in cursor}
    if column not in cols:
        await db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")


async def init_db():
    async with aiosqlite.connect(DATABASE_PATH) as db:
        # Base tables
        await db.execute('''
            CREATE TABLE IF NOT EXISTS patients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                age INTEGER NOT NULL,
                date TEXT NOT NULL,
                right_eye_va TEXT DEFAULT '', right_eye_sph TEXT DEFAULT '',
                right_eye_cyl TEXT DEFAULT '', right_eye_ax TEXT DEFAULT '',
                right_eye_bcva TEXT DEFAULT '', right_eye_near TEXT DEFAULT '',
                left_eye_va TEXT DEFAULT '', left_eye_sph TEXT DEFAULT '',
                left_eye_cyl TEXT DEFAULT '', left_eye_ax TEXT DEFAULT '',
                left_eye_bcva TEXT DEFAULT '', left_eye_near TEXT DEFAULT '',
                notes TEXT DEFAULT '', diagnosis TEXT DEFAULT '',
                prescription TEXT DEFAULT '', status TEXT DEFAULT 'pending',
                created_at TEXT NOT NULL, updated_at TEXT
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS shortcuts (
                id TEXT PRIMARY KEY, text TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0, created_at TEXT NOT NULL
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY, value TEXT NOT NULL
            )
        ''')
        # Audit trail table
        await db.execute('''
            CREATE TABLE IF NOT EXISTS audit_log (
                id TEXT PRIMARY KEY,
                user_role TEXT NOT NULL,
                action TEXT NOT NULL,
                patient_id TEXT,
                timestamp TEXT NOT NULL,
                changes_json TEXT,
                created_at TEXT NOT NULL
            )
        ''')
        # Seed PINs from environment on first run only (never overwrite existing DB values)
        async with db.execute("SELECT key FROM settings WHERE key IN ('secretary_pin','doctor_pin')") as cursor:
            existing = {row[0] async for row in cursor}
        if 'secretary_pin' not in existing:
            await db.execute(
                "INSERT INTO settings (key, value) VALUES ('secretary_pin', ?)", (SECRETARY_PIN,)
            )
        if 'doctor_pin' not in existing:
            await db.execute(
                "INSERT INTO settings (key, value) VALUES ('doctor_pin', ?)", (DOCTOR_PIN,)
            )
        # New columns (idempotent) - extended exam fields
        for col in ['right_eye_ucva', 'left_eye_ucva',
                    'right_eye_iop', 'left_eye_iop',
                    'right_eye_lid', 'left_eye_lid',
                    'right_eye_cornea', 'left_eye_cornea',
                    'right_eye_lens', 'left_eye_lens',
                    'right_eye_retina', 'left_eye_retina']:
            await ensure_column(db, 'patients', col, 'TEXT DEFAULT ""')
        # Appointment scheduling (future bookings + follow-up dates)
        await ensure_column(db, 'patients', 'appointment_date', 'TEXT')
        await ensure_column(db, 'patients', 'appointment_note', 'TEXT DEFAULT ""')
        # Internal notes — never shown to the patient, never printed on the
        # prescription. secretary_note: written by the secretary, visible to
        # both secretary and doctor. doctor_private_note: written by the
        # doctor, visible ONLY to the doctor role (enforced in the API layer).
        await ensure_column(db, 'patients', 'secretary_note', 'TEXT DEFAULT ""')
        await ensure_column(db, 'patients', 'doctor_private_note', 'TEXT DEFAULT ""')
        # Shortcut color
        await ensure_column(db, 'shortcuts', 'color', 'TEXT DEFAULT "#5B3A7D"')
        
        # Indexes for performance
        await db.execute('''
            CREATE INDEX IF NOT EXISTS idx_patients_status_created 
            ON patients(status, created_at DESC)
        ''')
        await db.execute('''
            CREATE INDEX IF NOT EXISTS idx_patients_search 
            ON patients(name COLLATE NOCASE)
        ''')
        await db.execute('''
            CREATE INDEX IF NOT EXISTS idx_shortcuts_order 
            ON shortcuts(sort_order)
        ''')
        await db.execute('''
            CREATE INDEX IF NOT EXISTS idx_audit_patient 
            ON audit_log(patient_id)
        ''')
        await db.execute('''
            CREATE INDEX IF NOT EXISTS idx_audit_timestamp 
            ON audit_log(timestamp DESC)
        ''')
        # Legacy indexes (kept for compatibility)
        await db.execute('CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_patients_created ON patients(created_at)')
        await db.commit()



# ============ WebSocket connection manager ============
class ConnectionManager:
    def __init__(self):
        self.active: dict = {}  # {websocket: client_id}
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket, client_id: str = None):
        await ws.accept()
        async with self._lock:
            self.active[ws] = client_id or str(uuid.uuid4())

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self.active.pop(ws, None)

    async def broadcast(self, event: str, data: dict = None):
        """Broadcast an event to all connected clients."""
        message = json.dumps({"event": event, "data": data or {}}, default=str)
        await self._send_all(message)

    async def broadcast_raw(self, payload: dict, exclude: str = None):
        """Broadcast a raw payload, optionally excluding one client_id."""
        message = json.dumps(payload, default=str)
        await self._send_all(message, exclude=exclude)

    async def _send_all(self, message: str, exclude: str = None):
        dead = []
        async with self._lock:
            connections = list(self.active.items())
        for ws, cid in connections:
            if exclude and cid == exclude:
                continue
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await load_pin_cache()
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

api_router = APIRouter(prefix="/api/v1")


async def verify_pin(authorization: Optional[str] = Header(None)):
    """Verify JWT token and return role"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token مطلوب")
    token = authorization[7:]  # Remove "Bearer " prefix
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        role = payload.get("role")
        if not role:
            raise HTTPException(status_code=401, detail="Token غير صحيح")
        return role
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token منتهي الصلاحية")
    except Exception:
        raise HTTPException(status_code=401, detail="Token غير صحيح")



# ============ Models ============
class EyeExamData(BaseModel):
    va: Optional[constr(max_length=50)] = ""
    sph: Optional[constr(max_length=50)] = ""
    cyl: Optional[constr(max_length=50)] = ""
    ax: Optional[constr(max_length=50)] = ""
    bcva: Optional[constr(max_length=50)] = ""
    near: Optional[constr(max_length=50)] = ""
    ucva: Optional[constr(max_length=50)] = ""
    iop: Optional[constr(max_length=50)] = ""
    lid: Optional[constr(max_length=200)] = ""
    cornea: Optional[constr(max_length=200)] = ""
    lens: Optional[constr(max_length=200)] = ""
    retina: Optional[constr(max_length=200)] = ""


class Patient(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: constr(min_length=1, max_length=200)
    age: conint(ge=0, le=150)
    date: constr(max_length=100)
    right_eye: EyeExamData = Field(default_factory=EyeExamData)
    left_eye: EyeExamData = Field(default_factory=EyeExamData)
    notes: Optional[constr(max_length=5000)] = ""
    diagnosis: Optional[constr(max_length=5000)] = ""
    prescription: Optional[constr(max_length=10000)] = ""
    status: str = "pending"
    appointment_date: Optional[constr(max_length=50)] = None
    appointment_note: Optional[constr(max_length=1000)] = ""
    # Internal-only notes (never printed, never shown to the patient — see
    # column comments in init_db for the visibility rules of each field).
    secretary_note: Optional[constr(max_length=2000)] = ""
    doctor_private_note: Optional[constr(max_length=2000)] = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None


class PatientCreate(BaseModel):
    name: constr(min_length=1, max_length=200)
    age: conint(ge=0, le=150)
    date: constr(max_length=100)
    status: Optional[constr(max_length=50)] = "pending"
    appointment_date: Optional[constr(max_length=50)] = None
    appointment_note: Optional[constr(max_length=1000)] = ""


class PatientUpdate(BaseModel):
    right_eye: Optional[EyeExamData] = None
    left_eye: Optional[EyeExamData] = None
    notes: Optional[constr(max_length=5000)] = None
    diagnosis: Optional[constr(max_length=5000)] = None
    prescription: Optional[constr(max_length=10000)] = None
    status: Optional[constr(max_length=50)] = None
    appointment_date: Optional[constr(max_length=50)] = None
    appointment_note: Optional[constr(max_length=1000)] = None
    secretary_note: Optional[constr(max_length=2000)] = None
    doctor_private_note: Optional[constr(max_length=2000)] = None


class StatusUpdate(BaseModel):
    status: constr(min_length=1, max_length=50)


class ShortcutButton(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    color: str = "#5B3A7D"
    order: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ShortcutCreate(BaseModel):
    text: constr(min_length=1, max_length=1000)
    color: Optional[constr(max_length=20)] = "#5B3A7D"


class ShortcutUpdate(BaseModel):
    text: constr(min_length=1, max_length=1000)
    color: Optional[constr(max_length=20)] = "#5B3A7D"


class PinVerification(BaseModel):
    pin: constr(min_length=1, max_length=50)


class PinChange(BaseModel):
    current_pin: constr(min_length=1, max_length=50)
    new_pin: constr(min_length=4, max_length=50)


# ============ Helpers ============
EYE_FIELDS = ['va', 'sph', 'cyl', 'ax', 'bcva', 'near',
              'ucva', 'iop', 'lid', 'cornea', 'lens', 'retina']


def row_to_patient(row) -> dict:
    def eye(side: str) -> dict:
        return {f: row[f'{side}_eye_{f}'] or '' for f in EYE_FIELDS}
    return {
        'id': row['id'], 'name': row['name'], 'age': row['age'], 'date': row['date'],
        'right_eye': eye('right'), 'left_eye': eye('left'),
        'notes': row['notes'] or '', 'diagnosis': row['diagnosis'] or '',
        'prescription': row['prescription'] or '', 'status': row['status'],
        'appointment_date': row['appointment_date'] if 'appointment_date' in row.keys() else None,
        'appointment_note': (row['appointment_note'] if 'appointment_note' in row.keys() else '') or '',
        'secretary_note': (row['secretary_note'] if 'secretary_note' in row.keys() else '') or '',
        'doctor_private_note': (row['doctor_private_note'] if 'doctor_private_note' in row.keys() else '') or '',
        'created_at': datetime.fromisoformat(row['created_at']),
        'updated_at': datetime.fromisoformat(row['updated_at']) if row['updated_at'] else None,
    }


def sanitize_patient_for_role(patient: dict, role: str) -> dict:
    """Strip fields the current role must never see.

    doctor_private_note is written by the doctor for herself only — it must
    never reach the secretary's screen, print output, or API response.
    """
    if role != 'doctor':
        patient = dict(patient)
        patient['doctor_private_note'] = ''
    return patient


def row_to_shortcut(row) -> dict:
    return {
        'id': row['id'], 'text': row['text'],
        'color': row['color'] or '#5B3A7D',
        'order': row['sort_order'],
        'created_at': datetime.fromisoformat(row['created_at']),
    }


# ============ Audit logging ============
async def log_audit(db, role: str, action: str, patient_id: str = None, changes: dict = None):
    """Log changes for audit trail"""
    await db.execute('''
        INSERT INTO audit_log (id, user_role, action, patient_id, timestamp, changes_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        str(uuid.uuid4()),
        role,
        action,
        patient_id,
        datetime.now(timezone.utc).isoformat(),
        json.dumps(changes) if changes else None,
        datetime.now(timezone.utc).isoformat()
    ))


# ============ Shortcuts caching ============
from functools import lru_cache

@lru_cache(maxsize=1)
async def get_shortcuts_cached():
    """Cache shortcuts since they change rarely"""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM shortcuts ORDER BY sort_order ASC") as cursor:
            rows = await cursor.fetchall()
    return [row_to_shortcut(row) for row in rows]


async def invalidate_shortcuts_cache():
    """Clear cache when shortcuts change"""
    get_shortcuts_cached.cache_clear()


# ============ Login lockout (brute-force protection) ============
# In addition to the per-minute rate limit on /login, track repeated wrong
# PINs per source IP and lock that IP out for a cooldown period. This is
# in-memory (resets on restart) which is an acceptable tradeoff for a
# single-instance clinic app; the per-minute rate limit still applies even
# after a restart.
_failed_logins: dict = {}  # ip -> {"count": int, "locked_until": float}
LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 15 * 60


def _check_login_lockout(ip: str):
    entry = _failed_logins.get(ip)
    if entry and entry.get("locked_until", 0) > time.time():
        remaining_min = max(1, int((entry["locked_until"] - time.time()) / 60) + 1)
        raise HTTPException(
            status_code=429,
            detail=f"تم تعطيل الدخول مؤقتاً بسبب محاولات فاشلة متكررة، حاول بعد {remaining_min} دقيقة"
        )


def _register_login_failure(ip: str):
    entry = _failed_logins.setdefault(ip, {"count": 0, "locked_until": 0})
    entry["count"] += 1
    if entry["count"] >= LOGIN_MAX_ATTEMPTS:
        entry["locked_until"] = time.time() + LOGIN_LOCKOUT_SECONDS
        entry["count"] = 0


def _register_login_success(ip: str):
    _failed_logins.pop(ip, None)


@api_router.get("/")
async def root():
    return {"message": "Dr. Wesen Abdulaziz Eye Clinic API", "status": "running"}


@api_router.get("/health")
async def health():
    return {"status": "ok"}


@api_router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, body: PinVerification):
    ip = get_remote_address(request)
    _check_login_lockout(ip)

    role = get_role_for_pin(body.pin)
    if not role:
        _register_login_failure(ip)
        raise HTTPException(status_code=401, detail="PIN غير صحيح")
    _register_login_success(ip)

    expires = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = jwt.encode(
        {"role": role, "exp": expires},
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM
    )
    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "role": role,
        "message": "تم التحقق بنجاح"
    }


@api_router.post("/change-pin")
@limiter.limit("5/minute")
async def change_pin_endpoint(request: Request, body: PinChange, role: str = Depends(verify_pin)):
    # For now, accept any role since both can change their PIN
    if not body.current_pin.strip().isdigit() or not body.new_pin.strip().isdigit():
        raise HTTPException(status_code=400, detail="الرمز يجب أن يتكون من أرقام فقط")
    if not secrets.compare_digest(body.current_pin, _pin_cache[role]):
        raise HTTPException(status_code=401, detail="الرمز الحالي غير صحيح")
    new_pin = body.new_pin.strip()
    # A newly chosen PIN must not collide with the other role's active PIN
    other_role = 'doctor' if role == 'secretary' else 'secretary'
    if secrets.compare_digest(new_pin, _pin_cache[other_role]):
        raise HTTPException(status_code=400, detail="هذا الرمز مستخدم بالفعل، اختر رمزاً مختلفاً")
    key = 'secretary_pin' if role == 'secretary' else 'doctor_pin'
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, new_pin)
        )
        await db.commit()
    _pin_cache[role] = new_pin
    return {"success": True, "message": "تم تغيير الرمز بنجاح"}


# ============ WebSocket for real-time updates ============
@app.websocket("/ws/updates")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        role = payload.get("role")
        if not role:
            await websocket.close(code=1008)
            return
    except Exception:
        await websocket.close(code=1008)
        return
    
    client_id = str(uuid.uuid4())
    await manager.connect(websocket, client_id)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
                if payload.get("event") == "patient_field_edit":
                    payload["client_id"] = client_id
                    await manager.broadcast_raw(payload, exclude=client_id)
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
    except WebSocketDisconnect:
        await manager.disconnect(websocket)


# ============ Patient CRUD ============
@api_router.post("/patients", response_model=Patient)
@limiter.limit("60/minute")
async def create_patient(request: Request, input: PatientCreate, role: str = Depends(verify_pin)):
    status = input.status if input.status in ("pending", "scheduled") else "pending"
    patient = Patient(
        name=input.name, age=input.age, date=input.date, status=status,
        appointment_date=input.appointment_date, appointment_note=input.appointment_note or "",
    )
    async with aiosqlite.connect(DATABASE_PATH) as db:
        await db.execute(
            "INSERT INTO patients (id, name, age, date, status, appointment_date, appointment_note, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (patient.id, patient.name, patient.age, patient.date, patient.status,
             patient.appointment_date, patient.appointment_note, patient.created_at.isoformat())
        )
        await log_audit(db, role, 'create_patient', patient.id, {'name': patient.name, 'status': status})
        await db.commit()
    event = "appointment_created" if status == "scheduled" else "patient_created"
    await manager.broadcast(event, {"id": patient.id, "name": patient.name})
    return patient


@api_router.get("/patients", response_model=dict)
@limiter.limit("240/minute")
async def get_patients(request: Request, skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                       status: Optional[str] = None, search: Optional[str] = None, 
                       role: str = Depends(verify_pin)):
    query = "SELECT * FROM patients WHERE 1=1"
    count_query = "SELECT COUNT(*) as total FROM patients WHERE 1=1"
    params = []
    
    if status:
        query += " AND status = ?"
        count_query += " AND status = ?"
        params.append(status[:50])
    
    if search:
        escaped = search[:100].replace('%', r'\%').replace('_', r'\_')
        query += " AND name LIKE ? ESCAPE '\\'"
        count_query += " AND name LIKE ? ESCAPE '\\'"
        params.append(f"%{escaped}%")
    
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        
        async with db.execute(count_query, params) as cursor:
            total = (await cursor.fetchone())['total']
        
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        async with db.execute(query, params + [limit, skip]) as cursor:
            rows = await cursor.fetchall()
    
    return {
        "items": [sanitize_patient_for_role(row_to_patient(row), role) for row in rows],
        "total": total,
        "skip": skip,
        "limit": limit
    }


@api_router.get("/patients/{patient_id}", response_model=Patient)
@limiter.limit("240/minute")
async def get_patient(request: Request, patient_id: str, role: str = Depends(verify_pin)):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)) as cursor:
            row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Patient not found")
    return sanitize_patient_for_role(row_to_patient(row), role)


@api_router.get("/patients/{patient_id}/history", response_model=dict)
@limiter.limit("240/minute")
async def get_patient_history(request: Request, patient_id: str,
                               limit: int = Query(10, ge=1, le=50),
                               role: str = Depends(verify_pin)):
    """Return prior completed visits belonging to the same patient, for the
    doctor's historical comparison view. Matched by exact name (there is no
    persistent patient ID across visits in this system yet), excluding the
    current record itself, most recent first."""
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)) as cursor:
            current_row = await cursor.fetchone()
        if not current_row:
            raise HTTPException(status_code=404, detail="Patient not found")

        async with db.execute(
            """SELECT * FROM patients
               WHERE name = ? AND status = 'completed' AND id != ?
               ORDER BY COALESCE(updated_at, created_at) DESC
               LIMIT ?""",
            (current_row['name'], patient_id, limit),
        ) as cursor:
            rows = await cursor.fetchall()

    return {
        "current": sanitize_patient_for_role(row_to_patient(current_row), role),
        "history": [sanitize_patient_for_role(row_to_patient(row), role) for row in rows],
    }


@api_router.put("/patients/{patient_id}", response_model=Patient)
@limiter.limit("120/minute")
async def update_patient(request: Request, patient_id: str, input: PatientUpdate, role: str = Depends(verify_pin)):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id FROM patients WHERE id = ?", (patient_id,)) as cursor:
            if not await cursor.fetchone():
                raise HTTPException(status_code=404, detail="Patient not found")
        update_fields, params = [], []
        changes = {}
        if input.right_eye:
            for f in EYE_FIELDS:
                update_fields.append(f"right_eye_{f} = ?")
                params.append(getattr(input.right_eye, f) or '')
            changes['right_eye'] = dict(input.right_eye)
        if input.left_eye:
            for f in EYE_FIELDS:
                update_fields.append(f"left_eye_{f} = ?")
                params.append(getattr(input.left_eye, f) or '')
            changes['left_eye'] = dict(input.left_eye)
        for name, val in [('notes', input.notes), ('diagnosis', input.diagnosis),
                          ('prescription', input.prescription), ('status', input.status),
                          ('appointment_date', input.appointment_date),
                          ('appointment_note', input.appointment_note),
                          ('secretary_note', input.secretary_note)]:
            if val is not None:
                update_fields.append(f"{name} = ?")
                params.append(val)
                changes[name] = val
        # doctor_private_note is only ever readable/writable by the doctor
        # role. Content is deliberately excluded from the audit log — only
        # the fact that it changed is recorded, to keep it genuinely private.
        if input.doctor_private_note is not None:
            if role != 'doctor':
                raise HTTPException(status_code=403, detail="هذا الحقل خاص بالطبيبة ولا يمكن للسكرتيرة تعديله")
            update_fields.append("doctor_private_note = ?")
            params.append(input.doctor_private_note)
            changes['doctor_private_note'] = '[تم التحديث]'
        update_fields.append("updated_at = ?")
        params.append(datetime.now(timezone.utc).isoformat())
        params.append(patient_id)
        await db.execute(f"UPDATE patients SET {', '.join(update_fields)} WHERE id = ?", params)
        await log_audit(db, role, 'update_patient', patient_id, changes)
        await db.commit()
        async with db.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)) as cursor:
            updated = await cursor.fetchone()
    patient_data = sanitize_patient_for_role(row_to_patient(updated), role)
    await manager.broadcast("patient_updated", {
        "id": patient_id, "status": patient_data['status'], "name": patient_data['name']
    })
    return patient_data


@api_router.patch("/patients/{patient_id}/status")
@limiter.limit("120/minute")
async def update_patient_status(request: Request, patient_id: str, body: StatusUpdate, role: str = Depends(verify_pin)):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            "UPDATE patients SET status = ?, updated_at = ? WHERE id = ?",
            (body.status, datetime.now(timezone.utc).isoformat(), patient_id)
        )
        await log_audit(db, role, 'update_status', patient_id, {'status': body.status})
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Patient not found")
    await manager.broadcast("patient_updated", {"id": patient_id, "status": body.status})
    return {"success": True, "status": body.status}


@api_router.delete("/patients/{patient_id}")
@limiter.limit("30/minute")
async def delete_patient(request: Request, patient_id: str, role: str = Depends(verify_pin)):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute("DELETE FROM patients WHERE id = ?", (patient_id,))
        await log_audit(db, role, 'delete_patient', patient_id)
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Patient not found")
    await manager.broadcast("patient_deleted", {"id": patient_id})
    return {"message": "Patient deleted"}


# ============ Shortcuts CRUD ============
@api_router.get("/shortcuts", response_model=List[ShortcutButton])
@limiter.limit("240/minute")
async def get_shortcuts(request: Request, role: str = Depends(verify_pin)):
    return await get_shortcuts_cached()


@api_router.post("/shortcuts", response_model=ShortcutButton)
@limiter.limit("60/minute")
async def create_shortcut(request: Request, input: ShortcutCreate, role: str = Depends(verify_pin)):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        async with db.execute("SELECT COUNT(*) FROM shortcuts") as cursor:
            count = (await cursor.fetchone())[0]
        shortcut = ShortcutButton(text=input.text, color=input.color or "#5B3A7D", order=count)
        await db.execute(
            "INSERT INTO shortcuts (id, text, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
            (shortcut.id, shortcut.text, shortcut.color, shortcut.order, shortcut.created_at.isoformat())
        )
        await db.commit()
    await invalidate_shortcuts_cache()
    await manager.broadcast("shortcut_changed", {})
    return shortcut


@api_router.put("/shortcuts/{shortcut_id}", response_model=ShortcutButton)
@limiter.limit("60/minute")
async def update_shortcut(request: Request, shortcut_id: str, input: ShortcutUpdate, role: str = Depends(verify_pin)):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "UPDATE shortcuts SET text = ?, color = ? WHERE id = ?",
            (input.text, input.color or "#5B3A7D", shortcut_id)
        )
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Shortcut not found")
        async with db.execute("SELECT * FROM shortcuts WHERE id = ?", (shortcut_id,)) as cur:
            row = await cur.fetchone()
    await invalidate_shortcuts_cache()
    await manager.broadcast("shortcut_changed", {})
    return row_to_shortcut(row)


@api_router.delete("/shortcuts/{shortcut_id}")
@limiter.limit("60/minute")
async def delete_shortcut(request: Request, shortcut_id: str, role: str = Depends(verify_pin)):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute("DELETE FROM shortcuts WHERE id = ?", (shortcut_id,))
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Shortcut not found")
    await invalidate_shortcuts_cache()
    await manager.broadcast("shortcut_changed", {})
    return {"message": "Shortcut deleted"}


@api_router.get("/stats")
@limiter.limit("120/minute")
async def get_stats(request: Request, role: str = Depends(verify_pin)):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT COUNT(*) as c FROM patients") as cur:
            total = (await cur.fetchone())['c']
        async with db.execute("SELECT COUNT(*) as c FROM patients WHERE status = 'pending'") as cur:
            pending = (await cur.fetchone())['c']
        async with db.execute("SELECT COUNT(*) as c FROM patients WHERE status = 'in_exam'") as cur:
            in_exam = (await cur.fetchone())['c']
        async with db.execute("SELECT COUNT(*) as c FROM patients WHERE status = 'completed'") as cur:
            completed = (await cur.fetchone())['c']
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        async with db.execute(
            "SELECT COUNT(*) as c FROM patients WHERE substr(created_at, 1, 10) = ?", (today,)
        ) as cur:
            today_count = (await cur.fetchone())['c']
    return {
        'total_patients': total, 'pending_patients': pending,
        'in_exam_patients': in_exam, 'completed_patients': completed,
        'today_patients': today_count
    }


@api_router.get("/backup")
@limiter.limit("10/minute")
async def download_backup(request: Request, role: str = Depends(verify_pin)):
    """تحميل نسخة احتياطية من قاعدة البيانات (clinic.db)

    Restricted to the doctor role: this is a raw copy of the whole database,
    which includes doctor_private_note in full — giving it to the secretary
    role would defeat the purpose of that field being private.
    """
    if role != 'doctor':
        raise HTTPException(status_code=403, detail="هذه الميزة متاحة للطبيبة فقط")
    if not os.path.exists(DATABASE_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")
    backup_name = f"clinic-backup-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.db"
    return FileResponse(DATABASE_PATH, filename=backup_name, media_type="application/octet-stream")


@api_router.get("/export/patients")
@limiter.limit("10/minute")
async def export_patients(request: Request, format: str = Query("csv"), role: str = Depends(verify_pin)):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM patients ORDER BY created_at DESC") as cursor:
            rows = await cursor.fetchall()
    
    patients = [sanitize_patient_for_role(row_to_patient(row), role) for row in rows]
    
    if format == "csv":
        from io import StringIO
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=['id', 'name', 'age', 'date', 'status', 'diagnosis'])
        writer.writeheader()
        for p in patients:
            writer.writerow({
                'id': p['id'],
                'name': p['name'],
                'age': p['age'],
                'date': p['date'],
                'status': p['status'],
                'diagnosis': p['diagnosis']
            })
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=patients.csv"}
        )
    
    elif format == "json":
        return Response(
            content=json.dumps(patients, default=str),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=patients.json"}
        )
    else:
        raise HTTPException(status_code=400, detail="Format should be 'csv' or 'json'")


def backup_database():
    """Create daily backup"""
    backup_dir = Path(DATABASE_PATH).parent / "backups"
    backup_dir.mkdir(exist_ok=True)
    
    backup_file = backup_dir / f"clinic-backup-{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.db"
    try:
        shutil.copy2(DATABASE_PATH, backup_file)
        logger.info(f"Backup created: {backup_file}")
        # Keep only last 30 backups
        backups = sorted(backup_dir.glob("*.db"))[:-30]
        for old_backup in backups:
            old_backup.unlink()
    except Exception as e:
        logger.error(f"Backup failed: {e}")


def run_scheduler():
    """Run backup scheduler"""
    schedule.every().day.at("22:00").do(backup_database)
    while True:
        schedule.run_pending()
        time.sleep(60)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Start backup scheduler in background
backup_thread = threading.Thread(target=run_scheduler, daemon=True)
backup_thread.start()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Serve React frontend if built
FRONTEND_BUILD = BUNDLE_DIR / 'frontend_build'
if FRONTEND_BUILD.exists() and (FRONTEND_BUILD / 'index.html').exists():
    logger.info(f"Serving frontend from: {FRONTEND_BUILD}")
    static_dir = FRONTEND_BUILD / 'static'
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.get("/manifest.json", include_in_schema=False)
    async def manifest():
        return FileResponse(FRONTEND_BUILD / 'manifest.json')

    @app.get("/service-worker.js", include_in_schema=False)
    async def service_worker():
        return FileResponse(FRONTEND_BUILD / 'service-worker.js')

    @app.get("/favicon.ico", include_in_schema=False)
    async def favicon():
        f = FRONTEND_BUILD / 'favicon.ico'
        if f.exists():
            return FileResponse(f)
        raise HTTPException(status_code=404)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_react(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("ws/"):
            raise HTTPException(status_code=404, detail="Route not found")
        return FileResponse(FRONTEND_BUILD / 'index.html')
else:
    logger.info(f"Frontend build not found at {FRONTEND_BUILD} - running API-only mode")

    @app.get("/", include_in_schema=False)
    async def root_dev():
        return {"message": "Dr. Wesen Abdulaziz Clinic API", "mode": "development"}
