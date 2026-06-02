export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  avatarUrl?: string | null;
  languagePreference?: string | null;
  partnerId?: string | null;
  groupId?: string | null;
  memberId?: string | null;
  permissions?: string[];
  partner?: { id: string; name: string } | null;
  group?: { id: string; name: string; code: string } | null;
  member?: { id: string; fullName: string; phone: string } | null;
  createdAt?: string;
}

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  href?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface GroupRow {
  id: string;
  name: string;
  code: string;
  phase: string;
  county: string;
  subCounty?: string | null;
  location?: string | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  gpsRadiusMeters?: number | null;
  shareValueCents?: number;
  maxSharesPerMemberPerMeeting?: number;
  constitutionVersion?: string;
  cycleNumber?: number;
  composition?: string | null;
  objective?: string | null;
  contactPersonName?: string | null;
  contactPhone?: string | null;
  onboardingFeedback?: string | null;
  meetingDay?: string | null;
  sourceSystem?: string | null;
  sourceReference?: string | null;
  villageAgent?: { id?: string; name: string } | null;
  programme?: { id?: string; name: string; partner?: { name: string } | null } | null;
  fundAccounts?: Array<{ id: string; type: string; balanceCents: number; currency: string }>;
  programmeLinks?: Array<{
    id: string;
    role: string;
    programme: ProgrammeRow;
  }>;
  creditScores: Array<{ score: number; computedAt?: string }>;
  _count: {
    members: number;
    meetings: number;
    votes: number;
    ledgerEntries?: number;
  };
}

export interface PartnerRow {
  id: string;
  name: string;
  type: string;
  status: string;
  apiScope: string;
  county?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  valueProposition?: string | null;
  capacity?: string | null;
  linkageType?: string | null;
  sourceSystem?: string | null;
  sourceReference?: string | null;
  _count: {
    programmes: number;
    programmeLinks?: number;
    users: number;
    webhookSubscriptions: number;
  };
}

export interface ProgrammeRow {
  id: string;
  name: string;
  country: string;
  county?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  publicSlug?: string | null;
  publicStatus?: string;
  fundingGoalCents?: number;
  fundingRaisedCents?: number;
  investmentCents?: number;
  donationCents?: number;
  fundingSummary?: string | null;
  impactSummary?: string | null;
  fundingDeadline?: string | null;
  allowInvestments?: boolean;
  allowDonations?: boolean;
  sourceSystem?: string | null;
  sourceReference?: string | null;
  partner: PartnerRow;
  partnerLinks?: Array<{ id: string; role: string; partner: PartnerRow }>;
  assets?: ProgrammeAsset[];
  groupLinks?: Array<{
    id: string;
    role: string;
    group: { id: string; name: string; code: string; county: string; phase: string };
  }>;
  _count: {
    groups: number;
    villageAgents: number;
    partnerLinks?: number;
    groupLinks?: number;
  };
}

export interface ProgrammeAsset {
  id: string;
  programmeId: string;
  type: "IMAGE" | "FILE" | string;
  visibility: "PUBLIC" | "PRIVATE" | string;
  title: string;
  description?: string | null;
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
  createdAt: string;
}

export interface PartnerSignupRequest {
  id: string;
  organizationName: string;
  organizationType: string;
  requestedRole: string;
  requestedPartnerType: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  county?: string | null;
  groupSubCounty?: string | null;
  groupLocation?: string | null;
  groupMeetingDay?: string | null;
  groupObjective?: string | null;
  estimatedMembers?: number | null;
  championRole?: string | null;
  assignedVillageAgentId?: string | null;
  assignedVillageAgent?: AgentRow | null;
  fieldVisitStatus?: string | null;
  fieldVisitNotes?: string | null;
  fieldVisitScheduledAt?: string | null;
  fieldVisitedAt?: string | null;
  fieldVisitReviewedByUserId?: string | null;
  valueProposition?: string | null;
  status: string;
  reviewNotes?: string | null;
  createdGroupId?: string | null;
  createdMemberId?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  createdPartner?: PartnerRow | null;
}

export interface PartnerWallet {
  id: string;
  partnerId: string;
  balanceCents: number;
  heldCents: number;
  availableCents: number;
  currency: string;
}

