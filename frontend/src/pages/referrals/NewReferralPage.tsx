import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateReferral } from "@/hooks/useReferrals";
import { useFacilities } from "@/hooks/useFacilities";
import { useUnits } from "@/hooks/useUnits";
import { useAvailableResources } from "@/hooks/useResources";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Building2, ClipboardList } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NewReferralFormValues, newReferralSchema } from "@/schemas/referral.schema";
import { DictationPanel } from "./DictationPanel";
import { CallButton } from "@/components/call/CallButton";
import type { DictationResult } from "@/types/referral";
import { DynamicFormFields } from "@/components/referral/DynamicFormFields";
import {
  FORM_TYPE_ORDER,
  TRANSFER_FORMS,
  CORE_FIELD_NAMES,
  getFormDef,
  defaultFormTypeForUnit,
  voiceSpecForForm,
  type FormType,
} from "@/config/transferForms";

const CORE_SET = new Set<string>(CORE_FIELD_NAMES);

// Friendly labels for the required fields, used to tell the clinician exactly what's
// still missing when a submit is blocked.
const REQUIRED_FIELD_LABELS: Record<string, string> = {
  preferred_facility_id: "Preferred facility",
  requested_unit_id: "Requested clinical unit",
  requested_resource_id: "Requested resource",
  form_type: "Form type",
  sex: "Sex",
  diagnosis: "Diagnosis",
  reason_for_transfer: "Reason for transfer",
};

const SectionHeader = ({
  icon: Icon,
  title,
  step,
}: {
  icon: React.ElementType;
  title: string;
  step: number;
}) => (
  <div className="flex items-center gap-3">
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white text-xs font-bold shadow-glow-sm">
      {step}
    </div>
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <span className="font-semibold text-foreground">{title}</span>
    </div>
  </div>
);

