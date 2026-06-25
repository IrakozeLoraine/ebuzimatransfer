import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Compass className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1.5">
                <p className="text-sm font-semibold text-muted-foreground">404</p>
                <h1 className="text-xl font-semibold">Page not found</h1>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                    The page you’re looking for doesn’t exist or may have been moved.
                </p>
            </div>
            <Button asChild>
                <Link to="/dashboard">Back to dashboard</Link>
            </Button>
        </div>
    );
}
