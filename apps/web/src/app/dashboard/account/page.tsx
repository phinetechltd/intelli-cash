"use client";

import type { ChangeEvent, FormEvent } from "react";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { languagePreferenceLabels, languagePreferences } from "@intellicash/shared";
import {
  Bell,
  CalendarDays,
  Camera,
  CircleDollarSign,
  HandCoins,
  HeartHandshake,
  IdCard,
  KeyRound,
  Landmark,
  LockKeyhole,
  Mail,
  Phone,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  WalletCards
} from "@/lib/theme-icons";
import { apiFetch, formatKes, humanizeEnum, uploadFile } from "../../../lib/api";
import { DataTable } from "../../../components/dashboard/data-table";
import { StatCard } from "../../../components/dashboard/stat-card";
import { FallbackImage } from "../../../components/fallback-image";
import { DEFAULT_AVATAR_PLACEHOLDER } from "../../../lib/placeholders";
import type {
  GroupRow,
  Member,
  PartnerWallet,
  PartnerWalletTransaction,
  ProgrammeRow,
  User
} from "../../../components/dashboard/types";

const defaultDeposit = {
  provider: "MPESA_DARAJA",
  amountKes: "2500",
  phoneNumber: ""
};

const defaultWithdrawal = {
  provider: "MPESA_DARAJA",
  amountKes: "1000",
  payoutPhoneNumber: "",
  payoutRecipientCode: ""
};

const defaultContribution = {
  programmeId: "",
  type: "DONATION",
  source: "WALLET",
  provider: "MPESA_DARAJA",
  amountKes: "1000",
  phoneNumber: ""
};

const defaultPasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
};

function cents(value: string) {
  return Math.round(Number(value) * 100);
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("en-KE") : "Pending";
}

