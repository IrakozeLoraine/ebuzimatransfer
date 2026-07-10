import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin, useSetPassword, useCompleteAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordInput } from "@/components/atoms/PasswordInput";
import { Bed, Activity, Truck, ArrowLeft } from "lucide-react";
import logo from "@/assets/ebuzimaTransfer.svg";
import {
  medicalIdSchema,
  passwordSchema,
  setPasswordSchema,
  type MedicalIdFormValues,
  type PasswordFormValues,
  type SetPasswordFormValues,
} from "@/schemas/login.schema";

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

type Step = "medical_id" | "password" | "set_password";

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

export const LoginPage = () => {
  const [slide, setSlide] = useState(0);
  const [step, setStep] = useState<Step>("medical_id");
  const [medicalId, setMedicalId] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 4000);
    return () => clearInterval(id);
  }, []);

  const loginMutation = useLogin();
  const setPasswordMutation = useSetPassword();
  const completeAuth = useCompleteAuth();

  const medicalIdForm = useForm<MedicalIdFormValues>({ resolver: zodResolver(medicalIdSchema) });
  const passwordForm = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });
  const setPasswordForm = useForm<SetPasswordFormValues>({ resolver: zodResolver(setPasswordSchema) });

  // Step 1: validate medical ID — determine next step from API response
  const onMedicalIdSubmit = async (data: MedicalIdFormValues) => {
    try {
      const result = await loginMutation.mutateAsync({ medical_id: data.medical_id });
      setMedicalId(data.medical_id);
      if (result.requires_password_reset && result.reset_token) {
        setResetToken(result.reset_token);
        setStep("set_password");
      } else {
        setStep("password");
      }
    } catch {
      // error displayed via loginMutation.error
    }
  };

  // Step 2: submit password for verified active account
  const onPasswordSubmit = async (data: PasswordFormValues) => {
    try {
      const result = await loginMutation.mutateAsync({ medical_id: medicalId, password: data.password });
      if (result.access_token && result.refresh_token) {
        await completeAuth(result.access_token, result.refresh_token);
      }
    } catch {
      // error displayed via loginMutation.error
    }
  };

  // Step 3 (set-password wizard): set new password using reset token
  const onSetPasswordSubmit = (data: SetPasswordFormValues) => {
    if (!resetToken) return;
    setPasswordMutation.mutate({ reset_token: resetToken, new_password: data.new_password });
  };

  const goBack = () => {
    loginMutation.reset();
    passwordForm.reset();
    setStep("medical_id");
  };

  return (
    <div className="flex min-h-screen">
      <HeroPanel slide={slide} setSlide={setSlide} />

      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm animate-fade-in">
          <MobileLogo />

          {/* ── Step 1: Medical ID ── */}
          {step === "medical_id" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                <p className="mt-1 text-sm text-muted-foreground">Enter your Medical ID to continue</p>
              </div>

              {loginMutation.error && (
                <Alert variant="destructive" className="mb-5">
                  <AlertDescription>Medical ID not found or account inactive.</AlertDescription>
                </Alert>
              )}

              <form onSubmit={medicalIdForm.handleSubmit(onMedicalIdSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="medical_id" className="text-sm font-medium">Medical ID</Label>
                  <Input
                    id="medical_id"
                    type="text"
                    placeholder="e.g. RC-CHUK-001"
                    autoComplete="username"
                    autoFocus
                    {...medicalIdForm.register("medical_id")}
                  />
                  {medicalIdForm.formState.errors.medical_id && (
                    <p className="text-xs text-destructive">{medicalIdForm.formState.errors.medical_id.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full mt-2" size="lg" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? "Checking…" : "Continue"}
                </Button>
              </form>
            </>
          )}

          {/* ── Step 2: Password ── */}
          {step === "password" && (
            <>
              <div className="mb-8">
                <button
                  type="button"
                  onClick={goBack}
                  className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Change Medical ID
                </button>
                <h2 className="text-2xl font-bold text-foreground">Enter your password</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Signing in as <span className="font-medium text-foreground">{medicalId}</span>
                </p>
              </div>

              {loginMutation.error && (
                <Alert variant="destructive" className="mb-5">
                  <AlertDescription>Incorrect credentials!</AlertDescription>
                </Alert>
              )}

              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <PasswordInput
                    id="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    autoFocus
                    {...passwordForm.register("password")}
                  />
                  {passwordForm.formState.errors.password && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.password.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full mt-2" size="lg" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? "Signing in…" : "Sign In"}
                </Button>
              </form>
            </>
          )}

          {/* ── Step 3: Set new password (account flagged for reset) ── */}
          {step === "set_password" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-foreground">Set new password</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your administrator has enabled a password reset for{" "}
                  <span className="font-medium text-foreground">{medicalId}</span>. Choose a new password to continue.
                </p>
              </div>

              {setPasswordMutation.error && (
                <Alert variant="destructive" className="mb-5">
                  <AlertDescription>Failed to set password. The reset link may have expired — contact your administrator.</AlertDescription>
                </Alert>
              )}

              <form onSubmit={setPasswordForm.handleSubmit(onSetPasswordSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new_password" className="text-sm font-medium">New Password</Label>
                  <PasswordInput
                    id="new_password"
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                    autoFocus
                    {...setPasswordForm.register("new_password")}
                  />
                  {setPasswordForm.formState.errors.new_password && (
                    <p className="text-xs text-destructive">{setPasswordForm.formState.errors.new_password.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm_password" className="text-sm font-medium">Confirm Password</Label>
                  <PasswordInput
                    id="confirm_password"
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    {...setPasswordForm.register("confirm_password")}
                  />
                  {setPasswordForm.formState.errors.confirm_password && (
                    <p className="text-xs text-destructive">{setPasswordForm.formState.errors.confirm_password.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full mt-2"
                  size="lg"
                  disabled={setPasswordMutation.isPending}
                >
                  {setPasswordMutation.isPending ? "Saving…" : "Set Password & Sign In"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
