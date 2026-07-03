import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ClipboardCheck } from "lucide-react";
import { DynamicFormFields } from "./DynamicFormFields";
import { DynamicFormDetails } from "./DynamicFormDetails";
import { FEEDBACK_FORM, COUNTER_REFERRAL_FORM } from "@/config/transferForms";
import { useSaveReferralFeedback } from "@/hooks/useReferrals";
import { toast } from "@/components/ui/toaster";
import { getApiErrorMessage } from "@/utils/apiError";
import type { Referral } from "@/types/referral";

type FormData = Record<string, unknown>;

interface Props {
  referral: Referral;
  /** The receiving side may fill these forms; everyone else sees them read-only. */
  canEdit: boolean;
}

/** Referral Feedback + Counter-Referral — filled by the receiving facility per case,
 *  shown read-only to both sides once recorded. */
export const ReferralFeedbackSection = ({ referral, canEdit }: Props) => {
  const { mutate: save, isPending } = useSaveReferralFeedback();
  const [feedback, setFeedback] = useState<FormData>((referral.feedback_data as FormData) ?? {});
  const [counter, setCounter] = useState<FormData>((referral.counter_referral_data as FormData) ?? {});

  const hasFeedback = !!referral.feedback_data && Object.keys(referral.feedback_data).length > 0;
  const hasCounter = !!referral.counter_referral_data && Object.keys(referral.counter_referral_data).length > 0;

  // Read-only view for anyone who can't edit (e.g. the referring side).
  if (!canEdit) {
    if (!hasFeedback && !hasCounter) return null;
    return (
      <>
        <DynamicFormDetails sections={FEEDBACK_FORM.sections} formData={referral.feedback_data} title="Referral Feedback" />
        <DynamicFormDetails sections={COUNTER_REFERRAL_FORM.sections} formData={referral.counter_referral_data} title="Counter-Referral" />
      </>
    );
  }

  const onSave = () =>
    save(
      { id: referral.id, payload: { feedback_data: feedback, counter_referral_data: counter } },
      {
        onSuccess: () => toast({ variant: "success", title: "Feedback saved", description: "The referring facility has been notified." }),
        onError: (e) => toast({ variant: "destructive", title: "Could not save", description: getApiErrorMessage(e) }),
      }
    );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Referral Feedback & Counter-Referral
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Filled by the receiving facility — the patient's outcome and any follow-up recommendations.
          The referring facility sees this on their copy of the case.
        </p>
        <DynamicFormFields sections={FEEDBACK_FORM.sections} value={feedback} onChange={(name, v) => setFeedback((p) => ({ ...p, [name]: v }))} />
        <DynamicFormFields sections={COUNTER_REFERRAL_FORM.sections} value={counter} onChange={(name, v) => setCounter((p) => ({ ...p, [name]: v }))} />
        <Button onClick={onSave} disabled={isPending}>
          <Check className="mr-2 h-4 w-4" />
          {isPending ? "Saving…" : "Save feedback"}
        </Button>
      </CardContent>
    </Card>
  );
};
