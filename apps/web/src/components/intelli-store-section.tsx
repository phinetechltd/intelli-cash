"use client";

import React from "react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  CalendarCheck,
  HandCoins,
  ShoppingBag,
  UsersRound,
  X
} from "@/lib/theme-icons";
import { apiFetch, formatKes, humanizeEnum } from "../lib/api";
import { FallbackImage } from "./fallback-image";
import type { AgentRow, IntelliStorePayload, StoreProduct } from "./dashboard/types";

const defaultCreditForm = {
  programmeId: "",
  customerName: "",
  customerEmail: "",
  phoneNumber: "",
  county: "",
  groupName: "",
  quantity: "1",
  notes: ""
};

const defaultBookingForm = {
  villageAgentId: "",
  programmeId: "",
  serviceType: "",
  preferredDate: "",
  customerName: "",
  customerEmail: "",
  phoneNumber: "",
  county: "",
  groupName: "",
  notes: ""
};

function publicStoreCopy(value?: string | null) {
  if (!value) return "Savings records and grant eligibility are reviewed before fulfilment.";

  return value
    .replace(/programme-backed credit/gi, "credit access from savings records")
    .replace(/program-backed credit/gi, "credit access from savings records")
    .replace(/programme-backed/gi, "grant-linked")
    .replace(/program-backed/gi, "grant-linked")
    .replace(/programme credit review/gi, "savings record and grant review")
    .replace(/program credit review/gi, "savings record and grant review")
    .replace(/programme review/gi, "savings record review")
    .replace(/program review/gi, "savings record review");
}

