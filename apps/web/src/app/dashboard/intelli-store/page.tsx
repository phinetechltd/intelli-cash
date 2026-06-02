"use client";

import React from "react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarDays,
  HandCoins,
  PackagePlus,
  Pencil,
  Plus,
  ReceiptText,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  UsersRound,
  X
} from "@/lib/theme-icons";
import { apiFetch, formatKes, humanizeEnum, uploadFile } from "../../../lib/api";
import { CollectionView } from "../../../components/dashboard/collection-view";
import { DataTable } from "../../../components/dashboard/data-table";
import { FallbackImage } from "../../../components/fallback-image";
import { StatCard } from "../../../components/dashboard/stat-card";
import type {
  AgentBookingRequest,
  AgentRow,
  PartnerRow,
  ProgrammeRow,
  StoreCreditRequest,
  StoreLoanPortfolioReport,
  StoreProduct,
  StoreSalesReport,
  StoreSupplier,
  User
} from "../../../components/dashboard/types";
import {
  bpsToPercentInput,
  canCancelRequest,
  centsToKesInput,
  dateInputToEnd,
  dateInputToStart,
  defaultActionForm,
  defaultCreditForm,
  defaultProductForm,
  defaultRepaymentForm,
  defaultReportFilters,
  defaultSupplierForm,
  emptyLoanReport,
  emptySalesReport,
  formatShortDate,
  installmentFrequencies,
  kesInputToCents,
  percentInputToBps,
  productCategories,
  productInventoryLabel,
  productStatuses,
  repaymentStatuses,
  requestOutstandingCents,
  requestStatuses,
  roleSurface,
  supplierStatuses
} from "../../../features/intelli-store/model";
import type {
  ActivePanel,
  RepaymentForm,
  RequestActionForm
} from "../../../features/intelli-store/model";

