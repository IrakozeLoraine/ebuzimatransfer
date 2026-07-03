import { useEffect, useState } from "react";
import { MapPin, LocateFixed } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFacilities, useSetFacilityLocation } from "@/hooks/useFacilities";
import { useAuthStore } from "@/store/auth.store";

// Ensure Leaflet's default marker images resolve under the bundler.
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// An explicit icon so the pin always renders (avoids missing-default-image issues).
const pinIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const RWANDA_CENTER: [number, number] = [-1.9441, 30.0619];

/** Keeps the map centered on the current coordinates as they change. */
const Recenter = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 14));
  }, [lat, lng, map]);
  return null;
};

/** A map in a dialog mounts before it has layout — recompute its size once shown so
 *  tiles and the marker render correctly. */
const SizeFix = () => {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
};

/** Lets the user drop/move the pin by clicking the map. */
const ClickPicker = ({ onPick }: { onPick: (lat: number, lng: number) => void }) => {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Lets a facility admin set/update their facility's coordinates — used to plot
 * ambulance routes and live tracking. Coordinates can be captured from the device
 * (HTTPS only) or typed in manually, so it still works on an http:// deployment.
 */
export const FacilityLocationDialog = ({ open, onOpenChange }: Props) => {
  const activeFacilityId = useAuthStore((s) => s.user?.active_facility_id ?? null);
  const { data: facilities = [] } = useFacilities();
  const { mutate: saveLocation, isPending } = useSetFacilityLocation();
  const facility = facilities.find((f) => f.id === activeFacilityId) ?? null;

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // Parsed, in-range coordinates drive the live map preview.
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const hasPreview =
    lat.trim() !== "" && lng.trim() !== "" &&
    Number.isFinite(latNum) && Number.isFinite(lngNum) &&
    latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180;

  // Prefill from the facility's existing coordinates each time the dialog opens (and
  // if the facility record loads/changes while open). Adjusting state during render
  // rather than in an effect avoids a cascading re-render.
  const [seeded, setSeeded] = useState<{ open: boolean; facility: typeof facility }>({
    open: false,
    facility: null,
  });
  if (seeded.open !== open || seeded.facility !== facility) {
    setSeeded({ open, facility });
    if (open) {
      setLat(facility?.latitude != null ? String(facility.latitude) : "");
      setLng(facility?.longitude != null ? String(facility.longitude) : "");
      setError(null);
    }
  }

  const useMyLocation = () => {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Location isn't supported on this device — enter the coordinates manually below.");
      return;
    }
    if (!window.isSecureContext) {
      setError(
        "Automatic location needs a secure (HTTPS) connection. On this http:// site, enter the coordinates manually below."
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Allow it in your browser, or enter the coordinates manually below."
            : err.message || "Couldn't get your location — enter the coordinates manually below."
        );
      },
      { enableHighAccuracy: true, timeout: 20_000 }
    );
  };

  const save = () => {
    if (!facility) return;
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!lat.trim() || !lng.trim() || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      setError("Enter valid numeric coordinates.");
      return;
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setError("Latitude must be -90…90 and longitude -180…180.");
      return;
    }
    saveLocation(
      { id: facility.id, latitude, longitude },
      {
        onSuccess: () => onOpenChange(false),
        onError: () => setError("Couldn't save the location. Please try again."),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {facility?.latitude != null ? "Update facility location" : "Set facility location"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pin {facility?.name ?? "your facility"}'s location — it's used to plot ambulance routes and
            live tracking. Capture it from your device while you're at the facility, or enter the
            coordinates manually.
          </p>

          <Button type="button" variant="outline" className="w-full" onClick={useMyLocation} disabled={locating || isPending}>
            <LocateFixed className="mr-2 h-4 w-4" />
            {locating ? "Locating…" : "Use my current location"}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Latitude</Label>
              <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-1.9441" inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Longitude</Label>
              <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="30.0619" inputMode="decimal" />
            </div>
          </div>

          {/* Always-on map so the admin can find the facility by panning; click to drop
              the pin, or type coordinates above to preview them here. */}
          <div className="space-y-1.5">
            <div className="h-52 w-full overflow-hidden rounded-lg border">
              <MapContainer
                center={hasPreview ? [latNum, lngNum] : RWANDA_CENTER}
                zoom={hasPreview ? 15 : 8}
                scrollWheelZoom
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {hasPreview && <Marker position={[latNum, lngNum]} icon={pinIcon} />}
                {hasPreview && <Recenter lat={latNum} lng={lngNum} />}
                <ClickPicker
                  onPick={(la, ln) => {
                    setLat(la.toFixed(6));
                    setLng(ln.toFixed(6));
                  }}
                />
                <SizeFix />
              </MapContainer>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Click the map to drop the pin on your facility{hasPreview ? ", or drag the numbers above" : ""}.
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={isPending}>
              {isPending ? "Saving…" : "Save location"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
