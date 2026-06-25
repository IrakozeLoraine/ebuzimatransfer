import { createUser, updateUser, getUser, removeUserFromFacility, assignUserToSpecificFacility, assignUserToFacility, createAndAssignUser, deactivateUser, updateUserAccountStatus, getUsers, importUsers } from "@/api/users.api";
import { toast } from "@/components/ui/toaster";
import { AssignUserFormValues, CreateAssignFormValues, EditUserFormValues, UserFormValues } from "@/schemas/user.schema";
import { getApiErrorMessage } from "@/utils/apiError";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

export const useUser = (id: string | undefined) =>
    useQuery({ queryKey: ["user", id], queryFn: () => getUser(id!), enabled: !!id });

/** Bulk import users at a facility. Super admins pass a facilityId; facility
 *  admins omit it and the server uses their own facility. */
export const useImportUsers = (facilityId?: string) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (file: File) => importUsers(file, facilityId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["users"] });
            qc.invalidateQueries({ queryKey: ["user"] });
            qc.invalidateQueries({ queryKey: ["facility"] });
        },
    });
};

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

export const useAssignUser = ({ onSuccess, onNotFound, fixedUser, fixedFacility }: {
    onSuccess: () => void,
    onNotFound: () => void,
    fixedUser: null | {
        id: string;
        medical_id: string;
    },
    fixedFacility: null | {
        id: string;
        name: string;
    }
}) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: AssignUserFormValues) => {
            const medical_id = fixedUser?.medical_id ?? (data.medical_id as string);
            const facilityId = fixedFacility?.id ?? data.facility_id;
            // A specific facility (fixed or picked by a super admin) → targeted endpoint;
            // otherwise a facility admin assigns within their own active facility.
            return facilityId
                ? assignUserToSpecificFacility(facilityId, { medical_id, roles: data.roles, unit_ids: data.unit_ids })
                : assignUserToFacility({ medical_id, roles: data.roles, unit_ids: data.unit_ids });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["users"] });
            qc.invalidateQueries({ queryKey: ["user"] });
            qc.invalidateQueries({ queryKey: ["facility"] });
            toast({ variant: "success", title: "User assigned to facility" });
            onSuccess()
        },
        onError: (error) => {
            // A 404 means no user has that Medical ID — surface the "create" path instead of an error toast.
            if (isAxiosError(error) && error.response?.status === 404) {
                onNotFound()
                return;
            }
            toast({
                variant: "destructive",
                title: "Failed to assign user",
                description: getApiErrorMessage(error),
            });
        },
    })
};

export const useCreateAndAssignUser = ({ onSuccess, fixedFacility }: {
    onSuccess: () => void;
    fixedFacility: null | {
        id: string;
        name: string;
    }
}) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: CreateAssignFormValues) =>
            createAndAssignUser({
                email: data.email || undefined,
                medical_id: data.medical_id,
                first_name: data.first_name,
                last_name: data.last_name,
                phone: data.phone || undefined,
                roles: data.roles,
                unit_ids: data.unit_ids,
                facility_id: fixedFacility?.id ?? data.facility_id,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["users"] });
            qc.invalidateQueries({ queryKey: ["facility"] });
            toast({ variant: "success", title: "User created and assigned" });
            onSuccess()
        },
        onError: (error) =>
            toast({ variant: "destructive", title: "Failed to create user", description: getApiErrorMessage(error) }),
    })
}

export const useDeactivateUser = ({ id, onSuccess }: { id: string; onSuccess: () => void }) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => deactivateUser(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["user", id] });
            qc.invalidateQueries({ queryKey: ["users"] });
            toast({ variant: "success", title: "User deactivated" });
            onSuccess()
        },
        onError: (error) =>
            toast({ variant: "destructive", title: "Failed to deactivate user", description: getApiErrorMessage(error) }),
    });
}

export const useUpdateUserAccountStatus = ({ id, onSuccess, status }: { id: string; onSuccess: () => void; status: string }) => {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => updateUserAccountStatus(id, { account_status: status }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["user", id] });
            qc.invalidateQueries({ queryKey: ["users"] });
            toast({ variant: "success", title: "Account status updated" });
            onSuccess()
        },
        onError: (error) =>
            toast({ variant: "destructive", title: "Failed to update status", description: getApiErrorMessage(error) }),
    });
}

export const useGetAllUsers = () => useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
});