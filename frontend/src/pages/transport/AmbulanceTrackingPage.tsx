import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
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
import { Ambulance, Play, RotateCcw, LocateFixed, LocateOff } from "lucide-react";
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

  // Journey replay: step the marker through the recorded pings over time.
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const replayTimer = useRef<number | null>(null);
  const isReplaying = replayIdx !== null;

  const stopReplay = useCallback(() => {
    if (replayTimer.current) {
      clearInterval(replayTimer.current);
      replayTimer.current = null;
    }
    setReplayIdx(null);
  }, []);

  const startReplay = useCallback(() => {
    if (pings.length < 2) return;
    setReplayIdx(0);
    if (replayTimer.current) clearInterval(replayTimer.current);
    replayTimer.current = window.setInterval(() => {
      setReplayIdx((i) => {
        if (i === null) return null;
        if (i >= pings.length - 1) {
          if (replayTimer.current) {
            clearInterval(replayTimer.current);
            replayTimer.current = null;
          }
          return i;
        }
        return i + 1;
      });
    }, 700);
  }, [pings.length]);

  // Stop the timer if the component unmounts mid-replay.
  useEffect(() => () => {
    if (replayTimer.current) clearInterval(replayTimer.current);
  }, []);

  const trail: LatLngExpression[] = useMemo(
    () => pings.map((p) => [p.latitude, p.longitude]),
    [pings]
  );

  // What the map renders: full live trail, or progressive trail while replaying.
  const displayTrail = isReplaying ? trail.slice(0, replayIdx + 1) : trail;
  const marker = isReplaying ? pings[replayIdx] : track?.latest;
  // Journey timing comes from the transport event (start = departure, actual = arrival).
  const startMs = track?.departure_time ? new Date(track.departure_time).getTime() : null;
  const actualArrivalMs = track?.arrival_time ? new Date(track.arrival_time).getTime() : null;
  // Duration = arrival − departure once arrived, otherwise elapsed so far.
  const journeyMs = startMs ? (actualArrivalMs ?? Date.now()) - startMs : 0;

  const bounds: LatLngBoundsExpression | null = useMemo(() => {
    const pts: LatLngExpression[] = [];
    if (track?.origin) pts.push([track.origin.latitude, track.origin.longitude]);
    if (track?.destination) pts.push([track.destination.latitude, track.destination.longitude]);
    pts.push(...trail);
    return pts.length >= 2 ? (pts as LatLngBoundsExpression) : null;
  }, [track, trail]);

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading map…</div>;
  }

  const latest = track?.latest;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Ambulance className="h-5 w-5 text-red-600" /> Ambulance tracking
        </h1>
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
          {pings.length >= 2 && (
            isReplaying ? (
              <>
                <span className="text-xs text-muted-foreground">
                  Replaying {(replayIdx ?? 0) + 1}/{pings.length}
                  {marker ? ` · ${formatDateTime(marker.recorded_at)}` : ""}
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
                <Marker position={[track.origin.latitude, track.origin.longitude]}>
                  <Popup>Origin: {track.origin.name}</Popup>
                </Marker>
              )}
              {track?.destination && (
                <Marker position={[track.destination.latitude, track.destination.longitude]}>
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
                <Polyline positions={displayTrail} pathOptions={{ color: "#dc2626", weight: 3 }} />
              )}

              {marker && (
                <Marker position={[marker.latitude, marker.longitude]} icon={ambulanceIcon}>
                  <Popup>
                    {isReplaying ? "Position at " : "Last seen "}
                    {formatDateTime(marker.recorded_at)}
                  </Popup>
                </Marker>
              )}

              {isReplaying && marker && (
                <RecenterMap position={[marker.latitude, marker.longitude]} />
              )}

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
