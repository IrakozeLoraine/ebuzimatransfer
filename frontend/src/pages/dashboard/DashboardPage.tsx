import { useAuthStore } from "@/store/auth.store";

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

export const DashboardPage = () => {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-7">
      {/* Greeting header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {getGreeting()}, {user?.first_name ?? "there"} 👋
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Here's a live overview of your referral network.
        </p>
      </div>
    </div>
  );
};
