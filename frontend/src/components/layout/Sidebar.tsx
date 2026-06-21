import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  FileText,
  Truck,
  BarChart3,
  Users,
  Building2,
  ClipboardList,
  User,
  Search,
  Layers,
} from "lucide-react";
import logo from "@/assets/ebuzimaTransfer.svg";
import { cn } from "@/utils/cn";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/store/auth.store";

const navItem = (to: string, label: string, Icon: React.ElementType) => ({ to, label, Icon });

export const Sidebar = () => {
  const { pathname } = useLocation();
  const {
    isSuperAdmin,
    isFacilityAdmin,
    canViewReports,
    canManageFacilities,
    canViewAudit,
    canViewResources
  } = usePermissions();
  const user = useAuthStore((s) => s.user);

  const mainLinks = [
    navItem("/dashboard", "Dashboard", LayoutDashboard),
    ...(canViewResources ? [navItem("/find-resources", "Resource Lookup", Search)] : []),
    ...(canViewResources ? [navItem("/resources", "Resources", Boxes)] : []),
    navItem("/referrals", "Referrals", FileText),
    ...(isSuperAdmin ? [navItem("/transport", "Transport", Truck)] : []),
    ...(canViewReports ? [navItem("/reports", "Reports", BarChart3)] : []),
  ];

  const adminLinks = [
    ...(isSuperAdmin || isFacilityAdmin ? [navItem("/admin/users", "Users", Users)] : []),
    ...(canManageFacilities ? [navItem("/admin/facilities", "Facilities", Building2)] : []),
    ...(isSuperAdmin ? [navItem("/admin/units", "Clinical Units", Layers)] : []),
    ...(canViewAudit ? [navItem("/admin/audit", "Audit Logs", ClipboardList)] : []),
  ];

  const bottomLinks = [navItem("/profile", "Profile", User)];

  const isActive = (to: string) =>
    to === "/dashboard" ? pathname === to : pathname.startsWith(to);

  const NavLink = ({ to, label, Icon }: { to: string; label: string; Icon: React.ElementType }) => (
    <Link
      key={to}
      to={to}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group",
        isActive(to)
          ? "bg-primary/10 text-primary"
          : "text-foreground/60 hover:bg-muted hover:text-foreground"
      )}
    >
      {isActive(to) && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-gradient-to-b from-primary to-primary/50" />
      )}
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
          isActive(to) ? "text-primary" : ""
        )}
      />
      {label}
    </Link>
  );

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-20 w-64 flex flex-col",
        "bg-white/85 dark:bg-card/85 backdrop-blur-xl"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border/60 px-4">
        <div className="rounded-lg p-1 shrink-0">
          <img alt="eBuzimaTransfer" width="36" height="36" src={logo} />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-medium text-muted-foreground leading-tight">Ministry of Health</span>
          <span className="text-sm font-bold text-primary leading-tight truncate">E-Buzima Transfer</span>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5 border-r border-border/60">
        {mainLinks.map((link) => (
          <NavLink key={link.to} {...link} />
        ))}

        {adminLinks.length > 0 && (
          <>
            <div className="my-3 px-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Administration
              </p>
            </div>
            {adminLinks.map((link) => (
              <NavLink key={link.to} {...link} />
            ))}
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-r border-border/60 px-3 py-3 space-y-0.5">
        {bottomLinks.map((link) => (
          <NavLink key={link.to} {...link} />
        ))}
        {user && (
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/50 text-xs font-bold text-white">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">
                {user.first_name} {user.last_name}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {user.roles?.[0]?.replace(/_/g, " ") ?? ""}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