export interface PartnerWalletTransaction {
  id: string;
  walletId?: string | null;
  partnerId?: string | null;
  programmeId?: string | null;
  type: string;
  provider: string;
  source: string;
  status: string;
  amountCents: number;
  currency: string;
  description?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  phoneNumber?: string | null;
  payoutPhoneNumber?: string | null;
  payoutRecipientCode?: string | null;
  providerReference?: string | null;
  internalReference: string;
  providerCheckoutUrl?: string | null;
  failureReason?: string | null;
  approvedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  partner?: PartnerRow | null;
  programme?: ProgrammeRow | null;
}

export interface AgentRow {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  status: string;
  digitalLiteracyScore: number;
  caseloadLimit: number;
  gender?: string | null;
  projectOfficer?: string | null;
  county?: string | null;
  location?: string | null;
  feedback?: string | null;
  sourceSystem?: string | null;
  sourceReference?: string | null;
  programme?: ProgrammeRow | null;
  groups?: Array<{ id: string; name: string; code: string; county: string; phase: string }>;
  _count: { groups: number };
}

export interface StoreSupplier {
  id: string;
  name: string;
  status: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  county?: string | null;
  location?: string | null;
  notes?: string | null;
  createdAt?: string;
  _count?: { products: number };
}

export interface StoreProductProgrammeLink {
  id: string;
  creditTerms?: string | null;
  depositRateBps?: number;
  installmentCount?: number;
  installmentFrequency?: string;
  flatInterestRateBps?: number;
  gracePeriodDays?: number;
  defaultAgents?: Array<{
    id: string;
    isPrimary: boolean;
    villageAgent: AgentRow;
  }>;
  programme: ProgrammeRow;
}

export interface StoreProduct {
  id: string;
  name: string;
  slug: string;
  category: string;
  status: string;
  supplierId?: string | null;
  supplier?: StoreSupplier | null;
  description: string;
  imageUrl?: string | null;
  sellerName?: string | null;
  priceCents: number;
  depositCents: number;
  currency: string;
  creditSummary?: string | null;
  fulfilmentSummary?: string | null;
  inventoryCount?: number | null;
  programmeLinks: StoreProductProgrammeLink[];
}

export interface StoreCreditInstallment {
  id: string;
  requestId: string;
  sequence: number;
  dueDate: string;
  principalCents: number;
  interestCents: number;
  totalDueCents: number;
  paidCents: number;
  status: string;
  paidAt?: string | null;
}

export interface StoreCreditRepayment {
  id: string;
  requestId: string;
  installmentId?: string | null;
  amountCents: number;
  source: string;
  provider?: string | null;
  providerReference?: string | null;
  recordedByUserId?: string | null;
  notes?: string | null;
  receivedAt: string;
  createdAt: string;
}

export interface StoreCreditRequest {
  id: string;
  productId: string;
  programmeId: string;
  requesterUserId?: string | null;
  distributionAgentId?: string | null;
  financierPartnerId?: string | null;
  customerName: string;
  customerEmail: string;
  phoneNumber: string;
  county?: string | null;
  groupName?: string | null;
  quantity: number;
  requestedAmountCents: number;
  depositCents: number;
  financedAmountCents: number;
  commissionRateBps: number;
  commissionCents: number;
  repaymentStatus: string;
  status: string;
  notes?: string | null;
  reviewNotes?: string | null;
  financedAt?: string | null;
  fulfilledAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
  product?: StoreProduct;
  programme?: ProgrammeRow;
  requester?: Pick<User, "id" | "name" | "email" | "role"> | null;
  distributionAgent?: AgentRow | null;
  financierPartner?: PartnerRow | null;
  installments?: StoreCreditInstallment[];
  repayments?: StoreCreditRepayment[];
}

export interface StoreSalesReportRow {
  id: string;
  fulfilledAt?: string | null;
  productId: string;
  productName: string;
  supplierId?: string | null;
  supplierName: string;
  programmeId: string;
  programmeName: string;
  vaId?: string | null;
  vaName: string;
  financierPartnerId?: string | null;
  financierName: string;
  customerName: string;
  groupName?: string | null;
  quantity: number;
  grossSalesCents: number;
  depositCents: number;
  financedValueCents: number;
  commissionCents: number;
  repaymentStatus: string;
}