export default function DashboardIntelliStorePage() {
  const [user, setUser] = useState<User | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [suppliers, setSuppliers] = useState<StoreSupplier[]>([]);
  const [creditRequests, setCreditRequests] = useState<StoreCreditRequest[]>([]);
  const [bookingRequests, setBookingRequests] = useState<AgentBookingRequest[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [partners, setPartners] = useState<Array<Pick<PartnerRow, "id" | "name" | "type">>>([]);
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([]);
  const [salesReport, setSalesReport] = useState<StoreSalesReport>(emptySalesReport);
  const [loanReport, setLoanReport] = useState<StoreLoanPortfolioReport>(emptyLoanReport);
  const [reportFilters, setReportFilters] = useState(defaultReportFilters);
  const [creditForm, setCreditForm] = useState(defaultCreditForm);
  const [productForm, setProductForm] = useState(defaultProductForm);
  const [supplierForm, setSupplierForm] = useState(defaultSupplierForm);
  const [actionForms, setActionForms] = useState<Record<string, RequestActionForm>>({});
  const [repaymentForms, setRepaymentForms] = useState<Record<string, RepaymentForm>>({});
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<StoreSupplier | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>("catalog");
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadingProductImage, setUploadingProductImage] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = products.find((product) => product.id === creditForm.productId) ?? products[0];
  const isMember = user?.role === "MEMBER";
  const isGroupAccount = user?.role === "GROUP_ACCOUNT";
  const isAdmin = user?.role === "IWL_ADMIN";
  const isPartnerInvestor = user?.role === "PARTNER_OFFICER" || user?.role === "LENDER";
  const isRequesterAccount = isMember || isGroupAccount;
  const canWriteStore = user?.permissions?.includes("store:write") ?? false;
  const canManageCatalog = canWriteStore && isAdmin;
  const canManageDistribution = canWriteStore && isAdmin;
  const canFinance =
    canWriteStore && (isAdmin || isPartnerInvestor);
  const canUpdateStoreStatus = canWriteStore && isAdmin;
  const canRecordRepayments = canWriteStore && isAdmin;
  const canRequestProducts = canWriteStore && isRequesterAccount;
  const fulfillmentQueue = creditRequests.filter((request) => request.status === "APPROVED" || request.status === "FULFILLED");
  const financingQueue = creditRequests.filter(
    (request) => request.status !== "REJECTED" && request.status !== "CANCELLED" && request.repaymentStatus !== "PAID"
  );
  const outstandingCreditCents = creditRequests.reduce((sum, request) => sum + requestOutstandingCents(request), 0);
  const dashboardProducts = products.map((product) => ({
    ...product,
    programmes: product.programmeLinks.map((link) => link.programme.name).join(", "),
    supplierName: product.supplier?.name ?? product.sellerName ?? "Intelli-Store"
  }));
  const reportQuery = useMemo(() => {
    const params = new URLSearchParams();
    const queryValues = {
      ...reportFilters,
      startDate: dateInputToStart(reportFilters.startDate),
      endDate: dateInputToEnd(reportFilters.endDate)
    };

    Object.entries(queryValues).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const query = params.toString();
    return query ? `?${query}` : "";
  }, [reportFilters]);

  async function loadStoreWorkspace() {
    const meResponse = await apiFetch<User>("/auth/me");
    const memberMode = meResponse.role === "MEMBER";
    const [
      productResponse,
      supplierResponse,
      creditResponse,
      bookingResponse,
      agentResponse,
      programmeResponse,
      salesResponse,
      loanResponse
    ] = await Promise.all([
      apiFetch<StoreProduct[]>("/intelli-store/products"),
      memberMode ? Promise.resolve([]) : apiFetch<StoreSupplier[]>("/intelli-store/suppliers").catch(() => []),
      apiFetch<StoreCreditRequest[]>("/intelli-store/credit-requests"),
      memberMode ? Promise.resolve([]) : apiFetch<AgentBookingRequest[]>("/intelli-store/booking-requests"),
      memberMode ? Promise.resolve([]) : apiFetch<AgentRow[]>("/village-agents").catch(() => []),
      memberMode ? Promise.resolve([]) : apiFetch<ProgrammeRow[]>("/programmes"),
      memberMode ? Promise.resolve(emptySalesReport) : apiFetch<StoreSalesReport>(`/intelli-store/reports/sales${reportQuery}`).catch(() => emptySalesReport),
      memberMode ? Promise.resolve(emptyLoanReport) : apiFetch<StoreLoanPortfolioReport>(`/intelli-store/reports/loan-portfolio${reportQuery}`).catch(() => emptyLoanReport)
    ]);
    const partnerResponse = memberMode ? [] : await apiFetch<PartnerRow[]>("/partners").catch(() => []);
    const fallbackPartner =
      meResponse.partnerId && meResponse.partner
        ? [{ id: meResponse.partnerId, name: meResponse.partner.name, type: meResponse.role === "LENDER" ? "LENDER" : "PARTNER" }]
        : [];

    setUser(meResponse);
    setProducts(productResponse);
    setSuppliers(supplierResponse);
    setCreditRequests(creditResponse);
    setBookingRequests(bookingResponse);
    setAgents(agentResponse);
    setProgrammes(programmeResponse);
    setSalesReport(salesResponse);
    setLoanReport(loanResponse);
    setPartners(
      partnerResponse.length > 0
        ? partnerResponse.map((partner) => ({ id: partner.id, name: partner.name, type: partner.type }))
        : fallbackPartner
    );
    setCreditForm((current) => ({
      ...current,
      productId: current.productId || productResponse[0]?.id || "",
      programmeId: current.programmeId || productResponse[0]?.programmeLinks[0]?.programme.id || "",
      customerName: current.customerName || meResponse.member?.fullName || meResponse.group?.name || meResponse.name,
      customerEmail: current.customerEmail || meResponse.email,
      phoneNumber: current.phoneNumber || meResponse.member?.phone || "",
      groupName: current.groupName || meResponse.group?.name || "",
      distributionAgentId: current.distributionAgentId || ""
    }));
    setActionForms((current) => {
      const next = { ...current };
      creditResponse.forEach((request) => {
        next[request.id] = next[request.id] ?? defaultActionForm(request);
      });
      return next;
    });
    setRepaymentForms((current) => {
      const next = { ...current };
      creditResponse.forEach((request) => {
        next[request.id] = next[request.id] ?? defaultRepaymentForm();
      });
      return next;
    });
  }

  useEffect(() => {
    let mounted = true;

    loadStoreWorkspace()
      .catch((storeError) => {
        if (mounted) setError(storeError instanceof Error ? storeError.message : "Intelli-Store failed to load");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [reportQuery]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", isProductModalOpen || isSupplierModalOpen || isRequestModalOpen);
    return () => document.body.classList.remove("modal-open");
  }, [isProductModalOpen, isRequestModalOpen, isSupplierModalOpen]);

  useEffect(() => {
    if ((user?.role === "MEMBER" || user?.role === "GROUP_ACCOUNT") && !["catalog", "requests", "portfolio"].includes(activePanel)) {
      setActivePanel("catalog");
    }

    if ((user?.role === "PARTNER_OFFICER" || user?.role === "LENDER") && !["catalog", "suppliers", "requests", "finance", "portfolio"].includes(activePanel)) {
      setActivePanel("catalog");
    }
  }, [activePanel, user?.role]);

  function updateActionForm(requestId: string, update: Partial<RequestActionForm>) {
    setActionForms((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] ?? defaultActionForm(creditRequests.find((request) => request.id === requestId)!)),
        ...update
      }
    }));
  }

  function updateRepaymentForm(requestId: string, update: Partial<RepaymentForm>) {
    setRepaymentForms((current) => ({
      ...current,
      [requestId]: {
        ...(current[requestId] ?? defaultRepaymentForm()),
        ...update
      }
    }));
  }

  function updateProductProgrammes(values: string[]) {
    setProductForm((current) => ({
      ...current,
      programmeIds: values,
      defaultAgentIds: current.defaultAgentIds.filter((agentId) => {
        const agent = agents.find((candidate) => candidate.id === agentId);
        return agent?.programme?.id ? values.includes(agent.programme.id) : values.length === 0;
      })
    }));
  }

  async function uploadProductImage(file: File) {
    setUploadingProductImage(true);
    setMessage(null);

    try {
      const uploaded = await uploadFile("store-image", file);
      setProductForm((current) => ({ ...current, imageUrl: uploaded.url }));
      setMessage({ ok: true, text: `${uploaded.fileName} uploaded as product image.` });
    } catch (uploadError) {
      setMessage({
        ok: false,
        text: uploadError instanceof Error ? uploadError.message : "Product image upload failed"
      });
    } finally {
      setUploadingProductImage(false);
    }
  }

  function openCreateProduct() {
    setEditingProduct(null);
    setProductForm({
      ...defaultProductForm,
      supplierId: suppliers[0]?.id ?? "",
      programmeIds: programmes[0]?.id ? [programmes[0].id] : []
    });
    setMessage(null);
    setIsProductModalOpen(true);
  }

  function openEditProduct(product: StoreProduct) {
    const firstLink = product.programmeLinks[0];
    const defaultAgentIds = product.programmeLinks.flatMap((link) =>
      (link.defaultAgents ?? []).map((agentLink) => agentLink.villageAgent.id)
    );
    const primaryAgentId =
      product.programmeLinks
        .flatMap((link) => link.defaultAgents ?? [])
        .find((agentLink) => agentLink.isPrimary)?.villageAgent.id ?? "";

    setEditingProduct(product);
    setProductForm({
      name: product.name,
      category: product.category,
      status: product.status,
      supplierId: product.supplierId ?? "",
      sellerName: product.sellerName ?? "",
      priceKes: centsToKesInput(product.priceCents),
      depositKes: centsToKesInput(product.depositCents),
      inventoryCount: product.inventoryCount === null || product.inventoryCount === undefined ? "" : String(product.inventoryCount),
      imageUrl: product.imageUrl ?? "",
      programmeIds: product.programmeLinks.map((link) => link.programme.id),
      creditTerms: firstLink?.creditTerms ?? "",
      depositRatePercent: bpsToPercentInput(firstLink?.depositRateBps ?? 1000),
      installmentCount: String(firstLink?.installmentCount ?? 6),
      installmentFrequency: firstLink?.installmentFrequency ?? "MONTHLY",
      flatInterestRatePercent: bpsToPercentInput(firstLink?.flatInterestRateBps ?? 0),
      gracePeriodDays: String(firstLink?.gracePeriodDays ?? 30),
      defaultAgentIds,
      primaryAgentId,
      creditSummary: product.creditSummary ?? "",
      fulfilmentSummary: product.fulfilmentSummary ?? "",
      description: product.description
    });
    setMessage(null);
    setIsProductModalOpen(true);
  }

  function openCreateSupplier() {
    setEditingSupplier(null);
    setSupplierForm(defaultSupplierForm);
    setMessage(null);
    setIsSupplierModalOpen(true);
  }

  function openRequestForProduct(product: StoreProduct) {
    setCreditForm((current) => ({
      ...current,
      productId: product.id,
      programmeId: product.programmeLinks[0]?.programme.id ?? "",
      distributionAgentId: "",
      quantity: "1",
      notes: ""
    }));
    setActivePanel("requests");
    setMessage(null);
    setIsRequestModalOpen(true);
  }

  function openCreateRequest() {
    const product = selectedProduct ?? products[0];
    setCreditForm((current) => ({
      ...current,
      productId: current.productId || product?.id || "",
      programmeId: current.programmeId || product?.programmeLinks[0]?.programme.id || "",
      distributionAgentId: "",
      quantity: current.quantity || "1",
      notes: ""
    }));
    setMessage(null);
    setIsRequestModalOpen(true);
  }

  function openEditSupplier(supplier: StoreSupplier) {
    setEditingSupplier(supplier);
    setSupplierForm({
      name: supplier.name,
      status: supplier.status,
      contactName: supplier.contactName ?? "",
      contactPhone: supplier.contactPhone ?? "",
      contactEmail: supplier.contactEmail ?? "",
      county: supplier.county ?? "",
      location: supplier.location ?? "",
      notes: supplier.notes ?? ""
    });
    setMessage(null);
    setIsSupplierModalOpen(true);
  }

  async function submitSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const saved = await apiFetch<StoreSupplier>(
        editingSupplier ? `/intelli-store/suppliers/${editingSupplier.id}` : "/intelli-store/suppliers",
        {
          method: editingSupplier ? "PATCH" : "POST",
          body: JSON.stringify({
            name: supplierForm.name,
            status: supplierForm.status,
            contactName: supplierForm.contactName || undefined,
            contactPhone: supplierForm.contactPhone || undefined,
            contactEmail: supplierForm.contactEmail || undefined,
            county: supplierForm.county || undefined,
            location: supplierForm.location || undefined,
            notes: supplierForm.notes || undefined
          })
        }
      );
      await loadStoreWorkspace();
      setSupplierForm(defaultSupplierForm);
      setEditingSupplier(null);
      setIsSupplierModalOpen(false);
      setMessage({ ok: true, text: `${saved.name} ${editingSupplier ? "updated" : "added"} as a supplier.` });
    } catch (supplierError) {
      setMessage({
        ok: false,
        text: supplierError instanceof Error ? supplierError.message : "Supplier failed to save"
      });
    } finally {
      setSaving(false);
    }
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (productForm.programmeIds.length === 0) return;

    setSaving(true);
    setMessage(null);

    const programmeSettings = productForm.programmeIds.map((programmeId) => {
      const programmeAgentIds = productForm.defaultAgentIds.filter((agentId) => {
        const agent = agents.find((candidate) => candidate.id === agentId);
        return agent?.programme?.id === programmeId;
      });

      return {
        programmeId,
        creditTerms: productForm.creditTerms || undefined,
        depositRateBps: percentInputToBps(productForm.depositRatePercent),
        installmentCount: Number(productForm.installmentCount || 1),
        installmentFrequency: productForm.installmentFrequency,
        flatInterestRateBps: percentInputToBps(productForm.flatInterestRatePercent),
        gracePeriodDays: Number(productForm.gracePeriodDays || 0),
        defaultAgentIds: programmeAgentIds,
        primaryAgentId: programmeAgentIds.includes(productForm.primaryAgentId) ? productForm.primaryAgentId : programmeAgentIds[0]
      };
    });

    const payload = {
      name: productForm.name,
      category: productForm.category,
      status: productForm.status,
      supplierId: productForm.supplierId || null,
      sellerName: productForm.sellerName || undefined,
      priceCents: kesInputToCents(productForm.priceKes),
      depositCents: kesInputToCents(productForm.depositKes),
      currency: "KES",
      inventoryCount: productForm.inventoryCount === "" ? null : Number(productForm.inventoryCount),
      imageUrl: productForm.imageUrl || undefined,
      programmeIds: productForm.programmeIds,
      creditTerms: productForm.creditTerms || undefined,
      programmeSettings,
      creditSummary: productForm.creditSummary || undefined,
      fulfilmentSummary: productForm.fulfilmentSummary || undefined,
      description: productForm.description
    };

    try {
      const saved = await apiFetch<StoreProduct>(
        editingProduct ? `/intelli-store/products/${editingProduct.id}` : "/intelli-store/products",
        {
          method: editingProduct ? "PATCH" : "POST",
          body: JSON.stringify(payload)
        }
      );
      await loadStoreWorkspace();
      setProductForm(defaultProductForm);
      setEditingProduct(null);
      setIsProductModalOpen(false);
      setMessage({ ok: true, text: `${saved.name} ${editingProduct ? "updated" : "added"} to the catalog.` });
    } catch (productError) {
      setMessage({
        ok: false,
        text: productError instanceof Error ? productError.message : "Product failed to save"
      });
    } finally {
      setSaving(false);
    }
  }

  async function submitCreditRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct) return;

    setSaving(true);
    setMessage(null);

    try {
      const created = await apiFetch<StoreCreditRequest>("/intelli-store/credit-requests", {
        method: "POST",
        body: JSON.stringify({
          productId: creditForm.productId,
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
      await loadStoreWorkspace();
      setCreditForm((current) => ({
        ...defaultCreditForm,
        productId: current.productId,
        programmeId: current.programmeId,
        distributionAgentId: "",
        customerName: user?.member?.fullName || user?.group?.name || user?.name || "",
        customerEmail: user?.email || "",
        phoneNumber: user?.member?.phone || "",
        groupName: user?.group?.name || ""
      }));
      setIsRequestModalOpen(false);
      setMessage({ ok: true, text: `${created.product?.name ?? "Product"} request submitted.` });
    } catch (requestError) {
      setMessage({
        ok: false,
        text: requestError instanceof Error ? requestError.message : "Product request failed"
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateCreditRequest(request: StoreCreditRequest) {
    const form = actionForms[request.id] ?? defaultActionForm(request);
    setBusyId(request.id);
    setMessage(null);

    try {
      const updated = await apiFetch<StoreCreditRequest>(`/intelli-store/credit-requests/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: canUpdateStoreStatus ? form.status : undefined,
          repaymentStatus: canUpdateStoreStatus ? form.repaymentStatus : undefined,
          distributionAgentId: canManageDistribution ? form.distributionAgentId || null : undefined,
          financierPartnerId: canFinance ? form.financierPartnerId || null : undefined,
          commissionRateBps: canManageDistribution ? Number(form.commissionRateBps) : undefined,
          reviewNotes: form.reviewNotes || null
        })
      });
      await loadStoreWorkspace();
      setMessage({ ok: true, text: `${updated.customerName} request updated.` });
    } catch (updateError) {
      setMessage({
        ok: false,
        text: updateError instanceof Error ? updateError.message : "Request update failed"
      });
    } finally {
      setBusyId(null);
    }
  }

  async function cancelCreditRequest(request: StoreCreditRequest) {
    setBusyId(`cancel-${request.id}`);
    setMessage(null);

    try {
      const updated = await apiFetch<StoreCreditRequest>(`/intelli-store/credit-requests/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "CANCELLED" })
      });
      await loadStoreWorkspace();
      setMessage({ ok: true, text: `${updated.product?.name ?? "Product"} request cancelled.` });
    } catch (cancelError) {
      setMessage({
        ok: false,
        text: cancelError instanceof Error ? cancelError.message : "Request cancellation failed"
      });
    } finally {
      setBusyId(null);
    }
  }

  async function postRepayment(request: StoreCreditRequest) {
    const form = repaymentForms[request.id] ?? defaultRepaymentForm();
    setBusyId(`repayment-${request.id}`);
    setMessage(null);

    try {
      const updated = await apiFetch<StoreCreditRequest>(`/intelli-store/credit-requests/${request.id}/repayments`, {
        method: "POST",
        body: JSON.stringify({
          amountCents: kesInputToCents(form.amountKes),
          installmentId: form.installmentId || undefined,
          source: form.source,
          provider: form.provider || undefined,
          providerReference: form.providerReference || undefined,
          notes: form.notes || undefined
        })
      });
      await loadStoreWorkspace();
      updateRepaymentForm(request.id, defaultRepaymentForm());
      setMessage({ ok: true, text: `Repayment posted for ${updated.customerName}.` });
    } catch (repaymentError) {
      setMessage({
        ok: false,
        text: repaymentError instanceof Error ? repaymentError.message : "Repayment posting failed"
      });
    } finally {
      setBusyId(null);
    }
  }

  async function updateBookingRequest(request: AgentBookingRequest, status: string) {
    setBusyId(request.id);
    setMessage(null);

    try {
      await apiFetch(`/intelli-store/booking-requests/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await loadStoreWorkspace();
      setMessage({ ok: true, text: "Booking request updated." });
    } catch (bookingError) {
      setMessage({
        ok: false,
        text: bookingError instanceof Error ? bookingError.message : "Booking update failed"
      });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  const fullMenuItems: Array<{
    key: ActivePanel;
    title: string;
    subtitle: string;
    count: string;
  }> = [
    { key: "catalog", title: "Catalog", subtitle: "Products", count: products.length.toString() },
    { key: "suppliers", title: "Suppliers", subtitle: "Records", count: suppliers.length.toString() },
    { key: "requests", title: "Requests", subtitle: "Demand", count: creditRequests.length.toString() },
    { key: "distribution", title: "Distribution", subtitle: "VA / CBT", count: fulfillmentQueue.length.toString() },
    { key: "finance", title: "Finance", subtitle: "Loans", count: formatKes(loanReport.summary.principalCents) },
    { key: "sales", title: "Sales", subtitle: "Fulfilled", count: salesReport.summary.fulfilledRequests.toString() },
    { key: "portfolio", title: "Portfolio", subtitle: "Outstanding", count: formatKes(loanReport.summary.outstandingCents) },
    { key: "bookings", title: "Bookings", subtitle: "Services", count: bookingRequests.length.toString() }
  ];
  const requesterMenuItems = [
    { key: "catalog" as const, title: "Products", subtitle: "Catalog", count: products.length.toString() },
    { key: "requests" as const, title: isMember ? "My requests" : "Group requests", subtitle: "Orders", count: creditRequests.length.toString() },
    { key: "portfolio" as const, title: "Credit", subtitle: "Status", count: formatKes(outstandingCreditCents) }
  ];
  const investorMenuItems = [
    { key: "catalog" as const, title: "Products", subtitle: "Listed", count: products.length.toString() },
    { key: "suppliers" as const, title: "Suppliers", subtitle: "Vetted", count: suppliers.length.toString() },
    { key: "requests" as const, title: "Applications", subtitle: "Demand", count: creditRequests.length.toString() },
    { key: "finance" as const, title: "Invest / Donate", subtitle: "Support", count: formatKes(loanReport.summary.principalCents) },
    { key: "portfolio" as const, title: "Impact", subtitle: "Outstanding", count: formatKes(loanReport.summary.outstandingCents) }
  ];
  const menuItems = isRequesterAccount
    ? requesterMenuItems
    : isPartnerInvestor
    ? [
        ...investorMenuItems
      ]
    : fullMenuItems;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Intelli-Store</p>
          <h2
            aria-label={roleSurface(user)}
            className="has-hint"
            data-hint={
              isPartnerInvestor
                ? "Review vetted suppliers, products, applications, and support green enterprise access through investment or donation flows."
                : "Manage product requests from buyer request through admin vetting, financing, agent distribution, commission, repayment tracking, and reporting."
            }
            tabIndex={0}
          >
            {roleSurface(user)}
          </h2>
          <p>
            {user?.role === "LENDER"
              ? "Invest in approved supplier-backed product access and track financed green enterprise support."
              : user?.role === "PARTNER_OFFICER"
              ? "Review vetted suppliers and support groups through investments or donations for listed products and services."
              : user?.role === "MEMBER"
                ? "Products, requests, and credit status."
                : user?.role === "GROUP_ACCOUNT"
                ? "Request productive assets and track fulfilment from your account."
                : "Vet suppliers, manage listed products, assign services, control fulfilment, and monitor store reports."}
          </p>
        </div>
        <div className="page-heading-actions">
          <span className="pill">{products.length} products</span>
          {canManageCatalog ? (
            <>
              <button className="button secondary" onClick={openCreateSupplier} type="button">
                <Building2 size={16} />
                Add supplier
              </button>
              <button className="button" onClick={openCreateProduct} type="button">
                <Plus size={16} />
                Add product
              </button>
            </>
          ) : null}
        </div>
      </section>

      {message ? <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div> : null}

      {isSupplierModalOpen && canManageCatalog ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={editingSupplier ? "Edit store supplier" : "Create store supplier"}>
          <button className="modal-backdrop" onClick={() => setIsSupplierModalOpen(false)} type="button" aria-label="Close supplier form" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</h3>
                <span>Maintain supplier contact, location, and status for the store catalog.</span>
              </div>
              <button className="icon-button" onClick={() => setIsSupplierModalOpen(false)} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form" onSubmit={submitSupplier}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Name</span>
                  <input onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} required value={supplierForm.name} />
                </label>
                <label className="credential-field">
                  <span>Status</span>
                  <select onChange={(event) => setSupplierForm((current) => ({ ...current, status: event.target.value }))} value={supplierForm.status}>
                    {supplierStatuses.map((status) => (
                      <option key={status} value={status}>
                        {humanizeEnum(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Contact name</span>
                  <input onChange={(event) => setSupplierForm((current) => ({ ...current, contactName: event.target.value }))} value={supplierForm.contactName} />
                </label>
                <label className="credential-field">
                  <span>Phone</span>
                  <input onChange={(event) => setSupplierForm((current) => ({ ...current, contactPhone: event.target.value }))} value={supplierForm.contactPhone} />
                </label>
                <label className="credential-field">
                  <span>Email</span>
                  <input onChange={(event) => setSupplierForm((current) => ({ ...current, contactEmail: event.target.value }))} type="email" value={supplierForm.contactEmail} />
                </label>
                <label className="credential-field">
                  <span>County</span>
                  <input onChange={(event) => setSupplierForm((current) => ({ ...current, county: event.target.value }))} value={supplierForm.county} />
                </label>
                <label className="credential-field">
                  <span>Location</span>
                  <input onChange={(event) => setSupplierForm((current) => ({ ...current, location: event.target.value }))} value={supplierForm.location} />
                </label>
                <label className="credential-field wide-field">
                  <span>Notes</span>
                  <textarea onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))} value={supplierForm.notes} />
                </label>
              </div>
              <div className="credential-actions">
                <button className="button" disabled={saving} type="submit">
                  {editingSupplier ? <Pencil size={16} /> : <Plus size={16} />}
                  {saving ? "Saving" : editingSupplier ? "Save supplier" : "Create supplier"}
                </button>
                <button className="button secondary" onClick={() => setIsSupplierModalOpen(false)} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isProductModalOpen && canManageCatalog ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={editingProduct ? "Edit store product" : "Create store product"}>
          <button className="modal-backdrop" onClick={() => setIsProductModalOpen(false)} type="button" aria-label="Close product form" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>{editingProduct ? "Edit Product" : "Add Product"}</h3>
                <span>Set supplier, catalog status, stock, programme terms, and VA defaults.</span>
              </div>
              <button className="icon-button" onClick={() => setIsProductModalOpen(false)} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form" onSubmit={submitProduct}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Name</span>
                  <input onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} required value={productForm.name} />
                </label>
                <label className="credential-field">
                  <span>Category</span>
                  <select onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} value={productForm.category}>
                    {productCategories.map((category) => (
                      <option key={category} value={category}>
                        {humanizeEnum(category)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Status</span>
                  <select onChange={(event) => setProductForm((current) => ({ ...current, status: event.target.value }))} value={productForm.status}>
                    {productStatuses.map((status) => (
                      <option key={status} value={status}>
                        {humanizeEnum(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Supplier</span>
                  <select onChange={(event) => setProductForm((current) => ({ ...current, supplierId: event.target.value }))} value={productForm.supplierId}>
                    <option value="">No supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Seller label</span>
                  <input onChange={(event) => setProductForm((current) => ({ ...current, sellerName: event.target.value }))} value={productForm.sellerName} />
                </label>
                <label className="credential-field">
                  <span>Price (KES)</span>
                  <input min="1" onChange={(event) => setProductForm((current) => ({ ...current, priceKes: event.target.value }))} required step="1" type="number" value={productForm.priceKes} />
                </label>
                <label className="credential-field">
                  <span>Deposit (KES)</span>
                  <input min="0" onChange={(event) => setProductForm((current) => ({ ...current, depositKes: event.target.value }))} step="1" type="number" value={productForm.depositKes} />
                </label>
                <label className="credential-field">
                  <span>Inventory</span>
                  <input min="0" onChange={(event) => setProductForm((current) => ({ ...current, inventoryCount: event.target.value }))} placeholder="Blank for open stock" step="1" type="number" value={productForm.inventoryCount} />
                </label>
                <label className="credential-field upload-field">
                  <span>Main image</span>
                  <input
                    accept="image/*"
                    disabled={uploadingProductImage}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadProductImage(file);
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                  {productForm.imageUrl ? (
                    <span className="upload-preview">
                      <FallbackImage alt="" className="table-avatar square-avatar" src={productForm.imageUrl} />
                      <em>Uploaded product image ready</em>
                    </span>
                  ) : (
                    <em>{uploadingProductImage ? "Uploading..." : "Upload required"}</em>
                  )}
                </label>
                <label className="credential-field wide-field">
                  <span>Programs</span>
                  <select
                    multiple
                    onChange={(event) => updateProductProgrammes(Array.from(event.currentTarget.selectedOptions).map((option) => option.value))}
                    required
                    value={productForm.programmeIds}
                  >
                    {programmes.map((programme) => (
                      <option key={programme.id} value={programme.id}>
                        {programme.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Deposit rate %</span>
                  <input min="0" max="100" onChange={(event) => setProductForm((current) => ({ ...current, depositRatePercent: event.target.value }))} step="0.01" type="number" value={productForm.depositRatePercent} />
                </label>
                <label className="credential-field">
                  <span>Installments</span>
                  <input min="1" max="60" onChange={(event) => setProductForm((current) => ({ ...current, installmentCount: event.target.value }))} type="number" value={productForm.installmentCount} />
                </label>
                <label className="credential-field">
                  <span>Frequency</span>
                  <select onChange={(event) => setProductForm((current) => ({ ...current, installmentFrequency: event.target.value }))} value={productForm.installmentFrequency}>
                    {installmentFrequencies.map((frequency) => (
                      <option key={frequency} value={frequency}>
                        {humanizeEnum(frequency)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Flat interest %</span>
                  <input min="0" max="100" onChange={(event) => setProductForm((current) => ({ ...current, flatInterestRatePercent: event.target.value }))} step="0.01" type="number" value={productForm.flatInterestRatePercent} />
                </label>
                <label className="credential-field">
                  <span>Grace days</span>
                  <input min="0" max="365" onChange={(event) => setProductForm((current) => ({ ...current, gracePeriodDays: event.target.value }))} type="number" value={productForm.gracePeriodDays} />
                </label>
                <label className="credential-field wide-field">
                  <span>Default VAs</span>
                  <select
                    multiple
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        defaultAgentIds: Array.from(event.currentTarget.selectedOptions).map((option) => option.value)
                      }))
                    }
                    value={productForm.defaultAgentIds}
                  >
                    {agents
                      .filter((agent) => !agent.programme?.id || productForm.programmeIds.includes(agent.programme.id))
                      .map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} {agent.programme?.name ? `- ${agent.programme.name}` : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Primary VA</span>
                  <select onChange={(event) => setProductForm((current) => ({ ...current, primaryAgentId: event.target.value }))} value={productForm.primaryAgentId}>
                    <option value="">Auto primary</option>
                    {productForm.defaultAgentIds.map((agentId) => {
                      const agent = agents.find((candidate) => candidate.id === agentId);
                      return (
                        <option key={agentId} value={agentId}>
                          {agent?.name ?? agentId}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="credential-field wide-field">
                  <span>Credit terms</span>
                  <input onChange={(event) => setProductForm((current) => ({ ...current, creditTerms: event.target.value }))} value={productForm.creditTerms} />
                </label>
                <label className="credential-field wide-field">
                  <span>Credit summary</span>
                  <input onChange={(event) => setProductForm((current) => ({ ...current, creditSummary: event.target.value }))} value={productForm.creditSummary} />
                </label>
                <label className="credential-field wide-field">
                  <span>Fulfilment summary</span>
                  <input onChange={(event) => setProductForm((current) => ({ ...current, fulfilmentSummary: event.target.value }))} value={productForm.fulfilmentSummary} />
                </label>
                <label className="credential-field wide-field">
                  <span>Description</span>
                  <textarea onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} required value={productForm.description} />
                </label>
              </div>
              <div className="credential-actions">
                <button className="button" disabled={saving || uploadingProductImage || productForm.programmeIds.length === 0 || !productForm.imageUrl} type="submit">
                  {editingProduct ? <Pencil size={16} /> : <Plus size={16} />}
                  {saving ? "Saving" : editingProduct ? "Save product" : "Create product"}
                </button>
                <button className="button secondary" onClick={() => setIsProductModalOpen(false)} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isRequestModalOpen && canRequestProducts ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Create product request">
          <button className="modal-backdrop" onClick={() => setIsRequestModalOpen(false)} type="button" aria-label="Close request form" />
          <section className="data-card credential-modal store-request-modal">
            <header>
              <div>
                <h3>Add Request</h3>
                <span>Select a product and submit the few details needed for review.</span>
              </div>
              <button className="icon-button" onClick={() => setIsRequestModalOpen(false)} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form" onSubmit={submitCreditRequest}>
              <div className="request-product-picker">
                {products.map((product) => {
                  const selected = product.id === creditForm.productId;
                  const outOfStock = product.inventoryCount === 0;

                  return (
                    <button
                      className={`request-product-option ${selected ? "selected" : ""}`}
                      disabled={outOfStock}
                      key={product.id}
                      onClick={() =>
                        setCreditForm((current) => ({
                          ...current,
                          productId: product.id,
                          programmeId: product.programmeLinks[0]?.programme.id ?? current.programmeId
                        }))
                      }
                      type="button"
                    >
                      <span className="request-product-image">
                        <FallbackImage alt="" src={product.imageUrl} />
                      </span>
                      <span>
                        <strong>{product.name}</strong>
                        <small>{formatKes(product.priceCents)} - {formatKes(product.depositCents)} deposit</small>
                      </span>
                      <em>{outOfStock ? "Out of stock" : productInventoryLabel(product)}</em>
                    </button>
                  );
                })}
              </div>

              <div className="credential-grid">
                <label className="credential-field">
                  <span>Program</span>
                  <select onChange={(event) => setCreditForm((current) => ({ ...current, programmeId: event.target.value }))} required value={creditForm.programmeId}>
                    {(selectedProduct?.programmeLinks ?? []).map((link) => (
                      <option key={link.programme.id} value={link.programme.id}>
                        {link.programme.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="credential-field">
                  <span>Quantity</span>
                  <input min="1" onChange={(event) => setCreditForm((current) => ({ ...current, quantity: event.target.value }))} required type="number" value={creditForm.quantity} />
                </label>
                {isGroupAccount ? (
                  <>
                    <label className="credential-field">
                      <span>Phone</span>
                      <input onChange={(event) => setCreditForm((current) => ({ ...current, phoneNumber: event.target.value }))} required value={creditForm.phoneNumber} />
                    </label>
                    <label className="credential-field">
                      <span>County</span>
                      <input onChange={(event) => setCreditForm((current) => ({ ...current, county: event.target.value }))} value={creditForm.county} />
                    </label>
                  </>
                ) : null}
                <label className="credential-field wide-field">
                  <span>Notes</span>
                  <textarea onChange={(event) => setCreditForm((current) => ({ ...current, notes: event.target.value }))} value={creditForm.notes} />
                </label>
              </div>
              <div className="credential-actions">
                <button className="button" disabled={saving || products.length === 0 || selectedProduct?.inventoryCount === 0} type="submit">
                  <PackagePlus size={16} />
                  {saving ? "Submitting" : isMember ? "Request" : "Request product"}
                </button>
                <button className="button secondary" onClick={() => setIsRequestModalOpen(false)} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <section className="stat-grid">
        {isRequesterAccount ? (
          <>
            <StatCard icon={<ShoppingBag size={20} />} label="Products" value={products.length.toString()} />
            <StatCard icon={<PackagePlus size={20} />} label="Requests" value={creditRequests.length.toString()} />
            <StatCard icon={<HandCoins size={20} />} label="Outstanding" value={formatKes(outstandingCreditCents)} />
            <StatCard icon={<BadgeCheck size={20} />} label="Active" value={creditRequests.filter((request) => canCancelRequest(request)).length.toString()} />
          </>
        ) : isPartnerInvestor ? (
          <>
            <StatCard icon={<ShoppingBag size={20} />} label="Listed products" note="Admin vetted catalog" value={products.length.toString()} />
            <StatCard icon={<Building2 size={20} />} label="Vetted suppliers" note="Green enterprise supply" value={suppliers.length.toString()} />
            <StatCard icon={<PackagePlus size={20} />} label="Applications" note="Group demand" value={creditRequests.length.toString()} />
            <StatCard icon={<HandCoins size={20} />} label="Supported value" note="Investments and donations" value={formatKes(loanReport.summary.principalCents)} />
          </>
        ) : (
          <>
            <StatCard icon={<ShoppingBag size={20} />} label="Products" note="Admin managed catalog" value={products.length.toString()} />
            <StatCard icon={<Building2 size={20} />} label="Suppliers" note="Vetted supply records" value={suppliers.length.toString()} />
            <StatCard icon={<Banknote size={20} />} label="Fulfilled sales" note="Recognized on fulfilment" value={formatKes(salesReport.summary.grossSalesCents)} />
            <StatCard icon={<HandCoins size={20} />} label="Outstanding loans" note="Portfolio balance" value={formatKes(loanReport.summary.outstandingCents)} />
          </>
        )}
      </section>

      <section className="system-workspace store-dashboard-workspace" aria-label="Intelli-Store account workspace">
        <aside className="system-list-panel">
          <nav className="system-list" aria-label="Store workspace views">
            {menuItems.map((item) => (
              <button
                className={`system-list-item ${activePanel === item.key ? "active" : ""}`}
                key={item.key}
                onClick={() => setActivePanel(item.key)}
                type="button"
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </span>
                <span className="pill">{item.count}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="data-card system-view">
          <header>
            <div>
              <h3>{menuItems.find((item) => item.key === activePanel)?.title}</h3>
              <span>{user?.role ?? "Account"} scope</span>
            </div>
            {activePanel === "catalog" && canManageCatalog ? (
              <button className="button secondary" onClick={openCreateProduct} type="button">
                <Plus size={16} />
                Add product
              </button>
            ) : null}
            {activePanel === "suppliers" && canManageCatalog ? (
              <button className="button secondary" onClick={openCreateSupplier} type="button">
                <Building2 size={16} />
                Add supplier
              </button>
            ) : null}
            {activePanel === "requests" && canRequestProducts ? (
              <button className="button" disabled={products.length === 0} onClick={openCreateRequest} type="button">
                <PackagePlus size={16} />
                {isMember ? "Add request" : "Request product"}
              </button>
            ) : null}
          </header>

          {isRequesterAccount && activePanel === "catalog" ? (
            <div className="card-grid">
              {products.map((product) => (
                <article className="record-card with-media" key={product.id}>
                  <div className="record-card-media">
                    <FallbackImage alt="" src={product.imageUrl} />
                  </div>
                  <div className="record-card-body">
                    <header>
                      <div>
                        <h4>{product.name}</h4>
                        <small>{humanizeEnum(product.category)} - {product.programmeLinks.map((link) => link.programme.name).join(", ")}</small>
                      </div>
                      <span className={`pill ${product.inventoryCount === 0 ? "gold" : "blue"}`}>
                        {productInventoryLabel(product)}
                      </span>
                    </header>
                    <div className="record-card-meta">
                      <div>
                        <span>Price</span>
                        <strong>{formatKes(product.priceCents)}</strong>
                      </div>
                      <div>
                        <span>Deposit</span>
                        <strong>{formatKes(product.depositCents)}</strong>
                      </div>
                      <div>
                        <span>Terms</span>
                        <strong>
                          {product.programmeLinks[0]
                            ? `${product.programmeLinks[0].installmentCount ?? 0} ${humanizeEnum(product.programmeLinks[0].installmentFrequency ?? "MONTHLY")}`
                            : "Review"}
                        </strong>
                      </div>
                      <div>
                        <span>Status</span>
                        <strong>{humanizeEnum(product.status)}</strong>
                      </div>
                    </div>
                    <div className="record-card-actions">
                      <button className="button" disabled={product.inventoryCount === 0} onClick={() => openRequestForProduct(product)} type="button">
                        <PackagePlus size={16} />
                        Request
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {products.length === 0 ? <div className="empty-state">No products</div> : null}
            </div>
          ) : null}

          {!isRequesterAccount && activePanel === "catalog" ? (
            <CollectionView
              count={dashboardProducts.length}
              label="products"
              cards={
                <div className="card-grid">
                  {dashboardProducts.map((product) => (
                    <article className="record-card with-media" key={product.id}>
                      <div className="record-card-media">
                        <FallbackImage alt="" src={product.imageUrl} />
                      </div>
                      <div className="record-card-body">
                        <header>
                          <div>
                            <h4>{product.name}</h4>
                            <small>{humanizeEnum(product.category)} - {product.supplierName}</small>
                          </div>
                          <span className={`pill ${product.inventoryCount === 0 ? "gold" : "blue"}`}>
                            {productInventoryLabel(product)}
                          </span>
                        </header>
                        <div className="record-card-meta">
                          <div>
                            <span>Price</span>
                            <strong>{formatKes(product.priceCents)}</strong>
                          </div>
                          <div>
                            <span>Deposit</span>
                            <strong>{formatKes(product.depositCents)}</strong>
                          </div>
                          <div>
                            <span>Programs</span>
                            <strong>{product.programmes || "Unassigned"}</strong>
                          </div>
                          <div>
                            <span>Status</span>
                            <strong>{humanizeEnum(product.status)}</strong>
                          </div>
                        </div>
                        {canManageCatalog ? (
                          <div className="record-card-actions">
                            <button className="button secondary" onClick={() => openEditProduct(product)} type="button">
                              <Pencil size={16} />
                              Edit
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                  {dashboardProducts.length === 0 ? <div className="empty-state">No products</div> : null}
                </div>
              }
              list={
                <DataTable
                  columns={[
                {
                  key: "product",
                  header: "Product",
                  value: (product) => `${product.name} ${product.category}`,
                  cell: (product) => (
                    <>
                      <strong>{product.name}</strong>
                      <br />
                      <span>{humanizeEnum(product.category)} - {product.supplierName}</span>
                    </>
                  )
                },
                {
                  key: "price",
                  header: "Price",
                  value: (product) => product.priceCents,
                  cell: (product) => <strong>{formatKes(product.priceCents)}</strong>
                },
                {
                  key: "deposit",
                  header: "Deposit",
                  value: (product) => product.depositCents,
                  cell: (product) => formatKes(product.depositCents)
                },
                {
                  key: "programmes",
                  header: "Programs",
                  value: (product) => product.programmes
                },
                {
                  key: "defaultVa",
                  header: "Default VA",
                  value: (product) =>
                    product.programmeLinks
                      .flatMap((link) => link.defaultAgents ?? [])
                      .filter((link) => link.isPrimary)
                      .map((link) => link.villageAgent.name)
                      .join(", ") || "Auto fallback"
                },
                {
                  key: "terms",
                  header: "Terms",
                  value: (product) => product.programmeLinks[0]?.installmentCount ?? 0,
                  cell: (product) => {
                    const terms = product.programmeLinks[0];
                    return terms ? `${terms.installmentCount ?? 0} ${humanizeEnum(terms.installmentFrequency ?? "MONTHLY")}, ${bpsToPercentInput(terms.flatInterestRateBps)}% flat` : "Not set";
                  }
                },
                {
                  key: "status",
                  header: "Status",
                  value: (product) => product.status,
                  cell: (product) => <span className="pill">{humanizeEnum(product.status)}</span>
                },
                {
                  key: "inventory",
                  header: "Inventory",
                  value: (product) => product.inventoryCount ?? "Open stock",
                  cell: (product) => (
                    <span className={`pill ${product.inventoryCount === 0 ? "gold" : "blue"}`}>
                      {productInventoryLabel(product)}
                    </span>
                  )
                },
                {
                  key: "actions",
                  header: "Actions",
                  value: () => "",
                  searchable: false,
                  sortable: false,
                  exportable: false,
                  cell: (product) =>
                    canManageCatalog ? (
                      <button className="button secondary" onClick={() => openEditProduct(product)} type="button">
                        <Pencil size={16} />
                        Edit
                      </button>
                    ) : isMember && canRequestProducts ? (
                      <button className="button secondary" disabled={product.inventoryCount === 0} onClick={() => openRequestForProduct(product)} type="button">
                        <PackagePlus size={16} />
                        Request
                      </button>
                    ) : (
                      "Scoped view"
                    )
                }
              ]}
              exportName="intelli-store-products"
              filters={[
                {
                  key: "supplier",
                  label: "Supplier",
                  allLabel: "All suppliers",
                  getValue: (product) => product.supplierName
                },
                {
                  key: "status",
                  label: "Status",
                  allLabel: "All statuses",
                  getValue: (product) => product.status,
                  options: productStatuses.map((status) => ({ label: humanizeEnum(status), value: status }))
                }
              ]}
              getRowKey={(product) => product.id}
              rows={dashboardProducts}
              title="Store Products"
                />
              }
            />
          ) : null}

          {activePanel === "suppliers" ? (
            <DataTable
              columns={[
                {
                  key: "supplier",
                  header: "Supplier",
                  value: (supplier) => `${supplier.name} ${supplier.contactName ?? ""}`,
                  cell: (supplier) => (
                    <>
                      <strong>{supplier.name}</strong>
                      <br />
                      <span>{supplier.contactName ?? "No contact"} {supplier.contactPhone ? `- ${supplier.contactPhone}` : ""}</span>
                    </>
                  )
                },
                { key: "email", header: "Email", value: (supplier) => supplier.contactEmail ?? "" },
                { key: "county", header: "County", value: (supplier) => supplier.county ?? "" },
                { key: "location", header: "Location", value: (supplier) => supplier.location ?? "" },
                {
                  key: "products",
                  header: "Products",
                  value: (supplier) => supplier._count?.products ?? 0
                },
                {
                  key: "status",
                  header: "Status",
                  value: (supplier) => supplier.status,
                  cell: (supplier) => <span className="pill">{humanizeEnum(supplier.status)}</span>
                },
                {
                  key: "actions",
                  header: "Actions",
                  value: () => "",
                  searchable: false,
                  sortable: false,
                  exportable: false,
                  cell: (supplier) =>
                    canManageCatalog ? (
                      <button className="button secondary" onClick={() => openEditSupplier(supplier)} type="button">
                        <Pencil size={16} />
                        Edit
                      </button>
                    ) : (
                      "Scoped view"
                    )
                }
              ]}
              exportName="intelli-store-suppliers"
              filters={[
                {
                  key: "status",
                  label: "Status",
                  allLabel: "All statuses",
                  getValue: (supplier) => supplier.status,
                  options: supplierStatuses.map((status) => ({ label: humanizeEnum(status), value: status }))
                }
              ]}
              getRowKey={(supplier) => supplier.id}
              rows={suppliers}
              title="Store Suppliers"
            />
          ) : null}

          {isRequesterAccount && activePanel === "requests" ? (
            <div className="store-action-list">
              {creditRequests.map((request) => (
                <article className="store-action-card" key={request.id}>
                  <header>
                    <span>
                      <strong>{request.product?.name ?? "Product request"}</strong>
                      <small>{formatKes(request.requestedAmountCents)} - {humanizeEnum(request.repaymentStatus)}</small>
                    </span>
                    <span className="pill">{humanizeEnum(request.status)}</span>
                  </header>
                  <div className="report-summary-strip">
                    <div>
                      <span>Quantity</span>
                      <strong>{request.quantity}</strong>
                    </div>
                    <div>
                      <span>Deposit</span>
                      <strong>{formatKes(request.depositCents)}</strong>
                    </div>
                    <div>
                      <span>Due</span>
                      <strong>{formatKes(requestOutstandingCents(request))}</strong>
                    </div>
                  </div>
                  {canCancelRequest(request) ? (
                    <button className="button secondary" disabled={busyId === `cancel-${request.id}`} onClick={() => cancelCreditRequest(request)} type="button">
                      <X size={15} />
                      {busyId === `cancel-${request.id}` ? "Cancelling" : "Cancel"}
                    </button>
                  ) : null}
                </article>
              ))}
              {creditRequests.length === 0 ? <div className="empty-state">No requests</div> : null}
            </div>
          ) : null}

          {!isRequesterAccount && activePanel === "requests" ? (
            <DataTable
              columns={[
                {
                  key: "buyer",
                  header: "Buyer",
                  value: (request) => `${request.customerName} ${request.customerEmail} ${request.groupName ?? ""}`,
                  cell: (request) => (
                    <>
                      <strong>{request.customerName}</strong>
                      <br />
                      <span>{request.groupName ?? request.customerEmail}</span>
                    </>
                  )
                },
                {
                  key: "product",
                  header: "Product",
                  value: (request) => `${request.product?.name ?? request.productId} ${request.quantity}`,
                  cell: (request) => (
                    <>
                      <strong>{request.product?.name ?? "Product"}</strong>
                      <br />
                      <span>{request.quantity} x {formatKes(request.product?.priceCents ?? 0)}</span>
                    </>
                  )
                },
                {
                  key: "amount",
                  header: "Amount",
                  value: (request) => request.requestedAmountCents,
                  cell: (request) => <strong>{formatKes(request.requestedAmountCents)}</strong>
                },
                {
                  key: "status",
                  header: "Status",
                  value: (request) => request.status,
                  cell: (request) => <span className="pill">{humanizeEnum(request.status)}</span>
                },
                {
                  key: "agent",
                  header: "Distribution",
                  value: (request) => request.distributionAgent?.name ?? "Unassigned"
                },
                ...(isMember
                  ? [
                      {
                        key: "actions",
                        header: "Actions",
                        value: (request: StoreCreditRequest) => request.status,
                        searchable: false,
                        sortable: false,
                        exportable: false,
                        cell: (request: StoreCreditRequest) =>
                          canCancelRequest(request) ? (
                            <button className="button secondary" disabled={busyId === `cancel-${request.id}`} onClick={() => cancelCreditRequest(request)} type="button">
                              <X size={15} />
                              {busyId === `cancel-${request.id}` ? "Cancelling" : "Cancel"}
                            </button>
                          ) : (
                            "View"
                          )
                      }
                    ]
                  : [])
              ]}
              defaultSort={{ key: "amount", direction: "desc" }}
              exportName="intelli-store-credit-requests"
              filters={[
                {
                  key: "status",
                  label: "Status",
                  allLabel: "All statuses",
                  getValue: (request) => request.status,
                  options: requestStatuses.map((status) => ({ label: humanizeEnum(status), value: status }))
                }
              ]}
              getRowKey={(request) => request.id}
              rows={creditRequests}
              title="Product Requests"
            />
          ) : null}

          {!isRequesterAccount && activePanel === "distribution" ? (
            <div className="store-action-list">
              {fulfillmentQueue.map((request) => {
                const form = actionForms[request.id] ?? defaultActionForm(request);
                return (
                  <article className="store-action-card" key={request.id}>
                    <header>
                      <span>
                        <strong>{request.product?.name ?? "Product request"}</strong>
                        <small>{request.customerName} - {formatKes(request.requestedAmountCents)}</small>
                      </span>
                      <span className="pill">{formatKes(request.commissionCents ?? 0)} commission</span>
                    </header>
                    <div className="credential-grid">
                      <label className="credential-field">
                        <span>Status</span>
                        <select disabled={!canManageDistribution} onChange={(event) => updateActionForm(request.id, { status: event.target.value })} value={form.status}>
                          {requestStatuses.map((status) => (
                            <option key={status} value={status}>
                              {humanizeEnum(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="credential-field">
                        <span>VA / CBT</span>
                        <select disabled={!canManageDistribution} onChange={(event) => updateActionForm(request.id, { distributionAgentId: event.target.value })} value={form.distributionAgentId}>
                          <option value="">Unassigned</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="credential-field">
                        <span>Commission bps</span>
                        <input disabled={!canManageDistribution} min="0" max="5000" onChange={(event) => updateActionForm(request.id, { commissionRateBps: event.target.value })} type="number" value={form.commissionRateBps} />
                      </label>
                    </div>
                    {canManageDistribution ? (
                      <button className="button" disabled={busyId === request.id} onClick={() => updateCreditRequest(request)} type="button">
                        <Truck size={16} />
                        {busyId === request.id ? "Saving" : "Save distribution"}
                      </button>
                    ) : null}
                  </article>
                );
              })}
              {fulfillmentQueue.length === 0 ? <div className="empty-state">No work</div> : null}
            </div>
          ) : null}

          {!isRequesterAccount && activePanel === "finance" ? (
            <div className="store-action-list">
              {financingQueue.map((request) => {
                const form = actionForms[request.id] ?? defaultActionForm(request);
                const repaymentForm = repaymentForms[request.id] ?? defaultRepaymentForm();
                return (
                  <article className="store-action-card" key={request.id}>
                    <header>
                      <span>
                        <strong>{request.product?.name ?? "Product request"}</strong>
                        <small>{request.customerName} - {request.programme?.name ?? "Program"}</small>
                      </span>
                      <span className="pill">
                        {formatKes(Math.max(0, request.requestedAmountCents - request.depositCents))} {isPartnerInvestor ? "support" : "loan"}
                      </span>
                    </header>
                    <div className="credential-grid">
                      <label className="credential-field">
                        <span>Status</span>
                        <select disabled={!canUpdateStoreStatus} onChange={(event) => updateActionForm(request.id, { status: event.target.value })} value={form.status}>
                          {requestStatuses.map((status) => (
                            <option key={status} value={status}>
                              {humanizeEnum(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="credential-field">
                        <span>{isPartnerInvestor ? "Investor / donor" : "Financier"}</span>
                        <select disabled={!canFinance} onChange={(event) => updateActionForm(request.id, { financierPartnerId: event.target.value })} value={form.financierPartnerId}>
                          <option value="">Not financed</option>
                          {partners.map((partner) => (
                            <option key={partner.id} value={partner.id}>
                              {partner.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="credential-field">
                        <span>Repayment</span>
                        <select disabled={!canUpdateStoreStatus} onChange={(event) => updateActionForm(request.id, { repaymentStatus: event.target.value })} value={form.repaymentStatus}>
                          {repaymentStatuses.map((status) => (
                            <option key={status} value={status}>
                              {humanizeEnum(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="credential-field wide-field">
                        <span>Review notes</span>
                        <textarea disabled={!canFinance} onChange={(event) => updateActionForm(request.id, { reviewNotes: event.target.value })} value={form.reviewNotes} />
                      </label>
                    </div>
                    {canFinance ? (
                      <button className="button" disabled={busyId === request.id} onClick={() => updateCreditRequest(request)} type="button">
                        <HandCoins size={16} />
                        {busyId === request.id ? "Saving" : isPartnerInvestor ? "Save support" : "Save financing"}
                      </button>
                    ) : null}

                    {request.installments && request.installments.length > 0 ? (
                      <div className="store-installment-grid">
                        {request.installments.map((installment) => (
                          <span className="pill" key={installment.id}>
                            #{installment.sequence} {formatShortDate(installment.dueDate)} {formatKes(installment.paidCents)}/{formatKes(installment.totalDueCents)}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {canRecordRepayments && request.financierPartnerId ? (
                      <div className="credential-grid">
                        <label className="credential-field">
                          <span>Installment</span>
                          <select onChange={(event) => updateRepaymentForm(request.id, { installmentId: event.target.value })} value={repaymentForm.installmentId}>
                            <option value="">Oldest unpaid</option>
                            {(request.installments ?? []).map((installment) => (
                              <option key={installment.id} value={installment.id}>
                                #{installment.sequence} due {formatShortDate(installment.dueDate)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="credential-field">
                          <span>Amount (KES)</span>
                          <input min="1" onChange={(event) => updateRepaymentForm(request.id, { amountKes: event.target.value })} step="1" type="number" value={repaymentForm.amountKes} />
                        </label>
                        <label className="credential-field">
                          <span>Source</span>
                          <select onChange={(event) => updateRepaymentForm(request.id, { source: event.target.value })} value={repaymentForm.source}>
                            <option value="MANUAL">Manual</option>
                            <option value="EXTERNAL_REFERENCE">External reference</option>
                          </select>
                        </label>
                        <label className="credential-field">
                          <span>Provider</span>
                          <input onChange={(event) => updateRepaymentForm(request.id, { provider: event.target.value })} value={repaymentForm.provider} />
                        </label>
                        <label className="credential-field">
                          <span>Reference</span>
                          <input onChange={(event) => updateRepaymentForm(request.id, { providerReference: event.target.value })} value={repaymentForm.providerReference} />
                        </label>
                        <label className="credential-field wide-field">
                          <span>Repayment notes</span>
                          <textarea onChange={(event) => updateRepaymentForm(request.id, { notes: event.target.value })} value={repaymentForm.notes} />
                        </label>
                        <button className="button secondary" disabled={busyId === `repayment-${request.id}` || !repaymentForm.amountKes} onClick={() => postRepayment(request)} type="button">
                          <ReceiptText size={16} />
                          {busyId === `repayment-${request.id}` ? "Posting" : "Post repayment"}
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {financingQueue.length === 0 ? <div className="empty-state">No records</div> : null}
            </div>
          ) : null}

          {isRequesterAccount && activePanel === "portfolio" ? (
            <div className="store-action-list">
              {creditRequests.map((request) => (
                <article className="store-action-card" key={request.id}>
                  <header>
                    <span>
                      <strong>{request.product?.name ?? "Product request"}</strong>
                      <small>{formatKes(request.requestedAmountCents)} - {humanizeEnum(request.repaymentStatus)}</small>
                    </span>
                    <span className="pill">{formatKes(requestOutstandingCents(request))} due</span>
                  </header>
                  {request.installments && request.installments.length > 0 ? (
                    <div className="store-installment-grid">
                      {request.installments.map((installment) => (
                        <span className="pill" key={installment.id}>
                          #{installment.sequence} {formatShortDate(installment.dueDate)} {formatKes(installment.paidCents)}/{formatKes(installment.totalDueCents)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">No repayment schedule</div>
                  )}
                </article>
              ))}
              {creditRequests.length === 0 ? <div className="empty-state">No credit</div> : null}
            </div>
          ) : null}

          {!isRequesterAccount && (activePanel === "sales" || activePanel === "portfolio") ? (
            <section className="report-filter-panel">
              <div className="credential-grid">
                <label className="table-filter compact-filter" title="Start date">
                  <CalendarDays aria-hidden="true" size={15} />
                  <span className="sr-only">Start date</span>
                  <input aria-label="Start date" onChange={(event) => setReportFilters((current) => ({ ...current, startDate: event.target.value }))} type="date" value={reportFilters.startDate} />
                </label>
                <label className="table-filter compact-filter" title="End date">
                  <CalendarDays aria-hidden="true" size={15} />
                  <span className="sr-only">End date</span>
                  <input aria-label="End date" onChange={(event) => setReportFilters((current) => ({ ...current, endDate: event.target.value }))} type="date" value={reportFilters.endDate} />
                </label>
                <label className="table-filter compact-filter" title="Supplier">
                  <SlidersHorizontal aria-hidden="true" size={15} />
                  <span className="sr-only">Supplier</span>
                  <select aria-label="Supplier" onChange={(event) => setReportFilters((current) => ({ ...current, supplierId: event.target.value }))} value={reportFilters.supplierId}>
                    <option value="">All suppliers</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="table-filter compact-filter" title="Product">
                  <SlidersHorizontal aria-hidden="true" size={15} />
                  <span className="sr-only">Product</span>
                  <select aria-label="Product" onChange={(event) => setReportFilters((current) => ({ ...current, productId: event.target.value }))} value={reportFilters.productId}>
                    <option value="">All products</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="table-filter compact-filter" title="Program">
                  <SlidersHorizontal aria-hidden="true" size={15} />
                  <span className="sr-only">Program</span>
                  <select aria-label="Program" onChange={(event) => setReportFilters((current) => ({ ...current, programmeId: event.target.value }))} value={reportFilters.programmeId}>
                    <option value="">All programs</option>
                    {programmes.map((programme) => (
                      <option key={programme.id} value={programme.id}>
                        {programme.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="table-filter compact-filter" title="VA / CBT">
                  <SlidersHorizontal aria-hidden="true" size={15} />
                  <span className="sr-only">VA / CBT</span>
                  <select aria-label="VA / CBT" onChange={(event) => setReportFilters((current) => ({ ...current, agentId: event.target.value }))} value={reportFilters.agentId}>
                    <option value="">All VAs</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="table-filter compact-filter" title="Financier">
                  <SlidersHorizontal aria-hidden="true" size={15} />
                  <span className="sr-only">Financier</span>
                  <select aria-label="Financier" onChange={(event) => setReportFilters((current) => ({ ...current, financierPartnerId: event.target.value }))} value={reportFilters.financierPartnerId}>
                    <option value="">All financiers</option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="table-filter compact-filter" title="Status">
                  <SlidersHorizontal aria-hidden="true" size={15} />
                  <span className="sr-only">Status</span>
                  <select aria-label="Status" onChange={(event) => setReportFilters((current) => ({ ...current, status: event.target.value }))} value={reportFilters.status}>
                    <option value="">All statuses</option>
                    {[...requestStatuses, ...repaymentStatuses].map((status) => (
                      <option key={status} value={status}>
                        {humanizeEnum(status)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          ) : null}

          {!isRequesterAccount && activePanel === "sales" ? (
            <>
              <section className="report-summary-strip" aria-label="Sales report summary">
                <div>
                  <span>Fulfilled requests</span>
                  <strong>{salesReport.summary.fulfilledRequests}</strong>
                </div>
                <div>
                  <span>Units sold</span>
                  <strong>{salesReport.summary.quantity}</strong>
                </div>
                <div>
                  <span>Gross sales</span>
                  <strong>{formatKes(salesReport.summary.grossSalesCents)}</strong>
                </div>
                <div>
                  <span>Commissions</span>
                  <strong>{formatKes(salesReport.summary.commissionCents)}</strong>
                </div>
              </section>
              <DataTable
                columns={[
                  { key: "fulfilledAt", header: "Date", value: (row) => row.fulfilledAt ?? "", cell: (row) => formatShortDate(row.fulfilledAt) },
                  { key: "product", header: "Product", value: (row) => row.productName },
                  { key: "supplier", header: "Supplier", value: (row) => row.supplierName },
                  { key: "programme", header: "Program", value: (row) => row.programmeName },
                  { key: "va", header: "VA", value: (row) => row.vaName },
                  { key: "quantity", header: "Qty", value: (row) => row.quantity },
                  { key: "gross", header: "Gross", value: (row) => row.grossSalesCents, cell: (row) => formatKes(row.grossSalesCents) },
                  { key: "deposit", header: "Deposits", value: (row) => row.depositCents, cell: (row) => formatKes(row.depositCents) },
                  { key: "financed", header: "Financed", value: (row) => row.financedValueCents, cell: (row) => formatKes(row.financedValueCents) },
                  { key: "commission", header: "Commission", value: (row) => row.commissionCents, cell: (row) => formatKes(row.commissionCents) }
                ]}
                defaultSort={{ key: "fulfilledAt", direction: "desc" }}
                exportName="intelli-store-sales-report"
                filters={[
                  { key: "supplier", label: "Supplier", allLabel: "All suppliers", getValue: (row) => row.supplierName },
                  { key: "programme", label: "Program", allLabel: "All programs", getValue: (row) => row.programmeName },
                  { key: "va", label: "VA", allLabel: "All VAs", getValue: (row) => row.vaName }
                ]}
                getRowKey={(row) => row.id}
                rows={salesReport.rows}
                title="Sales Report"
              />
            </>
          ) : null}

          {!isRequesterAccount && activePanel === "portfolio" ? (
            <>
              <section className="report-summary-strip" aria-label="Loan portfolio summary">
                <div>
                  <span>Principal</span>
                  <strong>{formatKes(loanReport.summary.principalCents)}</strong>
                </div>
                <div>
                  <span>Interest</span>
                  <strong>{formatKes(loanReport.summary.interestCents)}</strong>
                </div>
                <div>
                  <span>Outstanding</span>
                  <strong>{formatKes(loanReport.summary.outstandingCents)}</strong>
                </div>
                <div>
                  <span>Overdue</span>
                  <strong>{formatKes(loanReport.summary.overdueCents)}</strong>
                </div>
                <div>
                  <span>Current</span>
                  <strong>{formatKes(loanReport.summary.aging.currentCents)}</strong>
                </div>
                <div>
                  <span>1-30 days</span>
                  <strong>{formatKes(loanReport.summary.aging.days1To30Cents)}</strong>
                </div>
                <div>
                  <span>31-60 days</span>
                  <strong>{formatKes(loanReport.summary.aging.days31To60Cents)}</strong>
                </div>
                <div>
                  <span>90+ days</span>
                  <strong>{formatKes(loanReport.summary.aging.days90PlusCents)}</strong>
                </div>
              </section>
              <DataTable
                columns={[
                  { key: "financedAt", header: "Financed", value: (row) => row.financedAt ?? "", cell: (row) => formatShortDate(row.financedAt) },
                  {
                    key: "borrower",
                    header: "Borrower",
                    value: (row) => `${row.customerName} ${row.groupName ?? ""}`,
                    cell: (row) => (
                      <>
                        <strong>{row.customerName}</strong>
                        <br />
                        <span>{row.groupName ?? row.programmeName}</span>
                      </>
                    )
                  },
                  { key: "product", header: "Product", value: (row) => row.productName },
                  { key: "supplier", header: "Supplier", value: (row) => row.supplierName },
                  { key: "financier", header: "Financier", value: (row) => row.financierName },
                  { key: "principal", header: "Principal", value: (row) => row.principalCents, cell: (row) => formatKes(row.principalCents) },
                  { key: "interest", header: "Interest", value: (row) => row.interestCents, cell: (row) => formatKes(row.interestCents) },
                  { key: "due", header: "Total due", value: (row) => row.totalDueCents, cell: (row) => formatKes(row.totalDueCents) },
                  { key: "paid", header: "Paid", value: (row) => row.paidCents, cell: (row) => formatKes(row.paidCents) },
                  { key: "outstanding", header: "Outstanding", value: (row) => row.outstandingCents, cell: (row) => <strong>{formatKes(row.outstandingCents)}</strong> },
                  { key: "aging", header: "Aging", value: (row) => row.agingBucket, cell: (row) => <span className="pill">{row.agingBucket}</span> }
                ]}
                defaultSort={{ key: "outstanding", direction: "desc" }}
                exportName="intelli-store-loan-portfolio"
                filters={[
                  { key: "supplier", label: "Supplier", allLabel: "All suppliers", getValue: (row) => row.supplierName },
                  { key: "financier", label: "Financier", allLabel: "All financiers", getValue: (row) => row.financierName },
                  { key: "aging", label: "Aging", allLabel: "All aging", getValue: (row) => row.agingBucket }
                ]}
                getRowKey={(row) => row.id}
                rows={loanReport.rows}
                title="Loan Portfolio"
              />
            </>
          ) : null}

          {!isRequesterAccount && activePanel === "bookings" ? (
            <DataTable
              columns={[
                {
                  key: "customer",
                  header: "Customer",
                  value: (request) => `${request.customerName} ${request.customerEmail} ${request.groupName ?? ""}`,
                  cell: (request) => (
                    <>
                      <strong>{request.customerName}</strong>
                      <br />
                      <span>{request.groupName ?? request.customerEmail}</span>
                    </>
                  )
                },
                { key: "service", header: "Service", value: (request) => request.serviceType },
                { key: "agent", header: "VA / CBT", value: (request) => request.villageAgent?.name ?? "Programme support" },
                {
                  key: "status",
                  header: "Status",
                  value: (request) => request.status,
                  cell: (request) => <span className="pill">{humanizeEnum(request.status)}</span>
                },
                {
                  key: "actions",
                  header: "Actions",
                  value: (request) => request.status,
                  exportable: false,
                  cell: (request) =>
                    canManageDistribution ? (
                      <div className="table-action-row">
                        <button className="button secondary" disabled={busyId === request.id} onClick={() => updateBookingRequest(request, "APPROVED")} type="button">
                          <BadgeCheck size={15} />
                          Approve
                        </button>
                        <button className="button secondary" disabled={busyId === request.id} onClick={() => updateBookingRequest(request, "FULFILLED")} type="button">
                          <UsersRound size={15} />
                          Fulfil
                        </button>
                      </div>
                    ) : (
                      "Scoped view"
                    )
                }
              ]}
              exportName="intelli-store-booking-requests"
              getRowKey={(request) => request.id}
              rows={bookingRequests}
              title="Agent Bookings"
            />
          ) : null}
        </section>
      </section>
    </>
  );
}
