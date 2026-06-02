"use client";

import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  FileText,
  HandCoins,
  HeartHandshake,
  Landmark,
  UsersRound,
  X
} from "@/lib/theme-icons";
import { apiFetch, formatKes, humanizeEnum } from "../../../lib/api";
import { DEFAULT_IMAGE_PLACEHOLDER } from "../../../lib/placeholders";
import { FallbackImage } from "../../../components/fallback-image";
import { PublicSiteFooter } from "../../../components/public-site-footer";
import { PublicSiteHeader } from "../../../components/public-site-header";
import type { ProgrammeRow } from "../../../components/dashboard/types";

type ContributionType = "INVESTMENT" | "DONATION";

const playStoreUrl =
  "https://play.google.com/store/apps/details?id=com.intellicash.app";

const defaultContribution = {
  amountKes: "5000",
  provider: "MPESA_DARAJA",
  customerName: "",
  customerEmail: "",
  phoneNumber: ""
};

function fundingPercent(programme: ProgrammeRow) {
  const goal = programme.fundingGoalCents ?? 0;
  if (goal <= 0) return 0;
  return Math.min(100, Math.round(((programme.fundingRaisedCents ?? 0) / goal) * 100));
}

export default function PublicPartnerProjectPage() {
  const params = useParams<{ slug: string }>();
  const [programme, setProgramme] = useState<ProgrammeRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contributionType, setContributionType] = useState<ContributionType | null>(null);
  const [contribution, setContribution] = useState(defaultContribution);
  const [contributionMessage, setContributionMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingContribution, setSavingContribution] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadProject() {
      try {
        const response = await apiFetch<ProgrammeRow>(`/public/programmes/${encodeURIComponent(params.slug)}`);
        if (mounted) setProgramme(response);
      } catch (projectError) {
        if (mounted) {
          setError(projectError instanceof Error ? projectError.message : "Project failed to load");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProject();
    return () => {
      mounted = false;
    };
  }, [params.slug]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", Boolean(contributionType));
    return () => document.body.classList.remove("modal-open");
  }, [contributionType]);

  const galleryAssets = useMemo(
    () => programme?.assets?.filter((asset) => asset.type === "IMAGE") ?? [],
    [programme]
  );
  const fileAssets = useMemo(
    () => programme?.assets?.filter((asset) => asset.type === "FILE") ?? [],
    [programme]
  );

  async function submitContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!programme || !contributionType) return;

    setSavingContribution(true);
    setContributionMessage(null);

    try {
      const amountCents = Math.round(Number(contribution.amountKes) * 100);
      const transaction = await apiFetch<{ providerCheckoutUrl?: string | null }>(
        `/public/programmes/${programme.id}/contributions`,
        {
          method: "POST",
          body: JSON.stringify({
            type: contributionType,
            provider: contribution.provider,
            amountCents,
            customerName: contribution.customerName,
            customerEmail: contribution.customerEmail,
            phoneNumber: contribution.phoneNumber || undefined
          })
        }
      );

      if (transaction.providerCheckoutUrl) {
        window.location.href = transaction.providerCheckoutUrl;
        return;
      }

      setContributionMessage({
        ok: true,
        text:
          contribution.provider === "MPESA_DARAJA"
            ? "Payment request created. Complete the M-Pesa prompt to confirm."
            : "Payment request created."
      });
      setContribution(defaultContribution);
    } catch (contributionError) {
      setContributionMessage({
        ok: false,
        text: contributionError instanceof Error ? contributionError.message : "Contribution failed"
      });
    } finally {
      setSavingContribution(false);
    }
  }

  const progress = programme ? fundingPercent(programme) : 0;
  const partners =
    programme?.partnerLinks?.filter((link) => link.role !== "LENDER").map((link) => link.partner.name) ?? [];
  const lenders =
    programme?.partnerLinks?.filter((link) => link.role === "LENDER").map((link) => link.partner.name) ?? [];
  const heroImage = `linear-gradient(90deg, rgba(0, 11, 5, 0.86), rgba(0, 97, 40, 0.58)), url("${programme?.coverImageUrl || DEFAULT_IMAGE_PLACEHOLDER}")`;

  return (
    <main className="partner-public-page">
      <section className="project-detail-hero" style={{ backgroundImage: heroImage }}>
        <PublicSiteHeader ariaLabel="Project navigation" playStoreUrl={playStoreUrl} />
        <div className="project-detail-hero-content">
          <Link className="inline-back light" href="/partners#projects">
            <ArrowLeft size={16} />
            Back to projects
          </Link>
          {loading ? <div className="loading-panel">Loading project...</div> : null}
          {error ? <div className="error">{error}</div> : null}
          {programme ? (
            <>
              <p className="eyebrow">Project Detail</p>
              <h1>{programme.name}</h1>
              <p>{programme.fundingSummary ?? programme.description}</p>
              <div className="hero-actions">
                {programme.allowInvestments ? (
                  <button className="button" onClick={() => setContributionType("INVESTMENT")} type="button">
                    <HandCoins size={18} />
                    Invest
                  </button>
                ) : null}
                {programme.allowDonations ? (
                  <button className="button secondary light" onClick={() => setContributionType("DONATION")} type="button">
                    <HeartHandshake size={18} />
                    Donate
                  </button>
                ) : null}
                <a className="button secondary light" href="/partners#signup">
                  Request access
                </a>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {programme ? (
        <>
          <section className="landing-signal-band proof-strip project-detail-signals" aria-label="Project signals">
            <div className="landing-signal">
              <Building2 size={20} />
              <span>{programme.county ?? programme.country}</span>
            </div>
            <div className="landing-signal">
              <UsersRound size={20} />
              <span>{programme._count.groupLinks ?? programme._count.groups ?? 0} group links</span>
            </div>
            <div className="landing-signal">
              <Landmark size={20} />
              <span>{lenders.length > 0 ? `${lenders.length} lender link` : "Open to lenders"}</span>
            </div>
          </section>

          <section className="project-detail-gallery-band" aria-label="Project gallery preview">
            <div className="project-detail-gallery-preview">
              {galleryAssets.length > 0 ? (
                galleryAssets.slice(0, 4).map((asset) => (
                  <a href={asset.url} key={asset.id} rel="noopener noreferrer" target="_blank">
                    <FallbackImage alt={asset.title} src={asset.url} />
                    <span>{asset.title}</span>
                  </a>
                ))
              ) : (
                <div className="empty-state">No public gallery images yet.</div>
              )}
            </div>
            {fileAssets.length > 0 ? (
              <div className="project-detail-file-preview">
                {fileAssets.slice(0, 3).map((asset) => (
                  <a href={asset.url} key={asset.id} rel="noopener noreferrer" target="_blank">
                    <FileText size={16} />
                    {asset.title}
                  </a>
                ))}
              </div>
            ) : null}
          </section>

          <section className="landing-section project-detail-section">
            <div className="project-detail-layout">
              <div className="project-detail-copy">
                <p className="eyebrow">Overview</p>
                <h2>{programme.impactSummary ?? "Transparent savings-group project funding"}</h2>
                <p>
                  {programme.description ??
                    "This public project view shows confirmed funding, active partners, public project files, and implementation context for partners, lenders, and donors."}
                </p>
                <dl className="project-detail-facts">
                  <div>
                    <dt>Lead partner</dt>
                    <dd>{programme.partner.name}</dd>
                  </div>
                  <div>
                    <dt>Partners</dt>
                    <dd>{partners.join(", ") || programme.partner.name}</dd>
                  </div>
                  <div>
                    <dt>Lenders</dt>
                    <dd>{lenders.join(", ") || "Open"}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{humanizeEnum(programme.publicStatus ?? "ONGOING")}</dd>
                  </div>
                </dl>
              </div>

              <aside className="project-detail-funding">
                <span className="pill blue">{progress}% funded</span>
                <strong>{formatKes(programme.fundingRaisedCents ?? 0)}</strong>
                <span>of {formatKes(programme.fundingGoalCents ?? 0)} confirmed</span>
                <div className="funding-meter" aria-label={`${progress}% funded`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
                <div className="project-detail-actions">
                  {programme.allowInvestments ? (
                    <button className="button" onClick={() => setContributionType("INVESTMENT")} type="button">
                      <HandCoins size={16} />
                      Invest
                    </button>
                  ) : null}
                  {programme.allowDonations ? (
                    <button className="button secondary" onClick={() => setContributionType("DONATION")} type="button">
                      <HeartHandshake size={16} />
                      Donate
                    </button>
                  ) : null}
                </div>
              </aside>
            </div>
          </section>

          <section className="landing-section project-media-section">
            <div className="landing-section-header wide">
              <p className="eyebrow">Project Gallery And Files</p>
              <h2>Public material for partner and donor review</h2>
            </div>
            <div className="project-detail-media-grid">
              <div>
                <h3>Gallery</h3>
                <div className="project-detail-gallery">
                  {galleryAssets.map((asset) => (
                    <a href={asset.url} key={asset.id} rel="noopener noreferrer" target="_blank">
                      <FallbackImage alt={asset.title} src={asset.url} />
                      <span>{asset.title}</span>
                    </a>
                  ))}
                  {galleryAssets.length === 0 ? <div className="empty-state">No public gallery images yet.</div> : null}
                </div>
              </div>
              <div>
                <h3>Files</h3>
                <div className="project-detail-file-list">
                  {fileAssets.map((asset) => (
                    <a href={asset.url} key={asset.id} rel="noopener noreferrer" target="_blank">
                      <FileText size={18} />
                      <span>
                        <strong>{asset.title}</strong>
                        <em>{asset.description ?? asset.fileName ?? "Public project file"}</em>
                      </span>
                    </a>
                  ))}
                  {fileAssets.length === 0 ? <div className="empty-state">No public files yet.</div> : null}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {programme && contributionType ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Project contribution">
          <button className="modal-backdrop" onClick={() => setContributionType(null)} type="button" aria-label="Close contribution" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>{humanizeEnum(contributionType)} Project</h3>
                <span>{programme.name}</span>
              </div>
              <button className="icon-button" onClick={() => setContributionType(null)} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form" onSubmit={submitContribution}>
              <div className="credential-grid">
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
                <label className="credential-field">
                  <span>Name</span>
                  <input
                    onChange={(event) => setContribution((current) => ({ ...current, customerName: event.target.value }))}
                    required
                    value={contribution.customerName}
                  />
                </label>
                <label className="credential-field">
                  <span>Email</span>
                  <input
                    onChange={(event) => setContribution((current) => ({ ...current, customerEmail: event.target.value }))}
                    required
                    type="email"
                    value={contribution.customerEmail}
                  />
                </label>
                <label className="credential-field">
                  <span>M-Pesa phone</span>
                  <input
                    onChange={(event) => setContribution((current) => ({ ...current, phoneNumber: event.target.value }))}
                    required={contribution.provider === "MPESA_DARAJA"}
                    value={contribution.phoneNumber}
                  />
                </label>
              </div>
              {contributionMessage ? (
                <div className={contributionMessage.ok ? "notice success" : "notice warning"}>
                  {contributionMessage.text}
                </div>
              ) : null}
              <div className="credential-actions">
                <button className="button" disabled={savingContribution} type="submit">
                  {savingContribution ? "Submitting" : "Continue"}
                </button>
                <button className="button secondary" onClick={() => setContributionType(null)} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <PublicSiteFooter playStoreUrl={playStoreUrl} />
    </main>
  );
}
