import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/molecules/Pagination";
import { useNotificationStore } from "@/store/notification.store";
import { useNotifications, useMarkRead, useMarkAllRead } from "@/hooks/useNotifications";
import type { Notification } from "@/types/notification";
import { formatDateTime } from "@/utils/format";
import { cn } from "@/utils/cn";

export const NotificationsPage = () => {
  const { isLoading } = useNotifications();
  const navigate = useNavigate();
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const { mutate: markRead } = useMarkRead();
  const { mutate: markAll } = useMarkAllRead();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? notifications.filter(
        (n) =>
          n.title.toLowerCase().includes(query) || n.message.toLowerCase().includes(query)
      )
    : notifications;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const open = (n: Notification) => {
    if (!n.is_read) markRead(n.id);
    if (n.entity_type === "referral" && n.entity_id) navigate(`/transfer-requests/${n.entity_id}`);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={() => markAll()}>
            <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {notifications.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search notifications…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notifications.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <Bell className="mx-auto mb-2 h-6 w-6 opacity-50" />
          No notifications yet.
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <Search className="mx-auto mb-2 h-6 w-6 opacity-50" />
          No notifications match your search.
        </Card>
      ) : (
        <div className="space-y-2">
          {paged.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => open(n)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-card transition-colors hover:bg-muted/40",
                !n.is_read && "border-primary/30 bg-primary/5"
              )}
            >
              <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", n.is_read ? "bg-muted" : "bg-primary")} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
              </div>
            </button>
          ))}

          {filtered.length > pageSize && (
            <Card className="overflow-hidden p-0">
              <Pagination
                page={currentPage}
                pageSize={pageSize}
                total={filtered.length}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
