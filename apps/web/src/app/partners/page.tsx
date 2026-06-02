"use client";

import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CircleDollarSign,
  HandCoins,
  HeartHandshake,
  Landmark,
  X
} from "@/lib/theme-icons";
import { apiFetch, formatKes, humanizeEnum } from "../../lib/api";
import { FallbackImage } from "../../components/fallback-image";
import { PublicSiteFooter } from "../../components/public-site-footer";
import { PublicSiteHeader } from "../../components/public-site-header";
import type { ProgrammeRow } from "../../components/dashboard/types";

type ContributionType = "INVESTMENT" | "DONATION";

interface ContributionState {
  programme: ProgrammeRow;
  type: ContributionType;
}

const defaultSignup = {
  organizationName: "",
  organizationType: "NGO",
  requestedRole: "PARTNER_OFFICER",
  requestedPartnerType: "NGO",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  county: "",
  valueProposition: ""
};

const defaultContribution = {
  amountKes: "5000",
  provider: "MPESA_DARAJA",
  customerName: "",
  customerEmail: "",
  phoneNumber: ""
};

const playStoreUrl =
  "https://play.google.com/store/apps/details?id=com.intellicash.app";

function fundingPercent(programme: ProgrammeRow) {
  const goal = programme.fundingGoalCents ?? 0;
  if (goal <= 0) return 0;
  return Math.min(100, Math.round(((programme.fundingRaisedCents ?? 0) / goal) * 100));
}

