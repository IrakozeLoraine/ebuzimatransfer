import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, RotateCcw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranscribeReferral } from "@/hooks/useReferrals";
import type { DictationResult } from "@/types/referral";

type Phase = "idle" | "recording" | "processing" | "done" | "error";

/** Pick a recording MIME type the current browser supports (Safari lacks webm). */
const pickMimeType = (): string | undefined => {
  const candidates = ["audio/webm", "audio/webm;codecs=opus", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

interface Props {
  /** Called with the transcription result once processing succeeds. */
  onResult: (result: DictationResult) => void;
  /** The chosen MoH form's field list, so dictation also fills form-specific fields. */
  formSpec?: unknown;
  disabled?: boolean;
}

/**
 * Records the clinician dictating a referral, sends it for transcription +
 * field extraction, and hands the result to the parent form to prefill. The
 * recorded clip is also kept locally for immediate playback/review.
 */
export const DictationPanel = ({ onResult, formSpec, disabled }: Props) => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { mutate: transcribe } = useTranscribeReferral();

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  // Clean up the stream and any object URL on unmount.
  useEffect(() => {
    return () => {
      stopTracks();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    setErrorMsg(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setSummary(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        process(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setPhase("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setErrorMsg("Microphone access was denied. Allow it in your browser to dictate.");
      setPhase("error");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    stopTracks();
  };

  const process = (blob: Blob) => {
    setPhase("processing");
    transcribe({ audio: blob, formSpec }, {
      onSuccess: (result) => {
        setSummary(result.summary || null);
        setPhase("done");
        onResult(result);
      },
      onError: () => {
        setErrorMsg("Couldn't process the recording. Please try again.");
        setPhase("error");
      },
    });
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Dictate the referral</p>
            <p className="text-xs text-muted-foreground">
              Speak the patient details, the reason for transfer, and the form's clinical fields
              (vitals, findings, history…). We'll transcribe it, fill the matching fields below. Review before submitting.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {phase === "idle" && (
            <Button type="button" size="sm" onClick={startRecording} disabled={disabled}>
              <Mic className="mr-1.5 h-4 w-4" /> Start recording
            </Button>
          )}

          {phase === "recording" && (
            <>
              <Button type="button" size="sm" variant="destructive" onClick={stopRecording}>
                <Square className="mr-1.5 h-3.5 w-3.5" /> Stop
              </Button>
              <span className="flex items-center gap-2 text-sm font-medium text-destructive">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                Recording… {fmt(seconds)}
              </span>
            </>
          )}

          {phase === "processing" && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Transcribing and filling the form…
            </span>
          )}

          {(phase === "done" || phase === "error") && (
            <Button type="button" size="sm" variant="outline" onClick={startRecording} disabled={disabled}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Record again
            </Button>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" /> {errorMsg}
          </div>
        )}

        {audioUrl && phase !== "recording" && (
          <audio controls src={audioUrl} className="w-full" />
        )}

        {phase === "done" && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <p className="font-medium">Form prefilled from your dictation — please review and correct below.</p>
            {summary && <p className="mt-1 text-emerald-700">{summary}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
