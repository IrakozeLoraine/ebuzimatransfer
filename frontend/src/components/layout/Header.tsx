import { useAuthStore } from "@/store/auth.store";
import { useLogout } from "@/hooks/useAuth";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings } from "lucide-react";
import { Link } from "react-router-dom";

export const Header = () => {
    const user = useAuthStore((s) => s.user);
    const { mutate: doLogout } = useLogout();

    return (
        <header
            className={[
                "fixed top-0 left-64 right-0 z-10 flex h-16 items-center justify-between px-7",
                "bg-white/80 dark:bg-background/80 backdrop-blur-xl",
                "border-b border-border/60",
            ].join(" ")}
        >
            <div />

            <div className="flex items-center gap-1">
                {/* <NotificationBell /> */}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className={[
                                "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium",
                                "transition-all duration-200 hover:bg-muted outline-none",
                            ].join(" ")}
                        >
                            <span
                                className={[
                                    "flex h-8 w-8 items-center justify-center rounded-full",
                                    "bg-gradient-to-br from-primary to-primary/50 text-xs font-bold text-white",
                                    "ring-2 ring-primary/20",
                                ].join(" ")}
                            >
                                {user?.first_name?.[0]}{user?.last_name?.[0]}
                            </span>
                            <span className="hidden sm:block text-foreground">
                                {user?.first_name} {user?.last_name}
                            </span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                        <div className="px-3 py-2">
                            <p className="text-xs font-semibold text-foreground">{user?.first_name} {user?.last_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link to="/profile" className="flex items-center gap-2">
                                <Settings className="h-4 w-4" />
                                Profile & Settings
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive flex items-center gap-2"
                            onClick={() => doLogout()}
                        >
                            <LogOut className="h-4 w-4" />
                            Sign Out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
};