export interface StoreSalesReport {
  summary: {
    fulfilledRequests: number;
    quantity: number;
    grossSalesCents: number;
    depositCents: number;
    financedValueCents: number;
    commissionCents: number;
  };
  rows: StoreSalesReportRow[];
}

export interface StoreLoanPortfolioRow {
  id: string;
  financedAt?: string | null;
  customerName: string;
  groupName?: string | null;
  productId: string;
  productName: string;
  supplierId?: string | null;
  supplierName: string;
  programmeId: string;
  programmeName: string;
  vaId?: string | null;
  vaName: string;
  financierPartnerId?: string | null;
  financierName: string;
  status: string;
  repaymentStatus: string;
  principalCents: number;
  interestCents: number;
  totalDueCents: number;
  paidCents: number;
  outstandingCents: number;
  overdueCents: number;
  agingBucket: string;
  aging: {
    currentCents: number;
    days1To30Cents: number;
    days31To60Cents: number;
    days61To90Cents: number;
    days90PlusCents: number;
  };
}

export interface StoreLoanPortfolioReport {
  summary: {
    principalCents: number;
    interestCents: number;
    totalDueCents: number;
    paidCents: number;
    outstandingCents: number;
    overdueCents: number;
    aging: StoreLoanPortfolioRow["aging"];
  };
  rows: StoreLoanPortfolioRow[];
}

export interface AgentBookingRequest {
  id: string;
  villageAgentId?: string | null;
  programmeId?: string | null;
  serviceType: string;
  preferredDate?: string | null;
  customerName: string;
  customerEmail: string;
  phoneNumber: string;
  county?: string | null;
  groupName?: string | null;
  notes?: string | null;
  status: string;
  reviewNotes?: string | null;
  createdAt: string;
  villageAgent?: AgentRow | null;
  programme?: ProgrammeRow | null;
}

export interface IntelliStorePayload {
  products: StoreProduct[];
  agents: AgentRow[];
  serviceTypes: string[];
}

export interface IntegrationStatus {
  provider: string;
  displayName: string;
  configured: boolean;
  enabled: boolean;
  mode: string;
  requiredEnv: string[];
  missingEnv: string[];
  envCredentialKeys: string[];
  storedCredentialKeys: string[];
  networkTestsAllowed: boolean;
  credentialsUpdatedAt?: string | null;
  lastCheckedAt?: string | null;
}

export interface IntegrationHealth {
  configured: number;
  total: number;
  statuses: IntegrationStatus[];
}

export interface ApiKeyPreset {
  id: string;
  name: string;
  description: string;
  scopes: string[];
}

export interface ApiKeyRow {
  id: string;
  name: string;
  scopes: string[];
  effectiveScopes: string[];
  lastUsedAt?: string | null;
  createdAt: string;
  revokedAt?: string | null;
}

export interface ApiKeyCreated extends ApiKeyRow {
  token: string;
}

export interface AuditEvent {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  hash: string;
  payload?: unknown;
  actor?: { id: string; name: string; email: string; role: string } | null;
}

export interface MeetingRow {
  id: string;
  title: string;
  status: string;
  scheduledAt: string;
  openedAt?: string | null;
  closedAt?: string | null;
  unlockStatus: string;
  gpsCompliant: boolean;
  transactionTotal: number;
  minutes?: string | null;
  steps: Array<{ id: string; step: string; status: string; name: string; completedAt?: string | null }>;
  attendance: Array<{ id: string; status: string; member: { fullName: string; role: string } }>;
  keySubmissions?: Array<{
    id: string;
    memberId: string;
    deviceId?: string | null;
    capturedOfflineAt?: string | null;
    credentialType?: string | null;
    verifiedAt: string;
    member: { id: string; fullName: string; role: string };
  }>;
}

export interface Member {
  id: string;
  groupId?: string;
  fullName: string;
  phone: string;
  role: string;
  kycStatus: string;
  status: string;
  pinSet?: boolean;
  defaultPinSet?: boolean;
  pinSetAt?: string | null;
  currentOtpSet?: boolean;
  currentOtpIssuedAt?: string | null;
  currentOtpExpiresAt?: string | null;
  joinedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  pinDelivery?: {
    id: string;
    channel: string;
    purpose?: string;
    phone: string;
    provider: string;
    status: string;
    messagePreview: string;
    sentAt?: string | null;
    createdAt: string;
  };
}

