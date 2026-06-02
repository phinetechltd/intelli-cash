"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, ShieldCheck, SlidersHorizontal, UserPlus, UsersRound, X } from "@/lib/theme-icons";
import {
  permissions as permissionCatalogDefaults,
  rolePermissions as defaultRolePermissions,
  roles,
  type Permission,
  type Role
} from "@intellicash/shared";
import { apiFetch, humanizeEnum, uploadFile } from "../../../lib/api";
import { DEFAULT_AVATAR_PLACEHOLDER } from "../../../lib/placeholders";
import { DataTable } from "../../../components/dashboard/data-table";
import { FallbackImage } from "../../../components/fallback-image";
import { StatCard } from "../../../components/dashboard/stat-card";
import type { GroupRow, Member, PartnerRow, User } from "../../../components/dashboard/types";

interface UserFormState {
  name: string;
  email: string;
  password: string;
  role: Role;
  avatarUrl: string;
  partnerId: string;
  groupId: string;
  memberId: string;
}

interface UserEditState {
  role: Role;
  status: string;
  avatarUrl: string;
  partnerId: string;
  groupId: string;
  memberId: string;
}

interface AccessControlProfile {
  role: Role;
  accountType: string;
  requiredBinding: "GROUP" | "MEMBER" | "NONE" | "PARTNER" | "LENDER";
  dashboard: string;
  dataScope: string;
  permissionCount: number;
}

interface AccessControlState {
  roles: Role[];
  permissions: Permission[];
  rolePermissions: Record<Role, Permission[]>;
  accountProfiles: AccessControlProfile[];
}

const defaultForm: UserFormState = {
  name: "",
  email: "",
  password: "IntellicashDemo#2026",
  role: "GROUP_ACCOUNT",
  avatarUrl: "",
  partnerId: "",
  groupId: "",
  memberId: ""
};

const accountProfiles: Record<
  Role,
  {
    accountType: string;
    binding: string;
    dashboard: string;
    scope: string;
    intent: string;
  }
> = {
  IWL_ADMIN: {
    accountType: "Admin account",
    binding: "No binding",
    dashboard: "Full access",
    scope: "All data",
    intent: "For IWL staff responsible for platform setup, controls, and support."
  },
  PARTNER_OFFICER: {
    accountType: "Partner account",
    binding: "Partner required",
    dashboard: "Partner dashboard",
    scope: "Partner scope",
    intent: "For NGO, donor, and implementing-partner officers monitoring assigned programmes."
  },
  GROUP_ACCOUNT: {
    accountType: "Group account",
    binding: "Group required",
    dashboard: "Group dashboard",
    scope: "One group",
    intent: "For group officers managing one group profile and operational records."
  },
  MEMBER: {
    accountType: "Member account",
    binding: "Member required",
    dashboard: "Member dashboard",
    scope: "One member",
    intent: "For an individual VSLA member with personal visibility."
  },
  LENDER: {
    accountType: "Lender account",
    binding: "Lender required",
    dashboard: "Lender dashboard",
    scope: "Lender scope",
    intent: "For financial partners assessing portfolio readiness without administrative control."
  },
  READ_ONLY: {
    accountType: "Read-only account",
    binding: "No binding",
    dashboard: "Oversight",
    scope: "Read only",
    intent: "For auditors and leadership teams that need oversight without operational access."
  }
};

const permissionLabels: Record<string, string> = {
  users: "Users",
  partners: "Partners",
  programmes: "Programs",
  "village-agents": "Village Agents",
  groups: "Groups",
  members: "Members",
  meetings: "Meetings",
  ledger: "Ledger",
  payments: "Payments",
  "signup-requests": "Signup Requests",
  votes: "Votes",
  analytics: "Analytics",
  audit: "Audit",
  integrations: "Integrations",
  webhooks: "Webhooks"
};

function accountBinding(user: User) {
  if (user.role === "PARTNER_OFFICER") return user.partner?.name ?? "Partner not assigned";
  if (user.role === "LENDER") return user.partner?.name ?? "Lender not assigned";
  if (user.role === "GROUP_ACCOUNT") return user.group?.name ?? "Group not assigned";
  if (user.role === "MEMBER") return user.member?.fullName ?? "Member not assigned";
  return "Platform scope";
}

