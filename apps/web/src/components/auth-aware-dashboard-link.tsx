"use client";

import React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../lib/api";

interface AuthAwareDashboardLinkProps {
  className?: string;
  signedInLabel?: string;
  signedOutLabel?: string;
  onClick?: () => void;
}

export function AuthAwareDashboardLink({
  className,
  signedInLabel = "Dashboard",
  signedOutLabel = "Sign in",
  onClick
}: AuthAwareDashboardLinkProps) {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    let mounted = true;

    apiFetch<{ id?: string }>("/auth/me")
      .then((user) => {
        if (mounted) setIsSignedIn(Boolean(user?.id));
      })
      .catch(() => {
        if (mounted) setIsSignedIn(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Link className={className} href={isSignedIn ? "/dashboard" : "/login"} onClick={onClick}>
      {isSignedIn ? signedInLabel : signedOutLabel}
    </Link>
  );
}
