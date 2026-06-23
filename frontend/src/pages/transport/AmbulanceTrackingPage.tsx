import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { getAmbulanceTrack } from "@/api/ambulance.api";
import { useAmbulanceWebSocket } from "@/hooks/useWebSocket";
import { useLiveLocationShare } from "@/hooks/useLiveLocation";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/utils/format";
import { Ambulance, MapPin, Square, Play, RotateCcw } from "lucide-react";
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

const RWANDA_CENTER: LatLngExpression = [-1.9403, 29.8739];

export const AmbulanceTrackingPage = () => {
  const { id: referralId } = useParams<{ id: string }>();
  const { canManageTransport } = usePermissions();

  useAmbulanceWebSocket(referralId);

  const { data: track, isLoading } = useQuery({
    queryKey: ["ambulance-track", referralId],
    queryFn: () => getAmbulanceTrack(referralId as string),
    enabled: !!referralId,
    // WS invalidates on each ping; this is a fallback if the socket drops.
    refetchInterval: 20_000,
  });

  const { active, error: geoError, lastSentAt, sending, start, stop } =
    useLiveLocationShare(referralId);

  const pings = useMemo(() => track?.pings ?? [], [track?.pings]);

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
  const journeyMs =
    pings.length >= 2
      ? new Date(pings[pings.length - 1].recorded_at).getTime() -
        new Date(pings[0].recorded_at).getTime()
      : 0;

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

          {canManageTransport && !isReplaying && (
            <>
              {active && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-red-600">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
                  </span>
                  Live{sending ? " · sending…" : lastSentAt ? ` · sent ${formatDateTime(new Date(lastSentAt).toISOString())}` : ""}
                </span>
              )}
              {active ? (
                <Button variant="outline" onClick={stop}>
                  <Square className="mr-2 h-4 w-4" />
                  Stop sharing
                </Button>
              ) : (
                <Button onClick={start}>
                  <MapPin className="mr-2 h-4 w-4" />
                  Share live location
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {geoError && <p className="text-sm text-red-600">{geoError}</p>}

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
            <span className="text-muted-foreground">Positions reported: </span>
            {pings.length}
          </div>
          <div>
            <span className="text-muted-foreground">Journey duration: </span>
            {journeyMs > 0 ? formatDuration(journeyMs) : "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Last update: </span>
            {latest ? formatDateTime(latest.recorded_at) : "No positions yet"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
