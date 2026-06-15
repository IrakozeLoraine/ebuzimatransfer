import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

export const useCompleteAuth = () => {
    const { setTokens, setUser } = useAuthStore();
    const navigate = useNavigate();
    return async (access_token: string, refresh_token: string) => {
        setTokens(access_token, refresh_token);
        setUser(await getMe());
        navigate("/dashboard");
    };
};

export const useLogin = () => useMutation({ mutationFn: apiLogin });
export const useSetPassword = () => {
    const completeAuth = useCompleteAuth();
    return useMutation({
        mutationFn: apiSetPassword,
        onSuccess: (data) => { if (data.access_token && data.refresh_token) completeAuth(data.access_token, data.refresh_token); },
    });
};
