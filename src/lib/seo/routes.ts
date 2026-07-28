export const INDEXABLE_STATIC_ROUTES = [
  "/",
  "/pricing",
  "/academy",
  "/marketplace",
  "/events",
  "/blog",
  "/case-studies",
  "/partners",
  "/support",
  "/privacy",
  "/terms",
  "/about",
  "/contact",
] as const;

export const PRIVATE_ROUTE_PREFIXES = [
  "/open",
  "/login",
  "/signup",
  "/dashboard",
  "/settings",
  "/profile",
  "/admin",
  "/ai",
  "/mentor",
  "/social",
  "/reseller",
  "/my-courses",
  "/notifications",
  "/tools",
  "/community",
  "/academy/certificates",
  "/academy/*/learn",
  "/academy/*/quiz",
  "/academy/*/exam",
] as const;

export function isPrivateRoute(pathname: string) {
  return PRIVATE_ROUTE_PREFIXES.some((prefix) => {
    if (prefix.includes("*")) {
      const [head, tail] = prefix.split("*");
      return pathname.startsWith(head) && pathname.includes(tail);
    }
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}
