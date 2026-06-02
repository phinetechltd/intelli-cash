"use client";

import type { FormEvent } from "react";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, FileText, Pencil, UsersRound, Vote, X } from "@/lib/theme-icons";
import { apiFetch, formatKes, humanizeEnum } from "../../../../lib/api";
import { DataTable } from "../../../../components/dashboard/data-table";
import type { AgentRow, LedgerEntry, MeetingRow, Member, ProgrammeRow, User, VoteRow } from "../../../../components/dashboard/types";

const groupPhases = ["MOBILISATION", "INTENSIVE", "DEVELOPMENT", "MATURITY", "POST_GRADUATION"];

const defaultGroupForm = {
  name: "",
  code: "",
  county: "",
  subCounty: "",
  phase: "MOBILISATION",
  programmeIds: [] as string[],
  villageAgentId: "",
  location: "",
  objective: "",
  contactPersonName: "",
  contactPhone: "",
  meetingDay: "",
  gpsLatitude: "",
  gpsLongitude: "",
  gpsRadiusMeters: "50",
  shareValue: "500",
  maxSharesPerMemberPerMeeting: "10",
  constitutionVersion: "IWLSGS-1.0",
  cycleNumber: "1"
};

interface GroupDetail {
  id: string;
  name: string;
  code: string;
  phase: string;
  county: string;
  subCounty?: string | null;
  location?: string | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  gpsRadiusMeters?: number | null;
  shareValueCents?: number;
  maxSharesPerMemberPerMeeting?: number;
  composition?: string | null;
  objective?: string | null;
  contactPersonName?: string | null;
  contactPhone?: string | null;
  onboardingFeedback?: string | null;
  meetingDay?: string | null;
  constitutionVersion: string;
  cycleNumber: number;
  programme?: { id?: string; name: string; partner?: { name: string } | null } | null;
  programmeLinks?: Array<{ id: string; role: string; programme: ProgrammeRow }>;
  villageAgent?: { id?: string; name: string } | null;
  fundAccounts: Array<{ type: string; balanceCents: number; currency: string }>;
  creditScores: Array<{ score: number; computedAt: string; breakdownJson: string }>;
  _count: {
    members: number;
    meetings: number;
    votes: number;
    ledgerEntries: number;
  };
}

