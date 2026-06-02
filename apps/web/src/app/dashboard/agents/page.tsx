"use client";

import React from "react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { GraduationCap, Pencil, Phone, Plus, ShieldCheck, UsersRound, X } from "@/lib/theme-icons";
import { apiFetch, humanizeEnum } from "../../../lib/api";
import { CollectionView } from "../../../components/dashboard/collection-view";
import { DataTable } from "../../../components/dashboard/data-table";
import { StatCard } from "../../../components/dashboard/stat-card";
import type { AgentRow, GroupRow, ProgrammeRow, User } from "../../../components/dashboard/types";

const defaultAgentForm = {
  name: "",
  phone: "",
  email: "",
  status: "ACTIVE",
  programmeId: "",
  gender: "",
  projectOfficer: "",
  county: "",
  location: "",
  feedback: "",
  digitalLiteracyScore: "80",
  caseloadLimit: "25",
  groupIds: [] as string[]
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [agentForm, setAgentForm] = useState(defaultAgentForm);
  const [assignmentTarget, setAssignmentTarget] = useState<AgentRow | null>(null);
  const [assignmentGroupIds, setAssignmentGroupIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refreshWorkspace() {
    const [agentResponse, groupResponse] = await Promise.all([
      apiFetch<AgentRow[]>("/village-agents"),
      apiFetch<GroupRow[]>("/groups")
    ]);
    setAgents(agentResponse);
    setGroups(groupResponse);
  }

  useEffect(() => {
    let mounted = true;

    async function loadAgents() {
      try {
        const [agentResponse, groupResponse, programmeResponse, meResponse] = await Promise.all([
          apiFetch<AgentRow[]>("/village-agents"),
          apiFetch<GroupRow[]>("/groups"),
          apiFetch<ProgrammeRow[]>("/programmes"),
          apiFetch<User>("/auth/me")
        ]);

        if (!mounted) return;
        setAgents(agentResponse);
        setGroups(groupResponse);
        setProgrammes(programmeResponse);
        setUser(meResponse);
        setAgentForm((current) => ({
          ...current,
          programmeId: current.programmeId || programmeResponse[0]?.id || ""
        }));
      } catch (agentsError) {
        if (mounted) setError(agentsError instanceof Error ? agentsError.message : "Agents failed");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAgents();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", isCreateOpen || Boolean(assignmentTarget));
    return () => document.body.classList.remove("modal-open");
  }, [isCreateOpen, assignmentTarget]);

  const canManageAgents = user?.permissions?.includes("village-agents:write") ?? false;
  const totalCaseload = agents.reduce((sum, agent) => sum + agent._count.groups, 0);
  const averageLiteracy =
    agents.length === 0
      ? 0
      : Math.round(agents.reduce((sum, agent) => sum + agent.digitalLiteracyScore, 0) / agents.length);
  const availableCapacity = agents.reduce(
    (sum, agent) => sum + Math.max(0, agent.caseloadLimit - agent._count.groups),
    0
  );

  function updateAgentGroupSelection(values: string[]) {
    setAgentForm((current) => ({ ...current, groupIds: values }));
  }

  function openAssignment(agent: AgentRow) {
    setAssignmentTarget(agent);
    setAgentForm({
      name: agent.name,
      phone: agent.phone,
      email: agent.email ?? "",
      status: agent.status,
      programmeId: agent.programme?.id ?? "",
      gender: agent.gender ?? "",
      projectOfficer: agent.projectOfficer ?? "",
      county: agent.county ?? "",
      location: agent.location ?? "",
      feedback: agent.feedback ?? "",
      digitalLiteracyScore: String(agent.digitalLiteracyScore),
      caseloadLimit: String(agent.caseloadLimit),
      groupIds: agent.groups?.map((group) => group.id) ?? []
    });
    setAssignmentGroupIds(agent.groups?.map((group) => group.id) ?? []);
    setMessage(null);
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const created = await apiFetch<AgentRow>("/village-agents", {
        method: "POST",
        body: JSON.stringify({
          name: agentForm.name,
          phone: agentForm.phone,
          email: agentForm.email || undefined,
          status: agentForm.status,
          programmeId: agentForm.programmeId || undefined,
          gender: agentForm.gender || undefined,
          projectOfficer: agentForm.projectOfficer || undefined,
          county: agentForm.county || undefined,
          location: agentForm.location || undefined,
          feedback: agentForm.feedback || undefined,
          digitalLiteracyScore: Number(agentForm.digitalLiteracyScore),
          caseloadLimit: Number(agentForm.caseloadLimit),
          groupIds: agentForm.groupIds
        })
      });

      await refreshWorkspace();
      setAgentForm({
        ...defaultAgentForm,
        programmeId: programmes[0]?.id || ""
      });
      setIsCreateOpen(false);
      setMessage({ ok: true, text: `${created.name} created and assigned to ${created._count.groups} groups.` });
    } catch (saveError) {
      setMessage({
        ok: false,
        text: saveError instanceof Error ? saveError.message : "VA / CBT failed to save"
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignmentTarget) return;

    setSaving(true);
    setMessage(null);

    try {
      const updated = await apiFetch<AgentRow>(`/village-agents/${assignmentTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: agentForm.name,
          phone: agentForm.phone,
          email: agentForm.email || null,
          status: agentForm.status,
          programmeId: agentForm.programmeId || null,
          gender: agentForm.gender || null,
          projectOfficer: agentForm.projectOfficer || null,
          county: agentForm.county || null,
          location: agentForm.location || null,
          feedback: agentForm.feedback || null,
          digitalLiteracyScore: Number(agentForm.digitalLiteracyScore),
          caseloadLimit: Number(agentForm.caseloadLimit),
          groupIds: assignmentGroupIds
        })
      });
      await refreshWorkspace();
      setAssignmentTarget(null);
      setAgentForm({
        ...defaultAgentForm,
        programmeId: programmes[0]?.id || ""
      });
      setMessage({ ok: true, text: `${updated.name} updated and covers ${updated._count.groups} groups.` });
    } catch (saveError) {
      setMessage({
        ok: false,
        text: saveError instanceof Error ? saveError.message : "Group assignment failed"
      });
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
          <p className="eyebrow">VA / CBT Onboarding</p>
          <h2
            aria-label="VA / CBT"
            className="has-hint"
            data-hint="Track field-team coverage, programme assignments, digital literacy, and remaining caseload capacity."
            tabIndex={0}
          >
            VA / CBT
          </h2>
        </div>
        <div className="page-heading-actions">
          <span className="pill">{totalCaseload} assigned groups</span>
          {canManageAgents ? (
            <button className="button" onClick={() => setIsCreateOpen(true)} type="button">
              <Plus size={16} />
              Create VA / CBT
            </button>
          ) : null}
        </div>
      </section>

      {!isCreateOpen && !assignmentTarget && message ? (
        <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
      ) : null}

      <section className="stat-grid">
        <StatCard icon={<GraduationCap size={20} />} label="Agents" note="Registered VAs / CBTs" value={agents.length.toString()} />
        <StatCard icon={<UsersRound size={20} />} label="Assigned groups" note="Current caseload" value={totalCaseload.toString()} />
        <StatCard icon={<ShieldCheck size={20} />} label="Avg literacy" note="Digital readiness score" value={`${averageLiteracy}%`} />
        <StatCard icon={<Phone size={20} />} label="Open capacity" note="Available group slots" value={availableCapacity.toString()} />
      </section>

      {isCreateOpen && canManageAgents ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Create VA / CBT">
          <button className="modal-backdrop" onClick={() => setIsCreateOpen(false)} type="button" aria-label="Close create VA / CBT" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>Create VA / CBT</h3>
                <span>Assign one field agent to multiple groups within their caseload capacity.</span>
              </div>
              <button className="icon-button" onClick={() => setIsCreateOpen(false)} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form" onSubmit={createAgent}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Name</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    value={agentForm.name}
                  />
                </label>
                <label className="credential-field">
                  <span>Phone</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, phone: event.target.value }))}
                    required
                    value={agentForm.phone}
                  />
                </label>
                <label className="credential-field">
                  <span>Email</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, email: event.target.value }))}
                    type="email"
                    value={agentForm.email}
                  />
                </label>
                <label className="credential-field">
                  <span>Program</span>
                  <select
                    onChange={(event) => setAgentForm((current) => ({ ...current, programmeId: event.target.value }))}
                    value={agentForm.programmeId}
                  >
                    <option value="">Unassigned</option>
                    {programmes.map((programme) => (
                      <option key={programme.id} value={programme.id}>
                        {programme.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>County</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, county: event.target.value }))}
                    value={agentForm.county}
                  />
                </label>
                <label className="credential-field">
                  <span>Location</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, location: event.target.value }))}
                    value={agentForm.location}
                  />
                </label>
                <label className="credential-field">
                  <span>Literacy score</span>
                  <input
                    max="100"
                    min="0"
                    onChange={(event) => setAgentForm((current) => ({ ...current, digitalLiteracyScore: event.target.value }))}
                    required
                    type="number"
                    value={agentForm.digitalLiteracyScore}
                  />
                </label>
                <label className="credential-field">
                  <span>Caseload limit</span>
                  <input
                    max="100"
                    min="1"
                    onChange={(event) => setAgentForm((current) => ({ ...current, caseloadLimit: event.target.value }))}
                    required
                    type="number"
                    value={agentForm.caseloadLimit}
                  />
                </label>
                <label className="credential-field wide-field">
                  <span>Assigned groups</span>
                  <select
                    multiple
                    onChange={(event) =>
                      updateAgentGroupSelection(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))
                    }
                    value={agentForm.groupIds}
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.code})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {message ? (
                <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
              ) : null}
              <div className="credential-actions">
                <button className="button" disabled={saving} type="submit">
                  <Plus size={16} />
                  {saving ? "Creating" : "Create VA / CBT"}
                </button>
                <button className="button secondary" onClick={() => setIsCreateOpen(false)} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {assignmentTarget && canManageAgents ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Edit VA / CBT">
          <button className="modal-backdrop" onClick={() => setAssignmentTarget(null)} type="button" aria-label="Close VA / CBT editor" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>Edit VA / CBT</h3>
                <span>{assignmentTarget.name} can cover up to {assignmentTarget.caseloadLimit} groups.</span>
              </div>
              <button className="icon-button" onClick={() => setAssignmentTarget(null)} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form" onSubmit={saveAssignment}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Name</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    value={agentForm.name}
                  />
                </label>
                <label className="credential-field">
                  <span>Phone</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, phone: event.target.value }))}
                    required
                    value={agentForm.phone}
                  />
                </label>
                <label className="credential-field">
                  <span>Email</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, email: event.target.value }))}
                    type="email"
                    value={agentForm.email}
                  />
                </label>
                <label className="credential-field">
                  <span>Status</span>
                  <select
                    onChange={(event) => setAgentForm((current) => ({ ...current, status: event.target.value }))}
                    value={agentForm.status}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </label>
                <label className="credential-field">
                  <span>Program</span>
                  <select
                    onChange={(event) => setAgentForm((current) => ({ ...current, programmeId: event.target.value }))}
                    value={agentForm.programmeId}
                  >
                    <option value="">Unassigned</option>
                    {programmes.map((programme) => (
                      <option key={programme.id} value={programme.id}>
                        {programme.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Project officer</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, projectOfficer: event.target.value }))}
                    value={agentForm.projectOfficer}
                  />
                </label>
                <label className="credential-field">
                  <span>Gender</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, gender: event.target.value }))}
                    value={agentForm.gender}
                  />
                </label>
                <label className="credential-field">
                  <span>County</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, county: event.target.value }))}
                    value={agentForm.county}
                  />
                </label>
                <label className="credential-field">
                  <span>Location</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, location: event.target.value }))}
                    value={agentForm.location}
                  />
                </label>
                <label className="credential-field">
                  <span>Literacy score</span>
                  <input
                    max="100"
                    min="0"
                    onChange={(event) => setAgentForm((current) => ({ ...current, digitalLiteracyScore: event.target.value }))}
                    required
                    type="number"
                    value={agentForm.digitalLiteracyScore}
                  />
                </label>
                <label className="credential-field">
                  <span>Caseload limit</span>
                  <input
                    max="100"
                    min="1"
                    onChange={(event) => setAgentForm((current) => ({ ...current, caseloadLimit: event.target.value }))}
                    required
                    type="number"
                    value={agentForm.caseloadLimit}
                  />
                </label>
                <label className="credential-field">
                  <span>Feedback</span>
                  <input
                    onChange={(event) => setAgentForm((current) => ({ ...current, feedback: event.target.value }))}
                    value={agentForm.feedback}
                  />
                </label>
                <label className="credential-field wide-field">
                  <span>Groups</span>
                  <select
                    multiple
                    onChange={(event) =>
                      setAssignmentGroupIds(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))
                    }
                    value={assignmentGroupIds}
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.code})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {message ? (
                <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
              ) : null}
              <div className="credential-actions">
                <button className="button" disabled={saving} type="submit">
                  <Pencil size={16} />
                  {saving ? "Saving" : "Save VA / CBT"}
                </button>
                <button className="button secondary" onClick={() => setAssignmentTarget(null)} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="data-card">
        <header>
          <h3>Village Agents</h3>
          <span className="pill">{agents.length}</span>
        </header>
        <CollectionView
          count={agents.length}
          label="agents"
          cards={
            <div className="card-grid">
              {agents.map((agent) => (
                <article className="record-card" key={agent.id}>
                  <header>
                    <div>
                      <h4>{agent.name}</h4>
                      <small>{agent.phone} - {agent.email ?? "No email"}</small>
                    </div>
                    <span className="pill">{humanizeEnum(agent.status)}</span>
                  </header>
                  <div className="record-card-meta">
                    <div>
                      <span>Program</span>
                      <strong>{agent.programme?.name ?? "Unassigned"}</strong>
                    </div>
                    <div>
                      <span>County</span>
                      <strong>{agent.county ?? agent.programme?.county ?? "Unassigned"}</strong>
                    </div>
                    <div>
                      <span>Groups</span>
                      <strong>{agent._count.groups}/{agent.caseloadLimit}</strong>
                    </div>
                    <div>
                      <span>Literacy</span>
                      <strong>{agent.digitalLiteracyScore}%</strong>
                    </div>
                  </div>
                  <small>{agent.groups?.slice(0, 3).map((group) => group.name).join(", ") || agent.projectOfficer || "No group assignment"}</small>
                  {canManageAgents ? (
                    <div className="record-card-actions">
                      <button className="button secondary" onClick={() => openAssignment(agent)} type="button">
                        <Pencil size={16} />
                        Edit
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
              {agents.length === 0 ? <div className="empty-state">No agents</div> : null}
            </div>
          }
          list={
            <DataTable
              columns={[
            {
              key: "agent",
              header: "Agent",
              value: (agent) => `${agent.name} ${agent.email ?? ""}`,
              exportValue: (agent) => agent.name,
              cell: (agent) => (
                <>
                  <strong>{agent.name}</strong>
                  <br />
                  <span>{agent.email ?? "No email"}</span>
                </>
              )
            },
            {
              key: "programme",
              header: "Programme",
              value: (agent) => agent.programme?.name ?? "Unassigned"
            },
            {
              key: "county",
              header: "County",
              value: (agent) => agent.county ?? agent.programme?.county ?? "Unassigned"
            },
            {
              key: "project-officer",
              header: "Project Officer",
              value: (agent) => agent.projectOfficer ?? "Not captured"
            },
            {
              key: "phone",
              header: "Phone",
              value: (agent) => agent.phone
            },
            {
              key: "groups",
              header: "Groups",
              value: (agent) => agent.groups?.map((group) => group.name).join(", ") || agent._count.groups,
              cell: (agent) => (
                <>
                  <strong>{agent._count.groups}</strong>
                  <br />
                  <span>{agent.groups?.slice(0, 2).map((group) => group.name).join(", ") || "Unassigned"}</span>
                </>
              )
            },
            {
              key: "capacity",
              header: "Capacity",
              value: (agent) => agent.caseloadLimit
            },
            {
              key: "literacy",
              header: "Literacy",
              value: (agent) => agent.digitalLiteracyScore,
              exportValue: (agent) => `${agent.digitalLiteracyScore}%`,
              cell: (agent) => <span className="pill blue">{agent.digitalLiteracyScore}%</span>
            },
            {
              key: "action",
              header: "",
              value: () => "",
              searchable: false,
              sortable: false,
              exportable: false,
              cell: (agent) =>
                canManageAgents ? (
                  <button className="button secondary" onClick={() => openAssignment(agent)} type="button">
                    <Pencil size={16} />
                    Edit
                  </button>
                ) : null
            }
          ]}
          exportName="intelli-cash-village-agents"
          filters={[
            {
              key: "programme",
              label: "Programme",
              allLabel: "All programmes",
              getValue: (agent) => agent.programme?.name ?? "Unassigned"
            },
            {
              key: "status",
              label: "Status",
              allLabel: "All statuses",
              getValue: (agent) => agent.status
            },
            {
              key: "source",
              label: "Source",
              allLabel: "All sources",
              getValue: (agent) => agent.sourceSystem ?? "Native"
            }
          ]}
          getRowKey={(agent) => agent.id}
          rows={agents}
          title="Village agents"
            />
          }
        />
      </section>
    </>
  );
}
