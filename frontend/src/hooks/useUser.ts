import { createUser, updateUser, getUser, removeUserFromFacility } from "@/api/users.api";
import { toast } from "@/components/ui/toaster";
import { EditUserFormValues, UserFormValues } from "@/schemas/user.schema";
import { getApiErrorMessage } from "@/utils/apiError";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const useUser = (id: string | undefined) =>
    useQuery({ queryKey: ["user", id], queryFn: () => getUser(id!), enabled: !!id });

export const useRemoveUserFromFacility = ({ onSuccess }: { onSuccess?: () => void } = {}) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ userId, facilityId }: { userId: string; facilityId: string }) =>
            removeUserFromFacility(userId, facilityId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["users"] });
            qc.invalidateQueries({ queryKey: ["user"] });
            qc.invalidateQueries({ queryKey: ["facility"] });
            toast({ variant: "success", title: "User removed from facility" });
            onSuccess?.();
        },
        onError: (error) =>
            toast({
                variant: "destructive",
                title: "Failed to remove user from facility",
                description: getApiErrorMessage(error),
            }),
    });
};

export const useUpdateUser = ({ onClose }: { onClose: () => void }) => {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: EditUserFormValues }) =>
            updateUser(id, {
                first_name: data.first_name,
                last_name: data.last_name,
                phone: data.phone,
                email: data.email,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["users"] });
            qc.invalidateQueries({ queryKey: ["user"] });
            toast({ variant: "success", title: "User updated" });
            onClose();
        },
        onError: (error) => {
            toast({
                variant: "destructive",
                title: "Failed to update user",
                description: getApiErrorMessage(error),
            });
        }
    })
};

export const useCreateUser = ({ onClose }: { onClose: () => void }) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: UserFormValues) =>
            createUser({
                email: data.email,
                medical_id: data.medical_id,
                first_name: data.first_name,
                last_name: data.last_name,
                phone: data.phone,
                password: data.password,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["users"] });
            toast({ variant: "success", title: "User created" });
            onClose();
        },
        onError: (error) => {
            toast({
                variant: "destructive",
                title: "Failed to create user",
                description: getApiErrorMessage(error),
            });
        },
    });
}