export default function DashboardGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState(defaultGroupForm);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadGroup() {
      try {
        const meResponse = await apiFetch<User>("/auth/me");
        const isMemberAccount = meResponse.role === "MEMBER";
        const [groupResponse, memberResponse, meetingResponse, ledgerResponse, voteResponse, programmeResponse, agentResponse] =
          await Promise.all([
            apiFetch<GroupDetail>(`/groups/${id}`),
            apiFetch<Member[]>(`/groups/${id}/members`),
            apiFetch<MeetingRow[]>(`/groups/${id}/meetings`),
            apiFetch<LedgerEntry[]>(`/groups/${id}/ledger`),
            isMemberAccount ? Promise.resolve([]) : apiFetch<VoteRow[]>(`/groups/${id}/votes`),
            isMemberAccount ? Promise.resolve([]) : apiFetch<ProgrammeRow[]>("/programmes"),
            isMemberAccount ? Promise.resolve([]) : apiFetch<AgentRow[]>("/village-agents").catch(() => [])
          ]);

        if (!mounted) return;
        setGroup(groupResponse);
        setMembers(memberResponse);
        setMeetings(meetingResponse);
        setLedger(ledgerResponse);
        setVotes(voteResponse);
        setProgrammes(programmeResponse);
        setUser(meResponse);
        setAgents(agentResponse);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Group failed to load");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadGroup();
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", isEditOpen);
    return () => document.body.classList.remove("modal-open");
  }, [isEditOpen]);

  const canEditGroup = user?.permissions?.includes("groups:write") ?? false;

  function openEditGroup(target: GroupDetail) {
    setForm({
      name: target.name,
      code: target.code,
      county: target.county,
      subCounty: target.subCounty ?? "",
      phase: target.phase,
      programmeIds: target.programmeLinks?.map((link) => link.programme.id) ?? (target.programme?.id ? [target.programme.id] : []),
      villageAgentId: target.villageAgent?.id ?? "",
      location: target.location ?? "",
      objective: target.objective ?? "",
      contactPersonName: target.contactPersonName ?? "",
      contactPhone: target.contactPhone ?? "",
      meetingDay: target.meetingDay ?? "",
      gpsLatitude: target.gpsLatitude === null || target.gpsLatitude === undefined ? "" : String(target.gpsLatitude),
      gpsLongitude: target.gpsLongitude === null || target.gpsLongitude === undefined ? "" : String(target.gpsLongitude),
      gpsRadiusMeters: String(target.gpsRadiusMeters ?? 50),
      shareValue: String((target.shareValueCents ?? 50000) / 100),
      maxSharesPerMemberPerMeeting: String(target.maxSharesPerMemberPerMeeting ?? 10),
      constitutionVersion: target.constitutionVersion ?? "IWLSGS-1.0",
      cycleNumber: String(target.cycleNumber ?? 1)
    });
    setMessage(null);
    setIsEditOpen(true);
  }

  function closeGroupModal() {
    setIsEditOpen(false);
  }

  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!group) return;
    setSaving(true);
    setMessage(null);

    try {
      const saved = await apiFetch<GroupDetail>(`/groups/${group.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          county: form.county,
          subCounty: form.subCounty || null,
          phase: form.phase,
          programmeIds: form.programmeIds,
          villageAgentId: form.villageAgentId || null,
          location: form.location || null,
          objective: form.objective || null,
          contactPersonName: form.contactPersonName || null,
          contactPhone: form.contactPhone || null,
          meetingDay: form.meetingDay || null,
          gpsLatitude: form.gpsLatitude === "" ? null : Number(form.gpsLatitude),
          gpsLongitude: form.gpsLongitude === "" ? null : Number(form.gpsLongitude),
          gpsRadiusMeters: Number(form.gpsRadiusMeters || 50),
          shareValueCents: Math.round(Number(form.shareValue || 500) * 100),
          maxSharesPerMemberPerMeeting: Number(form.maxSharesPerMemberPerMeeting || 10),
          constitutionVersion: form.constitutionVersion,
          cycleNumber: Number(form.cycleNumber || 1)
        })
      });

      setGroup(saved);
      setMessage({ ok: true, text: `${saved.name} group updated.` });
      setIsEditOpen(false);
    } catch (saveError) {
      setMessage({
        ok: false,
        text: saveError instanceof Error ? saveError.message : "Group failed to save"
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!group) return <div className="empty-state">Not found</div>;

  const currentScore = group.creditScores[0]?.score ?? 0;
  const isMember = user?.role === "MEMBER";

  return (
    <>
      <section className="page-heading">
        <div>
          <Link className="inline-back" href={isMember ? "/dashboard" : "/dashboard/groups"}>
            <ArrowLeft size={17} />
            {isMember ? "Dashboard" : "Groups"}
          </Link>
          <p className="eyebrow">Group Detail</p>
          <h2>{group.name}</h2>
          <p>
            {group.code} - {humanizeEnum(group.phase)} - Cycle {group.cycleNumber} -
            {group.constitutionVersion}
          </p>
        </div>
        <div className="page-heading-actions">
          <span className="pill blue">IWL Credit Score {currentScore}</span>
          {canEditGroup ? (
            <button className="button secondary" onClick={() => openEditGroup(group)} type="button">
              <Pencil size={16} />
              Edit
            </button>
          ) : null}
          <Link className="button secondary" href={`/dashboard/groups/${group.id}/meetings`}>
            <Activity size={16} />
            Meetings
          </Link>
          {!isMember ? (
            <>
              <Link className="button secondary" href={`/dashboard/groups/${group.id}/members`}>
                <UsersRound size={16} />
                Members
              </Link>
              <Link className="button secondary" href={`/dashboard/groups/${group.id}/ledger`}>
                <FileText size={16} />
                Ledger
              </Link>
              <Link className="button secondary" href={`/dashboard/groups/${group.id}/votes`}>
                <Vote size={16} />
                Votes
              </Link>
            </>
          ) : null}
        </div>
      </section>

      {!isEditOpen && message ? (
        <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
      ) : null}

      {isEditOpen && canEditGroup ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Edit group">
          <button className="modal-backdrop" onClick={closeGroupModal} type="button" aria-label="Close group editor" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>Edit Group</h3>
                <span>Profile, programs, and VA / CBT.</span>
              </div>
              <button className="icon-button" onClick={closeGroupModal} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form" onSubmit={submitGroup}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Group name</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    value={form.name}
                  />
                </label>
                <label className="credential-field">
                  <span>Code</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                    required
                    value={form.code}
                  />
                </label>
                <label className="credential-field">
                  <span>County</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, county: event.target.value }))}
                    required
                    value={form.county}
                  />
                </label>
                <label className="credential-field">
                  <span>Sub-county</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, subCounty: event.target.value }))}
                    value={form.subCounty}
                  />
                </label>
                <label className="credential-field">
                  <span>Phase</span>
                  <select
                    onChange={(event) => setForm((current) => ({ ...current, phase: event.target.value }))}
                    value={form.phase}
                  >
                    {groupPhases.map((phase) => (
                      <option key={phase} value={phase}>
                        {humanizeEnum(phase)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Programs</span>
                  <select
                    multiple
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        programmeIds: Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                      }))
                    }
                    required
                    value={form.programmeIds}
                  >
                    {programmes.map((programme) => (
                      <option key={programme.id} value={programme.id}>
                        {programme.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>VA / CBT</span>
                  <select
                    onChange={(event) => setForm((current) => ({ ...current, villageAgentId: event.target.value }))}
                    value={form.villageAgentId}
                  >
                    <option value="">Unassigned</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Location</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                    value={form.location}
                  />
                </label>
                <label className="credential-field">
                  <span>Meeting day</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, meetingDay: event.target.value }))}
                    value={form.meetingDay}
                  />
                </label>
                <label className="credential-field">
                  <span>Contact person</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, contactPersonName: event.target.value }))}
                    value={form.contactPersonName}
                  />
                </label>
                <label className="credential-field">
                  <span>Contact phone</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))}
                    value={form.contactPhone}
                  />
                </label>
                <label className="credential-field">
                  <span>Objective</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))}
                    value={form.objective}
                  />
                </label>
                <label className="credential-field">
                  <span>GPS latitude</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, gpsLatitude: event.target.value }))}
                    step="0.000001"
                    type="number"
                    value={form.gpsLatitude}
                  />
                </label>
                <label className="credential-field">
                  <span>GPS longitude</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, gpsLongitude: event.target.value }))}
                    step="0.000001"
                    type="number"
                    value={form.gpsLongitude}
                  />
                </label>
                <label className="credential-field">
                  <span>GPS radius meters</span>
                  <input
                    max="1000"
                    min="10"
                    onChange={(event) => setForm((current) => ({ ...current, gpsRadiusMeters: event.target.value }))}
                    type="number"
                    value={form.gpsRadiusMeters}
                  />
                </label>
                <label className="credential-field">
                  <span>Share value</span>
                  <input
                    min="1"
                    onChange={(event) => setForm((current) => ({ ...current, shareValue: event.target.value }))}
                    step="1"
                    type="number"
                    value={form.shareValue}
                  />
                </label>
                <label className="credential-field">
                  <span>Max shares per member per meeting</span>
                  <input
                    max="100"
                    min="1"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, maxSharesPerMemberPerMeeting: event.target.value }))
                    }
                    type="number"
                    value={form.maxSharesPerMemberPerMeeting}
                  />
                </label>
                <label className="credential-field">
                  <span>Constitution version</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, constitutionVersion: event.target.value }))}
                    value={form.constitutionVersion}
                  />
                </label>
                <label className="credential-field">
                  <span>Cycle number</span>
                  <input
                    min="1"
                    onChange={(event) => setForm((current) => ({ ...current, cycleNumber: event.target.value }))}
                    type="number"
                    value={form.cycleNumber}
                  />
                </label>
              </div>
              {message ? (
                <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
              ) : null}
              <div className="credential-actions">
                <button className="button" disabled={saving} type="submit">
                  <Pencil size={16} />
                  {saving ? "Saving" : "Save group"}
                </button>
                <button className="button secondary" onClick={closeGroupModal} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {!isMember ? (
        <section className="stat-grid">
          {group.fundAccounts.map((account) => (
            <article className="stat-card" key={account.type}>
              <header>
                <span
                  aria-label={humanizeEnum(account.type)}
                  className="has-inline-hint"
                  data-hint={`${account.currency} segregated account`}
                  tabIndex={0}
                >
                  {humanizeEnum(account.type)}
                </span>
                <FileText size={18} />
              </header>
              <strong>{formatKes(account.balanceCents)}</strong>
            </article>
          ))}
        </section>
      ) : null}

      <section className="two-column">
        <div className="data-card">
          <header>
            <h3>Members</h3>
            <span className="pill">{members.length}</span>
          </header>
          <DataTable
            columns={[
              { key: "name", header: "Name", value: (member) => member.fullName },
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
                cell: (member) => <span className="pill">{member.kycStatus}</span>
              },
              { key: "phone", header: "Phone", value: (member) => member.phone }
            ]}
            exportName={`${group.code}-members`}
            filters={[
              {
                key: "role",
                label: "Role",
                allLabel: "All roles",
                getValue: (member) => member.role,
                options: Array.from(new Set(members.map((member) => member.role))).map((value) => ({
                  label: humanizeEnum(value),
                  value
                }))
              },
              {
                key: "kyc",
                label: "KYC",
                allLabel: "All KYC",
                getValue: (member) => member.kycStatus
              }
            ]}
            getRowKey={(member) => member.id}
            initialPageSize={5}
            rows={members}
            title="Members"
          />
        </div>

        <div className="data-card">
          <header>
            <h3>Meetings</h3>
            <span className="pill">{meetings.length}</span>
          </header>
          <DataTable
            columns={[
              {
                key: "meeting",
                header: "Meeting",
                value: (meeting) => `${meeting.title} ${meeting.scheduledAt}`,
                exportValue: (meeting) => meeting.title,
                cell: (meeting) => (
                  <>
                    <strong>{meeting.title}</strong>
                    <br />
                    <span>{new Date(meeting.scheduledAt).toLocaleString("en-KE")}</span>
                  </>
                )
              },
              {
                key: "status",
                header: "Status",
                value: (meeting) => humanizeEnum(meeting.status),
                cell: (meeting) => <span className="pill blue">{humanizeEnum(meeting.status)}</span>
              },
              {
                key: "gps",
                header: "GPS",
                value: (meeting) => (meeting.gpsCompliant ? "Compliant" : "Pending")
              },
              {
                key: "keys",
                header: "Keys",
                value: (meeting) => meeting.keySubmissions?.length ?? 0,
                cell: (meeting) => `${meeting.keySubmissions?.length ?? 0}/3`
              }
            ]}
            defaultSort={{ key: "meeting", direction: "desc" }}
            exportName={`${group.code}-meetings`}
            filters={[
              {
                key: "status",
                label: "Status",
                allLabel: "All statuses",
                getValue: (meeting) => meeting.status,
                options: Array.from(new Set(meetings.map((meeting) => meeting.status))).map((value) => ({
                  label: humanizeEnum(value),
                  value
                }))
              }
            ]}
            getRowKey={(meeting) => meeting.id}
            initialPageSize={5}
            rows={meetings}
            title="Meetings"
          />
        </div>
      </section>

      <section className="two-column">
        <div className="data-card">
          <header>
            <h3>Ledger</h3>
            <span className="pill">{ledger.length} entries</span>
          </header>
          <DataTable
            columns={[
              {
                key: "type",
                header: "Type",
                value: (entry) => humanizeEnum(entry.type),
                cell: (entry) => (
                  <>
                    <strong>{humanizeEnum(entry.type)}</strong>
                    <br />
                    <span>{entry.description}</span>
                  </>
                )
              },
              {
                key: "fund",
                header: "Fund",
                value: (entry) => entry.fundAccount?.type ? humanizeEnum(entry.fundAccount.type) : "Unassigned"
              },
              {
                key: "direction",
                header: "Direction",
                value: (entry) => entry.direction
              },
              {
                key: "amount",
                header: "Amount",
                value: (entry) => entry.amountCents,
                exportValue: (entry) => formatKes(entry.amountCents),
                cell: (entry) => (
                  <span className={entry.direction === "CREDIT" ? "pill" : "pill gold"}>
                    {formatKes(entry.amountCents)}
                  </span>
                )
              },
              {
                key: "time",
                header: "Time",
                value: (entry) => new Date(entry.createdAt).getTime(),
                exportValue: (entry) => new Date(entry.createdAt).toLocaleString("en-KE"),
                cell: (entry) => new Date(entry.createdAt).toLocaleString("en-KE")
              }
            ]}
            defaultSort={{ key: "time", direction: "desc" }}
            exportName={`${group.code}-ledger`}
            filters={[
              {
                key: "type",
                label: "Type",
                allLabel: "All types",
                getValue: (entry) => entry.type,
                options: Array.from(new Set(ledger.map((entry) => entry.type))).map((value) => ({
                  label: humanizeEnum(value),
                  value
                }))
              },
              {
                key: "direction",
                label: "Direction",
                allLabel: "All directions",
                getValue: (entry) => entry.direction
              }
            ]}
            getRowKey={(entry) => entry.id}
            initialPageSize={5}
            rows={ledger}
            title="Ledger"
          />
        </div>

        {!isMember ? (
          <div className="data-card">
            <header>
              <h3>Votes</h3>
              <Vote size={18} />
            </header>
            <DataTable
              columns={[
                {
                  key: "resolution",
                  header: "Resolution",
                  value: (vote) => `${humanizeEnum(vote.resolutionType)} ${vote.motion}`,
                  exportValue: (vote) => humanizeEnum(vote.resolutionType),
                  cell: (vote) => (
                    <>
                      <strong>{humanizeEnum(vote.resolutionType)}</strong>
                      <br />
                      <span>{vote.motion}</span>
                    </>
                  )
                },
                {
                  key: "result",
                  header: "Result",
                  value: (vote) => vote.result,
                  cell: (vote) => <span className="pill">{vote.result}</span>
                },
                {
                  key: "yes",
                  header: "Yes",
                  value: (vote) => vote.yesCount
                },
                {
                  key: "no",
                  header: "No",
                  value: (vote) => vote.noCount
                },
                {
                  key: "time",
                  header: "Time",
                  value: (vote) => new Date(vote.createdAt).getTime(),
                  exportValue: (vote) => new Date(vote.createdAt).toLocaleString("en-KE"),
                  cell: (vote) => new Date(vote.createdAt).toLocaleString("en-KE")
                }
              ]}
              defaultSort={{ key: "time", direction: "desc" }}
              exportName={`${group.code}-votes`}
              filters={[
                {
                  key: "resolution",
                  label: "Resolution",
                  allLabel: "All resolutions",
                  getValue: (vote) => vote.resolutionType,
                  options: Array.from(new Set(votes.map((vote) => vote.resolutionType))).map((value) => ({
                    label: humanizeEnum(value),
                    value
                  }))
                },
                {
                  key: "result",
                  label: "Result",
                  allLabel: "All results",
                  getValue: (vote) => vote.result
                }
              ]}
              getRowKey={(vote) => vote.id}
              initialPageSize={5}
              rows={votes}
              title="Votes"
            />
          </div>
        ) : null}
      </section>
    </>
  );
}
