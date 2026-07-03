"""Voice-dictated referrals — fully open-source and offline.

A clinician speaks the referral; this service turns that recording into a filled
form. Three stages, each independently degradable so the feature still works
before every piece is configured:

1. Transcribe  — self-hosted Whisper (faster-whisper). Always available.
2. Extract     — a local Ollama model pulls structured form fields + a short
                 summary from the transcript using JSON-schema-constrained output,
                 which guarantees parseable JSON. Skipped (empty fields) if Ollama
                 is unreachable.
3. Store       — the recording is written to the local filesystem and served back
                 by the API so the receiving clinic can play it.

No paid services, no API keys, no network egress: Whisper and Ollama both run on
your own machine. The clinician always reviews and corrects the extracted fields
before submitting, so extraction is a convenience, never the source of truth.
"""
from __future__ import annotations

import io
import json
import logging
import os
import re
import uuid
from functools import lru_cache
from typing import Optional

import anyio
import httpx

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.schemas.referral import (
    DictationFields,
    DictationResult,
    TransportMonitoringResult,
    MonitoringVitalRow,
    MonitoringProblemRow,
)

logger = logging.getLogger(__name__)

# Audio is stored under <MEDIA_ROOT>/<subdir> and served at the matching URL prefix
# (the prefix matches the API router so the dev proxy and prod origin both route it).
# Clinician referral dictations and ambulance transport-monitoring recordings are
# kept in separate subdirs.
_AUDIO_URL_PREFIX = "/api/v1/referrals/audio"
_AUDIO_SUBDIR = "referrals"
_MONITORING_URL_PREFIX = "/api/v1/referrals/monitoring-audio"
_MONITORING_SUBDIR = "monitoring"
# Stored filenames are "<uuid hex>.<ext>" — used to validate download requests.
_SAFE_FILENAME = re.compile(r"^[0-9a-f]{32}\.[a-z0-9]{1,5}$")

# Allowed values for the constrained form fields. The model is asked to use these
# verbatim; anything it returns that isn't a member is dropped (left blank) so a
# mishearing can't smuggle an invalid value into the form.
_SEXES = {"M", "F"}

# JSON schema the model must fill. Ollama constrains decoding to this schema, so
# the response is always a complete, parseable object; unknown values come back
# as "" / false and are cleaned up below.
_EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "patient_code": {"type": "string"},
        "sex": {"type": "string"},
        "diagnosis": {"type": "string"},
        "reason_for_transfer": {"type": "string"},
    },
    "required": [
        "summary", "patient_code", "sex", "diagnosis", "reason_for_transfer",
    ],
}

_EXTRACTION_SYSTEM = (
    "You are a clinical scribe for an ICU/HDU patient-transfer system in Rwanda. "
    "You are given a verbatim transcript of a referring clinician dictating a "
    "transfer request. Extract the structured fields and write a concise summary. "
    "Rules:\n"
    "- Only use information stated in the transcript. Never invent a patient code, "
    "diagnosis, or vital. If something wasn't said, leave that field empty (\"\") "
    "or false.\n"
    "- sex must be \"M\" or \"F\", else \"\".\n"
    "- summary: 1-3 sentences a receiving clinician can read at a glance — who the "
    "patient is, the key clinical problem, and why transfer is needed. Plain text."
)


# --- Patient Monitoring Transfer Form (driver voice during transport) ----------

# Schema the model fills from the driver's spoken monitoring log. Both lists are
# free-text per cell so the driver can speak readings naturally ("at 10:30, BP
# 120 over 80, sats 95…").
_MONITORING_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "vital_signs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "time": {"type": "string"},
                    "bp": {"type": "string"},
                    "temp": {"type": "string"},
                    "spo2": {"type": "string"},
                    "rr": {"type": "string"},
                    "pulse": {"type": "string"},
                    "fhr": {"type": "string"},
                    "membranes_ruptured": {"type": "string"},
                },
                "required": ["time", "bp", "temp", "spo2", "rr", "pulse", "fhr", "membranes_ruptured"],
            },
        },
        "problems": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "problem": {"type": "string"},
                    "management": {"type": "string"},
                },
                "required": ["problem", "management"],
            },
        },
    },
    "required": ["summary", "vital_signs", "problems"],
}

