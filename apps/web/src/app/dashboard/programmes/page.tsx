"use client";

import React from "react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Building2, FileText, FolderKanban, Image, Landmark, Network, Pencil, Plus, UploadCloud, UsersRound, X } from "@/lib/theme-icons";
import { apiFetch, formatKes, humanizeEnum, uploadFile } from "../../../lib/api";
import { CollectionView } from "../../../components/dashboard/collection-view";
import { DataTable } from "../../../components/dashboard/data-table";
import { FallbackImage } from "../../../components/fallback-image";
import { StatCard } from "../../../components/dashboard/stat-card";
import type { GroupRow, PartnerRow, ProgrammeAsset, ProgrammeRow, User } from "../../../components/dashboard/types";

const publicProgrammeStatuses = ["DRAFT", "ONGOING", "PAUSED", "CLOSED"];

const defaultProgrammeForm = {
  name: "",
  country: "Kenya",
  county: "",
  description: "",
  coverImageUrl: "",
  partnerIds: [] as string[],
  lenderPartnerIds: [] as string[],
  publicSlug: "",
  publicStatus: "DRAFT",
  fundingGoalKes: "",
  fundingSummary: "",
  impactSummary: "",
  fundingDeadline: "",
  allowInvestments: true,
  allowDonations: true
};

const defaultAssetForm = {
  programmeId: "",
  type: "IMAGE",
  visibility: "PUBLIC",
  title: "",
  url: "",
  description: "",
  fileName: "",
  mimeType: ""
};

