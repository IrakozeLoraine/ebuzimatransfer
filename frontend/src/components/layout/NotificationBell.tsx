import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotificationStore } from "@/store/notification.store";
import { useNotifications, useMarkRead, useMarkAllRead } from "@/hooks/useNotifications";
import type { Notification } from "@/types/notification";
import { cn } from "@/utils/cn";

const timeAgo = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
};

export const NotificationBell = () => {
  useNotifications(); // loads notifications into the store
  const navigate = useNavigate();
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const { mutate: markRead } = useMarkRead();
  const { mutate: markAll } = useMarkAllRead();

  const open = (n: Notification) => {
    if (!n.is_read) markRead(n.id);
    if (n.entity_type === "referral" && n.entity_id) navigate(`/transfer-requests/${n.entity_id}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-foreground outline-none"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAll()}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-auto">
          {notifications.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">No notifications yet</p>
          ) : (
            notifications.slice(0, 8).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted/50",
                  !n.is_read && "bg-primary/5"
                )}
              >
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-primary")} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{n.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{n.message}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate("/notifications")}
          className="w-full border-t px-3 py-2 text-center text-xs font-medium text-primary hover:bg-muted/50"
        >
          View all notifications
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
