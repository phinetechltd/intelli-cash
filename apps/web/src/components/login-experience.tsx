"use client";

import type { FormEvent } from "react";
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "@/lib/theme-icons";
import { demoAccounts, demoPassword } from "@intellicash/shared";
import type { Role } from "@intellicash/shared";
import { apiFetch, humanizeEnum } from "../lib/api";
import { refreshOfflinePinCache } from "../lib/offline-pin-cache";

interface LoginExperienceProps {
  ariaLabel?: string;
  copyTitle: string;
  copyText: string;
  demoRoles?: readonly Role[];
  formTitle?: string;
}

export function LoginExperience({
  ariaLabel = "Intelli Cash platform",
  copyTitle,
  copyText,
  demoRoles,
  formTitle = "Sign in"
}: LoginExperienceProps) {
  const router = useRouter();
  const visibleDemoAccounts = useMemo(
    () => demoAccounts.filter((account) => !demoRoles || demoRoles.includes(account.role)),
    [demoRoles]
  );
  const initialAccount = visibleDemoAccounts[0] ?? demoAccounts[0];
  const [email, setEmail] = useState<string>(initialAccount.email);
  const [password, setPassword] = useState<string>(demoPassword);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeDemoEmail, setActiveDemoEmail] = useState<string | null>(null);

  async function signIn(nextEmail: string = email, nextPassword: string = password) {
    setError(null);
    setLoading(true);

    try {
      const signedInUser = await apiFetch<{ role: Role; groupId?: string | null }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: nextEmail, password: nextPassword })
      });
      if (signedInUser.role === "GROUP_ACCOUNT" && signedInUser.groupId) {
        void refreshOfflinePinCache(signedInUser.groupId).catch(() => undefined);
      }
      router.push("/dashboard");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await signIn();
  }

  async function signInAsDemo(account: (typeof demoAccounts)[number]) {
    setEmail(account.email);
    setPassword(demoPassword);
    setActiveDemoEmail(account.email);
    await signIn(account.email, demoPassword);
    setActiveDemoEmail(null);
  }

  return (
    <main className="login-screen">
      <section className="login-copy" aria-label={ariaLabel}>
        <div className="logo-panel">
          <img
            alt="Intelli Cash - Trusted Financial Partner"
            className="brand-logo login-logo"
            src="/brand/intelli-cash-logo.png"
          />
        </div>
        <div>
          <h1>{copyTitle}</h1>
          <p>{copyText}</p>
        </div>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={onSubmit}>
          <h2>{formTitle}</h2>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button className="button" disabled={loading} type="submit">
            <LogIn size={18} />
            {loading ? "Signing in" : "Sign in"}
          </button>
        </form>
        {visibleDemoAccounts.length > 0 ? (
          <section className="demo-login">
            <header>
              <h3>Demo accounts</h3>
              <span>One-click access</span>
            </header>
            <div className="demo-account-list">
              {visibleDemoAccounts.map((account) => (
                <button
                  className="demo-account-button"
                  disabled={loading}
                  key={account.email}
                  onClick={() => void signInAsDemo(account)}
                  type="button"
                >
                  <span>
                    <strong>{humanizeEnum(account.role)}</strong>
                    <small>{account.scope}</small>
                  </span>
                  <em>{activeDemoEmail === account.email ? "Signing in" : "Open"}</em>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