export const NewReferralPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { mutate: create, isPending, error } = useCreateReferral();
  const { data: facilities = [] } = useFacilities();
  const { data: units = [] } = useUnits();
  const myFacilityId = useAuthStore((s) => s.user?.active_facility_id ?? null);
  const myUnitIds = useAuthStore((s) => s.user?.unit_ids ?? []);
  const myName = useAuthStore((s) => (s.user ? `${s.user.first_name} ${s.user.last_name}`.trim() : ""));
  const [preferredFacilityDetails, setPreferredFacilityDetails] = useState({
    facilityId: searchParams.get("facility") || "",
    unitId: searchParams.get("unit") || "",
    resourceId: searchParams.get("resource") || "",
  });

  const {
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<NewReferralFormValues>({
    resolver: zodResolver(newReferralSchema),
    // Initialise every required string field to "" so an untouched field validates as
    // "required" with a clear message, instead of a raw "expected string, received
    // undefined" type error.
    defaultValues: {
      patient_code: "",
      sex: "",
      diagnosis: "",
      reason_for_transfer: "",
      preferred_facility_id: "",
      requested_unit_id: "",
      requested_resource_id: "",
      form_type: "EXTERNAL",
      form_data: {},
    },
  });

  const formType = (watch("form_type") || "EXTERNAL") as FormType;
  // All form values flattened for the dynamic renderer: top-level core fields
  // (patient_code, diagnosis…) plus everything in form_data. The renderer reads by
  // field name; the change handler below routes each back to the right place.
  const allValues = watch();
  const combinedValue = useMemo(
    () => ({ ...allValues, ...(allValues.form_data as Record<string, unknown> | undefined) }),
    [allValues]
  );

  // Validation messages for the required core fields, keyed by field name.
  const coreErrors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const n of CORE_FIELD_NAMES) {
      const msg = (errors as Record<string, { message?: string }>)[n]?.message;
      if (msg) out[n] = msg;
    }
    return out;
  }, [errors]);

  // Route a dynamic field change to a top-level core column or into form_data.
  const handleFieldChange = (name: string, value: unknown) => {
    if (CORE_SET.has(name)) {
      setValue(name as keyof NewReferralFormValues, value as never, { shouldValidate: true });
    } else {
      setValue("form_data", { ...(getValues("form_data") || {}), [name]: value });
    }
  };

  // Hybrid form selection: default the MoH form variant from the requested unit
  // (and whether the destination is the requester's own facility — an internal
  // transfer), but let the clinician override it.
  const [formTypeTouched, setFormTypeTouched] = useState(false);
  const requestedUnitName = useMemo(
    () => units.find((u) => u.id === preferredFacilityDetails.unitId)?.name ?? null,
    [units, preferredFacilityDetails.unitId]
  );
  const suggestedFormType = useMemo(
    () => defaultFormTypeForUnit(requestedUnitName, preferredFacilityDetails.facilityId === myFacilityId && !!preferredFacilityDetails.facilityId),
    [requestedUnitName, preferredFacilityDetails.facilityId, myFacilityId]
  );

  useEffect(() => {
    if (!formTypeTouched) setValue("form_type", suggestedFormType);
  }, [suggestedFormType, formTypeTouched, setValue]);

  const handleFormTypeChange = (v: string) => {
    setFormTypeTouched(true);
    setValue("form_type", v);
  };

  // A clinician can't request a transfer into their own department — i.e. a unit
  // they work in at their own facility.
  const isOwnDepartment =
    preferredFacilityDetails.facilityId === myFacilityId && !!preferredFacilityDetails.unitId && myUnitIds.includes(preferredFacilityDetails.unitId);

  const { data: availableResources = [], isLoading: resourcesLoading } = useAvailableResources(preferredFacilityDetails.unitId || null);
  const facilityResources = useMemo(
    () => availableResources.filter((r) => r.facility_id === preferredFacilityDetails.facilityId),
    [availableResources, preferredFacilityDetails.facilityId]
  );

  // Prefill destination facility + requested unit + resource when arriving from
  // Resource Lookup (or a call follow-up), so the form shows what was chosen.
  useEffect(() => {
    const facility = searchParams.get("facility");
    const unit = searchParams.get("unit");
    const resource = searchParams.get("resource");
    if (facility) setPreferredFacilityDetails((prev) => ({ ...prev, facilityId: facility }));
    if (unit) setPreferredFacilityDetails((prev) => ({ ...prev, unitId: unit }));
    if (resource) setPreferredFacilityDetails((prev) => ({ ...prev, resourceId: resource }));
  }, [searchParams]);

  // Keep the destination selections in the RHF payload. The resource mirrors the
  // selection too, so it's set whether picked manually, re-picked, or prefilled.
  useEffect(() => {
    setValue("preferred_facility_id", preferredFacilityDetails.facilityId, { shouldValidate: true });
    setValue("requested_unit_id", preferredFacilityDetails.unitId, { shouldValidate: true });
    setValue("requested_resource_id", preferredFacilityDetails.resourceId, { shouldValidate: true });
  }, [preferredFacilityDetails.facilityId, preferredFacilityDetails.unitId, preferredFacilityDetails.resourceId, setValue]);

  // Autofill the receiving facility & service from the destination, and the referring
  // health provider with the logged-in clinician's name.
  useEffect(() => {
    const facilityName = facilities.find((f) => f.id === preferredFacilityDetails.facilityId)?.name ?? "";
    const serviceName = units.find((u) => u.id === preferredFacilityDetails.unitId)?.name ?? "";
    const cur = getValues("form_data") || {};
    if (
      cur.receiving_facility !== facilityName ||
      cur.receiving_service !== serviceName ||
      cur.referring_provider_name !== myName
    ) {
      setValue("form_data", {
        ...cur,
        receiving_facility: facilityName,
        receiving_service: serviceName,
        referring_provider_name: myName,
      });
    }
  }, [preferredFacilityDetails.facilityId, preferredFacilityDetails.unitId, facilities, units, myName, setValue, getValues]);

  // If the destination changes so the chosen resource is no longer available there,
  // drop the stale selection (the RHF field follows via the sync effect above).
  useEffect(() => {
    if (resourcesLoading) return;
    if (preferredFacilityDetails.resourceId && !facilityResources.some((r) => r.id === preferredFacilityDetails.resourceId)) {
      setPreferredFacilityDetails((prev) => ({ ...prev, resourceId: "" }));
    }
  }, [facilityResources, preferredFacilityDetails.resourceId, resourcesLoading]);

  // Apply a dictation result: core fields go to their columns; form-specific values
  // merge into form_data. The clinician reviews everything before submitting.
  const applyDictation = (r: DictationResult) => {
    const f = r.fields;
    if (f.patient_code) setValue("patient_code", f.patient_code, { shouldValidate: true });
    if (f.sex) setValue("sex", f.sex, { shouldValidate: true });
    if (f.diagnosis) setValue("diagnosis", f.diagnosis, { shouldValidate: true });
    if (f.reason_for_transfer) setValue("reason_for_transfer", f.reason_for_transfer, { shouldValidate: true });
    if (r.form_data && typeof r.form_data === "object") {
      setValue("form_data", { ...(getValues("form_data") || {}), ...(r.form_data as Record<string, unknown>) });
    }
    if (r.audio_url) setValue("audio_url", r.audio_url);
    setValue("transcript", r.transcript);
    setValue("ai_summary", r.summary);
  };

  const onSubmit = (data: NewReferralFormValues) => {
    if (isOwnDepartment) return;
    create(data, {
      onSuccess: (referral) => navigate(`/transfer-requests/${referral.id}`),
    });
  };

  const preferredFacilityName = facilities.find((f) => f.id === preferredFacilityDetails.facilityId)?.name;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Transfer Request</h1>
          <p className="text-sm text-muted-foreground">Pick the destination, then complete the transfer form</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Failed to create the transfer request. Please check all fields and try again.</AlertDescription>
        </Alert>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Preferred Destination */}
        <Card>
          <CardHeader className="pb-4">
            <SectionHeader icon={Building2} title="Preferred Destination" step={1} />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Preferred Facility <span className="text-destructive">*</span></Label>
              <Select
                value={preferredFacilityDetails.facilityId}
                onValueChange={(v) => setPreferredFacilityDetails((prev) => ({ ...prev, facilityId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select destination facility" /></SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.preferred_facility_id && <p className="text-xs text-destructive">{errors.preferred_facility_id.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Requested Clinical Unit <span className="text-destructive">*</span></Label>
              <Select
                value={preferredFacilityDetails.unitId}
                onValueChange={(v) => setPreferredFacilityDetails((prev) => ({ ...prev, unitId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select requested unit" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.requested_unit_id && <p className="text-xs text-destructive">{errors.requested_unit_id.message}</p>}
              {isOwnDepartment && (
                <p className="text-xs text-destructive">
                  This is your own department — pick a different facility or unit to transfer to.
                </p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Requested Resource <span className="text-destructive">*</span></Label>
              <Select
                value={preferredFacilityDetails.resourceId}
                onValueChange={(v) => setPreferredFacilityDetails((prev) => ({ ...prev, resourceId: v }))}
                disabled={!preferredFacilityDetails.facilityId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !preferredFacilityDetails.facilityId
                        ? "Select a facility first"
                        : facilityResources.length === 0
                          ? "No resources available at this facility"
                          : "Select an available resource"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {facilityResources.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.resource_name}
                      {r.unit_name ? ` · ${r.unit_name}` : ""} — {r.available} available
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {preferredFacilityDetails.facilityId && (
                <p className="text-xs text-muted-foreground">
                  {facilityResources.length} resource type{facilityResources.length === 1 ? "" : "s"} with availability at this facility
                  {preferredFacilityDetails.unitId ? " in the requested unit" : ""}.
                </p>
              )}
              {errors.requested_resource_id && <p className="text-xs text-destructive">{errors.requested_resource_id.message}</p>}
            </div>

            {/* Coordinate by an in-app voice call with an on-call clinician at the
                destination before/while raising the request. */}
            {preferredFacilityDetails.facilityId && (
              <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-medium">Need to coordinate first?</p>
                  <p className="text-xs text-muted-foreground">
                    Call the {requestedUnitName ? `${requestedUnitName} unit` : "unit"} at {preferredFacilityName ?? "this facility"}.
                  </p>
                </div>
                <CallButton
                  facilityId={preferredFacilityDetails.facilityId}
                  facilityName={preferredFacilityName}
                  unitId={preferredFacilityDetails.unitId || undefined}
                  unitName={requestedUnitName ?? undefined}
                  label="Call"
                  variant="outline"
                />
              </div>
            )}
          </CardContent>
        </Card>
        <DictationPanel onResult={applyDictation} formSpec={voiceSpecForForm(formType)} disabled={isPending} />

        {/* Transfer form — the Rwanda MoH form variant (with its patient, clinical and
            form-specific sections), defaulted from the destination. */}
        <Card>
          <CardHeader className="pb-4">
            <SectionHeader icon={ClipboardList} title="Transfer Form" step={2} />
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Form type <span className="text-destructive">*</span></Label>
              <Select value={formType} onValueChange={handleFormTypeChange}>
                <SelectTrigger><SelectValue placeholder="Select form type" /></SelectTrigger>
                <SelectContent>
                  {FORM_TYPE_ORDER.map((ft) => (
                    <SelectItem key={ft} value={ft}>{TRANSFER_FORMS[ft].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {getFormDef(formType).description}
                {!formTypeTouched && " (auto-selected from the destination — change it if needed)"}
              </p>
            </div>

            <DynamicFormFields
              sections={getFormDef(formType).sections}
              value={combinedValue}
              onChange={handleFieldChange}
              errors={coreErrors}
            />
          </CardContent>
        </Card>

        {Object.keys(errors).length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              Please complete these required fields:{" "}
              {Object.keys(errors)
                .map((k) => REQUIRED_FIELD_LABELS[k] ?? k)
                .join(", ")}
              .
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || isOwnDepartment} className="flex-1 sm:flex-none sm:min-w-40">
            {isPending ? "Submitting…" : "Submit Transfer Request"}
          </Button>
        </div>
      </form>
    </div>
  );
};
