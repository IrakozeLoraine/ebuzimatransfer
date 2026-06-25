import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { useImportUsers } from "@/hooks/useUser";
import { getApiErrorMessage } from "@/utils/apiError";

export const UserImportDialog = ({
  open,
  onOpenChange,
  facilityId,
  facilityName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Super admins pass the target facility; facility admins omit it (server uses their own). */
  facilityId?: string;
  facilityName?: string;
}) => {
  const { mutate: importUsers, isPending, data: result, reset } = useImportUsers(facilityId);
  const [file, setFile] = useState<File | null>(null);

  const handleClose = (o: boolean) => {
    if (!o) {
      setFile(null);
      reset();
    }
    onOpenChange(o);
  };

  const handleImport = () => {
    if (!file) return;
    importUsers(file, {
      onSuccess: (res) => {
        toast({
          variant: res.errors.length ? "warning" : "success",
          title: `${res.assigned} user(s) assigned`,
          description: [
            res.created ? `${res.created} new account(s)` : null,
            res.errors.length ? `${res.errors.length} row(s) skipped` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        });
        if (res.errors.length === 0) handleClose(false);
      },
      onError: (e) =>
        toast({ variant: "destructive", title: "Import failed", description: getApiErrorMessage(e) }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Users{facilityName ? ` — ${facilityName}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Upload a <code className="font-mono">.csv</code> or <code className="font-mono">.xlsx</code> file. The first
            row must be a header with columns: <span className="font-mono">medical_id</span> (required),{" "}
            <span className="font-mono">first_name</span>, <span className="font-mono">last_name</span>,{" "}
            <span className="font-mono">email</span>, <span className="font-mono">phone</span>,{" "}
            <span className="font-mono">roles</span>, <span className="font-mono">units</span>. Separate multiple roles or
            units with <code className="font-mono">;</code>. Roles default to CLINICIAN. A medical ID that already exists
            is re-assigned the given roles; new ones are registered and can set their own password on first login.
          </p>
          <a
            href="/user-import-template.csv"
            download
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Download CSV template
          </a>
          <Input type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />

          {result && (
            <div className="rounded-md border p-3 text-xs space-y-2">
              <p className="font-medium text-emerald-700">
                {result.assigned} user(s) assigned{result.created ? `, ${result.created} newly created.` : "."}
              </p>
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-amber-700">Skipped rows:</p>
                  <ul className="max-h-40 overflow-auto space-y-0.5">
                    {result.errors.map((err) => (
                      <li key={err.row} className="text-muted-foreground">
                        Row {err.row}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => handleClose(false)}>Close</Button>
            <Button onClick={handleImport} disabled={!file || isPending}>
              {isPending ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
