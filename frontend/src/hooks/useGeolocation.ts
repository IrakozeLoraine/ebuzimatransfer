import { useCallback, useEffect, useRef, useState } from "react";

export interface LivePosition {
  latitude: number;
  longitude: number;
  /** Accuracy radius in metres (95% confidence). */
  accuracy: number;
  /** Heading in degrees clockwise from true north, when the device reports it. */
  heading: number | null;
  /** Ground speed in m/s, when the device reports it. */
  speed: number | null;
  timestamp: number;
}

export interface GeolocationState {
  position: LivePosition | null;
  error: string | null;
  /** True once a watch is active (even before the first fix lands). */
  watching: boolean;
  /** Browser exposes the Geolocation API at all. */
  supported: boolean;
  /** Geolocation only works over HTTPS (or localhost). */
  secure: boolean;
  start: () => void;
  stop: () => void;
}

/**
 * Continuously tracks the *viewer's own* device position via the browser
 * Geolocation API — the live "blue dot" used to monitor yourself fleet-style on
 * the map. High-accuracy + a long-lived watch so the marker follows movement.
 */
export const useGeolocation = (): GeolocationState => {
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
  // Geolocation is gated to secure contexts; on plain HTTP browsers reject it.
  const secure = typeof window === "undefined" || window.isSecureContext;
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setWatching(false);
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      setError("Location isn't supported on this device.");
      return;
    }
    if (!secure) {
      setError("Location needs a secure (HTTPS) connection. Open this page over https:// to track yourself.");
      return;
    }
    setError(null);
    setWatching(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        setPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Allow location access in your browser to track yourself."
            : err.message || "Couldn't get your location."
        );
        // A denied permission won't recover on its own — release the watch.
        if (err.code === err.PERMISSION_DENIED) stop();
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );
  }, [supported, secure, stop]);

  // Always release the watch when the component using it unmounts.
  useEffect(() => () => stop(), [stop]);

  return { position, error, watching, supported, secure, start, stop };
};
