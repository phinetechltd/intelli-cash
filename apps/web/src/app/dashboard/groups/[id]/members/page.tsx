"use client";

import React from "react";
import type { FormEvent } from "react";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, ShieldCheck, UserPlus } from "@/lib/theme-icons";
import { memberRoles } from "@intellicash/shared";
import { apiFetch, humanizeEnum } from "../../../../../lib/api";
import { CollectionView } from "../../../../../components/dashboard/collection-view";
import { DataTable } from "../../../../../components/dashboard/data-table";
import type { Member, User } from "../../../../../components/dashboard/types";

interface GroupSummary {
  id: string;
  name: string;
  code: string;
}

const defaultForm = {
  fullName: "",
  phone: "",
  role: "MEMBER",
  kycStatus: "PENDING"
};

export default function GroupMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [pinForm, setPinForm] = useState({ memberId: "" });
  const [otpForm, setOtpForm] = useState({ memberId: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    const [groupResponse, memberResponse, meResponse] = await Promise.all([
      apiFetch<GroupSummary>(`/groups/${id}`),
      apiFetch<Member[]>(`/groups/${id}/members`),
      apiFetch<User>("/auth/me")
    ]);
    setGroup(groupResponse);
    setMembers(memberResponse);
    setUser(meResponse);
  }

  useEffect(() => {
    let mounted = true;
    loadPage()
      .catch((loadError) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Members failed to load");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  const canWrite = user?.permissions?.includes("members:write") ?? false;

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const created = await apiFetch<Member>(`/groups/${id}/members`, {
        method: "POST",
        body: JSON.stringify(form)
      });
      setForm(defaultForm);
      await loadPage();
      setMessage({ ok: true, text: `${created.fullName} added. Default meeting PIN queued for SMS.` });
    } catch (saveError) {
      setMessage({ ok: false, text: saveError instanceof Error ? saveError.message : "Member failed to save" });
    } finally {
      setSaving(false);
    }
  }

  async function updateMemberPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const member = await apiFetch<Member>(`/groups/${id}/members/${pinForm.memberId}/pin`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setPinForm({ memberId: "" });
      await loadPage();
      setMessage({ ok: true, text: `${member.fullName} default meeting PIN generated and queued for SMS.` });
    } catch (pinError) {
      setMessage({ ok: false, text: pinError instanceof Error ? pinError.message : "PIN update failed" });
    } finally {
      setSaving(false);
    }
  }

  async function sendMemberOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const member = await apiFetch<Member>(`/groups/${id}/members/${otpForm.memberId}/otp`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setOtpForm({ memberId: "" });
      await loadPage();
      setMessage({ ok: true, text: `${member.fullName} meeting OTP generated and queued for SMS.` });
    } catch (otpError) {
      setMessage({ ok: false, text: otpError instanceof Error ? otpError.message : "OTP update failed" });
    } finally {
      setSaving(false);
    }
  }

  async function updateMember(member: Member, kycStatus: string) {
    setSaving(true);
    setMessage(null);

    try {
      const updated = await apiFetch<Member>(`/groups/${id}/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ kycStatus })
      });
      setMembers((current) => current.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
      setMessage({ ok: true, text: `${updated.fullName} updated.` });
    } catch (updateError) {
      setMessage({ ok: false, text: updateError instanceof Error ? updateError.message : "Member update failed" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <section className="page-heading">
        <div>
          <Link className="inline-back" href={`/dashboard/groups/${id}`}>
            <ArrowLeft size={17} />
            {group?.name ?? "Group"}
          </Link>
          <p className="eyebrow">Group Members</p>
          <h2>{group?.code ?? "Members"}</h2>
        </div>
        <span className="pill">{members.length} members</span>
      </section>

      {message ? <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div> : null}

      {canWrite ? (
        <section className="data-card">
          <header>
            <h3>Add Member</h3>
          </header>
          <form className="credential-form" onSubmit={createMember}>
            <div className="credential-grid">
              <label className="credential-field">
                <span>Name</span>
                <input
                  onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                  required
                  value={form.fullName}
                />
              </label>
              <label className="credential-field">
                <span>Phone</span>
                <input
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  required
                  value={form.phone}
                />
              </label>
              <label className="credential-field">
                <span>Role</span>
                <select
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                  value={form.role}
                >
                  {memberRoles.map((role) => (
                    <option key={role} value={role}>
                      {humanizeEnum(role)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="credential-field">
                <span>KYC</span>
                <select
                  onChange={(event) => setForm((current) => ({ ...current, kycStatus: event.target.value }))}
                  value={form.kycStatus}
                >
                  <option value="PENDING">Pending</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </label>
            </div>
            <div className="credential-actions">
              <button className="button" disabled={saving} type="submit">
                <UserPlus size={16} />
                {saving ? "Saving" : "Add member"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {canWrite ? (
        <section className="data-card">
          <header>
            <h3>Default PIN</h3>
            <span className="pill">{members.filter((member) => member.pinSet).length} default PIN-ready</span>
          </header>
          <form className="credential-form" onSubmit={updateMemberPin}>
            <div className="credential-grid">
              <label className="credential-field">
                <span>Member</span>
                <select
                  onChange={(event) => setPinForm((current) => ({ ...current, memberId: event.target.value }))}
                  required
                  value={pinForm.memberId}
                >
                  <option value="">Select member</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.fullName} {member.pinSet ? "(PIN set)" : "(needs PIN)"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="credential-actions">
              <button className="button" disabled={saving} type="submit">
                <KeyRound size={16} />
                  {saving ? "Sending" : "Send default PIN"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {canWrite ? (
        <section className="data-card">
          <header>
            <h3>Meeting OTP</h3>
            <span className="pill">{members.filter((member) => member.currentOtpSet).length} OTP-current</span>
          </header>
          <form className="credential-form" onSubmit={sendMemberOtp}>
            <div className="credential-grid">
              <label className="credential-field">
                <span>Member</span>
                <select
                  onChange={(event) => setOtpForm((current) => ({ ...current, memberId: event.target.value }))}
                  required
                  value={otpForm.memberId}
                >
                  <option value="">Select member</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.fullName} {member.currentOtpSet ? "(OTP current)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="credential-actions">
              <button className="button" disabled={saving} type="submit">
                <KeyRound size={16} />
                {saving ? "Sending" : "Send OTP"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="data-card">
        <header>
          <h3>Members</h3>
        </header>
        <CollectionView
          count={members.length}
          label="members"
          cards={
            <div className="card-grid compact">
              {members.map((member) => (
                <article className="record-card" key={member.id}>
                  <header>
                    <div>
                      <h4>{member.fullName}</h4>
                      <small>{member.phone}</small>
                    </div>
                    <span className={`pill ${member.pinSet ? "blue" : "gold"}`}>
                      {member.pinSet ? "PIN set" : "Needs PIN"}
                    </span>
                  </header>
                  <div className="record-card-meta">
                    <div>
                      <span>Role</span>
                      <strong>{humanizeEnum(member.role)}</strong>
                    </div>
                    <div>
                      <span>KYC</span>
                      <strong>{humanizeEnum(member.kycStatus)}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{humanizeEnum(member.status)}</strong>
                    </div>
                    <div>
                      <span>PIN</span>
                      <strong>{member.pinSet ? "Ready" : "Pending"}</strong>
                    </div>
                  </div>
                  {canWrite ? (
                    <div className="record-card-actions">
                      <button
                        className="button secondary"
                        disabled={saving || member.kycStatus === "VERIFIED"}
                        onClick={() => updateMember(member, "VERIFIED")}
                        type="button"
                      >
                        <ShieldCheck size={15} />
                        Verify
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
              {members.length === 0 ? <div className="empty-state">No members</div> : null}
            </div>
          }
          list={
            <DataTable
              columns={[
            { key: "name", header: "Name", value: (member) => member.fullName },
            { key: "phone", header: "Phone", value: (member) => member.phone },
            { key: "role", header: "Role", value: (member) => humanizeEnum(member.role) },
            {
              key: "pin",
              header: "PIN",
              value: (member) => (member.pinSet ? "PIN set" : "Needs PIN"),
              cell: (member) => <span className={`pill ${member.pinSet ? "blue" : "gold"}`}>{member.pinSet ? "PIN set" : "Needs PIN"}</span>
            },
            {
              key: "kyc",
              header: "KYC",
              value: (member) => member.kycStatus,
              cell: (member) => <span className="pill">{humanizeEnum(member.kycStatus)}</span>
            },
            {
              key: "action",
              header: "Action",
              value: () => "",
              exportable: false,
              searchable: false,
              sortable: false,
              cell: (member) =>
                canWrite ? (
                  <button
                    className="button secondary table-action-button"
                    disabled={saving || member.kycStatus === "VERIFIED"}
                    onClick={() => updateMember(member, "VERIFIED")}
                    type="button"
                  >
                    <ShieldCheck size={15} />
                    Verify
                  </button>
                ) : (
                  "No action"
                )
            }
          ]}
          exportName={`${group?.code ?? "group"}-members`}
          getRowKey={(member) => member.id}
          rows={members}
          title="Members"
            />
          }
        />
      </section>
    </>
  );
}
