"use client";

import React from "react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Pencil, Plus, UsersRound, X } from "@/lib/theme-icons";
import { apiFetch, humanizeEnum } from "../../../lib/api";
import { CollectionView } from "../../../components/dashboard/collection-view";
import { DataTable } from "../../../components/dashboard/data-table";
import type { AgentRow, GroupRow, ProgrammeRow, User } from "../../../components/dashboard/types";

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

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState(defaultGroupForm);
  const [editingGroup, setEditingGroup] = useState<GroupRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadGroups() {
      try {
        const [groupResponse, programmeResponse, meResponse, agentResponse] = await Promise.all([
          apiFetch<GroupRow[]>("/groups"),
          apiFetch<ProgrammeRow[]>("/programmes"),
          apiFetch<User>("/auth/me"),
          apiFetch<AgentRow[]>("/village-agents").catch(() => [])
        ]);
        if (mounted) {
          setGroups(groupResponse);
          setProgrammes(programmeResponse);
          setUser(meResponse);
          setAgents(agentResponse);
        }
      } catch (groupsError) {
        if (mounted) setError(groupsError instanceof Error ? groupsError.message : "Groups failed");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadGroups();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", isCreateOpen);
    return () => document.body.classList.remove("modal-open");
  }, [isCreateOpen]);

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  const canCreateGroups = user?.permissions?.includes("groups:write") ?? false;
  const isMember = user?.role === "MEMBER";

  function openCreateGroup() {
    setEditingGroup(null);
    setForm(defaultGroupForm);
    setMessage(null);
    setIsCreateOpen(true);
  }

  function openEditGroup(group: GroupRow) {
    setEditingGroup(group);
    setForm({
      name: group.name,
      code: group.code,
      county: group.county,
      subCounty: group.subCounty ?? "",
      phase: group.phase,
      programmeIds: group.programmeLinks?.map((link) => link.programme.id) ?? (group.programme?.id ? [group.programme.id] : []),
      villageAgentId: group.villageAgent?.id ?? "",
      location: group.location ?? "",
      objective: group.objective ?? "",
      contactPersonName: group.contactPersonName ?? "",
      contactPhone: group.contactPhone ?? "",
      meetingDay: group.meetingDay ?? "",
      gpsLatitude: group.gpsLatitude === null || group.gpsLatitude === undefined ? "" : String(group.gpsLatitude),
      gpsLongitude: group.gpsLongitude === null || group.gpsLongitude === undefined ? "" : String(group.gpsLongitude),
      gpsRadiusMeters: String(group.gpsRadiusMeters ?? 50),
      shareValue: String((group.shareValueCents ?? 50000) / 100),
      maxSharesPerMemberPerMeeting: String(group.maxSharesPerMemberPerMeeting ?? 10),
      constitutionVersion: group.constitutionVersion ?? "IWLSGS-1.0",
      cycleNumber: String(group.cycleNumber ?? 1)
    });
    setMessage(null);
    setIsCreateOpen(true);
  }

  function closeGroupModal() {
    setEditingGroup(null);
    setIsCreateOpen(false);
  }

  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const saved = await apiFetch<GroupRow>(editingGroup ? `/groups/${editingGroup.id}` : "/groups", {
        method: editingGroup ? "PATCH" : "POST",
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
      const refreshed = await apiFetch<GroupRow[]>("/groups");

      setGroups(refreshed);
      setForm(defaultGroupForm);
      setEditingGroup(null);
      setMessage({ ok: true, text: `${saved.name} group ${editingGroup ? "updated" : "created and assigned to program"}.` });
      setIsCreateOpen(false);
    } catch (saveError) {
      setMessage({
        ok: false,
        text: saveError instanceof Error ? saveError.message : "Group failed to save"
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Group Intelligence</p>
          <h2
            aria-label="Groups"
            className="has-hint"
            data-hint="Search by group, code, county, or Village Agent. Open a group to inspect funds, members, meetings, ledger entries, and votes."
            tabIndex={0}
          >
            Groups
          </h2>
        </div>
        <div className="page-heading-actions">
          <span className="pill">{groups.length} groups</span>
          {canCreateGroups ? (
            <button className="button" onClick={openCreateGroup} type="button">
              <Plus size={16} />
              Create group
            </button>
          ) : null}
        </div>
      </section>

      {!isCreateOpen && message ? (
        <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
      ) : null}

      {isCreateOpen && canCreateGroups ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={editingGroup ? "Edit group" : "Create group"}>
          <button className="modal-backdrop" onClick={closeGroupModal} type="button" aria-label="Close group editor" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>{editingGroup ? "Edit Group" : "Create Group"}</h3>
                <span>New groups are assigned to programs only; they are not connected to other groups.</span>
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
                    {["MOBILISATION", "INTENSIVE", "DEVELOPMENT", "MATURITY", "POST_GRADUATION"].map((phase) => (
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
                        programmeIds: Array.from(event.currentTarget.selectedOptions).map(
                          (option) => option.value
                        )
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
                  {editingGroup ? <Pencil size={16} /> : <Plus size={16} />}
                  {saving ? "Saving" : editingGroup ? "Save group" : "Create group"}
                </button>
                <button className="button secondary" onClick={closeGroupModal} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="data-card">
        <header>
          <div>
            <h3>Groups</h3>
          </div>
          <UsersRound size={18} />
        </header>
        <CollectionView
          count={groups.length}
          label="groups"
          cards={
            <div className="card-grid">
              {groups.map((group) => {
                const programmes = group.programmeLinks?.map((link) => link.programme.name) ?? [];
                return (
                  <article className="record-card" key={group.id}>
                    <header>
                      <div>
                        <h4>{group.name}</h4>
                        <small>{group.code} - {group.county}</small>
                      </div>
                      <span className="pill blue">{humanizeEnum(group.phase)}</span>
                    </header>
                    <div className="record-card-meta">
                      <div>
                        <span>Program</span>
                        <strong>{programmes.slice(0, 2).join(", ") || group.programme?.name || "Unassigned"}</strong>
                      </div>
                      <div>
                        <span>VA / CBT</span>
                        <strong>{group.villageAgent?.name ?? "Unassigned"}</strong>
                      </div>
                      <div>
                        <span>{isMember ? "Member" : "Members"}</span>
                        <strong>{isMember ? "My account" : group._count.members}</strong>
                      </div>
                      <div>
                        <span>Credit</span>
                        <strong>{group.creditScores[0]?.score ?? "Pending"}</strong>
                      </div>
                      <div>
                        <span>Meeting shares</span>
                        <strong>{group.maxSharesPerMemberPerMeeting ?? 10} max</strong>
                      </div>
                    </div>
                    <small>{group.location ?? group.subCounty ?? group.county}</small>
                    <div className="record-card-actions">
                      {canCreateGroups ? (
                        <button className="button secondary" onClick={() => openEditGroup(group)} type="button">
                          <Pencil size={16} />
                          Edit
                        </button>
                      ) : null}
                      <Link className="button secondary" href={isMember ? "/dashboard/meetings" : `/dashboard/groups/${group.id}`}>
                        <ArrowRight size={16} />
                        {isMember ? "Meetings" : "Open"}
                      </Link>
                    </div>
                  </article>
                );
              })}
              {groups.length === 0 ? <div className="empty-state">No groups</div> : null}
            </div>
          }
          list={
            <DataTable
              columns={[
            {
              key: "group",
              header: "Group",
              value: (group) => `${group.name} ${group.code} ${group.county}`,
              exportValue: (group) => `${group.name} (${group.code})`,
              cell: (group) => (
                <>
                  <strong>{group.name}</strong>
                  <br />
                  <span>{group.code} - {group.county}</span>
                </>
              )
            },
            {
              key: "programme",
              header: "Programme",
              value: (group) =>
                group.programmeLinks?.map((link) => link.programme.name).join(", ") ??
                group.programme?.name ??
                "Unassigned",
              cell: (group) => {
                const programmes = group.programmeLinks?.map((link) => link.programme.name) ?? [];
                return programmes.length > 0 ? programmes.slice(0, 3).join(", ") : group.programme?.name ?? "Unassigned";
              }
            },
            {
              key: "location",
              header: "Location",
              value: (group) => group.location ?? group.subCounty ?? group.county
            },
            {
              key: "phase",
              header: "Phase",
              value: (group) => humanizeEnum(group.phase),
              filterValue: (group) => group.phase,
              cell: (group) => <span className="pill blue">{humanizeEnum(group.phase)}</span>
            },
            {
              key: "village-agent",
              header: "Village Agent",
              value: (group) => group.villageAgent?.name ?? "Unassigned"
            },
            {
              key: "objective",
              header: "Objective",
              value: (group) => group.objective ?? "Not captured"
            },
            {
              key: "credit",
              header: "Credit",
              value: (group) => group.creditScores[0]?.score ?? "Pending"
            },
            {
              key: "members",
              header: isMember ? "Member" : "Members",
              value: (group) => isMember ? "My account" : group._count.members
            },
            {
              key: "shares",
              header: "Meeting shares",
              value: (group) => `${group.maxSharesPerMemberPerMeeting ?? 10} max at KES ${(group.shareValueCents ?? 50000) / 100}`
            },
            {
              key: "action",
              header: "",
              value: () => "",
              searchable: false,
              sortable: false,
              exportable: false,
              cell: (group) => (
                <div className="table-action-group">
                  {canCreateGroups ? (
                    <button className="button secondary table-action-button" onClick={() => openEditGroup(group)} type="button">
                      <Pencil size={16} />
                      Edit
                    </button>
                  ) : null}
                  <Link className="button secondary" href={isMember ? "/dashboard/meetings" : `/dashboard/groups/${group.id}`}>
                    <ArrowRight size={16} />
                    {isMember ? "Meetings" : "Open"}
                  </Link>
                </div>
              )
            }
          ]}
          exportName="intelli-cash-groups"
          filters={[
            {
              key: "phase",
              label: "Phase",
              allLabel: "All phases",
              getValue: (group) => group.phase,
              options: Array.from(new Set(groups.map((group) => group.phase))).map((value) => ({
                label: humanizeEnum(value),
                value
              }))
            },
            {
              key: "county",
              label: "County",
              allLabel: "All counties",
              getValue: (group) => group.county
            },
            {
              key: "agent",
              label: "VA",
              allLabel: "All VAs",
              getValue: (group) => group.villageAgent?.name ?? "Unassigned"
            },
            {
              key: "source",
              label: "Source",
              allLabel: "All sources",
              getValue: (group) => group.sourceSystem ?? "Native"
            }
          ]}
          getRowKey={(group) => group.id}
          rows={groups}
          title="Groups"
            />
          }
        />
      </section>
    </>
  );
}
