"use client";

import React, { type ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { languagePreferenceLabels, languagePreferences, type LanguagePreference } from "@intellicash/shared";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  CircleHelp,
  Languages,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  UserRound,
  X
} from "@/lib/theme-icons";
import { apiFetch, humanizeEnum } from "../../lib/api";
import { navigationItems } from "../../lib/navigation";
import { FallbackImage } from "../fallback-image";
import { DEFAULT_AVATAR_PLACEHOLDER } from "../../lib/placeholders";
import { ThemeToggle } from "../theme-toggle";
import { PwaInstallManager } from "./pwa-install-manager";
import type { InAppNotification, User } from "./types";

const routeTitles = [
  {
    match: "/dashboard/account",
    title: "Account"
  },
  {
    match: "/dashboard/users",
    title: "Users"
  },
  {
    match: "/dashboard/payments",
    title: "Payments"
  },
  {
    match: "/dashboard/programmes",
    title: "Programs"
  },
  {
    match: "/dashboard/intelli-store",
    title: "Intelli-Store"
  },
  {
    match: "/dashboard/reports",
    title: "Reports"
  },
  {
    match: "/dashboard/intelliaudit",
    title: "IntelliAudit"
  },
  {
    match: "/dashboard/groups",
    title: "Groups"
  },
  {
    match: "/dashboard/meetings",
    title: "Meetings"
  },
  {
    match: "/dashboard/passbook",
    title: "Passbook"
  },
  {
    match: "/dashboard/partners",
    title: "Partners"
  },
  {
    match: "/dashboard/agents",
    title: "VA / CBT"
  },
  {
    match: "/dashboard/audit",
    title: "Audit"
  },
  {
    match: "/dashboard/api-docs",
    title: "API Docs"
  },
  {
    match: "/dashboard/integrations",
    title: "Integrations"
  },
  {
    match: "/dashboard/settings",
    title: "Settings"
  },
  {
    match: "/dashboard/help-support",
    title: "Help & Support"
  }
];

const languagePreferenceShortLabels: Record<LanguagePreference, string> = {
  ENGLISH: "EN",
  KISWAHILI: "SW",
  KIEMBU: "EM",
  GIKUYU: "KI"
};

