import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "@/components/ui/toaster";
import { initiateCall, initiateAmbulanceCall, answerCall, endCall, sendSignal } from "@/api/incall.api";
import { getApiErrorMessage } from "@/utils/apiError";
import { WS_BASE } from "@/lib/wsBase";
import { CallContext, type CallTarget } from "./call-context";

// Stop ringing if nobody on the desk picks up within this window.
const RING_TIMEOUT_MS = 35_000;

// Public STUN + optional self-hosted TURN (needed to traverse strict NATs in prod).
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
if (import.meta.env.VITE_TURN_URL) {
  ICE_SERVERS.push({
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  });
}

type Phase = "idle" | "outgoing" | "incoming" | "ongoing";

export const CallProvider = ({ children }: { children: React.ReactNode }) => {
  const userId = useAuthStore((s) => s.user?.id);

  const [phase, setPhase] = useState<Phase>("idle");
  const [peerName, setPeerName] = useState<string>("");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  // Mirror phase into a ref so the signaling socket reads it without re-subscribing
  // (re-subscribing mid-call would drop SDP/ICE messages).
  const phaseRef = useRef<Phase>(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callIdRef = useRef<string | null>(null);
  const roleRef = useRef<"caller" | "callee" | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
    }
    pcRef.current = null;
    pendingOfferRef.current = null;
    pendingIceRef.current = [];
    callIdRef.current = null;
    roleRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setPhase("idle");
    setMuted(false);
    setSeconds(0);
    setPeerName("");
  }, []);

  const startTimer = () => {
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const hangup = useCallback(() => {
    const id = callIdRef.current;
    if (id) endCall(id).catch(() => {});
    cleanup();
  }, [cleanup]);

  const createPeer = useCallback((callId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal(callId, "ice", e.candidate.toJSON()).catch(() => {});
    };
    pc.ontrack = (e) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0];
        remoteAudioRef.current.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") hangup();
    };
    pcRef.current = pc;
    return pc;
  }, [hangup]);

  const addMic = useCallback(async (pc: RTCPeerConnection) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  }, []);

  const flushIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const c of pendingIceRef.current) {
      try { await pc.addIceCandidate(c); } catch { /* ignore */ }
    }
    pendingIceRef.current = [];
  }, []);

  // Caller starts a call to a hospital desk; the offer is created once someone on
  // duty answers (we don't know who that is until then).
  const startCall = useCallback(async (target: CallTarget, referralId?: string) => {
    if (phase !== "idle") {
      toast({ variant: "destructive", title: "You're already on a call" });
      return;
    }
    try {
      roleRef.current = "caller";
      const where = target.ambulanceId
        ? (target.ambulanceLabel || "Ambulance")
        : [target.unitName, target.facilityName].filter(Boolean).join(" · ");
      setPeerName(where || "Emergency desk");
      setPhase("outgoing");
      const call = target.ambulanceId
        ? await initiateAmbulanceCall({ ambulance_id: target.ambulanceId, referral_id: referralId })
        : await initiateCall({ facility_id: target.facilityId, unit_id: target.unitId, referral_id: referralId });
      callIdRef.current = call.id;
      // Don't ring forever if no one on the desk picks up.
      ringTimeoutRef.current = setTimeout(() => {
        if (phaseRef.current === "outgoing") {
          toast({ title: "No answer", description: "No one at the facility picked up." });
          hangup();
        }
      }, RING_TIMEOUT_MS);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not start the call",
        description: getApiErrorMessage(err, "Please try again."),
      });
      cleanup();
    }
  }, [phase, cleanup, hangup]);

  // Caller: a desk staffer answered — now set up media and send the offer.
  const beginCallerOffer = useCallback(async (answeredBy?: string) => {
    const id = callIdRef.current;
    if (!id || pcRef.current) return;
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    try {
      if (answeredBy) setPeerName(answeredBy);
      const pc = createPeer(id);
      await addMic(pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendSignal(id, "offer", offer);
      setPhase("ongoing");
      startTimer();
    } catch {
      toast({ variant: "destructive", title: "Could not connect the call", description: "Check microphone permission." });
      hangup();
    }
  }, [createPeer, addMic, hangup]);

  // Callee: apply the caller's offer and send back an answer.
  const consumeOffer = useCallback(async () => {
    const pc = pcRef.current;
    const offer = pendingOfferRef.current;
    if (!pc || !offer || pc.currentRemoteDescription) return;
    pendingOfferRef.current = null;
    const id = callIdRef.current;
    if (!id) return;
    await pc.setRemoteDescription(offer);
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await sendSignal(id, "answer", ans);
    await flushIce();
  }, [flushIce]);

  const answer = useCallback(async () => {
    const id = callIdRef.current;
    if (!id) return;
    try {
      await answerCall(id);
      const pc = createPeer(id);
      await addMic(pc);
      setPhase("ongoing");
      startTimer();
      await consumeOffer(); // in case the caller's offer already arrived
    } catch {
      toast({ variant: "destructive", title: "Could not answer", description: "Check microphone permission." });
      hangup();
    }
  }, [createPeer, addMic, consumeOffer, hangup]);

  // A desk staffer dismissing the ring just stops their own phone — others may still
  // answer, so there's no server-side decline.
  const decline = useCallback(() => cleanup(), [cleanup]);

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  // Signaling + call events over the per-user WebSocket channel.
  useEffect(() => {
    if (!userId || !WS_BASE) return;
    const ws = new WebSocket(`${WS_BASE}/ws/user:${userId}`);
    ws.onmessage = async (e) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(e.data); } catch { return; }
      const event = msg.event as string | undefined;
      if (!event?.startsWith("CALL_")) return;

      if (event === "CALL_INCOMING") {
        // Busy or already ringing another call — ignore; another on-duty staffer
        // can still pick up.
        if (phaseRef.current !== "idle") return;
        roleRef.current = "callee";
        callIdRef.current = msg.call_id as string;
        setPeerName((msg.caller_name as string) || "Unknown");
        setPhase("incoming");
        return;
      }
      if (msg.call_id !== callIdRef.current) return;

      if (event === "CALL_ANSWERED") {
        // Caller side: a desk staffer answered — start media + offer.
        await beginCallerOffer(msg.answered_by as string | undefined);
      } else if (event === "CALL_TAKEN") {
        // Callee side: another staffer took the call — stop ringing here.
        cleanup();
      } else if (event === "CALL_ENDED") {
        cleanup();
      } else if (event === "CALL_SIGNAL") {
        const kind = msg.kind as string;
        const data = msg.data as RTCSessionDescriptionInit & RTCIceCandidateInit;
        const pc = pcRef.current;
        if (kind === "offer") {
          // Callee receives the caller's offer.
          pendingOfferRef.current = data;
          if (pc) await consumeOffer();
        } else if (kind === "answer") {
          // Caller receives the callee's answer.
          if (pc) { await pc.setRemoteDescription(data); await flushIce(); }
        } else if (kind === "ice") {
          if (pc && pc.remoteDescription) { try { await pc.addIceCandidate(data); } catch { /* ignore */ } }
          else pendingIceRef.current.push(data);
        }
      }
    };
    return () => ws.close();
  }, [userId, cleanup, flushIce, beginCallerOffer, consumeOffer]);

  // Audible ring while a call is incoming — a short repeating beep via WebAudio so
  // the desk doesn't miss the silent overlay (no audio asset needed).
  useEffect(() => {
    if (phase !== "incoming") return;
    let ctx: AudioContext | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
      const beep = () => {
        if (!ctx || stopped) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 480;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.55);
      };
      beep();
      timer = setInterval(beep, 1500);
    } catch { /* audio unavailable — overlay still shows */ }
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      ctx?.close().catch(() => {});
    };
  }, [phase]);

  useEffect(() => () => cleanup(), [cleanup]);

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <CallContext.Provider value={{ startCall, busy: phase !== "idle" }}>
      {children}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {phase !== "idle" && (
        <div className="fixed bottom-4 right-4 z-[100] w-72 rounded-xl border bg-card p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              {phase === "incoming" ? <PhoneIncoming className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{peerName || "Call"}</p>
              <p className="text-xs text-muted-foreground">
                {phase === "incoming" && "Incoming voice call…"}
                {phase === "outgoing" && (
                  <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Calling…</span>
                )}
                {phase === "ongoing" && `In call · ${mmss}`}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            {phase === "incoming" && (
              <>
                <button onClick={decline} className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive text-white hover:brightness-110" aria-label="Decline">
                  <PhoneOff className="h-5 w-5" />
                </button>
                <button onClick={answer} className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white hover:brightness-110" aria-label="Answer">
                  <Phone className="h-5 w-5" />
                </button>
              </>
            )}
            {phase === "ongoing" && (
              <button onClick={toggleMute} className="flex h-10 w-10 items-center justify-center rounded-full border hover:bg-muted" aria-label={muted ? "Unmute" : "Mute"}>
                {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
            )}
            {(phase === "ongoing" || phase === "outgoing") && (
              <button onClick={hangup} className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive text-white hover:brightness-110" aria-label="Hang up">
                <PhoneOff className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
};