function memberOtpLabel(member?: Member | null) {
  if (!member?.currentOtpSet || !member.currentOtpExpiresAt) return "No current OTP";
  return `Expires ${new Date(member.currentOtpExpiresAt).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function publishUserUpdate(user: User) {
  window.dispatchEvent(new CustomEvent("intellicash:user-updated", { detail: user }));
}

function AccountProfileCard({
  detail = "Update the account display used in the dashboard.",
  eyebrow = "Account",
  onUserUpdated,
  title = "Profile",
  user
}: {
  detail?: string;
  eyebrow?: string;
  onUserUpdated?: (user: User) => void;
  title?: string;
  user: User;
}) {
  const [profileForm, setProfileForm] = useState({
    name: user.name,
    avatarUrl: user.avatarUrl ?? "",
    languagePreference: user.languagePreference ?? "ENGLISH"
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setProfileForm({
      name: user.name,
      avatarUrl: user.avatarUrl ?? "",
      languagePreference: user.languagePreference ?? "ENGLISH"
    });
  }, [user.avatarUrl, user.id, user.languagePreference, user.name]);

  function applyProfileUpdate(updated: User, text: string) {
    setProfileForm({
      name: updated.name,
      avatarUrl: updated.avatarUrl ?? "",
      languagePreference: updated.languagePreference ?? "ENGLISH"
    });
    onUserUpdated?.(updated);
    publishUserUpdate(updated);
    setMessage({ ok: true, text });
  }

  async function saveProfile(avatarUrl = profileForm.avatarUrl.trim() || null, successText = "Profile updated.") {
    const name = profileForm.name.trim().length >= 2 ? profileForm.name.trim() : user.name;
    const updated = await apiFetch<User>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ name, avatarUrl, languagePreference: profileForm.languagePreference })
    });
    applyProfileUpdate(updated, successText);
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    setMessage(null);

    try {
      await saveProfile();
    } catch (profileError) {
      setMessage({ ok: false, text: profileError instanceof Error ? profileError.message : "Profile update failed" });
    } finally {
      setProfileSaving(false);
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setAvatarUploading(true);
    setMessage(null);

    try {
      const uploaded = await uploadFile("avatar", file);
      await saveProfile(uploaded.url, "Avatar updated.");
    } catch (uploadError) {
      setMessage({ ok: false, text: uploadError instanceof Error ? uploadError.message : "Avatar upload failed" });
    } finally {
      setAvatarUploading(false);
    }
  }

  async function removeAvatar() {
    setProfileSaving(true);
    setMessage(null);

    try {
      await saveProfile(null, "Avatar removed.");
    } catch (profileError) {
      setMessage({ ok: false, text: profileError instanceof Error ? profileError.message : "Avatar removal failed" });
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <form className="data-card member-account-card account-profile-card" onSubmit={submitProfile}>
      <header>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          <span>{detail}</span>
        </div>
        <UserRound size={18} />
      </header>

      <div className="account-profile-layout">
        <label className={`avatar-upload-target ${avatarUploading ? "loading" : ""}`}>
          <input
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-label="Change profile photo"
            disabled={avatarUploading || profileSaving}
            onChange={uploadAvatar}
            type="file"
          />
          <FallbackImage
            alt=""
            className="member-account-avatar"
            fallbackSrc={DEFAULT_AVATAR_PLACEHOLDER}
            src={profileForm.avatarUrl}
          />
          <span className="avatar-upload-action">
            <Camera size={15} />
            {avatarUploading ? "Uploading" : "Change photo"}
          </span>
        </label>

        <div className="account-profile-fields">
          <label className="credential-field">
            <span>Display name</span>
            <input
              onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
              required
              value={profileForm.name}
            />
          </label>
          <label className="credential-field">
            <span>Image URL</span>
            <input
              onChange={(event) => setProfileForm((current) => ({ ...current, avatarUrl: event.target.value }))}
              placeholder="https://..."
              type="url"
              value={profileForm.avatarUrl}
            />
          </label>
          <label className="credential-field">
            <span>Preferred language</span>
            <select
              onChange={(event) => setProfileForm((current) => ({ ...current, languagePreference: event.target.value }))}
              value={profileForm.languagePreference}
            >
              {languagePreferences.map((language) => (
                <option key={language} value={language}>
                  {languagePreferenceLabels[language]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="profile-form-actions">
        <button className="button" disabled={profileSaving || avatarUploading} type="submit">
          <Save size={16} />
          {profileSaving ? "Saving" : "Save profile"}
        </button>
        <button
          className="button secondary"
          disabled={profileSaving || avatarUploading || !profileForm.avatarUrl}
          onClick={removeAvatar}
          type="button"
        >
          <Trash2 size={16} />
          Remove photo
        </button>
      </div>

      {message ? <div className={message.ok ? "notice success compact" : "notice warning compact"}>{message.text}</div> : null}
    </form>
  );
}

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    apiFetch<User>("/auth/me")
      .then((me) => {
        if (mounted) setUser(me);
      })
      .catch((accountError) => {
        if (mounted) setError(accountError instanceof Error ? accountError.message : "Account failed to load");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!user) return <div className="error">Account could not be loaded.</div>;

  if (user.role === "MEMBER") return <MemberAccountPage initialUser={user} />;
  if (user.role === "PARTNER_OFFICER" || user.role === "LENDER") return <PartnerWalletAccount initialUser={user} />;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h2>Profile</h2>
        </div>
      </section>
      <AccountProfileCard
        detail="Update your dashboard name and profile image."
        eyebrow={humanizeEnum(user.role)}
        onUserUpdated={setUser}
        user={user}
      />
    </>
  );
}

function MemberAccountPage({ initialUser }: { initialUser: User }) {
  const [user, setUser] = useState(initialUser);
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [passwordForm, setPasswordForm] = useState(defaultPasswordForm);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [credentialSaving, setCredentialSaving] = useState<"pin" | "otp" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMemberAccount() {
    const me = await apiFetch<User>("/auth/me");
    const [groupResponse, memberResponse] = me.groupId
      ? await Promise.all([
          apiFetch<GroupRow>(`/groups/${me.groupId}`),
          apiFetch<Member[]>(`/groups/${me.groupId}/members`)
        ])
      : [null, [] as Member[]];

    setUser(me);
    setGroup(groupResponse);
    setMembers(memberResponse);
  }

  useEffect(() => {
    let mounted = true;

    loadMemberAccount()
      .catch((accountError) => {
        if (mounted) setError(accountError instanceof Error ? accountError.message : "Member account failed to load");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const currentMember = useMemo(
    () => members.find((member) => member.id === user.memberId) ?? null,
    [members, user.memberId]
  );

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordSaving(true);
    setMessage(null);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ ok: false, text: "New password and confirmation do not match." });
      setPasswordSaving(false);
      return;
    }

    try {
      await apiFetch("/auth/me/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });
      setPasswordForm(defaultPasswordForm);
      setMessage({ ok: true, text: "Password updated." });
    } catch (passwordError) {
      setMessage({ ok: false, text: passwordError instanceof Error ? passwordError.message : "Password update failed" });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function requestCredential(kind: "pin" | "otp") {
    setCredentialSaving(kind);
    setMessage(null);

    try {
      const updatedMember = await apiFetch<Member>(kind === "pin" ? "/members/me/pin" : "/members/me/otp", {
        method: "POST",
        body: JSON.stringify({})
      });
      setMembers((current) =>
        current.some((member) => member.id === updatedMember.id)
          ? current.map((member) => (member.id === updatedMember.id ? updatedMember : member))
          : [...current, updatedMember]
      );
      setMessage({
        ok: true,
        text: kind === "pin" ? "Default offline PIN sent." : "Current meeting OTP sent."
      });
    } catch (credentialError) {
      setMessage({ ok: false, text: credentialError instanceof Error ? credentialError.message : "Credential request failed" });
    } finally {
      setCredentialSaving(null);
    }
  }

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Member Account</p>
          <h2
            aria-label="Profile and Settings"
            className="has-hint"
            data-hint="Manage your member account profile, meeting credentials, password, and linked group settings."
            tabIndex={0}
          >
            Profile and Settings
          </h2>
        </div>
        <Link className="button secondary" href="/dashboard">
          Dashboard
        </Link>
      </section>

      {message ? <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div> : null}

      <section className="data-card member-account-hero">
        <FallbackImage alt="" className="member-account-avatar" fallbackSrc={DEFAULT_AVATAR_PLACEHOLDER} src={user.avatarUrl} />
        <div className="member-account-hero-copy">
          <p className="eyebrow">Member Profile</p>
          <h3>{currentMember?.fullName ?? user.member?.fullName ?? user.name}</h3>
          <span>{group?.name ?? user.group?.name ?? "Member group"}</span>
          <div className="member-account-contact">
            <span><Mail size={14} /> {user.email}</span>
            <span><Phone size={14} /> {currentMember?.phone ?? user.member?.phone ?? "No phone"}</span>
          </div>
        </div>
        <div className="member-account-hero-status">
          <span className="pill blue">{humanizeEnum(currentMember?.role ?? "MEMBER")}</span>
          <span className={`pill ${currentMember?.kycStatus === "VERIFIED" ? "" : "gold"}`}>
            {humanizeEnum(currentMember?.kycStatus ?? "PENDING")}
          </span>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard icon={<IdCard size={20} />} label="Member status" note={currentMember?.status ? humanizeEnum(currentMember.status) : "Linked account"} value={currentMember?.kycStatus ? humanizeEnum(currentMember.kycStatus) : "Pending"} />
        <StatCard icon={<KeyRound size={20} />} label="Default PIN" note="Offline meeting unlock" value={currentMember?.defaultPinSet ? "Ready" : "Needs PIN"} />
        <StatCard icon={<Smartphone size={20} />} label="Current OTP" note={memberOtpLabel(currentMember)} value={currentMember?.currentOtpSet ? "Active" : "None"} />
        <StatCard icon={<CalendarDays size={20} />} label="Group" note={group?.county ?? "Scoped access"} value={group?.code ?? user.group?.code ?? "Linked"} />
      </section>

      <section className="member-account-grid member-account-primary-grid">
        <AccountProfileCard
          detail="Update the member display used in the dashboard and mobile flows."
          eyebrow="Member Profile"
          onUserUpdated={setUser}
          user={user}
        />

        <section className="data-card member-account-card">
          <header>
            <div>
              <h3>Member Record</h3>
              <span>Your group-verified member details.</span>
            </div>
            <ShieldCheck size={18} />
          </header>
          <div className="list">
            <div className="list-row">
              <div>
                <strong>{currentMember?.fullName ?? user.member?.fullName ?? user.name}</strong>
                <span>Full member name</span>
              </div>
              <span className="pill blue">{humanizeEnum(currentMember?.role ?? "MEMBER")}</span>
            </div>
            <div className="list-row">
              <div>
                <strong>{currentMember?.phone ?? user.member?.phone ?? "No phone"}</strong>
                <span>Registered mobile number</span>
              </div>
              <span className="pill">SMS</span>
            </div>
            <div className="list-row">
              <div>
                <strong>{formatDate(currentMember?.joinedAt)}</strong>
                <span>Joined group</span>
              </div>
              <span className={`pill ${currentMember?.status === "ACTIVE" ? "" : "gold"}`}>
                {humanizeEnum(currentMember?.status ?? "ACTIVE")}
              </span>
            </div>
          </div>
        </section>
      </section>

      <section className="member-account-grid member-account-security-grid">
        <section className="data-card member-account-card">
          <header>
            <div>
              <h3>Meeting Settings</h3>
              <span>Manage credentials used to activate meetings.</span>
            </div>
            <KeyRound size={18} />
          </header>
          <div className="member-setting-list">
            <div className="member-setting-row">
              <div>
                <strong>Default offline PIN</strong>
                <span>Saved inside the mobile app for offline meeting activation.</span>
              </div>
              <span className={`pill ${currentMember?.defaultPinSet ? "blue" : "gold"}`}>
                {currentMember?.defaultPinSet ? "Ready" : "Needed"}
              </span>
            </div>
            <div className="member-setting-row">
              <div>
                <strong>Current OTP</strong>
                <span>{memberOtpLabel(currentMember)}</span>
              </div>
              <span className={`pill ${currentMember?.currentOtpSet ? "" : "gold"}`}>
                {currentMember?.currentOtpSet ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
          <div className="credential-actions">
            <button className="button" disabled={Boolean(credentialSaving)} onClick={() => requestCredential("pin")} type="button">
              <KeyRound size={16} />
              {credentialSaving === "pin" ? "Sending" : "Send PIN"}
            </button>
            <button className="button secondary" disabled={Boolean(credentialSaving)} onClick={() => requestCredential("otp")} type="button">
              <Smartphone size={16} />
              {credentialSaving === "otp" ? "Sending" : "Send OTP"}
            </button>
          </div>
        </section>

        <form className="data-card member-account-card" onSubmit={submitPassword}>
          <header>
            <div>
              <h3>Password</h3>
              <span>Change the password for this member login.</span>
            </div>
            <LockKeyhole size={18} />
          </header>
          <label className="credential-field">
            <span>Current password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
              required
              type="password"
              value={passwordForm.currentPassword}
            />
          </label>
          <label className="credential-field">
            <span>New password</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
              required
              type="password"
              value={passwordForm.newPassword}
            />
          </label>
          <label className="credential-field">
            <span>Confirm new password</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              required
              type="password"
              value={passwordForm.confirmPassword}
            />
          </label>
          <button className="button" disabled={passwordSaving} type="submit">
            <LockKeyhole size={16} />
            {passwordSaving ? "Saving" : "Update password"}
          </button>
        </form>
      </section>

      <section className="member-account-grid member-account-support-grid">
        <section className="data-card member-account-card">
          <header>
            <div>
              <h3>Linked Group</h3>
              <span>Account scope for meetings, passbook, and store requests.</span>
            </div>
            <CalendarDays size={18} />
          </header>
          <div className="list">
            <div className="list-row">
              <div>
                <strong>{group?.name ?? user.group?.name ?? "Group"}</strong>
                <span>{group?.code ?? user.group?.code ?? "Linked group"}</span>
              </div>
              <span className="pill blue">{group?.county ?? "Scoped"}</span>
            </div>
            <div className="list-row">
              <div>
                <strong>{group?.meetingDay ?? "Not set"}</strong>
                <span>Meeting day</span>
              </div>
              <span className="pill">{group?.phase ? humanizeEnum(group.phase) : "Active"}</span>
            </div>
          </div>
        </section>

        <section className="data-card member-account-card">
          <header>
            <div>
              <h3>Notifications</h3>
              <span>Current delivery channels for account activity.</span>
            </div>
            <Bell size={18} />
          </header>
          <div className="member-setting-list">
            <div className="member-setting-row">
              <div>
                <strong>Meeting credentials</strong>
                <span>Default PIN and current OTP are sent by SMS.</span>
              </div>
              <span className="pill">SMS</span>
            </div>
            <div className="member-setting-row">
              <div>
                <strong>Mobile app cache</strong>
                <span>Default PIN remains available for offline unlock.</span>
              </div>
              <span className="pill blue">Enabled</span>
            </div>
          </div>
        </section>
      </section>
    </>
  );
}

function PartnerWalletAccount({ initialUser }: { initialUser: User }) {
  const [user, setUser] = useState(initialUser);
  const [wallet, setWallet] = useState<PartnerWallet | null>(null);
  const [transactions, setTransactions] = useState<PartnerWalletTransaction[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([]);
  const [deposit, setDeposit] = useState(defaultDeposit);
  const [withdrawal, setWithdrawal] = useState(defaultWithdrawal);
  const [contribution, setContribution] = useState(defaultContribution);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAccount() {
    const [walletResponse, transactionResponse, programmeResponse] = await Promise.all([
      apiFetch<PartnerWallet>("/partner-wallet"),
      apiFetch<PartnerWalletTransaction[]>("/partner-wallet/transactions"),
      apiFetch<ProgrammeRow[]>("/public/programmes")
    ]);
    setWallet(walletResponse);
    setTransactions(transactionResponse);
    setProgrammes(programmeResponse);
    setContribution((current) => ({
      ...current,
      programmeId: current.programmeId || programmeResponse[0]?.id || ""
    }));
  }

  useEffect(() => {
    let mounted = true;

    loadAccount()
      .catch((accountError) => {
        if (mounted) setError(accountError instanceof Error ? accountError.message : "Account failed to load");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const totals = useMemo(
    () =>
      transactions.reduce(
        (summary, transaction) => ({
          pending:
            summary.pending + (["PENDING", "APPROVED"].includes(transaction.status) ? transaction.amountCents : 0),
          completed:
            summary.completed + (transaction.status === "COMPLETED" ? transaction.amountCents : 0)
        }),
        { pending: 0, completed: 0 }
      ),
    [transactions]
  );

  async function submitDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const transaction = await apiFetch<PartnerWalletTransaction>("/partner-wallet/deposits", {
        method: "POST",
        body: JSON.stringify({
          provider: deposit.provider,
          amountCents: cents(deposit.amountKes),
          phoneNumber: deposit.phoneNumber || undefined
        })
      });
      setMessage({
        ok: true,
        text: transaction.providerCheckoutUrl
          ? "Paystack checkout is ready."
          : "Deposit request created. Complete the provider prompt to confirm."
      });
      if (transaction.providerCheckoutUrl) window.location.href = transaction.providerCheckoutUrl;
      await loadAccount();
    } catch (depositError) {
      setMessage({ ok: false, text: depositError instanceof Error ? depositError.message : "Deposit failed" });
    } finally {
      setSaving(false);
    }
  }

  async function submitWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await apiFetch<PartnerWalletTransaction>("/partner-wallet/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          provider: withdrawal.provider,
          amountCents: cents(withdrawal.amountKes),
          payoutPhoneNumber: withdrawal.payoutPhoneNumber || undefined,
          payoutRecipientCode: withdrawal.payoutRecipientCode || undefined
        })
      });
      setMessage({ ok: true, text: "Withdrawal request submitted for admin approval." });
      setWithdrawal(defaultWithdrawal);
      await loadAccount();
    } catch (withdrawalError) {
      setMessage({ ok: false, text: withdrawalError instanceof Error ? withdrawalError.message : "Withdrawal failed" });
    } finally {
      setSaving(false);
    }
  }

  async function submitContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const transaction = await apiFetch<PartnerWalletTransaction>(
        `/programmes/${contribution.programmeId}/contributions`,
        {
          method: "POST",
          body: JSON.stringify({
            type: contribution.type,
            source: contribution.source,
            provider: contribution.source === "DIRECT" ? contribution.provider : undefined,
            amountCents: cents(contribution.amountKes),
            phoneNumber: contribution.phoneNumber || undefined
          })
        }
      );
      setMessage({
        ok: true,
        text:
          contribution.source === "WALLET"
            ? "Contribution completed from wallet balance."
            : "Direct payment request created."
      });
      if (transaction.providerCheckoutUrl) window.location.href = transaction.providerCheckoutUrl;
      await loadAccount();
    } catch (contributionError) {
      setMessage({
        ok: false,
        text: contributionError instanceof Error ? contributionError.message : "Contribution failed"
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!wallet) return <div className="error">Wallet could not be loaded.</div>;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Partner Wallet</p>
          <h2
            aria-label="Wallet"
            className="has-hint"
            data-hint="Manage confirmed wallet funds, request payouts, and fund public Intelli Cash projects from one account surface."
            tabIndex={0}
          >
            Wallet
          </h2>
        </div>
      </section>

      {message ? <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div> : null}

      <AccountProfileCard
        detail="Update the account display used beside wallet and dashboard activity."
        eyebrow={humanizeEnum(user.role)}
        onUserUpdated={setUser}
        user={user}
      />

      <section className="stat-grid">
        <StatCard icon={<WalletCards size={20} />} label="Available" note="Balance less holds" value={formatKes(wallet.availableCents)} />
        <StatCard icon={<CircleDollarSign size={20} />} label="Balance" note="Confirmed funds" value={formatKes(wallet.balanceCents)} />
        <StatCard icon={<HandCoins size={20} />} label="Held" note="Pending withdrawals" value={formatKes(wallet.heldCents)} />
        <StatCard icon={<HeartHandshake size={20} />} label="Completed" note="All completed transactions" value={formatKes(totals.completed)} />
      </section>

      <section className="account-action-grid">
        <form className="data-card account-action-card" onSubmit={submitDeposit}>
          <header>
            <div>
              <h3>Deposit Money</h3>
              <span>Credit your partner wallet after provider confirmation.</span>
            </div>
            <Send size={18} />
          </header>
          <label className="credential-field">
            <span>Provider</span>
            <select
              onChange={(event) => setDeposit((current) => ({ ...current, provider: event.target.value }))}
              value={deposit.provider}
            >
              <option value="MPESA_DARAJA">M-Pesa</option>
              <option value="PAYSTACK">Paystack</option>
            </select>
          </label>
          <label className="credential-field">
            <span>Amount (KES)</span>
            <input
              min="1"
              onChange={(event) => setDeposit((current) => ({ ...current, amountKes: event.target.value }))}
              required
              type="number"
              value={deposit.amountKes}
            />
          </label>
          <label className="credential-field">
            <span>M-Pesa phone</span>
            <input
              onChange={(event) => setDeposit((current) => ({ ...current, phoneNumber: event.target.value }))}
              required={deposit.provider === "MPESA_DARAJA"}
              value={deposit.phoneNumber}
            />
          </label>
          <button className="button" disabled={saving} type="submit">
            Start deposit
          </button>
        </form>

        <form className="data-card account-action-card" onSubmit={submitWithdrawal}>
          <header>
            <div>
              <h3>Withdraw Request</h3>
              <span>Funds are held until an IWL admin approves payout.</span>
            </div>
            <WalletCards size={18} />
          </header>
          <label className="credential-field">
            <span>Provider</span>
            <select
              onChange={(event) => setWithdrawal((current) => ({ ...current, provider: event.target.value }))}
              value={withdrawal.provider}
            >
              <option value="MPESA_DARAJA">M-Pesa B2C</option>
              <option value="PAYSTACK">Paystack transfer</option>
            </select>
          </label>
          <label className="credential-field">
            <span>Amount (KES)</span>
            <input
              min="1"
              onChange={(event) => setWithdrawal((current) => ({ ...current, amountKes: event.target.value }))}
              required
              type="number"
              value={withdrawal.amountKes}
            />
          </label>
          {withdrawal.provider === "MPESA_DARAJA" ? (
            <label className="credential-field">
              <span>Payout phone</span>
              <input
                onChange={(event) => setWithdrawal((current) => ({ ...current, payoutPhoneNumber: event.target.value }))}
                required
                value={withdrawal.payoutPhoneNumber}
              />
            </label>
          ) : (
            <label className="credential-field">
              <span>Paystack recipient code</span>
              <input
                onChange={(event) => setWithdrawal((current) => ({ ...current, payoutRecipientCode: event.target.value }))}
                required
                value={withdrawal.payoutRecipientCode}
              />
            </label>
          )}
          <button className="button" disabled={saving} type="submit">
            Request withdrawal
          </button>
        </form>

        <form className="data-card account-action-card" onSubmit={submitContribution}>
          <header>
            <div>
              <h3>Fund Project</h3>
              <span>Use wallet funds or start a direct provider payment.</span>
            </div>
            <Landmark size={18} />
          </header>
          <label className="credential-field">
            <span>Project</span>
            <select
              onChange={(event) => setContribution((current) => ({ ...current, programmeId: event.target.value }))}
              required
              value={contribution.programmeId}
            >
              {programmes.map((programme) => (
                <option key={programme.id} value={programme.id}>
                  {programme.name}
                </option>
              ))}
            </select>
          </label>
          <label className="credential-field">
            <span>Type</span>
            <select
              onChange={(event) => setContribution((current) => ({ ...current, type: event.target.value }))}
              value={contribution.type}
            >
              <option value="DONATION">Donation</option>
              <option value="INVESTMENT">Investment</option>
            </select>
          </label>
          <label className="credential-field">
            <span>Source</span>
            <select
              onChange={(event) => setContribution((current) => ({ ...current, source: event.target.value }))}
              value={contribution.source}
            >
              <option value="WALLET">Wallet balance</option>
              <option value="DIRECT">Direct payment</option>
            </select>
          </label>
          {contribution.source === "DIRECT" ? (
            <label className="credential-field">
              <span>Provider</span>
              <select
                onChange={(event) => setContribution((current) => ({ ...current, provider: event.target.value }))}
                value={contribution.provider}
              >
                <option value="MPESA_DARAJA">M-Pesa</option>
                <option value="PAYSTACK">Paystack</option>
              </select>
            </label>
          ) : null}
          <label className="credential-field">
            <span>Amount (KES)</span>
            <input
              min="1"
              onChange={(event) => setContribution((current) => ({ ...current, amountKes: event.target.value }))}
              required
              type="number"
              value={contribution.amountKes}
            />
          </label>
          {contribution.source === "DIRECT" && contribution.provider === "MPESA_DARAJA" ? (
            <label className="credential-field">
              <span>M-Pesa phone</span>
              <input
                onChange={(event) => setContribution((current) => ({ ...current, phoneNumber: event.target.value }))}
                required
                value={contribution.phoneNumber}
              />
            </label>
          ) : null}
          <button className="button" disabled={saving || programmes.length === 0} type="submit">
            Submit contribution
          </button>
        </form>
      </section>

      <section className="data-card">
        <header>
          <div>
            <h3>Wallet Transactions</h3>
            <span>{formatKes(totals.pending)} pending or approved</span>
          </div>
        </header>
        <DataTable
          columns={[
            {
              key: "type",
              header: "Type",
              value: (transaction) => humanizeEnum(transaction.type),
              cell: (transaction) => <span className="pill blue">{humanizeEnum(transaction.type)}</span>
            },
            {
              key: "amount",
              header: "Amount",
              value: (transaction) => transaction.amountCents,
              cell: (transaction) => formatKes(transaction.amountCents)
            },
            {
              key: "project",
              header: "Project",
              value: (transaction) => transaction.programme?.name ?? "Wallet"
            },
            {
              key: "provider",
              header: "Provider",
              value: (transaction) => humanizeEnum(transaction.provider)
            },
            {
              key: "status",
              header: "Status",
              value: (transaction) => humanizeEnum(transaction.status),
              cell: (transaction) => <span className="pill">{humanizeEnum(transaction.status)}</span>
            },
            {
              key: "created",
              header: "Created",
              value: (transaction) => new Date(transaction.createdAt).getTime(),
              cell: (transaction) => new Date(transaction.createdAt).toLocaleString("en-KE")
            }
          ]}
          defaultSort={{ key: "created", direction: "desc" }}
          exportName="intelli-cash-wallet-transactions"
          getRowKey={(transaction) => transaction.id}
          rows={transactions}
          title="Wallet transactions"
        />
      </section>
    </>
  );
}