function normalizeLanguagePreference(value?: string | null): LanguagePreference {
  return ((languagePreferences as readonly string[]).includes(value ?? "") ? value : "ENGLISH") as LanguagePreference;
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";

  return new Intl.DateTimeFormat("en-KE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguagePreference>("ENGLISH");
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);

  const heading = useMemo(() => {
    const matched = routeTitles.find((route) => pathname.startsWith(route.match));
    return (
      matched ?? {
        title: "Dashboard"
      }
    );
  }, [pathname]);
  const visibleNavigation = useMemo(
    () =>
      navigationItems.filter((item) =>
        user ? item.roles.includes(user.role) : item.href === "/dashboard"
      ),
    [user]
  );
  const unreadNotificationCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications]
  );
  const groupBottomNavigation = useMemo(() => {
    if (user?.role !== "GROUP_ACCOUNT") return [];

    const primaryTabs = new Set(["Dashboard", "Meetings", "Intelli-Store", "Reports"]);
    return visibleNavigation.filter((item) => primaryTabs.has(item.label));
  }, [user, visibleNavigation]);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      try {
        const me = await apiFetch<User>("/auth/me");
        if (mounted) setUser(me);
      } catch (error) {
        if (
          error instanceof Error &&
          "status" in error &&
          (error as { status: number }).status === 401
        ) {
          router.push("/login");
          return;
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadUser();
    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!user || pathname === "/dashboard") return;

    const profileRouteAllowed = [
      "/dashboard/account",
      "/dashboard/settings",
      "/dashboard/help-support"
    ].some((route) => pathname === route || pathname.startsWith(`${route}/`));
    const scopedGroupRouteAllowed =
      user.role === "GROUP_ACCOUNT" && pathname.startsWith("/dashboard/groups/");
    const routeAllowed = visibleNavigation.some((item) =>
      item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href)
    );

    if (!routeAllowed && !profileRouteAllowed && !scopedGroupRouteAllowed) router.push("/dashboard");
  }, [pathname, router, user, visibleNavigation]);

  useEffect(() => {
    function updateShellUser(event: Event) {
      const updated = (event as CustomEvent<User>).detail;
      if (!updated?.id) return;

      setUser((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
    }

    window.addEventListener("intellicash:user-updated", updateShellUser as EventListener);
    return () => {
      window.removeEventListener("intellicash:user-updated", updateShellUser as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setSelectedLanguage(normalizeLanguagePreference(user.languagePreference));
    let mounted = true;

    async function loadNotifications() {
      try {
        const rows = await apiFetch<InAppNotification[]>("/notifications");
        if (mounted) setNotifications(rows);
      } catch {
        if (mounted) setNotifications([]);
      }
    }

    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [user]);

  useEffect(() => {
    setIsNavigationOpen(false);
    setIsNotificationsOpen(false);
    setIsLanguageMenuOpen(false);
    setIsProfileMenuOpen(false);
  }, [pathname]);

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/login");
  }

  async function markNotificationRead(notificationId: string) {
    try {
      const updated = await apiFetch<InAppNotification>(
        `/notifications/${notificationId}/read`,
        { method: "POST" }
      );
      setNotifications((rows) =>
        rows.map((notification) => (notification.id === notificationId ? updated : notification))
      );
    } catch {
      setNotifications((rows) =>
        rows.map((notification) =>
          notification.id === notificationId
            ? { ...notification, readAt: notification.readAt ?? new Date().toISOString() }
            : notification
        )
      );
    }
  }

  async function markAllNotificationsRead() {
    const readAt = new Date().toISOString();
    setNotifications((rows) =>
      rows.map((notification) => (notification.readAt ? notification : { ...notification, readAt }))
    );
    await apiFetch("/notifications/read-all", { method: "POST" }).catch(() => null);
  }

  async function openNotification(notification: InAppNotification) {
    await markNotificationRead(notification.id);
    setIsNotificationsOpen(false);
    if (notification.href) router.push(notification.href);
  }

  async function changeLanguage(languagePreference: LanguagePreference) {
    if (!user) return;
    const currentLanguage = selectedLanguage;
    if (languagePreference === currentLanguage) {
      setIsLanguageMenuOpen(false);
      return;
    }

    setLanguageSaving(true);
    setLanguageError(null);
    const previousUser = user;
    const previousLanguage = currentLanguage;
    const optimisticUser = { ...user, languagePreference };
    setSelectedLanguage(languagePreference);
    setUser(optimisticUser);
    window.dispatchEvent(new CustomEvent("intellicash:user-updated", { detail: optimisticUser }));

    try {
      const updated = await apiFetch<User>("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ languagePreference })
      });
      setSelectedLanguage(normalizeLanguagePreference(updated.languagePreference));
      setUser(updated);
      window.dispatchEvent(new CustomEvent("intellicash:user-updated", { detail: updated }));
      setIsLanguageMenuOpen(false);
    } catch (error) {
      setSelectedLanguage(previousLanguage);
      setUser(previousUser);
      window.dispatchEvent(new CustomEvent("intellicash:user-updated", { detail: previousUser }));
      setLanguageError(error instanceof Error ? error.message : "Language update failed.");
    } finally {
      setLanguageSaving(false);
    }
  }

  function closeLanguageMenuOnBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setIsLanguageMenuOpen(false);
    }
  }

  function closeProfileMenuOnBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setIsProfileMenuOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="pwa-splash-screen" role="status" aria-live="polite">
        <img alt="" src="/pwa/icon-192.png" />
        <strong>Intelli-Cash</strong>
        <span>Loading workspace...</span>
      </div>
    );
  }

  const profileName = user?.name ?? "Intelli Cash user";
  const profileRole = user?.role ? humanizeEnum(user.role) : "Account";
  const currentLanguage = selectedLanguage;
  const currentLanguageLabel = languagePreferenceLabels[currentLanguage];

  const isGroupAccountPwa = user?.role === "GROUP_ACCOUNT";
  const isGroupBottomTabRoute = groupBottomNavigation.some((item) => pathname === item.href);
  const groupPwaRouteClass =
    isGroupAccountPwa && pathname === "/dashboard"
      ? "group-pwa-route-dashboard"
      : isGroupAccountPwa && pathname === "/dashboard/meetings"
        ? "group-pwa-route-meetings"
        : isGroupAccountPwa && pathname === "/dashboard/intelli-store"
          ? "group-pwa-route-store"
          : isGroupAccountPwa && pathname === "/dashboard/reports"
            ? "group-pwa-route-reports"
            : isGroupAccountPwa && pathname === "/dashboard/account"
              ? "group-pwa-route-account"
              : "";

  return (
    <div
      className={`app-shell ${isNavigationOpen ? "nav-open" : ""} ${isGroupAccountPwa ? "group-pwa-shell" : ""} ${
        isGroupBottomTabRoute ? "group-pwa-tab-screen" : ""
      } ${groupPwaRouteClass}`}
    >
      <button
        aria-label="Close navigation menu"
        className="mobile-nav-backdrop"
        onClick={() => setIsNavigationOpen(false)}
        type="button"
      />
      <aside className="sidebar" id="dashboard-navigation">
        <div className="sidebar-header">
          <Link className="brand" href="/dashboard">
            <img
              alt="Intelli Cash - Trusted Financial Partner"
              className="brand-logo sidebar-logo"
              src="/brand/intelli-cash-logo.png"
            />
          </Link>
          <button
            aria-label="Close navigation menu"
            className="icon-button mobile-nav-close"
            onClick={() => setIsNavigationOpen(false)}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="nav-list" aria-label="Primary navigation">
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);

            return (
              <Link
                className={`nav-item ${active ? "active" : ""}`}
                href={item.href}
                key={item.label}
                onClick={() => setIsNavigationOpen(false)}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-heading">
            <button
              aria-controls="dashboard-navigation"
              aria-expanded={isNavigationOpen}
              aria-label="Open navigation menu"
              className="icon-button mobile-nav-toggle"
              onClick={() => setIsNavigationOpen(true)}
              type="button"
            >
              <Menu size={19} />
            </button>
            <h1>{heading.title}</h1>
          </div>
          <div className="user-menu">
            <ThemeToggle compact />
            <div className="language-menu" onBlur={closeLanguageMenuOnBlur}>
              <button
                aria-expanded={isLanguageMenuOpen}
                aria-haspopup="menu"
                aria-label={`Change language, current ${currentLanguageLabel}`}
                className="icon-button language-button"
                onClick={() => {
                  setIsNotificationsOpen(false);
                  setIsProfileMenuOpen(false);
                  setLanguageError(null);
                  setIsLanguageMenuOpen((open) => !open);
                }}
                title={`Language: ${currentLanguageLabel}`}
                type="button"
              >
                <Languages size={17} />
                <span className="language-button-label">{languagePreferenceShortLabels[currentLanguage]}</span>
              </button>
              {isLanguageMenuOpen ? (
                <section className="language-popover" aria-label="Language choices">
                  <header>
                    <strong>Language</strong>
                    <span>{currentLanguageLabel}</span>
                  </header>
                  <div className="language-option-list" role="menu" aria-label="Choose language">
                    {languagePreferences.map((languagePreference) => {
                      const selected = languagePreference === currentLanguage;

                      return (
                        <button
                          aria-checked={selected}
                          className={`language-option ${selected ? "selected" : ""}`}
                          disabled={languageSaving}
                          key={languagePreference}
                          onClick={() => changeLanguage(languagePreference)}
                          role="menuitemradio"
                          type="button"
                        >
                          <span>
                            <strong>{languagePreferenceLabels[languagePreference]}</strong>
                            <em>{languagePreferenceShortLabels[languagePreference]}</em>
                          </span>
                          {selected ? <CheckCircle2 size={16} /> : null}
                        </button>
                      );
                    })}
                  </div>
                  {languageError ? <p className="language-error">{languageError}</p> : null}
                </section>
              ) : null}
            </div>
            <PwaInstallManager userRole={user?.role} />
            <div className="notification-menu">
              <button
                aria-expanded={isNotificationsOpen}
                aria-haspopup="dialog"
                aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ""}`}
                className="icon-button notification-button"
                onClick={() => {
                  setIsLanguageMenuOpen(false);
                  setIsProfileMenuOpen(false);
                  setIsNotificationsOpen((open) => !open);
                }}
                type="button"
              >
                <Bell size={18} />
                {unreadNotificationCount > 0 ? (
                  <span className="notification-badge">
                    {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                  </span>
                ) : null}
              </button>
              {isNotificationsOpen ? (
                <section className="notification-popover" aria-label="Notifications">
                  <header>
                    <div>
                      <strong>Notifications</strong>
                      <span>
                        {unreadNotificationCount === 0
                          ? "All read"
                          : `${unreadNotificationCount} unread`}
                      </span>
                    </div>
                    <button
                      className="button secondary notification-mark-all"
                      disabled={unreadNotificationCount === 0}
                      onClick={markAllNotificationsRead}
                      type="button"
                    >
                      <CheckCheck size={15} />
                      Mark all read
                    </button>
                  </header>
                  {notifications.length > 0 ? (
                    <div className="notification-list">
                      {notifications.map((notification) => (
                        <button
                          className={`notification-item ${notification.readAt ? "" : "unread"}`}
                          key={notification.id}
                          onClick={() => openNotification(notification)}
                          type="button"
                        >
                          <span className="notification-item-title">
                            <span className="notification-dot" aria-hidden="true" />
                            <strong>{notification.title}</strong>
                          </span>
                          <span className="notification-body">{notification.body}</span>
                          <span className="notification-time">
                            {formatNotificationTime(notification.createdAt)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="notification-empty">No notifications yet.</div>
                  )}
                </section>
              ) : null}
            </div>
            <div
              className={`profile-menu ${isProfileMenuOpen ? "open" : ""}`}
              onBlur={closeProfileMenuOnBlur}
              onMouseEnter={() => {
                setIsLanguageMenuOpen(false);
                setIsProfileMenuOpen(true);
              }}
              onMouseLeave={() => setIsProfileMenuOpen(false)}
            >
              <button
                aria-expanded={isProfileMenuOpen}
                aria-haspopup="menu"
                aria-label={`Open profile menu for ${profileName}`}
                className="profile-chip"
                onClick={() => {
                  setIsNotificationsOpen(false);
                  setIsLanguageMenuOpen(false);
                  setIsProfileMenuOpen((open) => !open);
                }}
                title={profileName}
                type="button"
              >
                <FallbackImage
                  alt=""
                  className="user-avatar"
                  fallbackSrc={DEFAULT_AVATAR_PLACEHOLDER}
                  src={user?.avatarUrl}
                />
                <span className="profile-chip-copy">
                  <strong>{profileName}</strong>
                  <span>{profileRole}</span>
                </span>
              </button>
              {isProfileMenuOpen ? (
                <section className="profile-menu-popover" aria-label="Profile menu panel">
                  <div className="profile-menu-card">
                    <header>
                      <strong>{profileName}</strong>
                      <span>{profileRole}</span>
                    </header>
                    <nav className="profile-menu-list" role="menu" aria-label="Profile menu">
                      <Link className="profile-menu-item" href="/dashboard/account" role="menuitem">
                        <UserRound size={16} />
                        <span>Account</span>
                      </Link>
                      <Link className="profile-menu-item" href="/dashboard/settings" role="menuitem">
                        <SettingsIcon size={16} />
                        <span>Settings</span>
                      </Link>
                      <Link className="profile-menu-item" href="/dashboard/help-support" role="menuitem">
                        <CircleHelp size={16} />
                        <span>Help & Support</span>
                      </Link>
                    </nav>
                  </div>
                </section>
              ) : null}
            </div>
            <button className="button secondary" onClick={logout} type="button">
              <LogOut size={17} />
              Sign out
            </button>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
      {groupBottomNavigation.length > 0 ? (
        <nav className="bottom-tab-bar" aria-label="Group account app navigation">
          {groupBottomNavigation.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/dashboard"
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link className={`bottom-tab-item ${active ? "active" : ""}`} href={item.href} key={item.label}>
                <Icon size={18} />
                <span>{item.label === "Intelli-Store" ? "Store" : item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
