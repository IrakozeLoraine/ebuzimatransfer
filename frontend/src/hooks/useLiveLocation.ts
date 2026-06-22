import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { reportPing } from "@/api/ambulance.api";
import { getApiErrorMessage } from "@/utils/apiError";

interface Coords {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two points, in metres. */
const distanceM = (a: Coords, b: Coords): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
};

interface Options {
  /** Hard floor between reported pings (ms). */
  minIntervalMs?: number;
  /** Minimum movement before a new ping is reported (m) — filters GPS jitter. */
  minDistanceM?: number;
}

/**
 * Continuously streams the device's GPS position as ambulance pings for a
 * referral while {@link active}. Throttled by both a minimum interval and a
 * minimum distance moved so we don't flood the backend on a stationary or
 * jittery fix.
 */
export const useLiveLocationShare = (
  referralId: string | undefined,
  { minIntervalMs = 8_000, minDistanceM = 25 }: Options = {}
) => {
  const qc = useQueryClient();
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const watchId = useRef<number | null>(null);
  const lastPos = useRef<Coords | null>(null);
  const lastTime = useRef(0);
  const inFlight = useRef(false);

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setActive(false);
  }, []);

  const send = useCallback(
    async (lat: number, lng: number) => {
      if (!referralId || inFlight.current) return;
      inFlight.current = true;
      setSending(true);
      try {
        await reportPing(referralId, { latitude: lat, longitude: lng });
        lastPos.current = { lat, lng };
        lastTime.current = Date.now();
        setLastSentAt(Date.now());
        qc.invalidateQueries({ queryKey: ["ambulance-track", referralId] });
      } catch (e) {
        setError(getApiErrorMessage(e));
      } finally {
        inFlight.current = false;
        setSending(false);
      }
    },
    [referralId, qc]
  );

  const start = useCallback(() => {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not available in this browser.");
      return;
    }
    if (watchId.current !== null) return;
    setActive(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const first = lastPos.current === null;
        const elapsed = Date.now() - lastTime.current;
        const moved = first
          ? Infinity
          : distanceM(lastPos.current as Coords, { lat: latitude, lng: longitude });
        // Hard rate limit, then skip near-stationary fixes.
        if (!first && elapsed < minIntervalMs) return;
        if (!first && moved < minDistanceM) return;
        void send(latitude, longitude);
      },
      (err) => setError(err.message || "Could not read your location."),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 }
    );
  }, [send, minIntervalMs, minDistanceM]);

  // Stop the watch when the consumer unmounts.
  useEffect(() => stop, [stop]);

  return { active, error, lastSentAt, sending, start, stop };
};
