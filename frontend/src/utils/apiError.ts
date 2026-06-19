import { AxiosError } from "axios";

interface FastApiValidationError {
  loc?: (string | number)[];
  msg?: string;
}

/**
 * Extracts a human-readable message from a backend (FastAPI) error.
 * FastAPI returns `detail` as either a string or an array of validation errors.
 */
export const getApiErrorMessage = (
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string => {
  if (error instanceof AxiosError) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") {
      return detail;
    }

    if (Array.isArray(detail)) {
      return detail
        .map((e: FastApiValidationError) => {
          const field = e.loc?.filter((p) => p !== "body").join(".");
          return field ? `${field}: ${e.msg}` : e.msg;
        })
        .filter(Boolean)
        .join("; ") || fallback;
    }
    
    if (detail?.message) {
      return detail.message as string;
    }

    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};
