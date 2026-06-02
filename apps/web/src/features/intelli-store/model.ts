import type {
  StoreCreditRequest,
  StoreLoanPortfolioReport,
  StoreProduct,
  StoreSalesReport,
  User
} from "../../types/dashboard";

export const requestStatuses = ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "FULFILLED", "CANCELLED"];
export const repaymentStatuses = ["NOT_FINANCED", "FINANCED", "PARTIALLY_PAID", "PAID", "DEFAULTED"];
export const productStatuses = ["ACTIVE", "INACTIVE", "ARCHIVED"];
export const supplierStatuses = ["ACTIVE", "INACTIVE"];
export const installmentFrequencies = ["WEEKLY", "BIWEEKLY", "MONTHLY"];
export const productCategories = [
  "AGRI_EQUIPMENT",
  "FARM_INPUTS",
  "POULTRY",
  "DAIRY",
  "RETAIL_STOCK",
  "TRAINING_SERVICE"
];

export type ActivePanel =
  | "catalog"
  | "suppliers"
  | "requests"
  | "distribution"
  | "finance"
  | "sales"
  | "portfolio"
  | "bookings";

export const defaultCreditForm = {
  productId: "",
  programmeId: "",
  distributionAgentId: "",
  customerName: "",
  customerEmail: "",
  phoneNumber: "",
  county: "",
  groupName: "",
  quantity: "1",
  notes: ""
};

export const defaultProductForm = {
  name: "",
  category: "AGRI_EQUIPMENT",
  status: "ACTIVE",
  supplierId: "",
  sellerName: "",
  priceKes: "",
  depositKes: "",
  inventoryCount: "",
  imageUrl: "",
  programmeIds: [] as string[],
  creditTerms: "",
  depositRatePercent: "10",
  installmentCount: "6",
  installmentFrequency: "MONTHLY",
  flatInterestRatePercent: "0",
  gracePeriodDays: "30",
  defaultAgentIds: [] as string[],
  primaryAgentId: "",
  creditSummary: "",
  fulfilmentSummary: "",
  description: ""
};

export const defaultSupplierForm = {
  name: "",
  status: "ACTIVE",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  county: "",
  location: "",
  notes: ""
};

export const defaultReportFilters = {
  startDate: "",
  endDate: "",
  supplierId: "",
  productId: "",
  programmeId: "",
  agentId: "",
  financierPartnerId: "",
  status: ""
};

export const emptySalesReport: StoreSalesReport = {
  summary: {
    fulfilledRequests: 0,
    quantity: 0,
    grossSalesCents: 0,
    depositCents: 0,
    financedValueCents: 0,
    commissionCents: 0
  },
  rows: []
};

export const emptyLoanReport: StoreLoanPortfolioReport = {
  summary: {
    principalCents: 0,
    interestCents: 0,
    totalDueCents: 0,
    paidCents: 0,
    outstandingCents: 0,
    overdueCents: 0,
    aging: {
      currentCents: 0,
      days1To30Cents: 0,
      days31To60Cents: 0,
      days61To90Cents: 0,
      days90PlusCents: 0
    }
  },
  rows: []
};

export type RequestActionForm = {
  status: string;
  repaymentStatus: string;
  distributionAgentId: string;
  financierPartnerId: string;
  commissionRateBps: string;
  reviewNotes: string;
};

export type RepaymentForm = {
  installmentId: string;
  amountKes: string;
  source: string;
  provider: string;
  providerReference: string;
  notes: string;
};

export function defaultActionForm(request: StoreCreditRequest): RequestActionForm {
  return {
    status: request.status,
    repaymentStatus: request.repaymentStatus ?? "NOT_FINANCED",
    distributionAgentId: request.distributionAgentId ?? "",
    financierPartnerId: request.financierPartnerId ?? "",
    commissionRateBps: String(request.commissionRateBps ?? 500),
    reviewNotes: request.reviewNotes ?? ""
  };
}

export function defaultRepaymentForm(): RepaymentForm {
  return {
    installmentId: "",
    amountKes: "",
    source: "MANUAL",
    provider: "",
    providerReference: "",
    notes: ""
  };
}

export function roleSurface(user: User | null) {
  if (!user) return "Intelli-Store";
  if (user.role === "MEMBER") return "My Store";
  if (user.role === "GROUP_ACCOUNT") return "My Requests";
  if (user.role === "PARTNER_OFFICER" || user.role === "LENDER") return "Supplier investment desk";
  return "Intelli-Store";
}

export function centsToKesInput(cents: number) {
  const amount = cents / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function kesInputToCents(value: string) {
  return Math.round(Number(value || "0") * 100);
}

export function bpsToPercentInput(value?: number) {
  const amount = (value ?? 0) / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function percentInputToBps(value: string) {
  return Math.round(Number(value || "0") * 100);
}

export function productInventoryLabel(product: StoreProduct) {
  if (product.inventoryCount === null || product.inventoryCount === undefined) return "Open stock";
  if (product.inventoryCount === 0) return "Out of stock";
  return `${product.inventoryCount} in stock`;
}

export function dateInputToStart(value: string) {
  return value ? `${value}T00:00:00.000Z` : "";
}

export function dateInputToEnd(value: string) {
  return value ? `${value}T23:59:59.999Z` : "";
}

export function formatShortDate(value?: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString();
}

export function requestOutstandingCents(request: StoreCreditRequest) {
  if (request.installments && request.installments.length > 0) {
    return request.installments.reduce(
      (sum, installment) => sum + Math.max(0, installment.totalDueCents - installment.paidCents),
      0
    );
  }

  const repaidCents = request.repayments?.reduce((sum, repayment) => sum + repayment.amountCents, 0) ?? 0;
  return Math.max(0, (request.financedAmountCents ?? 0) - repaidCents);
}

export function canCancelRequest(request: StoreCreditRequest) {
  return ["PENDING", "UNDER_REVIEW", "APPROVED"].includes(request.status);
}