export default function PublicPartnersPage() {
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signup, setSignup] = useState(defaultSignup);
  const [signupMessage, setSignupMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [contributionTarget, setContributionTarget] = useState<ContributionState | null>(null);
  const [contribution, setContribution] = useState(defaultContribution);
  const [contributionMessage, setContributionMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingSignup, setSavingSignup] = useState(false);
  const [savingContribution, setSavingContribution] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadProjects() {
      try {
        const response = await apiFetch<ProgrammeRow[]>("/public/programmes");
        if (mounted) setProgrammes(response);
      } catch (projectError) {
        if (mounted) setError(projectError instanceof Error ? projectError.message : "Projects failed to load");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProjects();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", Boolean(contributionTarget));
    return () => document.body.classList.remove("modal-open");
  }, [contributionTarget]);

  const totals = useMemo(
    () =>
      programmes.reduce(
        (summary, programme) => ({
          projects: summary.projects + 1,
          raised: summary.raised + (programme.fundingRaisedCents ?? 0),
          groups:
            summary.groups +
            (programme._count.groupLinks ?? programme._count.groups ?? programme.groupLinks?.length ?? 0)
        }),
        { projects: 0, raised: 0, groups: 0 }
      ),
    [programmes]
  );

  const partnerProgrammeGroups = useMemo(() => {
    const grouped = new Map<string, { partner: ProgrammeRow["partner"]; programmes: ProgrammeRow[] }>();

    programmes.forEach((programme) => {
      const partner = programme.partner;
      const key = partner.id;
      const current = grouped.get(key);

      if (current) {
        current.programmes.push(programme);
        return;
      }

      grouped.set(key, { partner, programmes: [programme] });
    });

    return Array.from(grouped.values());
  }, [programmes]);

  async function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSignup(true);
    setSignupMessage(null);

    try {
      await apiFetch("/partner-signup-requests", {
        method: "POST",
        body: JSON.stringify({
          ...signup,
          requestedPartnerType: signup.requestedRole === "LENDER" ? "LENDER" : signup.requestedPartnerType,
          contactPhone: signup.contactPhone || undefined,
          county: signup.county || undefined,
          valueProposition: signup.valueProposition || undefined
        })
      });
      setSignup(defaultSignup);
      setSignupMessage({
        ok: true,
        text: "Request submitted. An IWL admin will review the account before login access is created."
      });
    } catch (signupError) {
      setSignupMessage({
        ok: false,
        text: signupError instanceof Error ? signupError.message : "Signup request failed"
      });
    } finally {
      setSavingSignup(false);
    }
  }

  async function submitContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contributionTarget) return;

    setSavingContribution(true);
    setContributionMessage(null);

    try {
      const amountCents = Math.round(Number(contribution.amountKes) * 100);
      const transaction = await apiFetch<{ providerCheckoutUrl?: string | null }>(
        `/public/programmes/${contributionTarget.programme.id}/contributions`,
        {
          method: "POST",
          body: JSON.stringify({
            type: contributionTarget.type,
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

  return (
    <main className="partner-public-page">
      <section className="partner-hero">
        <PublicSiteHeader ariaLabel="Partner navigation" playStoreUrl={playStoreUrl} />

        <div className="partner-hero-content">
          <p className="eyebrow">Partners, Lenders, and Donors</p>
          <h1>Fund transparent savings-group projects</h1>
          <p>
            Review live Intelli Cash programmes, support ongoing field work, and
            request a scoped partner or lender account for dashboard access.
          </p>
          <div className="hero-actions">
            <a className="button" href="#projects">
              View projects
              <ArrowRight size={18} />
            </a>
            <a className="button secondary light" href="#signup">
              Request account
            </a>
          </div>
        </div>
      </section>

      <section className="landing-signal-band proof-strip" aria-label="Partner project signals">
        <div className="landing-signal">
          <Building2 size={20} />
          <span>{totals.projects} ongoing projects</span>
        </div>
        <div className="landing-signal">
          <CircleDollarSign size={20} />
          <span>{formatKes(totals.raised)} confirmed</span>
        </div>
        <div className="landing-signal">
          <HeartHandshake size={20} />
          <span>{totals.groups} group links</span>
        </div>
      </section>

      <section className="landing-section partner-project-section" id="projects">
        <div className="landing-section-header wide">
          <p className="eyebrow">Ongoing Projects</p>
          <h2>Programmes accepting investments and donations</h2>
          <p>
            Each project is tied to real programme, partner, lender, and group
            data from the Intelli Cash operating platform.
          </p>
        </div>

        {loading ? <div className="loading-panel">Loading partner projects...</div> : null}
        {error ? <div className="error">{error}</div> : null}

        <div className="partner-programme-stack">
          {partnerProgrammeGroups.map(({ partner, programmes: groupProgrammes }) => {
            const groupLinks = groupProgrammes.reduce(
              (count, programme) => count + (programme._count.groupLinks ?? programme._count.groups ?? 0),
              0
            );
            const counties = Array.from(
              new Set(groupProgrammes.map((programme) => programme.county ?? programme.country).filter(Boolean))
            );

            return (
              <article className="partner-programme-card" key={partner.id}>
                <header className="partner-programme-header">
                  <div>
                    <span className="pill blue">{humanizeEnum(partner.type)}</span>
                    <h3>{partner.name}</h3>
                    <p>
                      {partner.valueProposition ??
                        "Programs linked to this partner are grouped together for easier review and support."}
                    </p>
                  </div>
                  <div className="partner-programme-meta" aria-label={`${partner.name} program summary`}>
                    <span>{groupProgrammes.length} programs</span>
                    <span>{groupLinks} group links</span>
                    {counties.length > 0 ? <span>{counties.slice(0, 2).join(", ")}</span> : null}
                  </div>
                </header>

                <div className="project-grid partner-programme-grid">
                  {groupProgrammes.map((programme) => {
                    const progress = fundingPercent(programme);
                    const lenders =
                      programme.partnerLinks?.filter((link) => link.role === "LENDER").map((link) => link.partner.name) ?? [];
                    const partners =
                      programme.partnerLinks?.filter((link) => link.role !== "LENDER").map((link) => link.partner.name) ?? [];

                    return (
                      <article className="project-card" key={programme.id}>
                        <FallbackImage className="project-cover-image" alt={`${programme.name} program`} src={programme.coverImageUrl} />
                        <header>
                          <div>
                            <span className="pill blue">{programme.county ?? programme.country}</span>
                            <h3>{programme.name}</h3>
                          </div>
                          <Landmark size={22} />
                        </header>
                        <p>{programme.fundingSummary ?? programme.description}</p>
                        <div className="project-impact">
                          <BadgeCheck size={18} />
                          <span>{programme.impactSummary ?? "Transparent project funding linked to active VSLA operations."}</span>
                        </div>
                        <div className="funding-meter" aria-label={`${progress}% funded`}>
                          <span style={{ width: `${progress}%` }} />
                        </div>
                        <div className="project-money-row">
                          <strong>{formatKes(programme.fundingRaisedCents ?? 0)}</strong>
                          <span>of {formatKes(programme.fundingGoalCents ?? 0)}</span>
                        </div>
                        <dl className="project-facts">
                          <div>
                            <dt>Partners</dt>
                            <dd>{partners.slice(0, 2).join(", ") || programme.partner.name}</dd>
                          </div>
                          <div>
                            <dt>Lenders</dt>
                            <dd>{lenders.length > 0 ? lenders.join(", ") : "Open"}</dd>
                          </div>
                          <div>
                            <dt>Groups</dt>
                            <dd>{programme._count.groupLinks ?? programme._count.groups ?? 0}</dd>
                          </div>
                        </dl>
                        <div className="project-actions">
                          {programme.publicSlug ? (
                            <Link className="button secondary" href={`/partners/${programme.publicSlug}`}>
                              View details
                              <ArrowRight size={16} />
                            </Link>
                          ) : null}
                          {programme.allowInvestments ? (
                            <button
                              className="button"
                              onClick={() => setContributionTarget({ programme, type: "INVESTMENT" })}
                              type="button"
                            >
                              <HandCoins size={16} />
                              Invest
                            </button>
                          ) : null}
                          {programme.allowDonations ? (
                            <button
                              className="button secondary"
                              onClick={() => setContributionTarget({ programme, type: "DONATION" })}
                              type="button"
                            >
                              <HeartHandshake size={16} />
                              Donate
                            </button>
                          ) : null}
                        </div>
                        {programme.assets?.length ? (
                          <div className="project-asset-strip">
                            {programme.assets.filter((asset) => asset.type === "IMAGE").slice(0, 3).map((asset) => (
                              <a href={asset.url} key={asset.id} rel="noopener noreferrer" target="_blank">
                                <FallbackImage alt={asset.title} src={asset.url} />
                              </a>
                            ))}
                            {programme.assets.filter((asset) => asset.type === "FILE").slice(0, 2).map((asset) => (
                              <a className="project-file-link" href={asset.url} key={asset.id} rel="noopener noreferrer" target="_blank">
                                {asset.title}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </article>
            );
          })}
          {!loading && partnerProgrammeGroups.length === 0 ? (
            <div className="empty-state">No partner programs are live yet.</div>
          ) : null}
        </div>
      </section>

      <section className="landing-section partner-signup-band" id="signup">
        <div className="landing-section-header">
          <p className="eyebrow">Account Access</p>
          <h2>Request a partner or lender dashboard account</h2>
        </div>
        <form className="partner-signup-form" onSubmit={submitSignup}>
          <label>
            <span>Organization</span>
            <input
              onChange={(event) => setSignup((current) => ({ ...current, organizationName: event.target.value }))}
              required
              value={signup.organizationName}
            />
          </label>
          <label>
            <span>Account type</span>
            <select
              onChange={(event) =>
                setSignup((current) => ({
                  ...current,
                  requestedRole: event.target.value,
                  requestedPartnerType: event.target.value === "LENDER" ? "LENDER" : current.requestedPartnerType
                }))
              }
              value={signup.requestedRole}
            >
              <option value="PARTNER_OFFICER">Partner</option>
              <option value="LENDER">Lender</option>
            </select>
          </label>
          {signup.requestedRole === "PARTNER_OFFICER" ? (
            <label>
              <span>Organization type</span>
              <input
                onChange={(event) => setSignup((current) => ({ ...current, requestedPartnerType: event.target.value }))}
                required
                value={signup.requestedPartnerType}
              />
            </label>
          ) : null}
          <label>
            <span>Contact name</span>
            <input
              onChange={(event) => setSignup((current) => ({ ...current, contactName: event.target.value }))}
              required
              value={signup.contactName}
            />
          </label>
          <label>
            <span>Email</span>
            <input
              onChange={(event) => setSignup((current) => ({ ...current, contactEmail: event.target.value }))}
              required
              type="email"
              value={signup.contactEmail}
            />
          </label>
          <label>
            <span>Phone</span>
            <input
              onChange={(event) => setSignup((current) => ({ ...current, contactPhone: event.target.value }))}
              value={signup.contactPhone}
            />
          </label>
          <label>
            <span>County</span>
            <input
              onChange={(event) => setSignup((current) => ({ ...current, county: event.target.value }))}
              value={signup.county}
            />
          </label>
          <label className="wide-field">
            <span>Value proposition</span>
            <textarea
              onChange={(event) => setSignup((current) => ({ ...current, valueProposition: event.target.value }))}
              value={signup.valueProposition}
            />
          </label>
          {signupMessage ? (
            <div className={signupMessage.ok ? "notice success wide-field" : "notice warning wide-field"}>
              {signupMessage.text}
            </div>
          ) : null}
          <button className="button wide-field" disabled={savingSignup} type="submit">
            {savingSignup ? "Submitting" : "Submit request"}
          </button>
        </form>
      </section>

      {contributionTarget ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Project contribution">
          <button className="modal-backdrop" onClick={() => setContributionTarget(null)} type="button" aria-label="Close contribution" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>{humanizeEnum(contributionTarget.type)} Project</h3>
                <span>{contributionTarget.programme.name}</span>
              </div>
              <button className="icon-button" onClick={() => setContributionTarget(null)} type="button" aria-label="Close">
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
                <button className="button secondary" onClick={() => setContributionTarget(null)} type="button">
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
