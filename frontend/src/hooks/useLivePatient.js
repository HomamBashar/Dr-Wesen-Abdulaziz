import { useState, useEffect, useRef, useCallback } from "react";
import apiClient from "@/lib/api";

const emptyEye = () => ({
  va: "", sph: "", cyl: "", ax: "", bcva: "", near: "",
  ucva: "", iop: "", lid: "", cornea: "", lens: "", retina: "",
});

const emptyExam = () => ({
  right_eye: emptyEye(),
  left_eye: emptyEye(),
  notes: "",
  diagnosis: "",
  prescription: "",
  // Written by the secretary, read by both secretary and doctor. Never
  // printed. NOTE: doctor_private_note is intentionally NOT part of this
  // shared live-sync state — see DoctorPage for why.
  secretary_note: "",
});

/**
 * Live-synced patient exam hook.
 *
 * - Reads patient by id.
 * - `update(path, value)` updates local state, broadcasts via WS, and debounce-saves to backend.
 * - Applies incoming `patient_field_edit` WS events unless the field is currently focused
 *   locally (avoids overwriting what the user is typing).
 * - `setFocusedField(path)` — call on focus/blur to signal current edit field.
 */
export default function useLivePatient({ patient, sendWs }) {
  const [data, setData] = useState(emptyExam);
  const focusedRef = useRef(null);
  const saveTimerRef = useRef(null);
  const patientIdRef = useRef(patient?.id);

  // Load patient snapshot when patient changes
  useEffect(() => {
    patientIdRef.current = patient?.id;
    if (patient) {
      setData({
        right_eye: { ...emptyEye(), ...(patient.right_eye || {}) },
        left_eye: { ...emptyEye(), ...(patient.left_eye || {}) },
        notes: patient.notes || "",
        diagnosis: patient.diagnosis || "",
        prescription: patient.prescription || "",
        secretary_note: patient.secretary_note || "",
      });
    } else {
      setData(emptyExam());
    }
    // Deliberately re-run only when the selected patient changes (by id),
    // not on every re-render of the patient object itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id]);

  const setFocusedField = useCallback((path) => {
    focusedRef.current = path;
  }, []);

  // Schedule debounced save to server (400ms after last edit)
  const scheduleSave = useCallback((snapshot) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const pid = patientIdRef.current;
      if (!pid) return;
      try {
        await apiClient.put(`/patients/${pid}`, {
          right_eye: snapshot.right_eye,
          left_eye: snapshot.left_eye,
          notes: snapshot.notes,
          diagnosis: snapshot.diagnosis,
          prescription: snapshot.prescription,
          secretary_note: snapshot.secretary_note,
        });
      } catch (e) { /* silent */ }
    }, 400);
  }, []);

  /**
   * update("right_eye.va", "1.0")
   * update("prescription", "Rx text")
   */
  const update = useCallback((path, value) => {
    setData(prev => {
      const next = structuredClone(prev);
      const parts = path.split(".");
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = value;

      // Broadcast the edit immediately (per-keystroke)
      if (patientIdRef.current && sendWs) {
        sendWs({
          event: "patient_field_edit",
          patient_id: patientIdRef.current,
          path,
          value,
        });
      }
      scheduleSave(next);
      return next;
    });
  }, [sendWs, scheduleSave]);

  // Batch update (e.g. Normal button fills multiple fields at once)
  const updateMany = useCallback((updates) => {
    setData(prev => {
      const next = structuredClone(prev);
      updates.forEach(({ path, value }) => {
        const parts = path.split(".");
        let obj = next;
        for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
        obj[parts[parts.length - 1]] = value;
        if (patientIdRef.current && sendWs) {
          sendWs({
            event: "patient_field_edit",
            patient_id: patientIdRef.current,
            path, value,
          });
        }
      });
      scheduleSave(next);
      return next;
    });
  }, [sendWs, scheduleSave]);

  // Apply incoming WS edit from a peer
  const applyRemoteEdit = useCallback((patientId, path, value) => {
    if (patientId !== patientIdRef.current) return;
    // Don't overwrite the field the user is currently editing
    if (focusedRef.current === path) return;
    setData(prev => {
      const next = structuredClone(prev);
      const parts = path.split(".");
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) {
        if (obj[parts[i]] === undefined) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  }, []);

  return { data, setData, update, updateMany, setFocusedField, applyRemoteEdit };
}
