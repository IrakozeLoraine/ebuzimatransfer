import { useEffect, useState, type ReactNode } from "react";
import { Bed, Activity, Truck } from "lucide-react";
import logo from "@/assets/ebuzimaTransfer.svg";

const SLIDES = [
  {
    icon: <Bed className="h-8 w-8 text-white" />,
    title: "Real-time Clinical Units Capacity",
    description:
      "See live resource availability across every referral hospital in Rwanda — no phone calls, no delays.",
  },
  {
    icon: <Truck className="h-8 w-8 text-white" />,
    title: "One-click Patient Referrals",
    description:
      "Submit critical referrals with full clinical context; receiving teams are notified the moment you send.",
  },
  {
    icon: <Activity className="h-8 w-8 text-white" />,
    title: "Data-driven Decision Support",
    description:
      "Healthcare providers can know beforehand which hospitals have capacity, enabling faster, more informed decisions during critical moments.",
  },
];

const HeroPanel = ({ slide, setSlide }: { slide: number; setSlide: (i: number) => void }) => (
  <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-neutral-200 p-12 text-neutral-800 relative overflow-hidden">
    <div className="absolute top-1/4 -left-1/3 h-72 w-72 rounded-full bg-primary/35 blur-3xl" />
    <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-primary/20 blur-2xl" />
    <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-primary/20 blur-2xl" />

    <div className="flex items-center gap-4">
      <div className="rounded-lg p-2">
        <img alt="eBuzimaTransfer" loading="lazy" width="60" height="60" decoding="async" src={logo} />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium sm:text-base">Ministry of Health</span>
        <span className="text-lg font-semibold sm:text-xl">E-Buzima Transfer</span>
      </div>
    </div>

    <div className="relative space-y-8 flex flex-col justify-center items-center">
      {SLIDES.map((s, i) => (
        <div
          key={i}
          className={`space-y-10 justify-between transition-opacity duration-500 flex flex-col items-center ${
            i === slide ? "relative opacity-100" : "absolute inset-0 opacity-0 pointer-events-none"
          }`}
        >
          <div className="inline-flex items-center justify-center rounded-2xl bg-primary p-4 backdrop-blur-sm">
            {s.icon}
          </div>
          <div className="space-y-2 flex flex-col items-center text-center">
            <h2 className="text-xl font-semibold">{s.title}</h2>
            <p className="text-base text-neutral-500 leading-relaxed max-w-md">{s.description}</p>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSlide(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === slide ? "w-6 bg-primary" : "w-4 bg-primary/30"
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>

    <p className="relative text-xs text-white/40">
      Ministry of Health — Rwanda © {new Date().getFullYear()}
    </p>
  </div>
);

const MobileLogo = () => (
  <div className="mb-8 lg:hidden flex items-center gap-4">
    <div className="rounded-lg p-2">
      <img alt="eBuzimaTransfer" loading="lazy" width="60" height="60" decoding="async" src={logo} />
    </div>
    <div className="flex flex-col">
      <span className="text-sm font-medium">Ministry of Health</span>
      <span className="text-lg font-semibold">E-Buzima Transfer</span>
    </div>
  </div>
);

/**
 * The shared split-screen scaffold for full-page auth flows: the rotating hero panel
 * on the left (desktop) and a centered content column on the right. Used by the login
 * screen and the post-login facility/unit picker so they read as one continuous flow.
 */
export const AuthShell = ({ children }: { children: ReactNode }) => {
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-screen">
      <HeroPanel slide={slide} setSlide={setSlide} />
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm animate-fade-in">
          <MobileLogo />
          {children}
        </div>
      </div>
    </div>
  );
};
