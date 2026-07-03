import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, QrCode, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import type { AmbulanceCredentials } from "@/types/ambulance";
import { buildSetupQr, driverServerUrl } from "@/utils/ambulanceSetup";

/** A read-only credential row with a copy button. */
function Field({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-sm">{value}</p>
      </div>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={onCopy}>
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

/** Shown once after registering an ambulance or resetting its password. The admin
 *  points the driver's phone camera at the QR code to sign it in — or reads out the
 *  login ID and password. The password is not retrievable later. */
export default function AmbulanceSetupDialog({
  credentials,
  onClose,
}: {
  credentials: AmbulanceCredentials | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  if (!credentials) return null;

  const serverUrl = driverServerUrl();
  const qr = buildSetupQr({
    serverUrl,
    loginId: credentials.login_id,
    password: credentials.password,
  });

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy — copy it manually" });
    }
  };

  return (
    <Dialog open={!!credentials} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" /> Set up the driver phone
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Open the ambulance app on the driver's phone, tap{" "}
            <span className="font-medium text-foreground">Scan setup code</span>, and point the
            camera at this QR. The phone signs in on its own — the driver never types anything.
          </p>

          <div className="flex justify-center rounded-lg border bg-white p-4">
            <QRCodeSVG value={qr} size={196} marginSize={2} />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              No camera? Enter these in the app by hand instead:
            </p>
            <Field label="Server address" value={serverUrl} copied={copied === "Server address"} onCopy={() => copy("Server address", serverUrl)} />
            <Field label="Login ID" value={credentials.login_id} copied={copied === "Login ID"} onCopy={() => copy("Login ID", credentials.login_id)} />
            <Field label="Password" value={credentials.password} copied={copied === "Password"} onCopy={() => copy("Password", credentials.password)} />
          </div>

          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This password is shown once. If you lose it, open the ambulance again and choose{" "}
              <span className="font-medium">Reset password</span> to issue a new one.
            </span>
          </div>

          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
