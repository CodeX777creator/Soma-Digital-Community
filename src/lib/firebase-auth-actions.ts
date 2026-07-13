import type { ActionCodeSettings } from "firebase/auth";

export function getAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return process.env.NEXT_PUBLIC_APP_URL || "https://www.somatoday.com";
}

export function getAuthActionUrl(): string {
  return `${getAppOrigin().replace(/\/$/, "")}/auth/action`;
}

export function getAuthActionCodeSettings(): ActionCodeSettings {
  return {
    url: getAuthActionUrl(),
    handleCodeInApp: false,
  };
}
