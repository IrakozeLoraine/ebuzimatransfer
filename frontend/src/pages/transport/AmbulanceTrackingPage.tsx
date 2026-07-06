import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { getAmbulanceTrack } from "@/api/ambulance.api";
import { useAmbulanceWebSocket } from "@/hooks/useWebSocket";
import { useGeolocation } from "@/hooks/useGeolocation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/utils/format";
import { Ambulance, Play, RotateCcw, LocateFixed, LocateOff, ArrowLeft } from "lucide-react";
import type { LatLngExpression, LatLngBoundsExpression } from "leaflet";

/** Pans the map to follow a position (used while replaying a journey). */
const RecenterMap = ({ position }: { position: LatLngExpression | null }) => {
  const map = useMap();
  useEffect(() => {
    if (position) map.panTo(position);
  }, [position, map]);
  return null;
};

const formatDuration = (ms: number): string => {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
};

type Pt = [number, number];

// Cumulative along-path distances (metres) at each vertex, so the marker can be
// placed by a 0→1 fraction of the whole trail (smooth motion, not vertex hops).
const cumulativeDistances = (path: Pt[]): number[] => {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + L.latLng(path[i - 1]).distanceTo(L.latLng(path[i])));
  }
  return cum;
};

// The point a fraction ``t`` (0→1) of the way along the path, interpolated within
// whichever segment ``t`` lands in.
const pointAtFraction = (path: Pt[], cum: number[], t: number): Pt => {
  if (path.length === 0) return [0, 0];
  if (path.length === 1) return path[0];
  const total = cum[cum.length - 1];
  if (total === 0) return path[0];
  const target = Math.max(0, Math.min(1, t)) * total;
  let i = 1;
  while (i < cum.length && cum[i] < target) i++;
  if (i >= cum.length) return path[path.length - 1];
  const span = cum[i] - cum[i - 1];
  const f = span > 0 ? (target - cum[i - 1]) / span : 0;
  const a = path[i - 1];
  const b = path[i];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
};

// The path up to fraction ``t`` — the traveled trail drawn behind the marker.
const sliceAtFraction = (path: Pt[], cum: number[], t: number): Pt[] => {
  if (path.length < 2) return path;
  const total = cum[cum.length - 1];
  const target = Math.max(0, Math.min(1, t)) * total;
  const out: Pt[] = [path[0]];
  for (let i = 1; i < cum.length && cum[i] < target; i++) out.push(path[i]);
  out.push(pointAtFraction(path, cum, t));
  return out;
};

