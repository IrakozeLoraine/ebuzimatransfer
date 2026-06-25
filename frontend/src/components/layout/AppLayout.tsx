import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { MobileSidebar } from "./MobileSidebar";
import { Header } from "./Header";
import { FacilityLocationPrompt } from "./FacilityLocationPrompt";
import { useNotificationsWebSocket } from "@/hooks/useWebSocket";

export const AppLayout = () => {
  // Live notification delivery over the per-user websocket channel.
  useNotificationsWebSocket();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/30">
      <FacilityLocationPrompt />
      <Sidebar />
      <MobileSidebar />
      <Header />
      <main className="pt-16 md:ml-64">
        <div className="p-4 sm:p-6 lg:p-7 page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
