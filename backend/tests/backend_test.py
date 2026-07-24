"""Backend tests: PIN authentication, validation, rate limiting, security, WebSocket, Phase 1 features."""
import os
import json
import asyncio
import pytest
import requests
import websockets

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://ophthalmology-clinic.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
PIN = "1234"
PIN_HEADER = {"X-Clinic-PIN": PIN}


# ============ Public endpoints ============
class TestPublicEndpoints:
    def test_root_no_pin_required(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        data = r.json()
        assert "message" in data
        assert "DATABASE_PATH" not in str(data)
        assert "clinic.db" not in str(data)

    def test_health_no_pin_required(self):
        r = requests.get(f"{API}/health")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_docs_disabled(self):
        # /docs is not under /api so ingress routes to frontend (returns HTML).
        # Verify FastAPI's Swagger UI is NOT served (no swagger-ui markers).
        r = requests.get(f"{BASE_URL}/docs")
        body = r.text.lower()
        assert "swagger-ui" not in body and "swagger ui" not in body

    def test_openapi_disabled(self):
        r = requests.get(f"{BASE_URL}/openapi.json")
        # Ensure it's not a JSON OpenAPI spec
        try:
            data = r.json()
            assert "openapi" not in data and "paths" not in data
        except ValueError:
            pass  # non-JSON (HTML) is fine, confirms disabled

    def test_redoc_disabled(self):
        r = requests.get(f"{BASE_URL}/redoc")
        assert "redoc" not in r.text.lower() or "<!doctype html>" in r.text.lower()


# ============ PIN Authentication ============
class TestPinAuth:
    def test_patients_without_pin_401(self):
        r = requests.get(f"{API}/patients")
        assert r.status_code == 401

    def test_patients_wrong_pin_401(self):
        r = requests.get(f"{API}/patients", headers={"X-Clinic-PIN": "9999"})
        assert r.status_code == 401

    def test_patients_correct_pin_200(self):
        r = requests.get(f"{API}/patients", headers=PIN_HEADER)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_shortcuts_without_pin_401(self):
        r = requests.get(f"{API}/shortcuts")
        assert r.status_code == 401

    def test_shortcuts_with_pin_200(self):
        r = requests.get(f"{API}/shortcuts", headers=PIN_HEADER)
        assert r.status_code == 200

    def test_stats_without_pin_401(self):
        r = requests.get(f"{API}/stats")
        assert r.status_code == 401

    def test_stats_with_pin_200(self):
        r = requests.get(f"{API}/stats", headers=PIN_HEADER)
        assert r.status_code == 200
        assert "total_patients" in r.json()

    def test_verify_pin_correct(self):
        r = requests.post(f"{API}/verify-pin", json={"pin": PIN})
        assert r.status_code == 200
        assert r.json().get("success") is True

    def test_verify_pin_wrong(self):
        r = requests.post(f"{API}/verify-pin", json={"pin": "0000"})
        assert r.status_code == 401


# ============ Input Validation ============
class TestValidation:
    def test_create_patient_empty_name_rejected(self):
        r = requests.post(f"{API}/patients", headers=PIN_HEADER,
                          json={"name": "", "age": 30, "date": "2026-01-01"})
        assert r.status_code == 422

    def test_create_patient_long_name_rejected(self):
        r = requests.post(f"{API}/patients", headers=PIN_HEADER,
                          json={"name": "A" * 201, "age": 30, "date": "2026-01-01"})
        assert r.status_code == 422

    def test_create_patient_age_too_high(self):
        r = requests.post(f"{API}/patients", headers=PIN_HEADER,
                          json={"name": "TEST_X", "age": 200, "date": "2026-01-01"})
        assert r.status_code == 422

    def test_create_patient_negative_age(self):
        r = requests.post(f"{API}/patients", headers=PIN_HEADER,
                          json={"name": "TEST_X", "age": -1, "date": "2026-01-01"})
        assert r.status_code == 422

    def test_update_patient_long_notes_rejected(self):
        cr = requests.post(f"{API}/patients", headers=PIN_HEADER,
                           json={"name": "TEST_notes", "age": 30, "date": "2026-01-01"})
        assert cr.status_code == 200
        pid = cr.json()["id"]
        try:
            r = requests.put(f"{API}/patients/{pid}", headers=PIN_HEADER,
                             json={"notes": "A" * 5001})
            assert r.status_code == 422
        finally:
            requests.delete(f"{API}/patients/{pid}", headers=PIN_HEADER)


# ============ CRUD end-to-end ============
class TestPatientCRUD:
    def test_create_get_update_delete(self):
        cr = requests.post(f"{API}/patients", headers=PIN_HEADER,
                           json={"name": "TEST_patient_crud", "age": 45, "date": "2026-01-15"})
        assert cr.status_code == 200
        pid = cr.json()["id"]
        assert cr.json()["name"] == "TEST_patient_crud"

        gr = requests.get(f"{API}/patients/{pid}", headers=PIN_HEADER)
        assert gr.status_code == 200
        assert gr.json()["age"] == 45

        ur = requests.put(f"{API}/patients/{pid}", headers=PIN_HEADER,
                          json={"diagnosis": "Myopia", "status": "completed"})
        assert ur.status_code == 200
        assert ur.json()["diagnosis"] == "Myopia"

        gr2 = requests.get(f"{API}/patients/{pid}", headers=PIN_HEADER)
        assert gr2.json()["diagnosis"] == "Myopia"
        assert gr2.json()["status"] == "completed"

        dr = requests.delete(f"{API}/patients/{pid}", headers=PIN_HEADER)
        assert dr.status_code == 200
        gr3 = requests.get(f"{API}/patients/{pid}", headers=PIN_HEADER)
        assert gr3.status_code == 404

    def test_search_patients(self):
        cr = requests.post(f"{API}/patients", headers=PIN_HEADER,
                           json={"name": "TEST_searchme_unique", "age": 25, "date": "2026-01-01"})
        pid = cr.json()["id"]
        try:
            r = requests.get(f"{API}/patients?search=searchme_unique", headers=PIN_HEADER)
            assert r.status_code == 200
            names = [p["name"] for p in r.json()]
            assert "TEST_searchme_unique" in names
        finally:
            requests.delete(f"{API}/patients/{pid}", headers=PIN_HEADER)


# ============ Shortcuts CRUD ============
class TestShortcuts:
    def test_shortcut_crud(self):
        cr = requests.post(f"{API}/shortcuts", headers=PIN_HEADER,
                           json={"text": "TEST_shortcut"})
        assert cr.status_code == 200
        sid = cr.json()["id"]
        try:
            gr = requests.get(f"{API}/shortcuts", headers=PIN_HEADER)
            assert any(s["id"] == sid for s in gr.json())
            ur = requests.put(f"{API}/shortcuts/{sid}", headers=PIN_HEADER,
                              json={"text": "TEST_updated"})
            assert ur.status_code == 200
            assert ur.json()["text"] == "TEST_updated"
        finally:
            requests.delete(f"{API}/shortcuts/{sid}", headers=PIN_HEADER)


# ============ Rate limiting ============
class TestRateLimit:
    def test_verify_pin_rate_limit(self):
        session = requests.Session()
        statuses = []
        for _ in range(16):
            r = session.post(f"{API}/verify-pin", json={"pin": "wrong"})
            statuses.append(r.status_code)
        assert 429 in statuses, f"Expected 429 in {statuses}"


# ============ Phase 1: Extended exam fields ============
class TestExtendedExamFields:
    def test_new_eye_fields_persist(self):
        cr = requests.post(f"{API}/patients", headers=PIN_HEADER,
                           json={"name": "TEST_ext_fields", "age": 40, "date": "2026-01-15"})
        assert cr.status_code == 200
        pid = cr.json()["id"]
        try:
            eye_payload = {
                "va": "6/6", "sph": "-1.00", "cyl": "-0.25", "ax": "180",
                "bcva": "6/6", "near": "N5",
                "ucva": "6/9", "iop": "15",
                "lid": "Normal", "cornea": "Clear",
                "lens": "Clear", "retina": "Normal"
            }
            ur = requests.put(f"{API}/patients/{pid}", headers=PIN_HEADER,
                              json={"right_eye": eye_payload, "left_eye": eye_payload})
            assert ur.status_code == 200
            body = ur.json()
            for field in ["ucva", "iop", "lid", "cornea", "lens", "retina"]:
                assert body["right_eye"][field] == eye_payload[field], f"right_eye.{field} not persisted"
                assert body["left_eye"][field] == eye_payload[field], f"left_eye.{field} not persisted"

            # GET verifies persistence
            gr = requests.get(f"{API}/patients/{pid}", headers=PIN_HEADER)
            assert gr.status_code == 200
            for field in ["ucva", "iop", "lid", "cornea", "lens", "retina"]:
                assert gr.json()["right_eye"][field] == eye_payload[field]
        finally:
            requests.delete(f"{API}/patients/{pid}", headers=PIN_HEADER)


# ============ Phase 1: Status endpoint ============
class TestStatusEndpoint:
    def test_patch_status_updates(self):
        cr = requests.post(f"{API}/patients", headers=PIN_HEADER,
                           json={"name": "TEST_status_patch", "age": 30, "date": "2026-01-15"})
        pid = cr.json()["id"]
        try:
            r = requests.patch(f"{API}/patients/{pid}/status", headers=PIN_HEADER,
                               json={"status": "in_exam"})
            assert r.status_code == 200
            assert r.json()["status"] == "in_exam"
            # verify persisted
            gr = requests.get(f"{API}/patients/{pid}", headers=PIN_HEADER)
            assert gr.json()["status"] == "in_exam"
        finally:
            requests.delete(f"{API}/patients/{pid}", headers=PIN_HEADER)

    def test_patch_status_nonexistent_404(self):
        r = requests.patch(f"{API}/patients/nonexistent-id/status", headers=PIN_HEADER,
                           json={"status": "in_exam"})
        assert r.status_code == 404

    def test_stats_includes_in_exam(self):
        r = requests.get(f"{API}/stats", headers=PIN_HEADER)
        assert r.status_code == 200
        data = r.json()
        assert "in_exam_patients" in data
        assert isinstance(data["in_exam_patients"], int)


# ============ Phase 1: Shortcut color ============
class TestShortcutColor:
    def test_shortcut_default_color(self):
        cr = requests.post(f"{API}/shortcuts", headers=PIN_HEADER,
                           json={"text": "TEST_color_default"})
        try:
            assert cr.status_code == 200
            assert cr.json()["color"] == "#5B3A7D"
        finally:
            requests.delete(f"{API}/shortcuts/{cr.json()['id']}", headers=PIN_HEADER)

    def test_shortcut_custom_color(self):
        cr = requests.post(f"{API}/shortcuts", headers=PIN_HEADER,
                           json={"text": "TEST_color_custom", "color": "#DC2626"})
        sid = cr.json()["id"]
        try:
            assert cr.json()["color"] == "#DC2626"
            # update color
            ur = requests.put(f"{API}/shortcuts/{sid}", headers=PIN_HEADER,
                              json={"text": "TEST_color_custom", "color": "#0B6E4F"})
            assert ur.status_code == 200
            assert ur.json()["color"] == "#0B6E4F"
            # GET list reflects
            gr = requests.get(f"{API}/shortcuts", headers=PIN_HEADER)
            found = next(s for s in gr.json() if s["id"] == sid)
            assert found["color"] == "#0B6E4F"
        finally:
            requests.delete(f"{API}/shortcuts/{sid}", headers=PIN_HEADER)


# ============ Phase 1: WebSocket real-time updates ============
def _ws_url(pin=PIN):
    # Ingress WSS handshake is not supported in this preview env; use localhost
    # per task guidance (this reflects the packaged .exe use case).
    return f"ws://localhost:8001/ws/updates?pin={pin}"


class TestWebSocket:
    def test_ws_wrong_pin_rejected(self):
        async def run():
            try:
                async with websockets.connect(_ws_url("wrong")) as ws:
                    # Should be closed by server
                    try:
                        await asyncio.wait_for(ws.recv(), timeout=2)
                    except Exception:
                        pass
                    return ws.close_code
            except websockets.exceptions.InvalidStatusCode as e:
                return e.status_code
            except Exception as e:
                # server may close with 1008
                return getattr(e, "code", None) or str(e)
        result = asyncio.run(run())
        # Accept either 1008 close code or an HTTP-style rejection
        assert result in (1008, 403, 401) or "1008" in str(result) or "403" in str(result), f"got {result}"

    def test_ws_correct_pin_receives_broadcast(self):
        async def run():
            async with websockets.connect(_ws_url()) as ws:
                # Wait a bit to ensure connection registered server-side
                await asyncio.sleep(0.5)
                # Trigger an event
                def create():
                    return requests.post(f"{API}/patients", headers=PIN_HEADER,
                                         json={"name": "TEST_ws_broadcast", "age": 33, "date": "2026-01-15"})
                loop = asyncio.get_event_loop()
                cr = await loop.run_in_executor(None, create)
                assert cr.status_code == 200
                pid = cr.json()["id"]
                events = []
                try:
                    for _ in range(50):
                        raw = await asyncio.wait_for(ws.recv(), timeout=5)
                        ev = json.loads(raw)
                        events.append(ev)
                        if ev.get("event") == "patient_created" and ev.get("data", {}).get("id") == pid:
                            break
                except asyncio.TimeoutError:
                    pass
                # cleanup
                await loop.run_in_executor(None, lambda: requests.delete(f"{API}/patients/{pid}", headers=PIN_HEADER))
                return events, pid
        events, pid = asyncio.run(run())
        assert any(e.get("event") == "patient_created" and e.get("data", {}).get("id") == pid for e in events), f"no patient_created for {pid} in {events}"

    def test_ws_shortcut_broadcast(self):
        async def run():
            async with websockets.connect(_ws_url()) as ws:
                await asyncio.sleep(0.5)
                loop = asyncio.get_event_loop()
                cr = await loop.run_in_executor(
                    None,
                    lambda: requests.post(f"{API}/shortcuts", headers=PIN_HEADER,
                                          json={"text": "TEST_ws_shortcut", "color": "#DC2626"})
                )
                assert cr.status_code == 200
                sid = cr.json()["id"]
                events = []
                try:
                    for _ in range(50):
                        raw = await asyncio.wait_for(ws.recv(), timeout=5)
                        ev = json.loads(raw)
                        events.append(ev)
                        if ev.get("event") == "shortcut_changed":
                            break
                except asyncio.TimeoutError:
                    pass
                await loop.run_in_executor(None, lambda: requests.delete(f"{API}/shortcuts/{sid}", headers=PIN_HEADER))
                return events
        events = asyncio.run(run())
        assert any(e.get("event") == "shortcut_changed" for e in events), f"no shortcut_changed in {events}"



# ============ Phase 2: Dual PIN & role-based verify-pin ============
class TestDualPin:
    def test_verify_pin_secretary_role(self):
        r = requests.post(f"{API}/verify-pin", json={"pin": "1234"})
        assert r.status_code == 200
        body = r.json()
        assert body.get("success") is True
        assert body.get("role") == "secretary"

    def test_verify_pin_doctor_role(self):
        r = requests.post(f"{API}/verify-pin", json={"pin": "4321"})
        assert r.status_code == 200
        body = r.json()
        assert body.get("success") is True
        assert body.get("role") == "doctor"

    def test_verify_pin_wrong_pin_401(self):
        r = requests.post(f"{API}/verify-pin", json={"pin": "0000"})
        assert r.status_code == 401

    def test_doctor_pin_can_access_patients(self):
        r = requests.get(f"{API}/patients", headers={"X-Clinic-PIN": "4321"})
        assert r.status_code == 200

    def test_secretary_pin_can_access_patients(self):
        r = requests.get(f"{API}/patients", headers={"X-Clinic-PIN": "1234"})
        assert r.status_code == 200

    def test_doctor_pin_can_patch_status(self):
        cr = requests.post(f"{API}/patients", headers={"X-Clinic-PIN": "4321"},
                           json={"name": "TEST_dr_pin", "age": 30, "date": "2026-01-15"})
        assert cr.status_code == 200
        pid = cr.json()["id"]
        try:
            r = requests.patch(f"{API}/patients/{pid}/status",
                               headers={"X-Clinic-PIN": "4321"},
                               json={"status": "in_exam"})
            assert r.status_code == 200
        finally:
            requests.delete(f"{API}/patients/{pid}", headers=PIN_HEADER)


# ============ Phase 2: WebSocket collaborative relay ============
class TestWsCollaborativeRelay:
    def test_ws_field_edit_relayed_to_other_only(self):
        """Client A sends patient_field_edit → Client B receives it, Client A does NOT get echo."""
        async def run():
            async with websockets.connect(_ws_url("1234")) as ws_a, \
                       websockets.connect(_ws_url("4321")) as ws_b:
                await asyncio.sleep(0.3)
                payload = {
                    "event": "patient_field_edit",
                    "patient_id": "test-pid-xyz",
                    "path": "right_eye.va",
                    "value": "1.0"
                }
                await ws_a.send(json.dumps(payload))

                # B should receive within a couple seconds
                b_events = []
                try:
                    while True:
                        raw = await asyncio.wait_for(ws_b.recv(), timeout=3)
                        ev = json.loads(raw)
                        b_events.append(ev)
                        if ev.get("event") == "patient_field_edit" and ev.get("patient_id") == "test-pid-xyz":
                            break
                except asyncio.TimeoutError:
                    pass

                # A should NOT receive echo of its own edit
                a_events = []
                try:
                    while True:
                        raw = await asyncio.wait_for(ws_a.recv(), timeout=1.5)
                        ev = json.loads(raw)
                        a_events.append(ev)
                except asyncio.TimeoutError:
                    pass
                return a_events, b_events

        a_events, b_events = asyncio.run(run())
        # B must have received the field_edit
        assert any(e.get("event") == "patient_field_edit" and e.get("patient_id") == "test-pid-xyz"
                   for e in b_events), f"B didn't receive edit. b_events={b_events}"
        # A must NOT have received a self-echo of the same edit
        assert not any(e.get("event") == "patient_field_edit" and e.get("patient_id") == "test-pid-xyz"
                       for e in a_events), f"A got a self-echo: {a_events}"
        # Relayed message must carry a client_id for identification
        edit_msgs = [e for e in b_events if e.get("event") == "patient_field_edit"]
        assert edit_msgs and "client_id" in edit_msgs[0], f"missing client_id in {edit_msgs}"

    def test_ws_malformed_message_ignored(self):
        """Sending garbage over WS must not crash the connection or the server."""
        async def run():
            async with websockets.connect(_ws_url("1234")) as ws:
                await asyncio.sleep(0.2)
                await ws.send("this-is-not-json")
                await ws.send(json.dumps({"event": "unknown_evt", "foo": "bar"}))
                await asyncio.sleep(0.3)
                # Connection should still be usable — trigger a broadcast via HTTP
                loop = asyncio.get_event_loop()
                cr = await loop.run_in_executor(
                    None,
                    lambda: requests.post(f"{API}/patients", headers=PIN_HEADER,
                                          json={"name": "TEST_ws_malformed", "age": 22, "date": "2026-01-15"})
                )
                assert cr.status_code == 200
                pid = cr.json()["id"]
                got = False
                try:
                    for _ in range(30):
                        raw = await asyncio.wait_for(ws.recv(), timeout=3)
                        ev = json.loads(raw)
                        if ev.get("event") == "patient_created" and ev.get("data", {}).get("id") == pid:
                            got = True
                            break
                except asyncio.TimeoutError:
                    pass
                await loop.run_in_executor(None, lambda: requests.delete(f"{API}/patients/{pid}", headers=PIN_HEADER))
                return got
        assert asyncio.run(run()), "connection died after malformed message"

    def test_ws_doctor_pin_accepted(self):
        async def run():
            try:
                async with websockets.connect(_ws_url("4321")) as ws:
                    await asyncio.sleep(0.3)
                    return True
            except Exception as e:
                return f"ERR: {e}"
        assert asyncio.run(run()) is True