// Vite-bundled marker assets (Leaflet's defaults point at relative paths that
// break under bundlers).
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const ambulanceIcon = L.divIcon({
  className: "",
  html: `<div style="background:#dc2626;color:white;border-radius:9999px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px white,0 1px 4px rgba(0,0,0,.4);font-size:18px">🚑</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Endpoint pins drawn as self-contained HTML (no image assets) so they always render
// — Leaflet's default PNG marker can fail to load under the bundler.
const endpointIcon = (bg: string, glyph: string) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${bg};color:white;border-radius:9999px 9999px 9999px 2px;width:28px;height:28px;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px white,0 1px 4px rgba(0,0,0,.4)">
      <span style="transform:rotate(45deg);font-size:14px;line-height:1">${glyph}</span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });

const originIcon = endpointIcon("#475569", "🏥");
const destinationIcon = endpointIcon("#059669", "🏥");

// The viewer's own live position — a pulsing blue "you are here" dot.
const myLocationIcon = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:18px;height:18px">
    <span style="position:absolute;inset:0;border-radius:9999px;background:#2563eb;opacity:.3;animation:ping 1.4s cubic-bezier(0,0,.2,1) infinite"></span>
    <span style="position:absolute;inset:4px;border-radius:9999px;background:#2563eb;box-shadow:0 0 0 2px white,0 1px 3px rgba(0,0,0,.4)"></span>
  </div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const RWANDA_CENTER: LatLngExpression = [-1.9403, 29.8739];

export const AmbulanceTrackingPage = () => {
  const { id: referralId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useAmbulanceWebSocket(referralId);

  // The viewer's own live device location (fleet-style self-tracking). When active
  // the map follows the blue dot, unless the user is replaying the journey.
  const {
    position: myPosition,
    error: geoError,
    watching: trackingMe,
    supported: geoSupported,
    start: startMyLocation,
    stop: stopMyLocation,
  } = useGeolocation();

  const { data: track, isLoading } = useQuery({
    queryKey: ["ambulance-track", referralId],
    queryFn: () => getAmbulanceTrack(referralId as string),
    enabled: !!referralId,
    // WS invalidates on each ping; this is a fallback if the socket drops.
    refetchInterval: 20_000,
  });

  const pings = useMemo(() => track?.pings ?? [], [track?.pings]);

  // Planned road route (origin → destination) from OSRM, drawn under the trail.
  const plannedRoute = useMemo<LatLngExpression[]>(
    () => (track?.route ?? []).map(([lat, lng]) => [lat, lng]),
    [track?.route]
  );

  // The trail plotted straight from the reported GPS coordinates — the exact path the
  // phone reported, not snapped to roads, so every movement shows (even off-road). This
  // is what we draw and animate along.
  const trailPath = useMemo<Pt[]>(
    () => pings.map((p) => [p.latitude, p.longitude] as Pt),
    [pings]
  );
  const trailCum = useMemo(() => cumulativeDistances(trailPath), [trailPath]);

  // Journey replay: glide the marker smoothly along the trail (0→1), drawing the
  // traveled trail behind it — the way a fleet app replays a trip.
  const [replayT, setReplayT] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const isReplaying = replayT !== null;

  const stopReplay = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setReplayT(null);
  }, []);

  const startReplay = useCallback(() => {
    if (trailPath.length < 2) return;
    // Scale the replay length with the path's detail, clamped to a snappy window.
    const durationMs = Math.min(20000, Math.max(6000, trailPath.length * 60));
    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = (nowTs: number) => {
      const t = Math.min(1, (nowTs - start) / durationMs);
      setReplayT(t);
      rafRef.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [trailPath.length]);

  // Stop the animation if the component unmounts mid-replay.
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // What the map renders: the full trail, or progressively revealed while replaying.
  const displayTrail: LatLngExpression[] = isReplaying
    ? sliceAtFraction(trailPath, trailCum, replayT ?? 0)
    : trailPath;
  // Marker position: interpolated along the trail while replaying, else the last fix.
  const markerPos: Pt | null = isReplaying
    ? pointAtFraction(trailPath, trailCum, replayT ?? 0)
    : track?.latest
      ? [track.latest.latitude, track.latest.longitude]
      : null;
  // Journey timing comes from the transport event (start = departure, actual = arrival).
  const startMs = track?.departure_time ? new Date(track.departure_time).getTime() : null;
  const actualArrivalMs = track?.arrival_time ? new Date(track.arrival_time).getTime() : null;
  // While replaying, interpolate the "clock" between departure and arrival for the label.
  const replayTimeMs =
    isReplaying && startMs != null && actualArrivalMs != null
      ? startMs + (replayT ?? 0) * (actualArrivalMs - startMs)
      : null;
  // Tick a clock once a second while the trip is still in progress so the "so far"
  // duration stays live; once arrived we freeze on the recorded arrival time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (actualArrivalMs) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [actualArrivalMs]);
  // Duration = arrival − departure once arrived, otherwise elapsed so far.
  const journeyMs = startMs ? (actualArrivalMs ?? now) - startMs : 0;

  const bounds: LatLngBoundsExpression | null = useMemo(() => {
    const pts: LatLngExpression[] = [];
    if (track?.origin) pts.push([track.origin.latitude, track.origin.longitude]);
    if (track?.destination) pts.push([track.destination.latitude, track.destination.longitude]);
    pts.push(...trailPath);
    return pts.length >= 2 ? (pts as LatLngBoundsExpression) : null;
  }, [track, trailPath]);

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading map…</div>;
  }

  const latest = track?.latest;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Ambulance className="h-5 w-5 text-red-600" /> Ambulance tracking
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {/* Self-tracking: follow the viewer's own device location on the map. */}
          {geoSupported && (
            trackingMe ? (
              <Button variant="outline" onClick={stopMyLocation}>
                <LocateOff className="mr-2 h-4 w-4" />
                Stop my location
              </Button>
            ) : (
              <Button variant="outline" onClick={startMyLocation}>
                <LocateFixed className="mr-2 h-4 w-4" />
                Track my location
              </Button>
            )
          )}

          {/* Journey replay — both the referring and receiving clinician can replay */}
          {trailPath.length >= 2 && (
            isReplaying ? (
              <>
                <span className="text-xs text-muted-foreground">
                  Replaying {Math.round((replayT ?? 0) * 100)}%
                  {replayTimeMs != null ? ` · ${formatDateTime(new Date(replayTimeMs).toISOString())}` : ""}
                </span>
                <Button variant="outline" onClick={stopReplay}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Stop replay
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={startReplay}>
                <Play className="mr-2 h-4 w-4" />
                Replay journey
              </Button>
            )
          )}

          {/* Live status is driven by the ambulance's hardware tracker. */}
          {latest && !isReplaying && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-600">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
              </span>
              Tracking · last fix {formatDateTime(latest.recorded_at)}
            </span>
          )}
        </div>
      </div>

      {geoError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {geoError}
        </div>
      )}
      {trackingMe && !geoError && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600">
          <LocateFixed className="h-3.5 w-3.5" />
          {myPosition
            ? `Following your location · accuracy ±${Math.round(myPosition.accuracy)} m`
            : "Getting your location…"}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="h-[60vh] w-full overflow-hidden rounded-lg">
            <MapContainer
              center={
                latest
                  ? [latest.latitude, latest.longitude]
                  : track?.origin
                    ? [track.origin.latitude, track.origin.longitude]
                    : RWANDA_CENTER
              }
              zoom={9}
              bounds={bounds ?? undefined}
              scrollWheelZoom
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {track?.origin && (
                <Marker position={[track.origin.latitude, track.origin.longitude]} icon={originIcon}>
                  <Popup>Origin: {track.origin.name}</Popup>
                </Marker>
              )}
              {track?.destination && (
                <Marker position={[track.destination.latitude, track.destination.longitude]} icon={destinationIcon}>
                  <Popup>Destination: {track.destination.name}</Popup>
                </Marker>
              )}

              {/* Planned road route (origin → destination), under the live trail. */}
              {!isReplaying && plannedRoute.length >= 2 && (
                <Polyline
                  positions={plannedRoute}
                  pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.4, dashArray: "6 8" }}
                />
              )}

              {displayTrail.length >= 2 && (
                <Polyline
                  positions={displayTrail}
                  pathOptions={{ color: "#dc2626", weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
                />
              )}

              {markerPos && (
                <Marker position={markerPos} icon={ambulanceIcon}>
                  <Popup>
                    {isReplaying
                      ? `Replay · ${Math.round((replayT ?? 0) * 100)}%${replayTimeMs != null ? ` · ${formatDateTime(new Date(replayTimeMs).toISOString())}` : ""}`
                      : track?.latest
                        ? `Last seen ${formatDateTime(track.latest.recorded_at)}`
                        : ""}
                  </Popup>
                </Marker>
              )}

              {isReplaying && markerPos && <RecenterMap position={markerPos} />}

              {/* The viewer's own live position + accuracy halo. */}
              {myPosition && (
                <>
                  <Circle
                    center={[myPosition.latitude, myPosition.longitude]}
                    radius={myPosition.accuracy}
                    pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.12, weight: 1 }}
                  />
                  <Marker position={[myPosition.latitude, myPosition.longitude]} icon={myLocationIcon}>
                    <Popup>
                      You are here · ±{Math.round(myPosition.accuracy)} m
                      {myPosition.speed != null ? ` · ${Math.round(myPosition.speed * 3.6)} km/h` : ""}
                    </Popup>
                  </Marker>
                </>
              )}
              {/* Follow the blue dot while self-tracking (not during a replay). */}
              {trackingMe && myPosition && !isReplaying && (
                <RecenterMap position={[myPosition.latitude, myPosition.longitude]} />
              )}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Origin: </span>
            {track?.origin?.name ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Destination: </span>
            {track?.destination?.name ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Start time: </span>
            {track?.departure_time ? formatDateTime(track.departure_time) : "Not departed"}
          </div>
          <div>
            <span className="text-muted-foreground">Estimated arrival: </span>
            {track?.estimated_arrival_time ? formatDateTime(track.estimated_arrival_time) : "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Actual arrival: </span>
            {track?.arrival_time ? formatDateTime(track.arrival_time) : "In transit"}
          </div>
          <div>
            <span className="text-muted-foreground">Journey duration: </span>
            {journeyMs > 0 ? `${formatDuration(journeyMs)}${actualArrivalMs ? "" : " so far"}` : "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Positions reported: </span>
            {pings.length}
          </div>
          <div>
            <span className="text-muted-foreground">Last update: </span>
            {latest ? formatDateTime(latest.recorded_at) : "No positions yet"}
          </div>
          {trackingMe && (
            <>
              <div>
                <span className="text-muted-foreground">My location: </span>
                {myPosition
                  ? `${myPosition.latitude.toFixed(5)}, ${myPosition.longitude.toFixed(5)}`
                  : "Locating…"}
              </div>
              <div>
                <span className="text-muted-foreground">My location accuracy: </span>
                {myPosition ? `±${Math.round(myPosition.accuracy)} m` : "—"}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
