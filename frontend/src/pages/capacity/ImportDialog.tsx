import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { useImportResources } from "@/hooks/useResources";
import { getApiErrorMessage } from "@/utils/apiError";
import { Download } from "lucide-react";
import { useRef, useState } from "react";

export default function ImportDialog({
    open,
    onOpenChange,
    facilityScoped,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    facilityScoped: boolean;
}) {
    const { mutate: importResources, isPending, data: result, reset } = useImportResources();
    const fileRef = useRef<HTMLInputElement>(null);
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
        importResources(file, {
            onSuccess: (res) => {
                toast({
                    variant: res.errors.length ? "warning" : "success",
                    title: `${res.created} resource(s) imported`,
                    description: res.errors.length ? `${res.errors.length} row(s) skipped` : undefined,
                })
                if (res.errors.length === 0) handleClose(false)
            },
            onError: (e) =>
                toast({ variant: "destructive", title: "Import failed", description: getApiErrorMessage(e) }),
        });
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Import Resources from Excel</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                        Upload a <code className="font-mono">.csv</code> or <code className="font-mono">.xlsx</code> file. The
                        first row must be a header with columns:{" "}
                        <span className="font-mono">resource_name</span>, <span className="font-mono">resource_code</span>,{" "}
                        <span className="font-mono">resource_type</span>, <span className="font-mono">quantity</span>,{" "}
                        <span className="font-mono">unit</span>, <span className="font-mono">notes</span>. The{" "}
                        <span className="font-mono">unit</span> column takes the clinical unit's name; rows naming a unit that
                        isn't available here are skipped and reported, while the rest still import.
                        {facilityScoped
                            ? " Resources without a unit are added to your facility's stock."
                            : " Rows without a unit are added to central (unassigned) stock."}
                    </p>
                    <a
                        href="/resource-import-template.csv"
                        download
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                        <Download className="h-3.5 w-3.5" />
                        Download CSV template
                    </a>
                    <Input
                        ref={fileRef}
                        type="file"
                        accept=".csv,.xlsx"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />

                    {result && (
                        <div className="rounded-md border p-3 text-xs space-y-2">
                            <p className="font-medium text-emerald-700">{result.created} resource(s) created.</p>
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