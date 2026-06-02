"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";
import { Download, Smartphone } from "@/lib/theme-icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function PwaInstallManager({ userRole }: { userRole?: string }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const enabled = userRole === "GROUP_ACCOUNT";
  const label = useMemo(() => {
    if (installed) return "App installed";
    if (installPrompt) return "Install app";
    return "Download app";
  }, [installPrompt, installed]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    setInstalled(isStandaloneDisplay());

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setMessage(null);
    }

    function handleInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
      setMessage("Installed on this device.");
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [enabled]);

  if (!enabled) return null;

  async function installApp() {
    if (installed) {
      setMessage("Open Intelli-Cash from your device apps.");
      return;
    }

    if (!installPrompt) {
      setMessage("Use the browser menu to install or add this app to your home screen.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setMessage(
      choice.outcome === "accepted"
        ? "Installing Intelli-Cash group app."
        : "Install dismissed. You can try again from the browser menu."
    );
  }

  return (
    <div className="pwa-install-control">
      <button className="button secondary pwa-install-button" onClick={installApp} type="button">
        {installed ? <Smartphone size={16} /> : <Download size={16} />}
        <span className="pwa-install-label">{label}</span>
      </button>
      {message ? <span className="pwa-install-message">{message}</span> : null}
    </div>
  );
}
