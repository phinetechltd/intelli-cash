"use client";

import React from "react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  HandCoins,
  Minus,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  ShoppingCart,
  Trash2,
  Truck,
  X
} from "@/lib/theme-icons";
import { PublicSiteFooter } from "../../components/public-site-footer";
import { PublicSiteHeader } from "../../components/public-site-header";
import { FallbackImage } from "../../components/fallback-image";
import { apiFetch, formatKes, humanizeEnum } from "../../lib/api";
import type { AgentRow, IntelliStorePayload, StoreProduct } from "../../components/dashboard/types";

const playStoreUrl = "https://play.google.com/store/apps/details?id=com.intellicash.app";

const defaultCheckoutForm = {
  customerName: "",
  customerEmail: "",
  phoneNumber: "",
  county: "",
  groupName: "",
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

type CartItem = {
  product: StoreProduct;
  programmeId: string;
  quantity: number;
};

function itemKey(item: CartItem) {
  return `${item.product.id}:${item.programmeId}`;
}

function quantityLimit(product: StoreProduct) {
  return Math.min(100, product.inventoryCount ?? 100);
}

function stockLabel(product: StoreProduct) {
  if (product.inventoryCount === null || product.inventoryCount === undefined) return "Open stock";
  if (product.inventoryCount === 0) return "Out of stock";
  return `${product.inventoryCount} in stock`;
}

export default function IntelliStorePage() {
  const [store, setStore] = useState<IntelliStorePayload | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutForm, setCheckoutForm] = useState(defaultCheckoutForm);
  const [bookingForm, setBookingForm] = useState(defaultBookingForm);
  const [bookingAgent, setBookingAgent] = useState<AgentRow | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    document.body.classList.toggle("modal-open", isBookingOpen);
    return () => document.body.classList.remove("modal-open");
  }, [isBookingOpen]);

  const totals = useMemo(
    () =>
      cart.reduce(
        (summary, item) => ({
          quantity: summary.quantity + item.quantity,
          amountCents: summary.amountCents + item.product.priceCents * item.quantity,
          depositCents: summary.depositCents + item.product.depositCents * item.quantity
        }),
        { quantity: 0, amountCents: 0, depositCents: 0 }
      ),
    [cart]
  );
  const categories = useMemo(
    () =>
      Array.from(new Set((store?.products ?? []).map((product) => product.category)))
        .sort((left, right) => left.localeCompare(right)),
    [store]
  );
  const filteredProducts = useMemo(() => {
    const query = catalogQuery.trim().toLowerCase();

    return (store?.products ?? []).filter((product) => {
      const matchesCategory = selectedCategory === "ALL" || product.category === selectedCategory;
      const matchesQuery =
        query === "" ||
        [product.name, product.description, product.sellerName, product.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);

      return matchesCategory && matchesQuery;
    });
  }, [catalogQuery, selectedCategory, store]);

  function addToCart(product: StoreProduct) {
    const programmeId = product.programmeLinks[0]?.programme.id;
    const limit = quantityLimit(product);
    if (!programmeId || limit <= 0) return;

    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id && item.programmeId === programmeId);
      if (existing) {
        return current.map((item) =>
          itemKey(item) === itemKey(existing)
            ? { ...item, quantity: Math.min(limit, item.quantity + 1) }
            : item
        );
      }

      return [...current, { product, programmeId, quantity: 1 }];
    });
    setMessage(null);
  }

  function updateCartItem(key: string, update: Partial<Pick<CartItem, "programmeId" | "quantity">>) {
    setCart((current) =>
      current.map((item) =>
        itemKey(item) === key
          ? {
              ...item,
              ...update,
              quantity:
                update.quantity === undefined
                  ? item.quantity
                  : Math.max(1, Math.min(quantityLimit(item.product), update.quantity))
            }
          : item
      )
    );
  }

  function removeFromCart(key: string) {
    setCart((current) => current.filter((item) => itemKey(item) !== key));
  }

  function openBooking(agent?: AgentRow) {
    setBookingAgent(agent ?? null);
    setIsBookingOpen(true);
    setBookingForm({
      ...defaultBookingForm,
      villageAgentId: agent?.id ?? "",
      programmeId: agent?.programme?.id ?? store?.agents[0]?.programme?.id ?? "",
      serviceType: store?.serviceTypes[0] ?? "Group onboarding"
    });
    setMessage(null);
  }

  async function submitCart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cart.length === 0) return;

    setSaving(true);
    setMessage(null);

    try {
      await Promise.all(
        cart.map((item) =>
          apiFetch("/public/intelli-store/credit-requests", {
            method: "POST",
            body: JSON.stringify({
              productId: item.product.id,
              programmeId: item.programmeId,
              customerName: checkoutForm.customerName,
              customerEmail: checkoutForm.customerEmail,
              phoneNumber: checkoutForm.phoneNumber,
              county: checkoutForm.county || undefined,
              groupName: checkoutForm.groupName || undefined,
              quantity: item.quantity,
              notes: checkoutForm.notes || undefined
            })
          })
        )
      );
      setCart([]);
      setCheckoutForm(defaultCheckoutForm);
      setMessage({ ok: true, text: "Cart submitted for programme credit review and agent distribution." });
    } catch (checkoutError) {
      setMessage({
        ok: false,
        text: checkoutError instanceof Error ? checkoutError.message : "Cart submission failed"
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
      setBookingForm(defaultBookingForm);
      setBookingAgent(null);
      setIsBookingOpen(false);
      setMessage({ ok: true, text: "Booking request submitted for follow-up." });
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
    <main className="landing-page store-page">
      <section className="store-page-hero">
        <PublicSiteHeader ariaLabel="Intelli-Store navigation" playStoreUrl={playStoreUrl} />
        <div className="store-page-hero-copy">
          <p className="eyebrow">Intelli-Store</p>
          <h1>Products, credit, and field distribution in one request flow</h1>
          <p>
            Product requests move from buyer cart to programme review, partner
            or lender financing, and VA / CBT delivery.
          </p>
        </div>
      </section>

      <section className="store-page-body" aria-label="Intelli-Store products and cart">
        {loading ? <div className="loading-panel">Loading Intelli-Store...</div> : null}
        {error ? <div className="notice warning">{error}</div> : null}
        {message ? <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div> : null}

        <div className="store-page-layout">
          <section className="store-catalog" aria-label="Products">
            <div className="store-catalog-toolbar">
              <label className="search-box">
                <Search size={17} />
                <input
                  onChange={(event) => setCatalogQuery(event.target.value)}
                  placeholder="Search products"
                  value={catalogQuery}
                />
              </label>
              <label className="table-filter compact-filter" title="Category">
                <SlidersHorizontal aria-hidden="true" size={15} />
                <span className="sr-only">Category</span>
                <select
                  aria-label="Category"
                  onChange={(event) => setSelectedCategory(event.target.value)}
                  value={selectedCategory}
                >
                  <option value="ALL">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {humanizeEnum(category)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {filteredProducts.map((product) => {
              const outOfStock = quantityLimit(product) <= 0;

              return (
              <article className="store-product-card store-page-product" key={product.id}>
                <FallbackImage alt={product.name} className="store-product-image" src={product.imageUrl} />
                <div className="store-product-copy">
                  <span className="pill blue">{humanizeEnum(product.category)}</span>
                  <h2>{product.name}</h2>
                  <p>{product.description}</p>
                </div>
                <div className="store-price-row">
                  <strong>{formatKes(product.priceCents)}</strong>
                  <span>{product.depositCents > 0 ? `${formatKes(product.depositCents)} deposit` : "Credit review"}</span>
                  <span className={outOfStock ? "stock-warning" : ""}>{stockLabel(product)}</span>
                </div>
                <div className="store-credit-note">
                  <HandCoins size={18} />
                  <span>{product.programmeLinks[0]?.creditTerms ?? product.creditSummary ?? "Programme credit review before delivery."}</span>
                </div>
                {product.fulfilmentSummary ? (
                  <div className="store-credit-note">
                    <Truck size={18} />
                    <span>{product.fulfilmentSummary}</span>
                  </div>
                ) : null}
                <div className="store-actions">
                  <button className="button" disabled={outOfStock} onClick={() => addToCart(product)} type="button">
                    <ShoppingCart size={16} />
                    {outOfStock ? "Out of stock" : "Add to cart"}
                  </button>
                  <button className="button secondary" onClick={() => openBooking()} type="button">
                    <CalendarCheck size={16} />
                    Book agent
                  </button>
                </div>
              </article>
              );
            })}
            {!loading && (store?.products.length ?? 0) === 0 ? (
              <div className="empty-state">No Intelli-Store products are live yet.</div>
            ) : null}
            {!loading && (store?.products.length ?? 0) > 0 && filteredProducts.length === 0 ? (
              <div className="empty-state">No products match the current filters.</div>
            ) : null}
          </section>

          <aside className="store-cart-panel" aria-label="Cart">
            <header>
              <div>
                <p className="eyebrow">Cart</p>
                <h2>{totals.quantity} item{totals.quantity === 1 ? "" : "s"}</h2>
              </div>
              <span className="pill">{formatKes(totals.amountCents)}</span>
            </header>

            <div className="cart-line-list">
              {cart.map((item) => {
                const key = itemKey(item);
                return (
                  <div className="cart-line" key={key}>
                    <div>
                      <strong>{item.product.name}</strong>
                      <span>{formatKes(item.product.priceCents * item.quantity)}</span>
                    </div>
                    <label className="credential-field compact">
                      <span>Program</span>
                      <select
                        onChange={(event) => updateCartItem(key, { programmeId: event.target.value })}
                        value={item.programmeId}
                      >
                        {item.product.programmeLinks.map((link) => (
                          <option key={link.programme.id} value={link.programme.id}>
                            {link.programme.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="cart-quantity-controls">
                      <button
                        aria-label={`Decrease ${item.product.name} quantity`}
                        className="icon-button"
                        onClick={() => updateCartItem(key, { quantity: item.quantity - 1 })}
                        type="button"
                      >
                        <Minus size={15} />
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        aria-label={`Increase ${item.product.name} quantity`}
                        className="icon-button"
                        disabled={item.quantity >= quantityLimit(item.product)}
                        onClick={() => updateCartItem(key, { quantity: item.quantity + 1 })}
                        type="button"
                      >
                        <Plus size={15} />
                      </button>
                      <button
                        aria-label={`Remove ${item.product.name}`}
                        className="icon-button"
                        onClick={() => removeFromCart(key)}
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {cart.length === 0 ? <div className="empty-state">Your cart is empty.</div> : null}
            </div>

            <form className="store-checkout-form" onSubmit={submitCart}>
              <div className="store-cart-total">
                <span>Estimated deposit</span>
                <strong>{formatKes(totals.depositCents)}</strong>
              </div>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Name</span>
                  <input
                    onChange={(event) => setCheckoutForm((current) => ({ ...current, customerName: event.target.value }))}
                    required
                    value={checkoutForm.customerName}
                  />
                </label>
                <label className="credential-field">
                  <span>Email</span>
                  <input
                    onChange={(event) => setCheckoutForm((current) => ({ ...current, customerEmail: event.target.value }))}
                    required
                    type="email"
                    value={checkoutForm.customerEmail}
                  />
                </label>
                <label className="credential-field">
                  <span>Phone</span>
                  <input
                    onChange={(event) => setCheckoutForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                    required
                    value={checkoutForm.phoneNumber}
                  />
                </label>
                <label className="credential-field">
                  <span>County</span>
                  <input
                    onChange={(event) => setCheckoutForm((current) => ({ ...current, county: event.target.value }))}
                    value={checkoutForm.county}
                  />
                </label>
                <label className="credential-field wide-field">
                  <span>Group or business</span>
                  <input
                    onChange={(event) => setCheckoutForm((current) => ({ ...current, groupName: event.target.value }))}
                    value={checkoutForm.groupName}
                  />
                </label>
                <label className="credential-field wide-field">
                  <span>Notes</span>
                  <textarea
                    onChange={(event) => setCheckoutForm((current) => ({ ...current, notes: event.target.value }))}
                    value={checkoutForm.notes}
                  />
                </label>
              </div>
              <button className="button" disabled={saving || cart.length === 0} type="submit">
                <Send size={16} />
                {saving ? "Submitting" : "Submit cart request"}
              </button>
            </form>
          </aside>
        </div>

        <section className="store-distribution-band" aria-label="Bookable VA and CBT support">
          <header>
            <p className="eyebrow">Field Distribution</p>
            <h2>VA / CBT teams supply approved products and earn commission on fulfilled requests</h2>
          </header>
          <div className="store-agent-list expanded">
            {(store?.agents ?? []).map((agent) => (
              <button className="store-agent-row" key={agent.id} onClick={() => openBooking(agent)} type="button">
                <Truck size={18} />
                <span>
                  <strong>{agent.name}</strong>
                  <em>{agent.county ?? agent.programme?.county ?? "Programme field team"}</em>
                </span>
                <span className="pill">{agent._count.groups} groups</span>
              </button>
            ))}
          </div>
        </section>
      </section>

      {isBookingOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="VA / CBT booking request">
          <button className="modal-backdrop" onClick={() => setIsBookingOpen(false)} type="button" aria-label="Close booking request" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>Book VA / CBT</h3>
                <span>{bookingAgent?.name ?? "Programme field support"}</span>
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
                  <span>Group or business</span>
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

      <PublicSiteFooter playStoreUrl={playStoreUrl} />
    </main>
  );
}