export function IntelliStoreSection() {
  const [store, setStore] = useState<IntelliStorePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentRow | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [creditForm, setCreditForm] = useState(defaultCreditForm);
  const [bookingForm, setBookingForm] = useState(defaultBookingForm);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadStore() {
      try {
        const response = await apiFetch<IntelliStorePayload>("/public/intelli-store");
        if (!mounted) return;
        setStore(response);
        setBookingForm((current) => ({
          ...current,
          serviceType: current.serviceType || response.serviceTypes[0] || "Group onboarding",
          programmeId: current.programmeId || response.agents[0]?.programme?.id || ""
        }));
      } catch (storeError) {
        if (mounted) setError(storeError instanceof Error ? storeError.message : "Intelli-Store failed to load");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadStore();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", Boolean(selectedProduct) || isBookingOpen);
    return () => document.body.classList.remove("modal-open");
  }, [selectedProduct, isBookingOpen]);

  const featuredProduct = store?.products[0] ?? null;
  const storeSignals = useMemo(
    () => [
      { label: `${store?.products.length ?? 0} products`, icon: ShoppingBag },
      { label: `${store?.agents.length ?? 0} bookable VAs / CBTs`, icon: UsersRound },
      { label: "Credit from savings records and grants", icon: HandCoins }
    ],
    [store]
  );

  function openCreditRequest(product: StoreProduct) {
    setSelectedProduct(product);
    setCreditForm({
      ...defaultCreditForm,
      programmeId: product.programmeLinks[0]?.programme.id ?? ""
    });
    setMessage(null);
  }

  function openBooking(agent?: AgentRow) {
    setSelectedAgent(agent ?? null);
    setIsBookingOpen(true);
    setBookingForm({
      ...defaultBookingForm,
      villageAgentId: agent?.id ?? "",
      programmeId: agent?.programme?.id ?? store?.agents[0]?.programme?.id ?? "",
      serviceType: store?.serviceTypes[0] ?? "Group onboarding"
    });
    setMessage(null);
  }

  async function submitCreditRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct) return;

    setSaving(true);
    setMessage(null);

    try {
      await apiFetch("/public/intelli-store/credit-requests", {
        method: "POST",
        body: JSON.stringify({
          productId: selectedProduct.id,
          programmeId: creditForm.programmeId,
          customerName: creditForm.customerName,
          customerEmail: creditForm.customerEmail,
          phoneNumber: creditForm.phoneNumber,
          county: creditForm.county || undefined,
          groupName: creditForm.groupName || undefined,
          quantity: Number(creditForm.quantity),
          notes: creditForm.notes || undefined
        })
      });
      setMessage({ ok: true, text: "Credit request submitted for review." });
      setCreditForm(defaultCreditForm);
      setSelectedProduct(null);
    } catch (creditError) {
      setMessage({
        ok: false,
        text: creditError instanceof Error ? creditError.message : "Credit request failed"
      });
    } finally {
      setSaving(false);
    }
  }

  async function submitBookingRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setMessage(null);

    try {
      await apiFetch("/public/intelli-store/booking-requests", {
        method: "POST",
        body: JSON.stringify({
          villageAgentId: bookingForm.villageAgentId || undefined,
          programmeId: bookingForm.programmeId || undefined,
          serviceType: bookingForm.serviceType,
          preferredDate: bookingForm.preferredDate
            ? new Date(bookingForm.preferredDate).toISOString()
            : undefined,
          customerName: bookingForm.customerName,
          customerEmail: bookingForm.customerEmail,
          phoneNumber: bookingForm.phoneNumber,
          county: bookingForm.county || undefined,
          groupName: bookingForm.groupName || undefined,
          notes: bookingForm.notes || undefined
        })
      });
      setMessage({ ok: true, text: "Booking request submitted for follow-up." });
      setBookingForm(defaultBookingForm);
      setSelectedAgent(null);
      setIsBookingOpen(false);
    } catch (bookingError) {
      setMessage({
        ok: false,
        text: bookingError instanceof Error ? bookingError.message : "Booking request failed"
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="landing-section intelli-store-section" id="intelli-store">
      <div className="landing-section-header wide">
        <p className="eyebrow">Intelli-Store</p>
        <h2>Buy productive assets with credit access and book field support</h2>
        <p>
          Groups can request assets like egg incubators using savings records
          and green enterprise related grants while booking VAs and CBTs for
          onboarding, coaching, and market-linkage visits.
        </p>
        <Link className="button secondary" href="/intelli-store">
          <ShoppingBag size={16} />
          Open Intelli-Store
        </Link>
      </div>

      {loading ? <div className="loading-panel">Loading Intelli-Store...</div> : null}
      {error ? <div className="notice warning">{error}</div> : null}
      {!selectedProduct && !isBookingOpen && message ? (
        <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
      ) : null}

      <div className="store-signal-row" aria-label="Intelli-Store signals">
        {storeSignals.map((signal) => {
          const Icon = signal.icon;
          return (
            <div className="store-signal" key={signal.label}>
              <Icon size={19} />
              <span>{signal.label}</span>
            </div>
          );
        })}
      </div>

      <div className="store-layout">
        <div className="store-product-grid">
          {(store?.products ?? []).map((product) => {
            const firstLink = product.programmeLinks[0];
            return (
              <article className="store-product-card" key={product.id}>
                <FallbackImage alt={product.name} className="store-product-image" src={product.imageUrl} />
                <div className="store-product-copy">
                  <span className="pill blue">{humanizeEnum(product.category)}</span>
                  <h3>{product.name}</h3>
                  <p>{publicStoreCopy(product.description)}</p>
                </div>
                <div className="store-price-row">
                  <strong>{formatKes(product.priceCents)}</strong>
                  <span>{product.depositCents > 0 ? `${formatKes(product.depositCents)} deposit request` : "Credit request"}</span>
                </div>
                <div className="store-credit-note">
                  <BadgeCheck size={18} />
                  <span>{publicStoreCopy(firstLink?.creditTerms ?? product.creditSummary)}</span>
                </div>
                <div className="store-actions">
                  <button className="button" onClick={() => openCreditRequest(product)} type="button">
                    <HandCoins size={16} />
                    Request on credit
                  </button>
                  <button className="button secondary" onClick={() => openBooking()} type="button">
                    <CalendarCheck size={16} />
                    Book support
                  </button>
                </div>
              </article>
            );
          })}
          {!loading && (store?.products.length ?? 0) === 0 ? (
            <div className="empty-state">No Intelli-Store products are live yet.</div>
          ) : null}
        </div>

        <aside className="store-agent-panel">
          <header>
            <p className="eyebrow">Book VA / CBT</p>
            <h3>{featuredProduct ? `${featuredProduct.name} support` : "Field support"}</h3>
          </header>
          <div className="store-agent-list">
            {(store?.agents ?? []).slice(0, 4).map((agent) => (
              <button className="store-agent-row" key={agent.id} onClick={() => openBooking(agent)} type="button">
                <span>
                  <strong>{agent.name}</strong>
                  <em>{agent.county ?? agent.programme?.county ?? "Programme field team"}</em>
                </span>
                <span className="pill">{agent._count.groups} groups</span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      {selectedProduct ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Product credit request">
          <button className="modal-backdrop" onClick={() => setSelectedProduct(null)} type="button" aria-label="Close credit request" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>Request On Credit</h3>
                <span>{selectedProduct.name}</span>
              </div>
              <button className="icon-button" onClick={() => setSelectedProduct(null)} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form" onSubmit={submitCreditRequest}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Program</span>
                  <select
                    onChange={(event) => setCreditForm((current) => ({ ...current, programmeId: event.target.value }))}
                    required
                    value={creditForm.programmeId}
                  >
                    {selectedProduct.programmeLinks.map((link) => (
                      <option key={link.programme.id} value={link.programme.id}>
                        {link.programme.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Quantity</span>
                  <input
                    min="1"
                    onChange={(event) => setCreditForm((current) => ({ ...current, quantity: event.target.value }))}
                    required
                    type="number"
                    value={creditForm.quantity}
                  />
                </label>
                <label className="credential-field">
                  <span>Name</span>
                  <input
                    onChange={(event) => setCreditForm((current) => ({ ...current, customerName: event.target.value }))}
                    required
                    value={creditForm.customerName}
                  />
                </label>
                <label className="credential-field">
                  <span>Email</span>
                  <input
                    onChange={(event) => setCreditForm((current) => ({ ...current, customerEmail: event.target.value }))}
                    required
                    type="email"
                    value={creditForm.customerEmail}
                  />
                </label>
                <label className="credential-field">
                  <span>Phone</span>
                  <input
                    onChange={(event) => setCreditForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                    required
                    value={creditForm.phoneNumber}
                  />
                </label>
                <label className="credential-field">
                  <span>County</span>
                  <input
                    onChange={(event) => setCreditForm((current) => ({ ...current, county: event.target.value }))}
                    value={creditForm.county}
                  />
                </label>
                <label className="credential-field wide-field">
                  <span>Group or business name</span>
                  <input
                    onChange={(event) => setCreditForm((current) => ({ ...current, groupName: event.target.value }))}
                    value={creditForm.groupName}
                  />
                </label>
                <label className="credential-field wide-field">
                  <span>Notes</span>
                  <textarea
                    onChange={(event) => setCreditForm((current) => ({ ...current, notes: event.target.value }))}
                    value={creditForm.notes}
                  />
                </label>
              </div>
              {message ? (
                <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
              ) : null}
              <div className="credential-actions">
                <button className="button" disabled={saving} type="submit">
                  {saving ? "Submitting" : "Submit request"}
                </button>
                <button className="button secondary" onClick={() => setSelectedProduct(null)} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isBookingOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="VA / CBT booking request">
          <button className="modal-backdrop" onClick={() => setIsBookingOpen(false)} type="button" aria-label="Close booking request" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>Book VA / CBT</h3>
                <span>{selectedAgent?.name ?? "Programme field support"}</span>
              </div>
              <button className="icon-button" onClick={() => setIsBookingOpen(false)} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form" onSubmit={submitBookingRequest}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Service</span>
                  <select
                    onChange={(event) => setBookingForm((current) => ({ ...current, serviceType: event.target.value }))}
                    required
                    value={bookingForm.serviceType}
                  >
                    {(store?.serviceTypes ?? ["Group onboarding"]).map((service) => (
                      <option key={service} value={service}>
                        {service}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Preferred date</span>
                  <input
                    onChange={(event) => setBookingForm((current) => ({ ...current, preferredDate: event.target.value }))}
                    type="datetime-local"
                    value={bookingForm.preferredDate}
                  />
                </label>
                <label className="credential-field">
                  <span>Name</span>
                  <input
                    onChange={(event) => setBookingForm((current) => ({ ...current, customerName: event.target.value }))}
                    required
                    value={bookingForm.customerName}
                  />
                </label>
                <label className="credential-field">
                  <span>Email</span>
                  <input
                    onChange={(event) => setBookingForm((current) => ({ ...current, customerEmail: event.target.value }))}
                    required
                    type="email"
                    value={bookingForm.customerEmail}
                  />
                </label>
                <label className="credential-field">
                  <span>Phone</span>
                  <input
                    onChange={(event) => setBookingForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                    required
                    value={bookingForm.phoneNumber}
                  />
                </label>
                <label className="credential-field">
                  <span>County</span>
                  <input
                    onChange={(event) => setBookingForm((current) => ({ ...current, county: event.target.value }))}
                    value={bookingForm.county}
                  />
                </label>
                <label className="credential-field wide-field">
                  <span>Group or business name</span>
                  <input
                    onChange={(event) => setBookingForm((current) => ({ ...current, groupName: event.target.value }))}
                    value={bookingForm.groupName}
                  />
                </label>
                <label className="credential-field wide-field">
                  <span>Notes</span>
                  <textarea
                    onChange={(event) => setBookingForm((current) => ({ ...current, notes: event.target.value }))}
                    value={bookingForm.notes}
                  />
                </label>
              </div>
              {message ? (
                <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
              ) : null}
              <div className="credential-actions">
                <button className="button" disabled={saving} type="submit">
                  {saving ? "Submitting" : "Submit booking"}
                </button>
                <button className="button secondary" onClick={() => setIsBookingOpen(false)} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
