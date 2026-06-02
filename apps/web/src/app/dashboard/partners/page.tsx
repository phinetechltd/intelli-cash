"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Building2, Link2, Network, Pencil, UsersRound, X } from "@/lib/theme-icons";
import { apiFetch, humanizeEnum } from "../../../lib/api";
import { CollectionView } from "../../../components/dashboard/collection-view";
import { DataTable } from "../../../components/dashboard/data-table";
import { StatCard } from "../../../components/dashboard/stat-card";
import type { PartnerRow, ProgrammeRow, User } from "../../../components/dashboard/types";

const defaultPartnerForm = {
  name: "",
  type: "NGO",
  status: "ACTIVE",
  apiScope: "PROGRAMME",
  county: "",
  contactName: "",
  contactPhone: "",
  valueProposition: "",
  capacity: "",
  linkageType: ""
};

export default function PartnersPage() {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [editingPartner, setEditingPartner] = useState<PartnerRow | null>(null);
  const [form, setForm] = useState(defaultPartnerForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPartnersWorkspace() {
    const [meResponse, partnerResponse, programmeResponse] = await Promise.all([
      apiFetch<User>("/auth/me"),
      apiFetch<PartnerRow[]>("/partners"),
      apiFetch<ProgrammeRow[]>("/programmes")
    ]);

    setUser(meResponse);
    setPartners(partnerResponse);
    setProgrammes(programmeResponse);
  }

  useEffect(() => {
    let mounted = true;

    async function loadPartners() {
      try {
        if (!mounted) return;
        await loadPartnersWorkspace();
      } catch (partnersError) {
        if (mounted) setError(partnersError instanceof Error ? partnersError.message : "Partners failed");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadPartners();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", Boolean(editingPartner));
    return () => document.body.classList.remove("modal-open");
  }, [editingPartner]);

  const webhookCount = partners.reduce((sum, partner) => sum + partner._count.webhookSubscriptions, 0);
  const programmeGroups = programmes.reduce((sum, programme) => sum + programme._count.groups, 0);
  const canManagePartners = user?.permissions?.includes("partners:write") ?? false;

  function openEditPartner(partner: PartnerRow) {
    setEditingPartner(partner);
    setForm({
      name: partner.name,
      type: partner.type,
      status: partner.status,
      apiScope: partner.apiScope,
      county: partner.county ?? "",
      contactName: partner.contactName ?? "",
      contactPhone: partner.contactPhone ?? "",
      valueProposition: partner.valueProposition ?? "",
      capacity: partner.capacity ?? "",
      linkageType: partner.linkageType ?? ""
    });
    setMessage(null);
  }

  async function submitPartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPartner) return;

    setSaving(true);
    setMessage(null);

    try {
      const saved = await apiFetch<PartnerRow>(`/partners/${editingPartner.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          status: form.status,
          apiScope: form.apiScope,
          county: form.county || null,
          contactName: form.contactName || null,
          contactPhone: form.contactPhone || null,
          valueProposition: form.valueProposition || null,
          capacity: form.capacity || null,
          linkageType: form.linkageType || null
        })
      });
      await loadPartnersWorkspace();
      setEditingPartner(null);
      setMessage({ ok: true, text: `${saved.name} partner updated.` });
    } catch (partnerError) {
      setMessage({ ok: false, text: partnerError instanceof Error ? partnerError.message : "Partner failed to save" });
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
          <p className="eyebrow">Partner Administration</p>
          <h2
            aria-label="Partners"
            className="has-hint"
            data-hint="Review partner organizations, programme coverage, webhook readiness, and group assignments."
            tabIndex={0}
          >
            Partners
          </h2>
        </div>
      </section>

      {!editingPartner && message ? (
        <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
      ) : null}

      {editingPartner && canManagePartners ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Edit ${editingPartner.name}`}>
          <button className="modal-backdrop" onClick={() => setEditingPartner(null)} type="button" aria-label="Close partner editor" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>Edit Partner</h3>
                <span>{editingPartner.name}</span>
              </div>
              <button className="icon-button" onClick={() => setEditingPartner(null)} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form" onSubmit={submitPartner}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Name</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required value={form.name} />
                </label>
                <label className="credential-field">
                  <span>Type</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} required value={form.type} />
                </label>
                <label className="credential-field">
                  <span>Status</span>
                  <select onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} value={form.status}>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="SUSPENDED">Suspended</option>
                  </select>
                </label>
                <label className="credential-field">
                  <span>API scope</span>
                  <select onChange={(event) => setForm((current) => ({ ...current, apiScope: event.target.value }))} value={form.apiScope}>
                    <option value="PROGRAMME">Programme</option>
                    <option value="PARTNER">Partner</option>
                    <option value="GLOBAL">Global</option>
                  </select>
                </label>
                <label className="credential-field">
                  <span>County</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, county: event.target.value }))} value={form.county} />
                </label>
                <label className="credential-field">
                  <span>Contact name</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} value={form.contactName} />
                </label>
                <label className="credential-field">
                  <span>Contact phone</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} value={form.contactPhone} />
                </label>
                <label className="credential-field">
                  <span>Linkage type</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, linkageType: event.target.value }))} value={form.linkageType} />
                </label>
                <label className="credential-field">
                  <span>Capacity</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))} value={form.capacity} />
                </label>
                <label className="credential-field">
                  <span>Value proposition</span>
                  <input onChange={(event) => setForm((current) => ({ ...current, valueProposition: event.target.value }))} value={form.valueProposition} />
                </label>
              </div>
              {message ? <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div> : null}
              <div className="credential-actions">
                <button className="button" disabled={saving} type="submit">
                  <Pencil size={16} />
                  {saving ? "Saving" : "Save partner"}
                </button>
                <button className="button secondary" onClick={() => setEditingPartner(null)} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="stat-grid">
        <StatCard icon={<Building2 size={20} />} label="Partners" note="Active organizations" value={partners.length.toString()} />
        <StatCard icon={<Network size={20} />} label="Programmes" note="Partner programme scopes" value={programmes.length.toString()} />
        <StatCard icon={<UsersRound size={20} />} label="Groups covered" note="Assigned to programmes" value={programmeGroups.toString()} />
        <StatCard icon={<Link2 size={20} />} label="Webhooks" note="Partner subscriptions" value={webhookCount.toString()} />
      </section>

      <section className="two-column">
        <div className="data-card">
          <header>
            <h3>Partners</h3>
            <span className="pill">{partners.length}</span>
          </header>
          <CollectionView
            count={partners.length}
            label="partners"
            cards={
              <div className="card-grid">
                {partners.map((partner) => (
                  <article className="record-card" key={partner.id}>
                    <header>
                      <div>
                        <h4>{partner.name}</h4>
                        <small>{humanizeEnum(partner.type)} - {humanizeEnum(partner.apiScope)} scope</small>
                      </div>
                      <span className="pill">{humanizeEnum(partner.status)}</span>
                    </header>
                    <div className="record-card-meta">
                      <div>
                        <span>County</span>
                        <strong>{partner.county ?? "Unassigned"}</strong>
                      </div>
                      <div>
                        <span>Contact</span>
                        <strong>{partner.contactName ?? partner.contactPhone ?? "Not captured"}</strong>
                      </div>
                      <div>
                        <span>Programmes</span>
                        <strong>{partner._count.programmes}</strong>
                      </div>
                      <div>
                        <span>Webhooks</span>
                        <strong>{partner._count.webhookSubscriptions}</strong>
                      </div>
                    </div>
                    <small>{partner.linkageType ?? partner.valueProposition ?? "No linkage captured"}</small>
                    {canManagePartners ? (
                      <div className="record-card-actions">
                        <button className="button secondary" onClick={() => openEditPartner(partner)} type="button">
                          <Pencil size={16} />
                          Edit
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
                {partners.length === 0 ? <div className="empty-state">No partners</div> : null}
              </div>
            }
            list={
              <DataTable
                columns={[
              {
                key: "partner",
                header: "Partner",
                value: (partner) => `${partner.name} ${partner.type} ${partner.apiScope}`,
                exportValue: (partner) => partner.name,
                cell: (partner) => (
                  <>
                    <strong>{partner.name}</strong>
                    <br />
                    <span>{humanizeEnum(partner.type)} - {humanizeEnum(partner.apiScope)} scope</span>
                  </>
                )
              },
              {
                key: "status",
                header: "Status",
                value: (partner) => humanizeEnum(partner.status),
                cell: (partner) => <span className="pill">{humanizeEnum(partner.status)}</span>
              },
              {
                key: "county",
                header: "County",
                value: (partner) => partner.county ?? "Unassigned"
              },
              {
                key: "linkage",
                header: "Linkage",
                value: (partner) => partner.linkageType ?? partner.valueProposition ?? "Not captured"
              },
              {
                key: "contact",
                header: "Contact",
                value: (partner) =>
                  [partner.contactName, partner.contactPhone].filter(Boolean).join(" - ") ||
                  "Not captured"
              },
              {
                key: "programmes",
                header: "Programmes",
                value: (partner) => partner._count.programmes
              },
              {
                key: "webhooks",
                header: "Webhooks",
                value: (partner) => partner._count.webhookSubscriptions
              },
              {
                key: "action",
                header: "",
                value: () => "",
                searchable: false,
                sortable: false,
                exportable: false,
                cell: (partner) =>
                  canManagePartners ? (
                    <button className="button secondary table-action-button" onClick={() => openEditPartner(partner)} type="button">
                      <Pencil size={16} />
                      Edit
                    </button>
                  ) : null
              }
            ]}
            exportName="intelli-cash-partners"
            filters={[
              {
                key: "type",
                label: "Type",
                allLabel: "All types",
                getValue: (partner) => partner.type,
                options: Array.from(new Set(partners.map((partner) => partner.type))).map((value) => ({
                  label: humanizeEnum(value),
                  value
                }))
              },
              {
                key: "status",
                label: "Status",
                allLabel: "All statuses",
                getValue: (partner) => partner.status,
                options: Array.from(new Set(partners.map((partner) => partner.status))).map((value) => ({
                  label: humanizeEnum(value),
                  value
                }))
              },
              {
                key: "source",
                label: "Source",
                allLabel: "All sources",
                getValue: (partner) => partner.sourceSystem ?? "Native"
              }
            ]}
            getRowKey={(partner) => partner.id}
            initialPageSize={5}
            rows={partners}
            title="Partners"
              />
            }
          />
        </div>

        <div className="data-card">
          <header>
            <h3>Programmes</h3>
            <span className="pill">{programmes.length}</span>
          </header>
          <CollectionView
            count={programmes.length}
            label="programmes"
            cards={
              <div className="card-grid compact">
                {programmes.map((programme) => (
                  <article className="record-card" key={programme.id}>
                    <header>
                      <div>
                        <h4>{programme.name}</h4>
                        <small>{programme.partner.name} - {programme.county ?? programme.country}</small>
                      </div>
                      <span className="pill blue">{programme._count.groups} groups</span>
                    </header>
                    <div className="record-card-meta">
                      <div>
                        <span>Groups</span>
                        <strong>{programme._count.groups}</strong>
                      </div>
                      <div>
                        <span>VAs</span>
                        <strong>{programme._count.villageAgents}</strong>
                      </div>
                    </div>
                  </article>
                ))}
                {programmes.length === 0 ? <div className="empty-state">No programmes</div> : null}
              </div>
            }
            list={
              <DataTable
                columns={[
              {
                key: "programme",
                header: "Programme",
                value: (programme) =>
                  `${programme.name} ${programme.partner.name} ${programme.county ?? programme.country}`,
                exportValue: (programme) => programme.name,
                cell: (programme) => (
                  <>
                    <strong>{programme.name}</strong>
                    <br />
                    <span>{programme.partner.name} - {programme.county ?? programme.country}</span>
                  </>
                )
              },
              {
                key: "groups",
                header: "Groups",
                value: (programme) => programme._count.groups,
                cell: (programme) => <span className="pill blue">{programme._count.groups}</span>
              },
              {
                key: "agents",
                header: "VAs",
                value: (programme) => programme._count.villageAgents
              }
            ]}
            exportName="intelli-cash-programmes"
            filters={[
              {
                key: "partner",
                label: "Partner",
                allLabel: "All partners",
                getValue: (programme) => programme.partner.name
              },
              {
                key: "county",
                label: "County",
                allLabel: "All locations",
                getValue: (programme) => programme.county ?? programme.country
              }
            ]}
            getRowKey={(programme) => programme.id}
            initialPageSize={5}
            rows={programmes}
            title="Programmes"
              />
            }
          />
        </div>
      </section>
    </>
  );
}
