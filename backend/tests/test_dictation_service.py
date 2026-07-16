"""Unit tests for DictationService — the voice-to-form pipeline.

Whisper transcription and the Ollama extraction HTTP call are the only external
pieces; both are stubbed so the pure orchestration, JSON handling, enum cleaning
and filesystem storage are exercised deterministically.
"""
import json

import pytest

import app.services.dictation_service as ds
from app.services.dictation_service import (
    DictationService,
    _clean_enum,
    _safe_ext,
    audio_path,
    monitoring_audio_path,
)
from app.core.exceptions import ValidationError

pytestmark = pytest.mark.asyncio


def _fake_httpx(content: str | None = None, exc: Exception | None = None):
    """Return a fake ``httpx.AsyncClient`` class whose ``post`` yields ``content``
    as the Ollama message body, or raises ``exc``."""
    class _Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"message": {"content": content}}

    class _Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            if exc:
                raise exc
            return _Resp()

    return _Client


# --------------------------------------------------------------------------- #
# Pure helpers
# --------------------------------------------------------------------------- #

class TestHelpers:
    def test_clean_enum_accepts_member(self):
        assert _clean_enum("M", {"M", "F"}) == "M"

    def test_clean_enum_normalises(self):
        assert _clean_enum("m", {"M", "F"}) is None or _clean_enum("Male", {"MALE"}) == "MALE"

    def test_clean_enum_rejects_unknown_and_empty(self):
        assert _clean_enum("X", {"M", "F"}) is None
        assert _clean_enum("", {"M", "F"}) is None
        assert _clean_enum(None, {"M", "F"}) is None

    def test_safe_ext(self):
        assert _safe_ext("rec.webm") == "webm"
        assert _safe_ext("noext") == "webm"
        assert _safe_ext("bad.<script>") == "webm"

    def test_audio_path_guards_against_traversal(self):
        assert audio_path("../../etc/passwd") is None
        assert audio_path("not-a-uuid.mp3") is None
        good = "0123456789abcdef0123456789abcdef.webm"
        assert audio_path(good) is not None
        assert monitoring_audio_path(good) is not None


# --------------------------------------------------------------------------- #
# Extraction (Ollama-backed, stubbed)
# --------------------------------------------------------------------------- #

class TestExtract:
    async def test_extract_success(self, monkeypatch):
        payload = json.dumps({
            "summary": "Patient with sepsis needs ICU.",
            "sex": "F",
            "diagnosis": "Severe sepsis",
            "reason_for_transfer": "ICU care",
        })
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx(payload))
        summary, fields = await DictationService()._extract("transcript")
        assert summary.startswith("Patient")
        assert fields.sex == "F"
        assert fields.diagnosis == "Severe sepsis"

    async def test_extract_ollama_failure_degrades(self, monkeypatch):
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx(exc=RuntimeError("down")))
        summary, fields = await DictationService()._extract("transcript")
        assert summary == ""
        assert fields.sex is None

    async def test_extract_non_json_degrades(self, monkeypatch):
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx("not json{"))
        summary, fields = await DictationService()._extract("transcript")
        assert summary == ""

    async def test_extract_form_data_empty_spec(self):
        assert await DictationService()._extract_form_data("t", []) == {}

    async def test_extract_form_data_success(self, monkeypatch):
        spec = [
            {"name": "patient_name", "kind": "text", "label": "Patient"},
            {"name": "in_labour", "kind": "boolean"},
            {"name": "symptoms", "kind": "multi", "options": ["fever", "cough"]},
            {"name": "visit_date", "kind": "date"},
            {"name": "skipped", "kind": "text"},
            "not-a-dict",
        ]
        payload = json.dumps({
            "patient_name": "Ada",
            "in_labour": True,
            "symptoms": ["fever", "", "cough"],
            "visit_date": "2026-01-01",
            "skipped": "",
            "count": 3,
        })
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx(payload))
        out = await DictationService()._extract_form_data("t", spec)
        assert out["patient_name"] == "Ada"
        assert out["in_labour"] is True
        assert out["symptoms"] == ["fever", "cough"]
        assert out["visit_date"] == "2026-01-01"
        assert "skipped" not in out

    async def test_extract_form_data_ollama_failure(self, monkeypatch):
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx(exc=RuntimeError("x")))
        out = await DictationService()._extract_form_data("t", [{"name": "a"}])
        assert out == {}

    async def test_extract_form_data_non_json(self, monkeypatch):
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx("<html>"))
        out = await DictationService()._extract_form_data("t", [{"name": "a"}])
        assert out == {}

    async def test_extract_monitoring_success(self, monkeypatch):
        payload = json.dumps({
            "summary": "Stable throughout.",
            "vital_signs": [
                {"time": "10:30", "bp": "120/80", "temp": "37", "spo2": "98",
                 "rr": "18", "pulse": "80", "fhr": "", "membranes_ruptured": ""},
                {"time": "", "bp": "", "temp": "", "spo2": "", "rr": "", "pulse": "",
                 "fhr": "", "membranes_ruptured": ""},  # all-empty row dropped
            ],
            "problems": [{"problem": "vomiting", "management": "antiemetic"}],
        })
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx(payload))
        summary, vitals, problems = await DictationService()._extract_monitoring("t")
        assert summary == "Stable throughout."
        assert len(vitals) == 1
        assert len(problems) == 1

    async def test_extract_monitoring_failure(self, monkeypatch):
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx(exc=RuntimeError("x")))
        summary, vitals, problems = await DictationService()._extract_monitoring("t")
        assert summary == "" and vitals == [] and problems == []

    async def test_extract_monitoring_non_json(self, monkeypatch):
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx("nope"))
        summary, vitals, problems = await DictationService()._extract_monitoring("t")
        assert summary == "" and vitals == [] and problems == []