function roleValue(value: string): Role {
  return roles.includes(value as Role) ? (value as Role) : "READ_ONLY";
}

function permissionGroups(permissionList: Permission[]) {
  return permissionList.reduce<Record<string, Permission[]>>((groups, permission) => {
    const domain = permission.split(":")[0] ?? "other";
    groups[domain] = [...(groups[domain] ?? []), permission];
    return groups;
  }, {});
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [accessControl, setAccessControl] = useState<AccessControlState | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<"accounts" | "roles">("accounts");
  const [selectedPermissionRole, setSelectedPermissionRole] = useState<Role>("PARTNER_OFFICER");
  const [permissionDraft, setPermissionDraft] = useState<Permission[]>([]);
  const [form, setForm] = useState<UserFormState>(defaultForm);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<UserEditState | null>(null);
  const [editMembers, setEditMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState<"create" | "edit" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", Boolean(editingUser) || isCreateOpen);
    return () => document.body.classList.remove("modal-open");
  }, [editingUser, isCreateOpen]);

  useEffect(() => {
    let mounted = true;

    async function loadMembers() {
      if (!form.groupId || form.role !== "MEMBER") {
        setMembers([]);
        return;
      }

      const response = await apiFetch<Member[]>(`/groups/${form.groupId}/members`);
      if (mounted) setMembers(response);
    }

    loadMembers().catch((memberError) => {
      if (mounted) {
        setMessage({
          ok: false,
          text: memberError instanceof Error ? memberError.message : "Members failed to load"
        });
      }
    });

    return () => {
      mounted = false;
    };
  }, [form.groupId, form.role]);

  useEffect(() => {
    let mounted = true;

    async function loadEditMembers() {
      if (!editForm?.groupId || editForm.role !== "MEMBER") {
        setEditMembers([]);
        return;
      }

      const response = await apiFetch<Member[]>(`/groups/${editForm.groupId}/members`);
      if (mounted) setEditMembers(response);
    }

    loadEditMembers().catch((memberError) => {
      if (mounted) {
        setMessage({
          ok: false,
          text: memberError instanceof Error ? memberError.message : "Members failed to load"
        });
      }
    });

    return () => {
      mounted = false;
    };
  }, [editForm?.groupId, editForm?.role]);

  async function loadPage() {
    setLoading(true);
    try {
      const [userResponse, partnerResponse, groupResponse, accessResponse] = await Promise.all([
        apiFetch<User[]>("/users"),
        apiFetch<PartnerRow[]>("/partners"),
        apiFetch<GroupRow[]>("/groups"),
        apiFetch<AccessControlState>("/access-control")
      ]);
      setUsers(userResponse);
      setPartners(partnerResponse);
      setGroups(groupResponse);
      setAccessControl(accessResponse);
      setError(null);
    } catch (pageError) {
      setError(pageError instanceof Error ? pageError.message : "Users failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const payload: Record<string, string> = {
      name: form.name,
      email: form.email,
      password: form.password,
      role: form.role
    };

    if (form.avatarUrl) payload.avatarUrl = form.avatarUrl;
    if (form.role === "PARTNER_OFFICER" || form.role === "LENDER") payload.partnerId = form.partnerId;
    if (form.role === "GROUP_ACCOUNT") payload.groupId = form.groupId;
    if (form.role === "MEMBER") payload.memberId = form.memberId;
    const creatingMemberAccount = form.role === "MEMBER";

    try {
      const created = await apiFetch<User>("/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setUsers((current) => [created, ...current]);
      setForm(defaultForm);
      setMembers([]);
      setMessage({
        ok: true,
        text: `${created.name} account created.${creatingMemberAccount ? " Member PIN generated and queued for SMS." : ""}`
      });
      setIsCreateOpen(false);
    } catch (saveError) {
      setMessage({
        ok: false,
        text: saveError instanceof Error ? saveError.message : "User failed to save"
      });
    } finally {
      setSaving(false);
    }
  }

  function partnerOptionsForRole(role: Role) {
    return partners.filter((partner) => (role === "LENDER" ? partner.type === "LENDER" : partner.type !== "LENDER"));
  }

  function startEditingUser(user: User) {
    const role = roleValue(user.role);
    setEditingUser(user);
    setEditForm({
      role,
      status: user.status ?? "ACTIVE",
      avatarUrl: user.avatarUrl ?? "",
      partnerId: user.partnerId ?? "",
      groupId: user.groupId ?? "",
      memberId: user.memberId ?? ""
    });
    setEditMembers([]);
    setMessage(null);
  }

  function closeEditor() {
    setEditingUser(null);
    setEditForm(null);
    setEditMembers([]);
  }

  async function uploadAvatar(file: File, target: "create" | "edit") {
    setUploadingAvatar(target);
    setMessage(null);

    try {
      const uploaded = await uploadFile("avatar", file);
      if (target === "create") {
        setForm((current) => ({ ...current, avatarUrl: uploaded.url }));
      } else {
        setEditForm((current) => (current ? { ...current, avatarUrl: uploaded.url } : current));
      }
      setMessage({ ok: true, text: `${uploaded.fileName} uploaded.` });
    } catch (uploadError) {
      setMessage({
        ok: false,
        text: uploadError instanceof Error ? uploadError.message : "Avatar upload failed"
      });
    } finally {
      setUploadingAvatar(null);
    }
  }

  async function saveManagedUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser || !editForm) return;

    setUpdating(true);
    setMessage(null);

    const payload: Record<string, string | null> = {
      role: editForm.role,
      status: editForm.status,
      avatarUrl: editForm.avatarUrl || null
    };

    if (editForm.role === "PARTNER_OFFICER" || editForm.role === "LENDER") payload.partnerId = editForm.partnerId;
    if (editForm.role === "GROUP_ACCOUNT") payload.groupId = editForm.groupId;
    if (editForm.role === "MEMBER") payload.memberId = editForm.memberId;
    const memberAccountChanged =
      editForm.role === "MEMBER" &&
      (editingUser.role !== "MEMBER" || editingUser.memberId !== editForm.memberId);

    try {
      const updated = await apiFetch<User>(`/users/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
      setMessage({
        ok: true,
        text: `${updated.name} access updated.${memberAccountChanged ? " Member PIN generated and queued for SMS." : ""}`
      });
      closeEditor();
    } catch (updateError) {
      setMessage({
        ok: false,
        text: updateError instanceof Error ? updateError.message : "User access failed to update"
      });
    } finally {
      setUpdating(false);
    }
  }

  function togglePermission(permission: Permission) {
    setPermissionDraft((current) =>
      current.includes(permission)
        ? current.filter((candidate) => candidate !== permission)
        : [...current, permission]
    );
  }

  async function saveRolePermissions() {
    setSavingPermissions(true);
    setMessage(null);

    try {
      const updated = await apiFetch<AccessControlState>(
        `/access-control/roles/${selectedPermissionRole}/permissions`,
        {
          method: "PATCH",
          body: JSON.stringify({ permissions: permissionDraft })
        }
      );
      setAccessControl(updated);
      setMessage({ ok: true, text: `${humanizeEnum(selectedPermissionRole)} permissions updated.` });
    } catch (permissionError) {
      setMessage({
        ok: false,
        text: permissionError instanceof Error ? permissionError.message : "Role permissions failed to update"
      });
    } finally {
      setSavingPermissions(false);
    }
  }

  const availableRoles = accessControl?.roles ?? [...roles];
  const permissionCatalog = accessControl?.permissions ?? [...permissionCatalogDefaults];
  const effectiveRolePermissions = accessControl?.rolePermissions ?? defaultRolePermissions;
  const selectedRolePermissionList = effectiveRolePermissions[selectedPermissionRole] ?? [];

  useEffect(() => {
    setPermissionDraft(selectedRolePermissionList);
  }, [accessControl, selectedPermissionRole]);

  const accountCounts = useMemo(
    () =>
      users.reduce<Record<string, number>>((counts, user) => {
        counts[user.role] = (counts[user.role] ?? 0) + 1;
        return counts;
      }, {}),
    [users]
  );
  const permissionTotal = availableRoles.reduce(
    (sum, role) => sum + (effectiveRolePermissions[role]?.length ?? 0),
    0
  );
  const selectedCreateProfile = accountProfiles[form.role];
  const selectedEditProfile = editForm ? accountProfiles[editForm.role] : null;
  const permissionCatalogGroups = useMemo(() => permissionGroups(permissionCatalog), [permissionCatalog]);
  const permissionDraftSet = useMemo(() => new Set(permissionDraft), [permissionDraft]);
  const permissionDirty =
    [...permissionDraft].sort().join("|") !== [...selectedRolePermissionList].sort().join("|");

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Account Management</p>
          <h2
            aria-label="Users"
            className="has-hint"
            data-hint="Define admin, partner, group, and member accounts. Each account is bound to the relevant partner, lender, group, or member scope before API data is returned. User creation never creates or chains groups to other groups."
            tabIndex={0}
          >
            Users
          </h2>
        </div>
        <div className="page-heading-actions">
          <span className="pill">{users.length} users</span>
          <button className="button" onClick={() => setIsCreateOpen(true)} type="button">
            <UserPlus size={16} />
            Create user
          </button>
        </div>
      </section>

      {!isCreateOpen && !editingUser && message ? (
        <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
      ) : null}

      <nav className="sub-menu user-submenu" aria-label="User management menu">
        <button
          className={activeSubmenu === "accounts" ? "active" : ""}
          onClick={() => setActiveSubmenu("accounts")}
          type="button"
        >
          Accounts
        </button>
        <button
          className={activeSubmenu === "roles" ? "active" : ""}
          onClick={() => setActiveSubmenu("roles")}
          type="button"
        >
          Roles & Permissions
        </button>
      </nav>

      {activeSubmenu === "accounts" ? (
        <>
          <section className="stat-grid">
            <StatCard icon={<UsersRound size={20} />} label="Accounts" note="Active demo and created users" value={users.length.toString()} />
            <StatCard icon={<ShieldCheck size={20} />} label="Roles" note="Platform account types" value={availableRoles.length.toString()} />
            <StatCard icon={<KeyRound size={20} />} label="Permissions" note="Role permission assignments" value={permissionTotal.toString()} />
            <StatCard icon={<UserPlus size={20} />} label="Member accounts" note="Personal account bindings" value={(accountCounts.MEMBER ?? 0).toString()} />
          </section>

          <section className="data-card">
            <header>
              <div>
                <h3>Accounts</h3>
              </div>
              <span className="pill">{users.length} users</span>
            </header>
            <DataTable
              columns={[
                {
                  key: "user",
                  header: "User",
                  value: (user) => `${user.name} ${user.email}`,
                cell: (user) => (
                    <div className="user-cell">
                      <FallbackImage
                        alt=""
                        className="table-avatar"
                        fallbackSrc={DEFAULT_AVATAR_PLACEHOLDER}
                        src={user.avatarUrl}
                      />
                      <span>
                        <strong>{user.name}</strong>
                        <br />
                        <span>{user.email}</span>
                      </span>
                    </div>
                  )
                },
                {
                  key: "role",
                  header: "Role",
                  value: (user) => humanizeEnum(user.role),
                  cell: (user) => <span className="pill blue">{humanizeEnum(user.role)}</span>
                },
                {
                  key: "binding",
                  header: "Account Scope",
                  value: accountBinding
                },
                {
                  key: "permissions",
                  header: "Permissions",
                  value: (user) => effectiveRolePermissions[roleValue(user.role)]?.length ?? 0
                },
                {
                  key: "manage",
                  header: "Manage",
                  value: () => "Manage",
                  exportable: false,
                  searchable: false,
                  sortable: false,
                  cell: (user) => (
                    <button className="button secondary table-action-button" onClick={() => startEditingUser(user)} type="button">
                      <SlidersHorizontal size={15} />
                      Manage
                    </button>
                  )
                },
                {
                  key: "status",
                  header: "Status",
                  value: (user) => humanizeEnum(user.status ?? "ACTIVE")
                }
              ]}
              exportName="intelli-cash-users"
              filters={[
                {
                  key: "role",
                  label: "Role",
                  allLabel: "All roles",
                  getValue: (user) => user.role,
                  options: availableRoles.map((role) => ({ label: humanizeEnum(role), value: role }))
                },
                {
                  key: "status",
                  label: "Status",
                  allLabel: "All statuses",
                  getValue: (user) => user.status ?? "ACTIVE"
                }
              ]}
              getRowKey={(user) => user.id}
              rows={users}
              title="Accounts"
            />
          </section>
        </>
      ) : (
        <>
          <section className="access-profile-grid">
            {availableRoles.map((role) => {
              const profile = accountProfiles[role];
              return (
                <article className="access-profile" key={role}>
                  <header>
                    <div>
                      <strong
                        aria-label={humanizeEnum(role)}
                        className="has-inline-hint"
                        data-hint={profile.intent}
                        tabIndex={0}
                      >
                        {humanizeEnum(role)}
                      </strong>
                      <span>{profile.accountType}</span>
                    </div>
                    <span className="pill">{accountCounts[role] ?? 0} users</span>
                  </header>
                  <dl>
                    <div>
                      <dt>Binding</dt>
                      <dd>{profile.binding}</dd>
                    </div>
                    <div>
                      <dt>Permissions</dt>
                      <dd>{effectiveRolePermissions[role]?.length ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Dashboard</dt>
                      <dd>{profile.dashboard}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </section>

          <section className="data-card role-permission-card">
            <header>
              <div>
                <h3>Role Permissions</h3>
                <span>Edit the permissions assigned to each account role.</span>
              </div>
              <span className="pill blue">{permissionDraft.length} selected</span>
            </header>
            <div className="role-permission-layout">
              <aside className="role-picker-list" aria-label="Roles">
                {availableRoles.map((role) => (
                  <button
                    className={selectedPermissionRole === role ? "active" : ""}
                    key={role}
                    onClick={() => setSelectedPermissionRole(role)}
                    type="button"
                  >
                    <strong>{humanizeEnum(role)}</strong>
                    <span>{effectiveRolePermissions[role]?.length ?? 0} permissions</span>
                  </button>
                ))}
              </aside>
              <div className="permission-editor">
                <div className="access-preview">
                  <div>
                    <strong>{accountProfiles[selectedPermissionRole].dashboard}</strong>
                    <span>{accountProfiles[selectedPermissionRole].scope}</span>
                  </div>
                </div>
                <div className="permission-editor-actions">
                  <span>{permissionDirty ? "Unsaved changes" : "Saved template"}</span>
                  <div>
                    <button
                      className="button secondary"
                      disabled={!permissionDirty || savingPermissions}
                      onClick={() => setPermissionDraft(selectedRolePermissionList)}
                      type="button"
                    >
                      Reset
                    </button>
                    <button
                      className="button"
                      disabled={!permissionDirty || savingPermissions}
                      onClick={saveRolePermissions}
                      type="button"
                    >
                      <ShieldCheck size={16} />
                      {savingPermissions ? "Saving" : "Save permissions"}
                    </button>
                  </div>
                </div>
                <div className="permission-domain-list">
                  {Object.entries(permissionCatalogGroups).map(([domain, domainPermissions]) => (
                    <section className="permission-domain" key={domain}>
                      <header>
                        <h4>{permissionLabels[domain] ?? humanizeEnum(domain)}</h4>
                        <span>{domainPermissions.length} available</span>
                      </header>
                      <div className="permission-toggle-grid">
                        {domainPermissions.map((permission) => {
                          const locked =
                            selectedPermissionRole === "IWL_ADMIN" &&
                            (permission === "users:read" || permission === "users:write");
                          return (
                            <label className="permission-toggle" key={permission}>
                              <input
                                checked={permissionDraftSet.has(permission)}
                                disabled={locked}
                                onChange={() => togglePermission(permission)}
                                type="checkbox"
                              />
                              <span>
                                <strong>{permission}</strong>
                                <em>{locked ? "Required for admin recovery" : humanizeEnum(permission.split(":")[1] ?? "access")}</em>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="data-card">
            <header>
              <div>
                <h3>Permission Templates</h3>
                <span>Permissions are assigned by account type and enforced by API scope.</span>
              </div>
            </header>
            <div className="permission-list">
              {availableRoles.map((role) => (
                <div className="permission-row" key={role}>
                  <strong
                    aria-label={humanizeEnum(role)}
                    className="has-inline-hint"
                    data-hint={accountProfiles[role].scope}
                    tabIndex={0}
                  >
                    {humanizeEnum(role)}
                  </strong>
                  <span>
                    {accountProfiles[role].binding} - {effectiveRolePermissions[role]?.length ?? 0} permissions
                  </span>
                  <div className="permission-summary">
                    {Object.entries(permissionGroups(effectiveRolePermissions[role] ?? [])).map(([domain, domainPermissions]) => (
                      <code key={domain}>
                        {permissionLabels[domain] ?? humanizeEnum(domain)}: {domainPermissions.length}
                      </code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {isCreateOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Create user">
          <button className="modal-backdrop" onClick={() => setIsCreateOpen(false)} type="button" aria-label="Close create user" />
          <section className="data-card credential-modal access-manager-modal">
            <header>
              <div>
                <h3>Create User</h3>
                <span>{selectedCreateProfile.accountType} - {selectedCreateProfile.binding}</span>
              </div>
              <button className="icon-button" onClick={() => setIsCreateOpen(false)} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form user-form" onSubmit={saveUser}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Name</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    type="text"
                    value={form.name}
                  />
                </label>
                <label className="credential-field">
                  <span>Email</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    required
                    type="email"
                    value={form.email}
                  />
                </label>
                <label className="credential-field">
                  <span>Password</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    required
                    type="password"
                    value={form.password}
                  />
                </label>
                <label className="credential-field">
                  <span>Role</span>
                  <select
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        role: roleValue(event.target.value),
                        partnerId: "",
                        groupId: "",
                        memberId: ""
                      }))
                    }
                    value={form.role}
                  >
                    {availableRoles.map((role) => (
                      <option key={role} value={role}>
                        {humanizeEnum(role)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field upload-field">
                  <span>Avatar image</span>
                  <input
                    accept="image/*"
                    disabled={uploadingAvatar === "create"}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadAvatar(file, "create");
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                  {form.avatarUrl ? (
                    <span className="upload-preview">
                      <FallbackImage alt="" className="table-avatar" fallbackSrc={DEFAULT_AVATAR_PLACEHOLDER} src={form.avatarUrl} />
                      <em>Uploaded avatar ready</em>
                    </span>
                  ) : (
                    <em>{uploadingAvatar === "create" ? "Uploading..." : "PNG, JPG, WebP, or GIF"}</em>
                  )}
                </label>
                {form.role === "PARTNER_OFFICER" || form.role === "LENDER" ? (
                  <label className="credential-field">
                    <span>{form.role === "LENDER" ? "Lender" : "Partner"}</span>
                    <select
                      onChange={(event) => setForm((current) => ({ ...current, partnerId: event.target.value }))}
                      required
                      value={form.partnerId}
                    >
                      <option value="">Select {form.role === "LENDER" ? "lender" : "partner"}</option>
                      {partnerOptionsForRole(form.role).map((partner) => (
                        <option key={partner.id} value={partner.id}>
                          {partner.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {form.role === "GROUP_ACCOUNT" || form.role === "MEMBER" ? (
                  <label className="credential-field">
                    <span>Group</span>
                    <select
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          groupId: event.target.value,
                          memberId: ""
                        }))
                      }
                      required
                      value={form.groupId}
                    >
                      <option value="">Select group</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name} ({group.code})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {form.role === "MEMBER" ? (
                  <label className="credential-field">
                    <span>Member</span>
                    <select
                      disabled={!form.groupId}
                      onChange={(event) => setForm((current) => ({ ...current, memberId: event.target.value }))}
                      required
                      value={form.memberId}
                    >
                      <option value="">Select member</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.fullName} ({humanizeEnum(member.role)})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="access-preview">
                <div>
                  <strong>{selectedCreateProfile.dashboard}</strong>
                  <span>{selectedCreateProfile.scope}</span>
                </div>
                <div className="permission-summary">
                  {Object.entries(permissionGroups(effectiveRolePermissions[form.role] ?? [])).map(([domain, domainPermissions]) => (
                    <span key={domain}>
                      {permissionLabels[domain] ?? humanizeEnum(domain)}: {domainPermissions.length}
                    </span>
                  ))}
                </div>
              </div>
              {message ? (
                <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
              ) : null}
              <div className="credential-actions">
                <button className="button" disabled={saving} type="submit">
                  <UserPlus size={16} />
                  {saving ? "Creating" : "Create user"}
                </button>
                <button className="button secondary" onClick={() => setIsCreateOpen(false)} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editingUser && editForm && selectedEditProfile ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Manage ${editingUser.name}`}>
          <button className="modal-backdrop" onClick={closeEditor} type="button" aria-label="Close user access manager" />
          <section className="data-card credential-modal access-manager-modal">
            <header>
              <div>
                <h3>Manage Access</h3>
                <span>{editingUser.name} - {editingUser.email}</span>
              </div>
              <div className="modal-header-actions">
                <span className="pill blue">{humanizeEnum(editForm.role)}</span>
                <button className="icon-button" onClick={closeEditor} type="button" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </header>
            <form className="credential-form" onSubmit={saveManagedUser}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Role template</span>
                  <select
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              role: roleValue(event.target.value),
                              partnerId: "",
                              groupId: "",
                              memberId: ""
                            }
                          : current
                      )
                    }
                    value={editForm.role}
                  >
                    {availableRoles.map((role) => (
                      <option key={role} value={role}>
                        {humanizeEnum(role)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Status</span>
                  <select
                    onChange={(event) =>
                      setEditForm((current) => (current ? { ...current, status: event.target.value } : current))
                    }
                    value={editForm.status}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </label>
                <label className="credential-field upload-field">
                  <span>Avatar image</span>
                  <input
                    accept="image/*"
                    disabled={uploadingAvatar === "edit"}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadAvatar(file, "edit");
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                  {editForm.avatarUrl ? (
                    <span className="upload-preview">
                      <FallbackImage alt="" className="table-avatar" fallbackSrc={DEFAULT_AVATAR_PLACEHOLDER} src={editForm.avatarUrl} />
                      <em>Uploaded avatar ready</em>
                    </span>
                  ) : (
                    <em>{uploadingAvatar === "edit" ? "Uploading..." : "PNG, JPG, WebP, or GIF"}</em>
                  )}
                </label>
                {editForm.role === "PARTNER_OFFICER" || editForm.role === "LENDER" ? (
                  <label className="credential-field">
                    <span>{editForm.role === "LENDER" ? "Lender account scope" : "Partner account scope"}</span>
                    <select
                      onChange={(event) =>
                        setEditForm((current) => (current ? { ...current, partnerId: event.target.value } : current))
                      }
                      required
                      value={editForm.partnerId}
                    >
                      <option value="">Select {editForm.role === "LENDER" ? "lender" : "partner"}</option>
                      {partnerOptionsForRole(editForm.role).map((partner) => (
                        <option key={partner.id} value={partner.id}>
                          {partner.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {editForm.role === "GROUP_ACCOUNT" || editForm.role === "MEMBER" ? (
                  <label className="credential-field">
                    <span>Group account scope</span>
                    <select
                      onChange={(event) =>
                        setEditForm((current) =>
                          current
                            ? {
                                ...current,
                                groupId: event.target.value,
                                memberId: ""
                              }
                            : current
                        )
                      }
                      required
                      value={editForm.groupId}
                    >
                      <option value="">Select group</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name} ({group.code})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {editForm.role === "MEMBER" ? (
                  <label className="credential-field">
                    <span>Member account scope</span>
                    <select
                      disabled={!editForm.groupId}
                      onChange={(event) =>
                        setEditForm((current) => (current ? { ...current, memberId: event.target.value } : current))
                      }
                      required
                      value={editForm.memberId}
                    >
                      <option value="">Select member</option>
                      {editMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.fullName} ({humanizeEnum(member.role)})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="access-preview">
                <CheckCircle2 size={18} />
                <div>
                  <strong>{selectedEditProfile.dashboard}</strong>
                  <span>{selectedEditProfile.scope}</span>
                </div>
              </div>
              <div className="permission-summary">
                {Object.entries(permissionGroups(effectiveRolePermissions[editForm.role] ?? [])).map(([domain, domainPermissions]) => (
                  <span key={domain}>
                    {permissionLabels[domain] ?? humanizeEnum(domain)}: {domainPermissions.length}
                  </span>
                ))}
              </div>
              {message ? (
                <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
              ) : null}
              <div className="credential-actions">
                <button className="button" disabled={updating} type="submit">
                  <ShieldCheck size={16} />
                  {updating ? "Saving" : "Save access"}
                </button>
                <button className="button secondary" onClick={closeEditor} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
