import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Volume2 } from "lucide-react";
import { formatDateTime } from "@/utils/format";
import type { TransportMonitoring } from "@/types/referral";

interface Props {
  monitorings: TransportMonitoring[] | null | undefined;
}

const VITAL_COLUMNS: { key: string; label: string }[] = [
  { key: "time", label: "Time" },
  { key: "bp", label: "BP" },
  { key: "temp", label: "T°" },
  { key: "spo2", label: "SpO₂" },
  { key: "rr", label: "RR" },
  { key: "pulse", label: "Pulse" },
  { key: "fhr", label: "FHR" },
  { key: "membranes_ruptured", label: "Membranes ruptured" },
];

const hasValues = (row: Record<string, string | null>, keys: string[]) =>
  keys.some((k) => row[k] != null && row[k] !== "");

/** One recorded monitoring, shown read-only with its own audio for replay. */
const MonitoringEntry = ({
  monitoring,
  index,
  total,
}: {
  monitoring: TransportMonitoring;
  index: number;
  total: number;
}) => {
  const vitalKeys = VITAL_COLUMNS.map((c) => c.key);
  const vitals = (monitoring.vital_signs ?? []).filter((r) => hasValues(r, vitalKeys));
  const problems = (monitoring.problems ?? []).filter((r) => hasValues(r, ["problem", "management"]));

  return (
    <div className="space-y-4 rounded-lg border bg-background/60 p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-indigo-700">
          Recording {index + 1} of {total}
        </span>
        {monitoring.recorded_at && (
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {formatDateTime(monitoring.recorded_at)}
          </span>
        )}
      </div>

      {monitoring.summary && (
        <p className="text-sm leading-relaxed text-foreground/80">{monitoring.summary}</p>
      )}

      {vitals.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Vital signs during transport</p>
          <div className="overflow-x-auto rounded-lg border bg-background">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50">
                  {VITAL_COLUMNS.map((c) => (
                    <th key={c.key} className="border-b border-r p-2 text-left text-xs font-medium text-muted-foreground">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vitals.map((row, i) => (
                  <tr key={i}>
                    {VITAL_COLUMNS.map((c) => (
                      <td key={c.key} className="border-r border-b p-2">{row[c.key] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {problems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Problems during transportation</p>
          <div className="overflow-x-auto rounded-lg border bg-background">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="border-b border-r p-2 text-left text-xs font-medium text-muted-foreground">Problem</th>
                  <th className="border-b p-2 text-left text-xs font-medium text-muted-foreground">Management</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((row, i) => (
                  <tr key={i}>
                    <td className="border-r border-b p-2">{row.problem ?? ""}</td>
                    <td className="border-b p-2">{row.management ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {monitoring.audio_url && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Volume2 className="h-3.5 w-3.5" /> Original recording
          </p>
          <audio controls src={monitoring.audio_url} className="w-full" />
        </div>
      )}

      {monitoring.transcript && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            View full transcript
          </summary>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-foreground/70">
            {monitoring.transcript}
          </p>
        </details>
      )}
    </div>
  );
};

/** Read-only display of every Patient Monitoring Transfer Form the driver voice-recorded
 *  during transport — shown to both clinics and admins on the referral detail, newest
 *  first, each replayable. */
export const TransportMonitoringCard = ({ monitorings }: Props) => {
  if (!monitorings || monitorings.length === 0) return null;

  // Newest recording first; the backend keeps them oldest-first.
  const ordered = [...monitorings].reverse();

  return (
    <Card className="border-indigo-200 bg-indigo-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-indigo-600" />
          Transport Monitoring
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {monitorings.length} recording{monitorings.length === 1 ? "" : "s"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Recorded by the ambulance crew by voice during transport.
        </p>
        {ordered.map((m, i) => (
          <MonitoringEntry
            key={i}
            monitoring={m}
            index={monitorings.length - 1 - i}
            total={monitorings.length}
          />
        ))}
      </CardContent>
    </Card>
  );
};
