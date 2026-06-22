import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useNotificationsWebSocket } from "@/hooks/useWebSocket";

export const AppLayout = () => {
  // Live notification delivery over the per-user websocket channel.
  useNotificationsWebSocket();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/30">
      <Sidebar />
      <Header />
      <main className="ml-64 pt-16">
        <div className="p-7 page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
