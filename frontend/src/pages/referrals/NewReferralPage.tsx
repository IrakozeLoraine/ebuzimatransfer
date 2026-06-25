import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateReferral } from "@/hooks/useReferrals";
import { useFacilities } from "@/hooks/useFacilities";
import { useUnits } from "@/hooks/useUnits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, User, Stethoscope, Building2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NewReferralFormValues, newReferralSchema } from "@/schemas/referral.schema";

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

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<NewReferralFormValues>({
    resolver: zodResolver(newReferralSchema),
    defaultValues: { ventilator_needed: false, high_flow_oxygen_needed: false },
  });

  // Prefill destination facility + requested unit when arriving from Resource Lookup.
  useEffect(() => {
    const facility = searchParams.get("facility");
    const unit = searchParams.get("unit");
    if (facility) setValue("preferred_facility_id", facility, { shouldValidate: true });
    if (unit) setValue("requested_unit_id", unit, { shouldValidate: true });
  }, [searchParams, setValue]);

  const onSubmit = (data: NewReferralFormValues) => {
    create(data, {
      onSuccess: (referral) => navigate(`/transfer-requests/${referral.id}`),
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Transfer Request</h1>
          <p className="text-sm text-muted-foreground">Complete all required sections below</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Failed to create the transfer request. Please check all fields and try again.</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Patient Information */}
        <Card>
          <CardHeader className="pb-4">
            <SectionHeader icon={User} title="Patient Information" step={1} />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Patient Code <span className="text-destructive">*</span></Label>
              <Input placeholder="PT-001" {...register("patient_code")} />
              {errors.patient_code && <p className="text-xs text-destructive">{errors.patient_code.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Age Band <span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => setValue("age_band", v)}>
                <SelectTrigger><SelectValue placeholder="Select age band" /></SelectTrigger>
                <SelectContent>
                  {["0-1","2-5","6-12","13-17","18-30","31-45","46-60","61-75","75+"].map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.age_band && <p className="text-xs text-destructive">{errors.age_band.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Sex <span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => setValue("sex", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Male</SelectItem>
                  <SelectItem value="F">Female</SelectItem>
                </SelectContent>
              </Select>
              {errors.sex && <p className="text-xs text-destructive">{errors.sex.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Clinical Summary */}
        <Card>
          <CardHeader className="pb-4">
            <SectionHeader icon={Stethoscope} title="Clinical Summary" step={2} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Diagnosis <span className="text-destructive">*</span></Label>
              <Textarea placeholder="Primary diagnosis…" {...register("diagnosis")} />
              {errors.diagnosis && <p className="text-xs text-destructive">{errors.diagnosis.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Comorbidities</Label>
              <Textarea placeholder="List any comorbidities…" {...register("comorbidities")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Acuity Level <span className="text-destructive">*</span></Label>
                <Select onValueChange={(v) => setValue("acuity_level", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
                {errors.acuity_level && <p className="text-xs text-destructive">{errors.acuity_level.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Urgency <span className="text-destructive">*</span></Label>
                <Select onValueChange={(v) => setValue("urgency", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IMMEDIATE">Immediate</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                    <SelectItem value="NON_URGENT">Non-Urgent</SelectItem>
                  </SelectContent>
                </Select>
                {errors.urgency && <p className="text-xs text-destructive">{errors.urgency.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason for Transfer <span className="text-destructive">*</span></Label>
              <Textarea placeholder="Why is this patient being transferred?" {...register("reason_for_transfer")} />
              {errors.reason_for_transfer && <p className="text-xs text-destructive">{errors.reason_for_transfer.message}</p>}
            </div>
            <div className="flex flex-wrap gap-6 pt-1">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox
                  checked={watch("ventilator_needed")}
                  onCheckedChange={(v) => setValue("ventilator_needed", !!v)}
                />
                <span className="text-sm font-medium">Ventilator needed</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox
                  checked={watch("high_flow_oxygen_needed")}
                  onCheckedChange={(v) => setValue("high_flow_oxygen_needed", !!v)}
                />
                <span className="text-sm font-medium">High-flow O₂ needed</span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Preferred Destination */}
        <Card>
          <CardHeader className="pb-4">
            <SectionHeader icon={Building2} title="Preferred Destination" step={3} />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Preferred Facility <span className="text-destructive">*</span></Label>
              <Select value={watch("preferred_facility_id")} onValueChange={(v) => setValue("preferred_facility_id", v, { shouldValidate: true })}>
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
              <Select value={watch("requested_unit_id")} onValueChange={(v) => setValue("requested_unit_id", v, { shouldValidate: true })}>
                <SelectTrigger><SelectValue placeholder="Select requested unit" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.requested_unit_id && <p className="text-xs text-destructive">{errors.requested_unit_id.message}</p>}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} className="flex-1 sm:flex-none sm:min-w-40">
            {isPending ? "Submitting…" : "Submit Transfer Request"}
          </Button>
        </div>
      </form>
    </div>
  );
};
