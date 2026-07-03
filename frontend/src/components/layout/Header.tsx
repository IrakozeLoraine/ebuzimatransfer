import { useAuthStore } from "@/store/auth.store";
import { useLogout, useSwitchFacility } from "@/hooks/useAuth";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronsUpDown, LogOut, Menu, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";
import { FacilityLocationButton } from "./FacilityLocationButton";
import { DirectoryCallDialog } from "@/components/call/DirectoryCallDialog";
import { useUiStore } from "@/store/ui.store";

export const Header = () => {
    const user = useAuthStore((s) => s.user);
    const { mutate: doLogout } = useLogout();
    const { mutate: doSwitch, isPending: switching } = useSwitchFacility();
    const openMobileNav = useUiStore((s) => s.setMobileNavOpen);

    const facilities = user?.facilities ?? [];
    const activeFacility = facilities.find((f) => f.id === user?.active_facility_id);

    return (
        <header
            className={[
                "fixed top-0 left-0 right-0 z-10 flex h-16 items-center justify-between gap-2 px-4 md:left-64 md:px-7",
                "bg-white/80 dark:bg-background/80 backdrop-blur-xl",
                "border-b border-border/60",
            ].join(" ")}
        >
            <div className="flex min-w-0 items-center gap-2">
                <button
                    type="button"
                    onClick={() => openMobileNav(true)}
                    aria-label="Open navigation menu"
                    className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted md:hidden"
                >
                    <Menu className="h-5 w-5" />
                </button>

                {facilities.length > 1 ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            disabled={switching}
                            className={[
                                "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium md:px-3",
                                "transition-all duration-200 hover:bg-muted outline-none disabled:opacity-60",
                            ].join(" ")}
                        >
                            <span className="hidden text-muted-foreground sm:inline">Facility:</span>
                            <span className="text-foreground max-w-[40vw] truncate md:max-w-[18rem]">
                                {activeFacility?.name ?? "Select facility"}
                            </span>
                            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72">
                        {facilities.map((f) => (
                            <DropdownMenuItem
                                key={f.id}
                                className="flex items-center gap-2"
                                onClick={() => f.id !== user?.active_facility_id && doSwitch(f.id)}
                            >
                                <Check
                                    className={[
                                        "h-4 w-4",
                                        f.id === user?.active_facility_id ? "opacity-100" : "opacity-0",
                                    ].join(" ")}
                                />
                                <span className="truncate">{f.name}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                <div />
            )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
                <FacilityLocationButton />
                <DirectoryCallDialog />
                <NotificationBell />

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
