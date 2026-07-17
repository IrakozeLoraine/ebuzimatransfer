import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin, useSetPassword, useCompleteAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordInput } from "@/components/atoms/PasswordInput";
import { AuthShell } from "@/components/layout/AuthShell";
import { ArrowLeft } from "lucide-react";
import {
  medicalIdSchema,
  passwordSchema,
  setPasswordSchema,
  type MedicalIdFormValues,
  type PasswordFormValues,
  type SetPasswordFormValues,
} from "@/schemas/login.schema";

type Step = "medical_id" | "password" | "set_password";

export const LoginPage = () => {
  const [step, setStep] = useState<Step>("medical_id");
  const [medicalId, setMedicalId] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);

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
    <AuthShell>
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
    </AuthShell>
  );
};