function centsToKesInput(cents?: number) {
  if (!cents) return "";
  const amount = cents / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function kesInputToCents(value: string) {
  return Math.round(Number(value || "0") * 100);
}

function dateToInput(value?: string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function dateInputToIso(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
}

function partnerNames(programme: ProgrammeRow, role: string) {
  return (
    programme.partnerLinks
      ?.filter((link) => link.role === role)
      .map((link) => link.partner.name) ?? []
  );
}

function supportingPartners(programme: ProgrammeRow) {
  return (
    programme.partnerLinks
      ?.filter((link) => link.role !== "LENDER" && link.role !== "IMPLEMENTING_PARTNER")
      .map((link) => link.partner.name) ?? []
  );
}

export default function ProgrammesPage() {
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState(defaultProgrammeForm);
  const [assetForm, setAssetForm] = useState(defaultAssetForm);
  const [editingProgramme, setEditingProgramme] = useState<ProgrammeRow | null>(null);
  const [editingAsset, setEditingAsset] = useState<ProgrammeAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"cover" | "asset" | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadProgrammes() {
      try {
        const [meResponse, programmeResponse, groupResponse, partnerResponse] = await Promise.all([
          apiFetch<User>("/auth/me"),
          apiFetch<ProgrammeRow[]>("/programmes"),
          apiFetch<GroupRow[]>("/groups"),
          apiFetch<PartnerRow[]>("/partners").catch(() => [])
        ]);

        if (!mounted) return;
        setUser(meResponse);
        setProgrammes(programmeResponse);
        setGroups(groupResponse);
        setPartners(partnerResponse);
        setAssetForm((current) => ({ ...current, programmeId: current.programmeId || programmeResponse[0]?.id || "" }));
      } catch (programmeError) {
        if (mounted) {
          setError(programmeError instanceof Error ? programmeError.message : "Programs failed");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProgrammes();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", isCreateOpen);
    return () => document.body.classList.remove("modal-open");
  }, [isCreateOpen]);

  const programmeGroups = useMemo(() => {
    const groupsByProgramme = new Map<string, GroupRow[]>();
    groups.forEach((group) => {
      const programmeIds = [
        group.programme?.id,
        ...(group.programmeLinks?.map((link) => link.programme.id) ?? [])
      ].filter(Boolean) as string[];
      const uniqueProgrammeIds = Array.from(new Set(programmeIds.length > 0 ? programmeIds : ["unassigned"]));
      uniqueProgrammeIds.forEach((programmeId) => {
        groupsByProgramme.set(programmeId, [...(groupsByProgramme.get(programmeId) ?? []), group]);
      });
    });
    return groupsByProgramme;
  }, [groups]);
  const partnerLinkCount = programmes.reduce(
    (sum, programme) => sum + (programme.partnerLinks?.length ?? 0),
    0
  );
  const lenderLinkCount = programmes.reduce(
    (sum, programme) =>
      sum + (programme.partnerLinks?.filter((link) => link.role === "LENDER").length ?? 0),
    0
  );
  const groupCount = programmes.reduce(
    (sum, programme) => sum + (programme._count.groupLinks ?? programme._count.groups),
    0
  );
  const deliveryPartners = partners.filter((partner) => partner.type !== "LENDER");
  const lenders = partners.filter((partner) => partner.type === "LENDER");
  const galleryAssets = programmes.flatMap((programme) =>
    (programme.assets ?? [])
      .filter((asset) => asset.type === "IMAGE")
      .map((asset) => ({ ...asset, programmeName: programme.name }))
  );
  const fileAssets = programmes.flatMap((programme) =>
    (programme.assets ?? [])
      .filter((asset) => asset.type === "FILE")
      .map((asset) => ({ ...asset, programmeName: programme.name }))
  );
  const canManageProgrammes = user?.permissions?.includes("programmes:write") ?? false;
  const canManageAssets = canManageProgrammes;

  function updateMultiSelect(field: "partnerIds" | "lenderPartnerIds", values: string[]) {
    setForm((current) => ({ ...current, [field]: values }));
  }

  function openCreateProgramme() {
    setEditingProgramme(null);
    setForm(defaultProgrammeForm);
    setMessage(null);
    setIsCreateOpen(true);
  }

  function openEditProgramme(programme: ProgrammeRow) {
    setEditingProgramme(programme);
    setForm({
      name: programme.name,
      country: programme.country,
      county: programme.county ?? "",
      description: programme.description ?? "",
      coverImageUrl: programme.coverImageUrl ?? "",
      partnerIds:
        programme.partnerLinks
          ?.filter((link) => link.role !== "LENDER")
          .map((link) => link.partner.id) ?? [programme.partner.id],
      lenderPartnerIds:
        programme.partnerLinks
          ?.filter((link) => link.role === "LENDER")
          .map((link) => link.partner.id) ?? [],
      publicSlug: programme.publicSlug ?? "",
      publicStatus: programme.publicStatus ?? "DRAFT",
      fundingGoalKes: centsToKesInput(programme.fundingGoalCents),
      fundingSummary: programme.fundingSummary ?? "",
      impactSummary: programme.impactSummary ?? "",
      fundingDeadline: dateToInput(programme.fundingDeadline),
      allowInvestments: programme.allowInvestments ?? true,
      allowDonations: programme.allowDonations ?? true
    });
    setMessage(null);
    setIsCreateOpen(true);
  }

  async function uploadProgrammeCover(file: File) {
    setUploading("cover");
    setMessage(null);

    try {
      const uploaded = await uploadFile("image", file);
      setForm((current) => ({ ...current, coverImageUrl: uploaded.url }));
      setMessage({ ok: true, text: `${uploaded.fileName} uploaded as cover image.` });
    } catch (uploadError) {
      setMessage({
        ok: false,
        text: uploadError instanceof Error ? uploadError.message : "Cover image upload failed"
      });
    } finally {
      setUploading(null);
    }
  }

  async function uploadProgrammeAsset(file: File) {
    setUploading("asset");
    setMessage(null);

    try {
      const isImage = file.type.startsWith("image/");
      const uploaded = await uploadFile(isImage ? "image" : "file", file);
      setAssetForm((current) => ({
        ...current,
        type: isImage ? "IMAGE" : "FILE",
        title: current.title || file.name.replace(/\.[^.]+$/, ""),
        url: uploaded.url,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType
      }));
      setMessage({ ok: true, text: `${uploaded.fileName} uploaded.` });
    } catch (uploadError) {
      setMessage({
        ok: false,
        text: uploadError instanceof Error ? uploadError.message : "Program asset upload failed"
      });
    } finally {
      setUploading(null);
    }
  }

  function closeProgrammeModal() {
    setEditingProgramme(null);
    setIsCreateOpen(false);
  }

  async function submitProgramme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const saved = await apiFetch<ProgrammeRow>(editingProgramme ? `/programmes/${editingProgramme.id}` : "/programmes", {
        method: editingProgramme ? "PATCH" : "POST",
        body: JSON.stringify({
          name: form.name,
          country: form.country,
          county: form.county || undefined,
          description: form.description || undefined,
          coverImageUrl: form.coverImageUrl || undefined,
          partnerIds: form.partnerIds,
          lenderPartnerIds: form.lenderPartnerIds,
          publicSlug: form.publicSlug || null,
          publicStatus: form.publicStatus,
          fundingGoalCents: kesInputToCents(form.fundingGoalKes),
          fundingSummary: form.fundingSummary || null,
          impactSummary: form.impactSummary || null,
          fundingDeadline: dateInputToIso(form.fundingDeadline),
          allowInvestments: form.allowInvestments,
          allowDonations: form.allowDonations
        })
      });
      const refreshed = await apiFetch<ProgrammeRow[]>("/programmes");

      setProgrammes(refreshed);
      setForm(defaultProgrammeForm);
      setEditingProgramme(null);
      setMessage({ ok: true, text: `${saved.name} program ${editingProgramme ? "updated" : "created"}.` });
      setIsCreateOpen(false);
    } catch (saveError) {
      setMessage({
        ok: false,
        text: saveError instanceof Error ? saveError.message : "Program failed to save"
      });
    } finally {
      setSaving(false);
    }
  }

  function editAsset(asset: ProgrammeAsset) {
    setEditingAsset(asset);
    setAssetForm({
      programmeId: asset.programmeId,
      type: asset.type,
      visibility: asset.visibility,
      title: asset.title,
      url: asset.url,
      description: asset.description ?? "",
      fileName: asset.fileName ?? "",
      mimeType: asset.mimeType ?? ""
    });
    setMessage(null);
  }

  async function createProgrammeAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const created = await apiFetch(
        editingAsset
          ? `/programmes/${assetForm.programmeId}/assets/${editingAsset.id}`
          : `/programmes/${assetForm.programmeId}/assets`,
        {
        method: editingAsset ? "PATCH" : "POST",
        body: JSON.stringify({
          type: assetForm.type,
          visibility: assetForm.visibility,
          title: assetForm.title,
          url: assetForm.url,
          description: assetForm.description || null,
          fileName: assetForm.fileName || null,
          mimeType: assetForm.mimeType || null
        })
        }
      );
      const refreshed = await apiFetch<ProgrammeRow[]>("/programmes");
      setProgrammes(refreshed);
      setAssetForm((current) => ({
        ...current,
        title: "",
        url: "",
        description: "",
        fileName: "",
        mimeType: ""
      }));
      setEditingAsset(null);
      setMessage({ ok: true, text: `Program asset ${editingAsset ? "updated" : typeof created === "object" ? "created" : "saved"}.` });
    } catch (assetError) {
      setMessage({
        ok: false,
        text: assetError instanceof Error ? assetError.message : "Program asset failed to save"
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
          <p className="eyebrow">Program Hierarchy</p>
          <h2
            aria-label="Programs"
            className="has-hint"
            data-hint="Members belong to groups, groups belong to programs, and every program can carry implementing partners, support partners, and lenders. FtMA is represented as a program when test data is imported."
            tabIndex={0}
          >
            Programs
          </h2>
        </div>
        <div className="page-heading-actions">
          <span className="pill">{programmes.length} programs</span>
          {canManageProgrammes ? (
            <button className="button" onClick={openCreateProgramme} type="button">
              <Plus size={16} />
              Create program
            </button>
          ) : null}
        </div>
      </section>

      {!isCreateOpen && message ? (
        <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
      ) : null}

      <section className="stat-grid">
        <StatCard icon={<FolderKanban size={20} />} label="Programs" note="Portfolio scopes" value={programmes.length.toString()} />
        <StatCard icon={<UsersRound size={20} />} label="Groups" note="Assigned to programs" value={groupCount.toString()} />
        <StatCard icon={<Building2 size={20} />} label="Partners" note="Implementing and support links" value={partnerLinkCount.toString()} />
        <StatCard icon={<Landmark size={20} />} label="Lenders" note="Programme finance links" value={lenderLinkCount.toString()} />
      </section>

      {isCreateOpen && canManageProgrammes ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={editingProgramme ? "Edit program" : "Create program"}>
          <button className="modal-backdrop" onClick={closeProgrammeModal} type="button" aria-label="Close program editor" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>{editingProgramme ? "Edit Program" : "Create Program"}</h3>
                <span>Attach implementing partners and lenders directly to the program.</span>
              </div>
              <button className="icon-button" onClick={closeProgrammeModal} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form" onSubmit={submitProgramme}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Program name</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    required
                    value={form.name}
                  />
                </label>
                <label className="credential-field">
                  <span>Country</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                    required
                    value={form.country}
                  />
                </label>
                <label className="credential-field">
                  <span>County</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, county: event.target.value }))}
                    value={form.county}
                  />
                </label>
                <label className="credential-field">
                  <span>Description</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    value={form.description}
                  />
                </label>
                <label className="credential-field upload-field">
                  <span>Cover image</span>
                  <input
                    accept="image/*"
                    disabled={uploading === "cover"}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadProgrammeCover(file);
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                  {form.coverImageUrl ? (
                    <span className="upload-preview">
                      <FallbackImage alt="" className="programme-thumb" src={form.coverImageUrl} />
                      <em>Uploaded cover ready</em>
                    </span>
                  ) : (
                    <em>{uploading === "cover" ? "Uploading..." : "PNG, JPG, WebP, or GIF"}</em>
                  )}
                </label>
                <label className="credential-field">
                  <span>Public slug</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, publicSlug: event.target.value }))}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    value={form.publicSlug}
                  />
                </label>
                <label className="credential-field">
                  <span>Public status</span>
                  <select
                    onChange={(event) => setForm((current) => ({ ...current, publicStatus: event.target.value }))}
                    value={form.publicStatus}
                  >
                    {publicProgrammeStatuses.map((status) => (
                      <option key={status} value={status}>
                        {humanizeEnum(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Funding goal (KES)</span>
                  <input
                    min="0"
                    onChange={(event) => setForm((current) => ({ ...current, fundingGoalKes: event.target.value }))}
                    type="number"
                    value={form.fundingGoalKes}
                  />
                </label>
                <label className="credential-field">
                  <span>Funding deadline</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, fundingDeadline: event.target.value }))}
                    type="date"
                    value={form.fundingDeadline}
                  />
                </label>
                <label className="credential-field">
                  <span>Funding summary</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, fundingSummary: event.target.value }))}
                    value={form.fundingSummary}
                  />
                </label>
                <label className="credential-field">
                  <span>Impact summary</span>
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, impactSummary: event.target.value }))}
                    value={form.impactSummary}
                  />
                </label>
                <label className="checkbox-card">
                  <input
                    checked={form.allowInvestments}
                    onChange={(event) => setForm((current) => ({ ...current, allowInvestments: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>Allow investments</span>
                </label>
                <label className="checkbox-card">
                  <input
                    checked={form.allowDonations}
                    onChange={(event) => setForm((current) => ({ ...current, allowDonations: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>Allow donations</span>
                </label>
                <label className="credential-field">
                  <span>Partners</span>
                  <select
                    multiple
                    onChange={(event) =>
                      updateMultiSelect(
                        "partnerIds",
                        Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                      )
                    }
                    value={form.partnerIds}
                  >
                    {deliveryPartners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Lenders</span>
                  <select
                    multiple
                    onChange={(event) =>
                      updateMultiSelect(
                        "lenderPartnerIds",
                        Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                      )
                    }
                    value={form.lenderPartnerIds}
                  >
                    {lenders.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name}
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
                  {editingProgramme ? <Pencil size={16} /> : <Plus size={16} />}
                  {saving ? "Saving" : editingProgramme ? "Save program" : "Create program"}
                </button>
                <button className="button secondary" onClick={closeProgrammeModal} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="data-card hierarchy-card">
        <header>
          <div>
            <h3>Hierarchy</h3>
          </div>
        </header>
        <div className="hierarchy-flow" aria-label="Program hierarchy">
          <div>
            <span>Member</span>
            <strong>Passbook</strong>
          </div>
          <div>
            <span>Group</span>
            <strong>Records</strong>
          </div>
          <div>
            <span>Program</span>
            <strong>Scope</strong>
          </div>
          <div>
            <span>Partners & Lenders</span>
            <strong>Links</strong>
          </div>
        </div>
      </section>

      <section className="data-card">
        <header>
          <div>
            <h3>Programs</h3>
          </div>
          <Network size={18} />
        </header>
        <CollectionView
          count={programmes.length}
          label="programs"
          cards={
            <div className="card-grid compact">
              {programmes.map((programme) => {
                const groupsForProgramme = programmeGroups.get(programme.id) ?? [];
                const visibleMembers = groupsForProgramme.reduce((sum, group) => sum + group._count.members, 0);
                const lendersForProgramme = partnerNames(programme, "LENDER");
                return (
                  <article className="record-card record-card-small with-media" key={programme.id}>
                    <div className="record-card-media">
                      <FallbackImage alt="" src={programme.coverImageUrl} />
                    </div>
                    <div className="record-card-body">
                      <header>
                        <div>
                          <h4>{programme.name}</h4>
                          <small>{programme.partner.name} - {programme.county ?? programme.country}</small>
                        </div>
                        <span className="pill">{humanizeEnum(programme.publicStatus ?? "DRAFT")}</span>
                      </header>
                      <div className="record-card-meta">
                        <div>
                          <span>Groups</span>
                          <strong>{programme._count.groupLinks ?? programme._count.groups}</strong>
                        </div>
                        <div>
                          <span>Members</span>
                          <strong>{visibleMembers}</strong>
                        </div>
                        <div>
                          <span>VA</span>
                          <strong>{programme._count.villageAgents}</strong>
                        </div>
                        <div>
                          <span>Funding</span>
                          <strong>{programme.fundingGoalCents ? formatKes(programme.fundingGoalCents) : "Not set"}</strong>
                        </div>
                      </div>
                      <small>{lendersForProgramme.length > 0 ? `${lendersForProgramme.length} lenders linked` : "No lenders linked"}</small>
                      {canManageProgrammes ? (
                        <div className="record-card-actions">
                          <button className="button secondary" onClick={() => openEditProgramme(programme)} type="button">
                            <Pencil size={16} />
                            Edit
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {programmes.length === 0 ? <div className="empty-state">No programs</div> : null}
            </div>
          }
          list={
            <DataTable
              columns={[
            {
              key: "programme",
              header: "Program",
              value: (programme) =>
                `${programme.name} ${programme.county ?? programme.country} ${programme.partner.name}`,
              exportValue: (programme) => programme.name,
              cell: (programme) => (
                <div className="programme-cell">
                  <FallbackImage alt="" className="programme-thumb" src={programme.coverImageUrl} />
                  <span>
                    <strong>{programme.name}</strong>
                    <br />
                    <span>{programme.county ?? programme.country}</span>
                  </span>
                </div>
              )
            },
            {
              key: "lead",
              header: "Lead Partner",
              value: (programme) => programme.partner.name,
              cell: (programme) => (
                <>
                  <strong>{programme.partner.name}</strong>
                  <br />
                  <span>{humanizeEnum(programme.partner.type)}</span>
                </>
              )
            },
            {
              key: "partners",
              header: "Partners",
              value: (programme) => supportingPartners(programme).join(", ") || programme.partner.name,
              cell: (programme) => {
                const names = [
                  ...partnerNames(programme, "IMPLEMENTING_PARTNER"),
                  ...supportingPartners(programme)
                ];
                return names.length > 0 ? names.slice(0, 4).join(", ") : programme.partner.name;
              }
            },
            {
              key: "lenders",
              header: "Lenders",
              value: (programme) => partnerNames(programme, "LENDER").join(", ") || "None",
              cell: (programme) => {
                const lenders = partnerNames(programme, "LENDER");
                return lenders.length > 0 ? (
                  <span className="pill gold">{lenders.length} linked</span>
                ) : (
                  <span className="pill">None</span>
                );
              }
            },
            {
              key: "groups",
              header: "Groups",
              value: (programme) => programme._count.groupLinks ?? programme._count.groups,
              cell: (programme) => (
                <span className="pill blue">
                  {programme._count.groupLinks ?? programme._count.groups}
                </span>
              )
            },
            {
              key: "members",
              header: "Visible Members",
              value: (programme) =>
                (programmeGroups.get(programme.id) ?? []).reduce(
                  (sum, group) => sum + group._count.members,
                  0
                )
            },
            {
              key: "agents",
              header: "VAs/FSCs",
              value: (programme) => programme._count.villageAgents
            },
            {
              key: "action",
              header: "",
              value: () => "",
              searchable: false,
              sortable: false,
              exportable: false,
              cell: (programme) =>
                canManageProgrammes ? (
                  <button className="button secondary table-action-button" onClick={() => openEditProgramme(programme)} type="button">
                    <Pencil size={16} />
                    Edit
                  </button>
                ) : null
            }
          ]}
          exportName="intelli-cash-programs"
          filters={[
            {
              key: "lead",
              label: "Lead partner",
              allLabel: "All leads",
              getValue: (programme) => programme.partner.name
            },
            {
              key: "location",
              label: "Location",
              allLabel: "All locations",
              getValue: (programme) => programme.county ?? programme.country
            },
            {
              key: "source",
              label: "Source",
              allLabel: "All sources",
              getValue: (programme) => programme.sourceSystem ?? "Native"
            }
          ]}
          getRowKey={(programme) => programme.id}
          rows={programmes}
          title="Programs"
            />
          }
        />
      </section>

      <section className="two-column">
        <div className="data-card">
          <header>
            <div>
              <h3>Program Gallery</h3>
              <span>Public and private image assets attached to programs.</span>
            </div>
            <Image size={18} />
          </header>
          <div className="programme-gallery-grid">
            {galleryAssets.map((asset) => (
              <div className="programme-gallery-item" key={asset.id}>
                <a href={asset.url} rel="noopener noreferrer" target="_blank">
                  <FallbackImage alt={asset.title} src={asset.url} />
                  <span>
                    <strong>{asset.title}</strong>
                    <em>{asset.programmeName} - {humanizeEnum(asset.visibility)}</em>
                  </span>
                </a>
                {canManageAssets ? (
                  <button className="button secondary table-action-button" onClick={() => editAsset(asset)} type="button">
                    <Pencil size={15} />
                    Edit
                  </button>
                ) : null}
              </div>
            ))}
            {galleryAssets.length === 0 ? <div className="empty-state">No images</div> : null}
          </div>
        </div>

        <div className="data-card">
          <header>
            <div>
              <h3>Program Files</h3>
              <span>Documents can be public for website visitors or private for signed-in accounts.</span>
            </div>
            <FileText size={18} />
          </header>
          <div className="list">
            {fileAssets.map((asset) => (
              <div className="list-row" key={asset.id}>
                <a href={asset.url} rel="noopener noreferrer" target="_blank">
                  <strong>{asset.title}</strong>
                  <span>{asset.programmeName} - {humanizeEnum(asset.visibility)}</span>
                </a>
                <span className={`pill ${asset.visibility === "PUBLIC" ? "blue" : "gold"}`}>
                  {humanizeEnum(asset.visibility)}
                </span>
                {canManageAssets ? (
                  <button className="button secondary table-action-button" onClick={() => editAsset(asset)} type="button">
                    <Pencil size={15} />
                    Edit
                  </button>
                ) : null}
              </div>
            ))}
            {fileAssets.length === 0 ? <div className="empty-state">No files</div> : null}
          </div>
        </div>
      </section>

      {canManageAssets ? (
        <section className="data-card">
          <header>
            <div>
              <h3>{editingAsset ? "Edit Asset" : "Add Asset"}</h3>
              <span>Upload images, documents, and report files directly into the program.</span>
            </div>
            <Plus size={18} />
          </header>
          <form className="credential-form" onSubmit={createProgrammeAsset}>
            <div className="credential-grid">
              <label className="credential-field">
                <span>Program</span>
                <select
                  disabled={Boolean(editingAsset)}
                  onChange={(event) => setAssetForm((current) => ({ ...current, programmeId: event.target.value }))}
                  required
                  value={assetForm.programmeId}
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
                  onChange={(event) => setAssetForm((current) => ({ ...current, type: event.target.value }))}
                  value={assetForm.type}
                >
                  <option value="IMAGE">Gallery image</option>
                  <option value="FILE">File</option>
                </select>
              </label>
              <label className="credential-field">
                <span>Visibility</span>
                <select
                  onChange={(event) => setAssetForm((current) => ({ ...current, visibility: event.target.value }))}
                  value={assetForm.visibility}
                >
                  <option value="PUBLIC">Public</option>
                  <option value="PRIVATE">Private</option>
                </select>
              </label>
              <label className="credential-field">
                <span>Title</span>
                <input
                  onChange={(event) => setAssetForm((current) => ({ ...current, title: event.target.value }))}
                  required
                  value={assetForm.title}
                />
              </label>
              <label className="credential-field upload-field">
                <span>Upload file</span>
                <input
                  accept={assetForm.type === "IMAGE" ? "image/*" : ".pdf,.csv,.txt,.json,.doc,.docx,.xls,.xlsx,image/*"}
                  disabled={uploading === "asset"}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadProgrammeAsset(file);
                    event.currentTarget.value = "";
                  }}
                  type="file"
                />
                {assetForm.url ? (
                  <span className="upload-preview">
                    <UploadCloud size={17} />
                    <em>{assetForm.fileName || "Uploaded asset ready"}</em>
                  </span>
                ) : (
                  <em>{uploading === "asset" ? "Uploading..." : "Image, PDF, spreadsheet, or document"}</em>
                )}
              </label>
              <label className="credential-field">
                <span>Description</span>
                <input
                  onChange={(event) => setAssetForm((current) => ({ ...current, description: event.target.value }))}
                  value={assetForm.description}
                />
              </label>
            </div>
            <div className="credential-actions">
              <button className="button" disabled={saving || uploading === "asset" || !assetForm.programmeId || !assetForm.url} type="submit">
                {editingAsset ? <Pencil size={16} /> : <Plus size={16} />}
                {saving ? "Saving" : editingAsset ? "Save asset" : "Add asset"}
              </button>
              {editingAsset ? (
                <button
                  className="button secondary"
                  onClick={() => {
                    setEditingAsset(null);
                    setAssetForm((current) => ({ ...defaultAssetForm, programmeId: current.programmeId }));
                  }}
                  type="button"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
