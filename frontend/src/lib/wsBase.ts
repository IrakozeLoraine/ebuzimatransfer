// Base URL for WebSocket connections.
//
// In local dev, VITE_WS_BASE_URL points at the backend (e.g. ws://127.0.0.1:8000).
// In production the value is intentionally absent (the `.env` files are excluded
// from the Docker build), so we derive the base from the current page origin.
// This makes the same build work over both HTTP (ws://) and HTTPS (wss://)
// behind Nginx, with no per-environment rebuild.
export const WS_BASE =
  import.meta.env.VITE_WS_BASE_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
    : "");