_MONITORING_SYSTEM = (
    "You are a scribe for an ambulance patient-transfer system in Rwanda. You are "
    "given a verbatim transcript of an ambulance driver/attendant dictating the "
    "Patient Monitoring Transfer Form while transporting a patient. Extract the "
    "monitoring log. Rules:\n"
    "- Only use information stated in the transcript. Never invent a reading. If a "
    "value wasn't said, leave that field empty (\"\").\n"
    "- vital_signs: one object per set of readings taken (vitals are recorded about "
    "every 30 minutes). Fill time, bp, temp (T°), spo2 (SpO2), rr, pulse. fhr and "
    "membranes_ruptured apply only if the patient is a woman in labour, else \"\".\n"
    "- problems: one object per problem encountered during transport, with how it "
    "was managed. Empty list if none were mentioned.\n"
    "- summary: 1-2 plain-text sentences on how the patient was during transport."
)


@lru_cache(maxsize=1)
def _whisper_model():
    """Load the Whisper model once, on first use (lazy so import stays cheap and the
    model download doesn't happen at server boot)."""
    from faster_whisper import WhisperModel

    logger.info("Loading Whisper model '%s' (cpu/int8)…", settings.WHISPER_MODEL_SIZE)
    return WhisperModel(settings.WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")


def _transcribe_sync(audio_bytes: bytes) -> str:
    model = _whisper_model()
    # faster-whisper accepts a binary file-like object; PyAV decodes webm/opus
    # (what the browser MediaRecorder produces) without a system ffmpeg.
    segments, _info = model.transcribe(io.BytesIO(audio_bytes), beam_size=5)
    return " ".join(seg.text.strip() for seg in segments).strip()


def media_dir(subdir: str = _AUDIO_SUBDIR) -> str:
    path = os.path.join(settings.MEDIA_ROOT, subdir)
    os.makedirs(path, exist_ok=True)
    return path


def audio_path(filename: str, subdir: str = _AUDIO_SUBDIR) -> Optional[str]:
    """Resolve a stored audio filename to its on-disk path, or None if the name
    fails validation (guards against path traversal)."""
    if not _SAFE_FILENAME.match(filename):
        return None
    return os.path.join(media_dir(subdir), filename)


def monitoring_audio_path(filename: str) -> Optional[str]:
    """On-disk path for a stored transport-monitoring recording."""
    return audio_path(filename, _MONITORING_SUBDIR)


def _store_audio_sync(
    audio_bytes: bytes, ext: str, subdir: str = _AUDIO_SUBDIR, url_prefix: str = _AUDIO_URL_PREFIX
) -> str:
    filename = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(media_dir(subdir), filename), "wb") as fh:
        fh.write(audio_bytes)
    return f"{url_prefix}/{filename}"


def _safe_ext(filename: str) -> str:
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "webm").lower()
    return ext if re.fullmatch(r"[a-z0-9]{1,5}", ext) else "webm"


def _clean_enum(value: Optional[str], allowed: set[str]) -> Optional[str]:
    if not value:
        return None
    if value.strip() in allowed:
        return value.strip()
    v = value.strip().upper().replace(" ", "_")
    return v if v in allowed else None


# Cap how many form fields we ask the model to fill in one pass, to bound the
# schema/prompt size on the largest forms.
_MAX_FORM_FIELDS = 120


