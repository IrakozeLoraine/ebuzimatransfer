import { Outlet } from "react-router-dom";

export const AppLayout = () => {
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/30">
      <main className="ml-64 pt-16">
        <div className="p-7 page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
