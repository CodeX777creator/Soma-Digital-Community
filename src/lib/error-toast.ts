import { getErrorToast, toAppError } from "@/lib/errors";
import { trackErrorEvent } from "@/lib/error-observability";

type ToastFn = (props: any) => unknown;

export function showErrorToast(
  toast: ToastFn,
  error: unknown,
  context: {
    title?: string;
    fallback?: string;
  } = {}
) {
  const appError = toAppError(error, { message: context.fallback });
  trackErrorEvent("error_shown", appError, { feature: context.title });
  return toast({
    ...getErrorToast(appError, context.title || "Action failed"),
  });
}
