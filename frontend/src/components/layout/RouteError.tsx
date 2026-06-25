import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";

/**
 * Route-level error boundary. React Router renders this in place of a route's
 * element whenever rendering, a loader, or an action throws — turning the raw
 * "Unexpected Application Error" overlay into a friendly, recoverable screen.
 */
export function RouteError() {
    const error = useRouteError();
    const navigate = useNavigate();

    let title = "Something went wrong";
    let detail = "An unexpected error occurred. Try again, or head back to your dashboard.";

    if (isRouteErrorResponse(error)) {
        title = `${error.status} ${error.statusText}`;
        detail = error.data?.message ?? detail;
    } else if (error instanceof Error) {
        detail = error.message;
    }

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <div className="space-y-1.5">
                <h1 className="text-xl font-semibold">{title}</h1>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">{detail}</p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate(0)}>
                    Reload
                </Button>
                <Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
            </div>
        </div>
    );
}
