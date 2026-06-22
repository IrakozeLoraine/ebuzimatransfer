import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/responsive-dialog"
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { RejectReferralForm, rejectReferralSchema } from '@/schemas/referral.schema'
import { zodResolver } from '@hookform/resolvers/zod/dist/zod.js'
import { useForm } from 'react-hook-form'

export default function RejectDialog({ open, onOpenChange, onSubmit, isSubmitting }: { open: boolean; onOpenChange: (open: boolean) => void; onSubmit: (data: { reason: string; comment?: string }) => void; isSubmitting: boolean }) {
    const { register, handleSubmit, setValue, formState: { errors } } = useForm<RejectReferralForm>({
        resolver: zodResolver(rejectReferralSchema),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reject Referral</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>Reason <span className="text-destructive">*</span></Label>
                        <Select onValueChange={(v) => setValue("reason", v)}>
                            <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="NO_RESOURCE">No Resource Available</SelectItem>
                                <SelectItem value="NO_CAPACITY">No Capacity</SelectItem>
                                <SelectItem value="NOT_APPROPRIATE">Not Clinically Appropriate</SelectItem>
                                <SelectItem value="MISSING_INFO">Missing Information</SelectItem>
                                <SelectItem value="OTHER">Other</SelectItem>
                            </SelectContent>
                        </Select>
                        {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                        <Label>Additional comment <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Textarea placeholder="Provide additional context…" {...register("comment")} />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" variant="destructive" disabled={isSubmitting}>
                            {isSubmitting ? "Rejecting…" : "Confirm Rejection"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