class DictationService:
    async def transcribe_to_form(
        self, audio_bytes: bytes, filename: str, form_spec: Optional[list] = None
    ) -> DictationResult:
        if not audio_bytes:
            raise ValidationError("No audio was received")

        # Whisper transcription is CPU-bound and blocking — keep the event loop free.
        transcript = await anyio.to_thread.run_sync(_transcribe_sync, audio_bytes)
        if not transcript:
            raise ValidationError(
                "Could not make out any speech in the recording — please try again"
            )

        summary, fields = await self._extract(transcript)
        form_data = await self._extract_form_data(transcript, form_spec) if form_spec else {}

        # Keep the recording so the receiving clinic can listen.
        audio_url = await anyio.to_thread.run_sync(
            _store_audio_sync, audio_bytes, _safe_ext(filename)
        )

        return DictationResult(
            audio_url=audio_url,
            transcript=transcript,
            summary=summary,
            fields=fields,
            form_data=form_data,
        )

    async def _extract_form_data(self, transcript: str, spec: list) -> dict:
        """Fill the chosen MoH form's fields from the transcript. ``spec`` is the
        frontend's compact field list ({name, label, kind, options?}). Best-effort:
        an Ollama/parse failure returns {} so dictation still prefills the core
        fields. The clinician reviews every value before submitting."""
        fields = [f for f in spec if isinstance(f, dict) and f.get("name")][:_MAX_FORM_FIELDS]
        if not fields:
            return {}

        # Format hints so date/time values come back in the exact shapes the form
        # inputs accept (otherwise they're extracted but won't autofill).
        _FORMAT_HINT = {
            "date": " (format strictly as YYYY-MM-DD)",
            "time": " (format strictly as HH:MM, 24-hour)",
            "datetime": " (format strictly as YYYY-MM-DDTHH:MM, 24-hour)",
        }
        properties: dict = {}
        lines: list[str] = []
        for f in fields:
            name, kind = f["name"], f.get("kind", "text")
            if kind == "boolean":
                properties[name] = {"type": "boolean"}
            elif kind == "multi":
                properties[name] = {"type": "array", "items": {"type": "string"}}
            else:
                properties[name] = {"type": "string"}
            opts = f.get("options")
            opt_hint = f" (one of: {', '.join(opts)})" if isinstance(opts, list) and opts else ""
            lines.append(f"- {name}: {f.get('label', name)}{opt_hint}{_FORMAT_HINT.get(kind, '')}")

        schema = {"type": "object", "properties": properties, "required": list(properties)}
        system = (
            "You are a clinical scribe for a patient-transfer system in Rwanda. You "
            "are given a verbatim transcript of a clinician dictating a transfer form, "
            "and a list of fields to fill. Extract each field's value from the "
            "transcript. Rules:\n"
            "- Only use information stated in the transcript. If a field wasn't "
            "mentioned, leave it empty (\"\" / false / []).\n"
            "- For fields with a listed set of options, use exactly one of those "
            "options.\n"
            "- For boolean fields, true only if explicitly stated.\n"
            "- For array (multi-select) fields, return the subset of the listed "
            "options that apply.\n"
            "- For date/time fields, output exactly the format noted in parentheses "
            "(e.g. dates as YYYY-MM-DD); resolve relative dates against the transcript "
            "if stated, else leave empty.\n\nFields:\n" + "\n".join(lines)
        )

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{settings.OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": settings.OLLAMA_MODEL,
                        "stream": False,
                        "format": schema,
                        "options": {"temperature": 0},
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": f"Transcript:\n\n{transcript}"},
                        ],
                    },
                )
                resp.raise_for_status()
                content = resp.json().get("message", {}).get("content", "")
        except Exception:
            logger.exception("Transfer-form field extraction (Ollama) failed")
            return {}

        try:
            data = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            logger.warning("Form extraction returned non-JSON output")
            return {}
        if not isinstance(data, dict):
            return {}

        # Keep only meaningful values: non-empty strings, true booleans, non-empty
        # lists — so unmentioned fields don't overwrite the form with blanks/falses.
        out: dict = {}
        for f in fields:
            name = f["name"]
            v = data.get(name)
            if isinstance(v, str):
                if v.strip():
                    out[name] = v.strip()
            elif isinstance(v, bool):
                if v:
                    out[name] = True
            elif isinstance(v, list):
                cleaned = [str(x).strip() for x in v if str(x).strip()]
                if cleaned:
                    out[name] = cleaned
            elif isinstance(v, (int, float)):
                out[name] = str(v)
        return out

    async def transcribe_monitoring(self, audio_bytes: bytes, filename: str) -> TransportMonitoringResult:
        """Turn the driver's spoken monitoring log into the structured Patient
        Monitoring Transfer Form. Same pipeline as a referral dictation: transcribe,
        extract (best-effort), and keep the recording."""
        if not audio_bytes:
            raise ValidationError("No audio was received")

        transcript = await anyio.to_thread.run_sync(_transcribe_sync, audio_bytes)
        if not transcript:
            raise ValidationError(
                "Could not make out any speech in the recording — please try again"
            )

        summary, vital_signs, problems = await self._extract_monitoring(transcript)
        audio_url = await anyio.to_thread.run_sync(
            _store_audio_sync, audio_bytes, _safe_ext(filename), _MONITORING_SUBDIR, _MONITORING_URL_PREFIX
        )
        return TransportMonitoringResult(
            audio_url=audio_url,
            transcript=transcript,
            summary=summary,
            vital_signs=vital_signs,
            problems=problems,
        )

    async def _extract_monitoring(
        self, transcript: str
    ) -> tuple[str, list[MonitoringVitalRow], list[MonitoringProblemRow]]:
        """Pull the monitoring summary, vitals and problems from the transcript via
        Ollama. Degrades to transcript-only (empty lists) if Ollama is unreachable."""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{settings.OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": settings.OLLAMA_MODEL,
                        "stream": False,
                        "format": _MONITORING_SCHEMA,
                        "options": {"temperature": 0},
                        "messages": [
                            {"role": "system", "content": _MONITORING_SYSTEM},
                            {"role": "user", "content": f"Transcript:\n\n{transcript}"},
                        ],
                    },
                )
                resp.raise_for_status()
                content = resp.json().get("message", {}).get("content", "")
        except Exception:
            logger.exception("Transport monitoring extraction (Ollama) failed")
            return "", [], []

        try:
            data = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            logger.warning("Monitoring extraction returned non-JSON output")
            return "", [], []

        def _rows(key: str, model, fields: tuple[str, ...]) -> list:
            out = []
            for raw in data.get(key) or []:
                if not isinstance(raw, dict):
                    continue
                vals = {f: (str(raw.get(f)).strip() if raw.get(f) not in (None, "") else None) for f in fields}
                if any(v for v in vals.values()):
                    out.append(model(**vals))
            return out

        vital_signs = _rows(
            "vital_signs", MonitoringVitalRow,
            ("time", "bp", "temp", "spo2", "rr", "pulse", "fhr", "membranes_ruptured"),
        )
        problems = _rows("problems", MonitoringProblemRow, ("problem", "management"))
        summary = data.get("summary")
        summary = summary.strip() if isinstance(summary, str) else ""
        return summary, vital_signs, problems

    async def _extract(self, transcript: str) -> tuple[str, DictationFields]:
        """Pull structured fields + a summary from the transcript via a local Ollama
        model. If Ollama is unreachable, degrade to transcript-only (empty fields)."""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{settings.OLLAMA_BASE_URL}/api/chat",
                    json={
                        "model": settings.OLLAMA_MODEL,
                        "stream": False,
                        # JSON-schema-constrained decoding → always-valid JSON.
                        "format": _EXTRACTION_SCHEMA,
                        "options": {"temperature": 0},
                        "messages": [
                            {"role": "system", "content": _EXTRACTION_SYSTEM},
                            {"role": "user", "content": f"Transcript:\n\n{transcript}"},
                        ],
                    },
                )
                resp.raise_for_status()
                content = resp.json().get("message", {}).get("content", "")
        except Exception:
            # Extraction is best-effort — an Ollama/network failure shouldn't sink
            # the whole dictation. The clinician still gets the transcript to work from.
            logger.exception("Referral field extraction (Ollama) failed")
            return "", DictationFields()

        try:
            data = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            logger.warning("Extraction returned non-JSON output")
            return "", DictationFields()

        def s(key: str) -> Optional[str]:
            val = data.get(key)
            return val.strip() if isinstance(val, str) and val.strip() else None

        fields = DictationFields(
            patient_code=s("patient_code"),
            sex=_clean_enum(s("sex"), _SEXES),
            diagnosis=s("diagnosis"),
            reason_for_transfer=s("reason_for_transfer"),
        )
        return s("summary") or "", fields
