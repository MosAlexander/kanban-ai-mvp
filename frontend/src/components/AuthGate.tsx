"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { api } from "@/lib/api";

type AuthState = "loading" | "authenticated" | "anonymous";

const PUBLIC_PATHS = new Set(["/login", "/login/"]);

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<AuthState>("loading");
  const isPublic = PUBLIC_PATHS.has(pathname);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    api
      .getSession()
      .then((s) => {
        if (cancelled) return;
        const authed = s.authenticated;
        setState(authed ? "authenticated" : "anonymous");
        if (!authed && !isPublic) router.replace("/login/");
        else if (authed && isPublic) router.replace("/");
      })
      .catch(() => {
        if (!cancelled) setState("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, isPublic, router]);

  if (state === "loading") return isPublic ? <>{children}</> : null;
  if (state === "anonymous" && !isPublic) return null;
  if (state === "authenticated" && isPublic) return null;
  return <>{children}</>;
}
