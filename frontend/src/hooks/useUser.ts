import { createUser, updateUser } from "@/api/users.api";
import { toast } from "@/components/ui/toaster";
import { EditUserFormValues, UserFormValues } from "@/schemas/user.schema";
import { getApiErrorMessage } from "@/utils/apiError";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export const useUpdateUser = ({ onClose }: { onClose: () => void }) => {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: EditUserFormValues }) =>
            updateUser(id, {
                first_name: data.first_name,
                last_name: data.last_name,
                phone: data.phone,
                email: data.email,
                roles: data.roles,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["users"] });
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
                roles: data.roles,
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