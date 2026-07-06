import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useReferral, useCompleteReferralForm } from "@/hooks/useReferrals";
import type { Referral } from "@/types/referral";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DynamicFormFields } from "@/components/referral/DynamicFormFields";
import {
  FORM_TYPE_ORDER,
  TRANSFER_FORMS,
  CORE_FIELD_NAMES,
  getFormDef,
  type FormType,
} from "@/config/transferForms";

const CORE_SET = new Set<string>(CORE_FIELD_NAMES);
type Values = Record<string, unknown>;

export const CompleteReferralFormPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: referral, isLoading } = useReferral(id!);

  if (isLoading || !referral) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="h-8 w-48 rounded-lg shimmer" />
        <div className="h-64 rounded-xl border shimmer" />
      </div>
    );
  }

  // Remount (and re-seed) the form when a different referral loads.
  return <CompleteReferralForm key={referral.id} referral={referral} />;
};

const CompleteReferralForm = ({ referral }: { referral: Referral }) => {
  const navigate = useNavigate();
  const { mutate: complete, isPending } = useCompleteReferralForm();

  // Prefill the form from the referral: the three core fields plus everything in
  // form_data, flattened into one map for the dynamic renderer.
  const [values, setValues] = useState<Values>(() => ({
    sex: referral.sex ?? "",
    diagnosis: referral.diagnosis ?? "",
    reason_for_transfer: referral.reason_for_transfer ?? "",
    ...(referral.form_data ?? {}),
  }));
  const [formType, setFormType] = useState<FormType>(
    (referral.form_type || "EXTERNAL") as FormType
  );
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const activeType = formType;
  const requiredFields = useMemo(
    () => getFormDef(activeType).sections.flatMap((s) => s.fields).filter((f) => f.required),
    [activeType]
  );
  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!submitAttempted) return out;
    for (const f of requiredFields) {
      const v = values[f.name];
      if (v == null || v === "") out[f.name] = "Required";
    }
    return out;
  }, [submitAttempted, requiredFields, values]);

  const handleChange = (name: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = () => {
    setSubmitAttempted(true);
    const missing = requiredFields.some((f) => {
      const v = values[f.name];
      return v == null || v === "";
    });
    if (missing) return;

    // Split the flat map back into the top-level core columns and the form_data blob.
    const form_data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (!CORE_SET.has(k)) form_data[k] = v;
    }
    complete(
      {
        id: referral.id,
        payload: {
          sex: String(values.sex ?? ""),
          diagnosis: String(values.diagnosis ?? ""),
          reason_for_transfer: String(values.reason_for_transfer ?? ""),
          form_type: activeType,
          form_data,
        },
      },
      {
        onSuccess: () => {
          toast({ variant: "success", title: "Transfer form completed" });
          navigate(`/transfer-requests/${referral.id}`);
        },
        onError: (e) => toast({ variant: "destructive", title: "Could not save", description: getApiErrorMessage(e) }),
      }
    );
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Complete Transfer Form</h1>
          <p className="text-sm text-muted-foreground">
            {referral.referral_number} — fill in the full MoH transfer form for this referral
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">Transfer Form</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>Form type <span className="text-destructive">*</span></Label>
            <Select value={activeType} onValueChange={(v) => setFormType(v as FormType)}>
              <SelectTrigger><SelectValue placeholder="Select form type" /></SelectTrigger>
              <SelectContent>
                {FORM_TYPE_ORDER.map((ft) => (
                  <SelectItem key={ft} value={ft}>{TRANSFER_FORMS[ft].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{getFormDef(activeType).description}</p>
          </div>

          <DynamicFormFields
            sections={getFormDef(activeType).sections}
            value={values}
            onChange={handleChange}
            errors={errors}
          />
        </CardContent>
      </Card>

      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            Please complete these required fields:{" "}
            {requiredFields.filter((f) => errors[f.name]).map((f) => f.label).join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 pt-1">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isPending} className="flex-1 sm:flex-none sm:min-w-40">
          {isPending ? "Saving…" : "Save transfer form"}
        </Button>
      </div>
    </div>
  );
};