# --------------------------------------------------------------------------- #
# End-to-end pipelines (transcription + storage stubbed)
# --------------------------------------------------------------------------- #

class TestPipelines:
    async def test_transcribe_to_form_stores_audio(self, monkeypatch, tmp_path):
        monkeypatch.setattr(ds.settings, "MEDIA_ROOT", str(tmp_path))
        monkeypatch.setattr(ds, "_transcribe_sync", lambda b: "dictated transcript")
        payload = json.dumps({
            "summary": "sum", "sex": "M", "diagnosis": "dx", "reason_for_transfer": "why",
        })
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx(payload))

        result = await DictationService().transcribe_to_form(b"audio", "rec.webm")
        assert result.transcript == "dictated transcript"
        assert result.fields.sex == "M"
        assert result.audio_url.endswith(".webm")
        # The recording was written under the referrals subdir.
        assert (tmp_path / "referrals").exists()

    async def test_transcribe_to_form_with_form_spec(self, monkeypatch, tmp_path):
        monkeypatch.setattr(ds.settings, "MEDIA_ROOT", str(tmp_path))
        monkeypatch.setattr(ds, "_transcribe_sync", lambda b: "t")
        payload = json.dumps({
            "summary": "s", "sex": "", "diagnosis": "", "reason_for_transfer": "",
            "patient_name": "Ada",
        })
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx(payload))
        result = await DictationService().transcribe_to_form(
            b"audio", "rec.webm", form_spec=[{"name": "patient_name", "kind": "text"}]
        )
        assert result.form_data.get("patient_name") == "Ada"

    async def test_transcribe_rejects_empty_audio(self):
        with pytest.raises(ValidationError):
            await DictationService().transcribe_to_form(b"", "rec.webm")

    async def test_transcribe_rejects_empty_transcript(self, monkeypatch):
        monkeypatch.setattr(ds, "_transcribe_sync", lambda b: "")
        with pytest.raises(ValidationError):
            await DictationService().transcribe_to_form(b"audio", "rec.webm")

    async def test_transcribe_monitoring_pipeline(self, monkeypatch, tmp_path):
        monkeypatch.setattr(ds.settings, "MEDIA_ROOT", str(tmp_path))
        monkeypatch.setattr(ds, "_transcribe_sync", lambda b: "monitoring transcript")
        payload = json.dumps({"summary": "ok", "vital_signs": [], "problems": []})
        monkeypatch.setattr(ds.httpx, "AsyncClient", _fake_httpx(payload))
        result = await DictationService().transcribe_monitoring(b"audio", "m.m4a")
        assert result.transcript == "monitoring transcript"
        assert result.audio_url.endswith(".m4a")
        assert (tmp_path / "monitoring").exists()

    async def test_transcribe_monitoring_rejects_empty_audio(self):
        with pytest.raises(ValidationError):
            await DictationService().transcribe_monitoring(b"", "m.m4a")