export interface LedgerEntry {
  id: string;
  memberId?: string | null;
  meetingId?: string | null;
  clientRequestId?: string | null;
  type: string;
  amountCents: number;
  direction: string;
  description: string;
  signature: string;
  createdAt: string;
  member?: { id?: string; fullName: string; role?: string } | null;
  meeting?: { id: string; title: string; scheduledAt?: string; status?: string } | null;
  fundAccount?: { id?: string; type: string; currency: string } | null;
}

export interface VoteRow {
  id: string;
  resolutionType: string;
  motion: string;
  result: string;
  quorumRequired: number;
  yesCount: number;
  noCount: number;
  abstainCount: number;
  totalEligible: number;
  hash: string;
  createdAt: string;
}

export interface IntelliAuditOverview {
  sources: number;
  documents: number;
  records: number;
  reconciliations: number;
  findings: number;
  recommendations: number;
  reports: number;
  approvals: number;
  standards: number;
  llmConfigured: boolean;
  connectorNetworkCallsEnabled: boolean;
}

export interface IntelliAuditStandard {
  id: string;
  key: string;
  name: string;
  category: string;
  jurisdiction?: string | null;
  sourceUrl: string;
  summary: string;
}

export interface IntelliAuditSource {
  id: string;
  name: string;
  sourceType: string;
  provider?: string | null;
  status: string;
  scopeType: string;
  scopeId?: string | null;
  lastSyncedAt?: string | null;
  createdAt: string;
  _count?: { documents: number; records: number; syncRuns: number };
}

export interface IntelliAuditDocument {
  id: string;
  sourceId: string;
  scopeType: string;
  scopeId?: string | null;
  title: string;
  fileName?: string | null;
  mimeType?: string | null;
  sourceUri?: string | null;
  contentHash: string;
  extractionStatus: string;
  createdAt: string;
  source?: IntelliAuditSource;
  _count?: { records: number };
}

export interface IntelliAuditRecord {
  id: string;
  sourceId?: string | null;
  documentId?: string | null;
  recordType: string;
  occurredAt?: string | null;
  amountCents?: number | null;
  currency: string;
  direction?: string | null;
  counterparty?: string | null;
  reference?: string | null;
  description?: string | null;
  hash: string;
  confidence: number;
  status: string;
  createdAt: string;
}

export interface IntelliAuditFinding {
  id: string;
  scopeType: string;
  scopeId?: string | null;
  severity: string;
  category: string;
  title: string;
  observation: string;
  recommendation: string;
  status: string;
  createdAt: string;
}

export interface IntelliAuditEvidencePayload {
  sources: IntelliAuditSource[];
  documents: IntelliAuditDocument[];
  records: IntelliAuditRecord[];
  findings: IntelliAuditFinding[];
}

export interface IntelliAuditReconciliation {
  id: string;
  scopeType: string;
  scopeId?: string | null;
  title: string;
  status: string;
  recordCount: number;
  exceptionCount: number;
  totalDebitCents: number;
  totalCreditCents: number;
  createdByUserId?: string | null;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  reviewerNotes?: string | null;
  createdAt: string;
  items?: Array<{
    id: string;
    matchStatus: string;
    confidence: number;
    reviewerNotes?: string | null;
  }>;
}

export interface IntelliAuditReport {
  id: string;
  scopeType: string;
  scopeId?: string | null;
  templateKey: string;
  standard: string;
  title: string;
  status: string;
  generatedByUserId?: string | null;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  content?: {
    executiveSummary?: string;
    methodology?: string;
    findings?: unknown[];
    recommendations?: string[];
    auditTrailReferences?: number;
  };
  auditReferences?: Array<{
    id: string;
    entityType: string;
    entityId: string;
  }>;
  approvals?: Array<{
    id: string;
    action: string;
    actorUserId: string;
    notes?: string | null;
    createdAt: string;
  }>;
}

export interface IntelliAuditChatResponse {
  conversation: {
    id: string;
    title: string;
    scopeType: string;
    scopeId?: string | null;
  };
  message: {
    id: string;
    role: string;
    content: string;
    createdAt: string;
  };
}
