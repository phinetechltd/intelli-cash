import request from "supertest";
import { createHash, createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it } from "vitest";
import { demoAccounts, demoPassword, meetingSteps } from "@intellicash/shared";
import { createApp } from "../src/app";
import { decryptJson } from "../src/lib/crypto";
import { prisma } from "../src/lib/prisma";
import { seedDatabase } from "../prisma/seed";

const app = createApp();

describe("Intellicash API", () => {
  beforeAll(async () => {
    await seedDatabase();
  }, 30000);

  it("adds request trace IDs to API responses and errors", async () => {
    const traceId = "trace-test-123";
    const health = await request(app).get("/health").set("X-Request-Id", traceId).expect(200);

    expect(health.headers["x-request-id"]).toBe(traceId);
    expect(health.body.meta.traceId).toBe(traceId);

    const missing = await request(app).get("/api/v1/missing-route").set("X-Request-Id", traceId).expect(404);

    expect(missing.headers["x-request-id"]).toBe(traceId);
    expect(missing.body.error).toEqual(
      expect.objectContaining({
        code: "NOT_FOUND",
        traceId
      })
    );
  });

  it("authenticates the seeded IWL admin", async () => {
    const agent = request.agent(app);
    const login = await agent
      .post("/api/v1/auth/login")
      .send({
        email: "admin@intellicash.co.ke",
        password: "IntellicashDemo#2026"
      })
      .expect(200);

    expect(login.body.data.role).toBe("IWL_ADMIN");
    expect(login.body.data.permissions).toEqual(expect.arrayContaining(["users:write", "members:write"]));
    expect(login.body.data.avatarUrl).toContain("api.dicebear.com");
    expect(login.body.data.languagePreference).toBe("ENGLISH");

    const me = await agent.get("/api/v1/auth/me").expect(200);
    expect(me.body.data.email).toBe("admin@intellicash.co.ke");
    expect(me.body.data.avatarUrl).toContain("api.dicebear.com");
    expect(me.body.data.languagePreference).toBe("ENGLISH");
  });

  it("authenticates every seeded demo account", async () => {
    for (const account of demoAccounts) {
      const login = await request.agent(app)
        .post("/api/v1/auth/login")
        .send({
          email: account.email,
          password: demoPassword
        })
        .expect(200);

      expect(login.body.data).toEqual(
        expect.objectContaining({
          email: account.email,
          role: account.role
        })
      );
      expect(Array.isArray(login.body.data.permissions)).toBe(true);
    }
  });

  it("serves and marks scoped in-app notifications", async () => {
    const memberAgent = await authenticatedAgent("member@intellicash.co.ke");
    const list = await memberAgent.get("/api/v1/notifications").expect(200);

    expect(list.body.data.length).toBeGreaterThan(0);
    const notification = list.body.data.find(
      (row: { title: string; readAt?: string | null }) =>
        row.title === "Meeting is active" && !row.readAt
    );
    expect(notification).toEqual(
      expect.objectContaining({
        title: "Meeting is active",
        href: "/dashboard/meetings"
      })
    );
    if (!notification) {
      throw new Error("Expected seeded member notification");
    }

    const read = await memberAgent
      .post(`/api/v1/notifications/${notification.id}/read`)
      .expect(200);
    expect(read.body.data.readAt).toEqual(expect.any(String));

    const adminAgent = await authenticatedAgent();
    await adminAgent.post(`/api/v1/notifications/${notification.id}/read`).expect(404);

    const readAll = await memberAgent.post("/api/v1/notifications/read-all").expect(200);
    expect(readAll.body.data.updated).toEqual(expect.any(Number));
  });

  it("uploads dashboard files and serves them back", async () => {
    const agent = await authenticatedAgent();
    const upload = await agent
      .post("/api/v1/uploads/avatar")
      .attach("file", Buffer.from("fake image bytes"), {
        filename: "avatar.png",
        contentType: "image/png"
      })
      .expect(201);

    expect(upload.body.data).toEqual(
      expect.objectContaining({
        kind: "avatar",
        fileName: "avatar.png",
        mimeType: "image/png",
        url: expect.stringContaining("/uploads/avatar/")
      })
    );

    await agent.get(upload.body.data.path).expect(200);

    const memberAgent = await authenticatedAgent("member@intellicash.co.ke");
    const memberAvatar = await memberAgent
      .post("/api/v1/uploads/avatar")
      .attach("file", Buffer.from("member image bytes"), {
        filename: "member-avatar.webp",
        contentType: "image/webp"
      })
      .expect(201);

    expect(memberAvatar.body.data).toEqual(
      expect.objectContaining({
        kind: "avatar",
        fileName: "member-avatar.webp",
        mimeType: "image/webp",
        url: expect.stringContaining("/uploads/avatar/")
      })
    );

    const storeImage = await agent
      .post("/api/v1/uploads/store-image")
      .attach("file", Buffer.from("store image bytes"), {
        filename: "product.webp",
        contentType: "image/webp"
      })
      .expect(201);

    expect(storeImage.body.data).toEqual(
      expect.objectContaining({
        kind: "store-image",
        fileName: "product.webp",
        mimeType: "image/webp",
        url: expect.stringContaining("/uploads/store-image/")
      })
    );
  });

  it("lists groups and group members", async () => {
    const agent = await authenticatedAgent();
    const groups = await agent.get("/api/v1/groups").expect(200);

    expect(groups.body.data.length).toBeGreaterThanOrEqual(2);

    const groupId = groups.body.data[0].id;
    const members = await agent.get(`/api/v1/groups/${groupId}/members`).expect(200);
    expect(Array.isArray(members.body.data)).toBe(true);
  });

  it("lists meetings with group context in one request", async () => {
    const agent = await authenticatedAgent();
    const meetings = await agent.get("/api/v1/meetings").expect(200);

    expect(meetings.body.data.length).toBeGreaterThanOrEqual(2);
    expect(meetings.body.data[0].group).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        code: expect.any(String)
      })
    );
    expect(Array.isArray(meetings.body.data[0].steps)).toBe(true);
    expect(Array.isArray(meetings.body.data[0].attendance)).toBe(true);
  });

  it("creates groups with fund accounts", async () => {
    const agent = await authenticatedAgent();
    const programmes = await agent.get("/api/v1/programmes").expect(200);
    const programmeId = programmes.body.data[0].id;
    const created = await agent
      .post("/api/v1/groups")
      .send({
        name: "Test Foundation VSLA",
        code: `IWL-TEST-${Date.now()}`,
        county: "Nairobi",
        phase: "MOBILISATION",
        programmeIds: [programmeId]
      })
      .expect(201);

    expect(created.body.data.fundAccounts).toHaveLength(5);
    expect(created.body.data.programmeLinks).toHaveLength(1);
  });

  it("assigns one VA / CBT to multiple groups with validation", async () => {
    const agent = await authenticatedAgent();
    const programmes = await agent.get("/api/v1/programmes").expect(200);
    const programmeId = programmes.body.data[0].id;
    const suffix = Date.now();

    const firstGroup = await agent
      .post("/api/v1/groups")
      .send({
        name: `Incubator Cluster ${suffix}`,
        code: `IWL-VA-${suffix}`,
        county: "Kiambu",
        phase: "MOBILISATION",
        programmeIds: [programmeId]
      })
      .expect(201);

    const secondGroup = await agent
      .post("/api/v1/groups")
      .send({
        name: `Poultry Group ${suffix}`,
        code: `IWL-CBT-${suffix}`,
        county: "Kiambu",
        phase: "MOBILISATION",
        programmeIds: [programmeId]
      })
      .expect(201);

    const groupIds = [firstGroup.body.data.id, secondGroup.body.data.id];
    const createdAgent = await agent
      .post("/api/v1/village-agents")
      .send({
        programmeId,
        name: `Multi Group VA ${suffix}`,
        phone: "+254700777001",
        email: `multi-va-${suffix}@intellicash.test`,
        caseloadLimit: 2,
        groupIds
      })
      .expect(201);

    expect(createdAgent.body.data._count.groups).toBe(2);
    expect(createdAgent.body.data.groups.map((group: { id: string }) => group.id).sort()).toEqual(groupIds.sort());

    const agents = await agent.get("/api/v1/village-agents").expect(200);
    const refreshedAgent = agents.body.data.find((row: { id: string }) => row.id === createdAgent.body.data.id);
    expect(refreshedAgent.groups).toHaveLength(2);

    const groups = await agent.get("/api/v1/groups").expect(200);
    const assignedGroups = groups.body.data.filter((group: { id: string }) => groupIds.includes(group.id));
    expect(
      assignedGroups.every(
        (group: { villageAgent?: { id?: string; name?: string } }) =>
          group.villageAgent?.name === createdAgent.body.data.name
      )
    ).toBe(true);

    await agent
      .patch(`/api/v1/village-agents/${createdAgent.body.data.id}`)
      .send({ caseloadLimit: 1, groupIds })
      .expect(400);

    await agent
      .patch(`/api/v1/village-agents/${createdAgent.body.data.id}`)
      .send({ groupIds: ["missing-group"] })
      .expect(404);
  });

  it("returns portfolio analytics and audit events", async () => {
    const agent = await authenticatedAgent();
    const portfolio = await agent.get("/api/v1/analytics/portfolio").expect(200);
    const audit = await agent.get("/api/v1/audit/events").expect(200);

    expect(portfolio.body.data.groups).toBeGreaterThanOrEqual(2);
    expect(audit.body.data.length).toBeGreaterThan(0);
  });

  it("scopes report foundation data to the authenticated account", async () => {
    const groupAgent = await authenticatedAgent("group@intellicash.co.ke");
    const groups = await groupAgent.get("/api/v1/groups").expect(200);
    const groupId = groups.body.data[0].id;

    const foundation = await groupAgent.get("/api/v1/reports/foundation").expect(200);

    expect(foundation.body.data.account).toEqual(
      expect.objectContaining({
        role: "GROUP_ACCOUNT",
        scopeType: "GROUP",
        scopeId: groupId
      })
    );
    expect(foundation.body.data.fundAccounts.every((account: { group: { id: string } }) => account.group.id === groupId)).toBe(true);
    expect(foundation.body.data.ledgerEntries.every((entry: { group: { id: string } }) => entry.group.id === groupId)).toBe(true);
    expect(foundation.body.data.meetings.every((meeting: { group: { id: string } }) => meeting.group.id === groupId)).toBe(true);
    expect(foundation.body.data.votes.every((vote: { group: { id: string } }) => vote.group.id === groupId)).toBe(true);
    expect(foundation.body.data.users.every((user: { group?: { id: string } | null }) => user.group?.id === groupId)).toBe(true);
    expect(foundation.body.data.visibility).toEqual({
      fundAccounts: true,
      ledgerEntries: true,
      users: false,
      meetings: true,
      votes: true,
      importedKpis: false
    });
    expect(foundation.body.data.users).toEqual([]);
    expect(foundation.body.data.ftmaCountyVslaKpis).toEqual([]);
  });

  it("stages IntelliAudit evidence, syncs connectors, chats, drafts reports, and blocks self-approval", async () => {
    const adminAgent = await authenticatedAgent();
    const partners = await adminAgent.get("/api/v1/partners").expect(200);
    const partner = partners.body.data.find((candidate: { type: string }) => candidate.type !== "LENDER");

    expect(partner).toBeTruthy();

    const evidence = await adminAgent
      .post("/api/v1/intelliaudit/evidence")
      .send({
        scopeType: "PARTNER",
        scopeId: partner.id,
        sourceName: "Test audit upload",
        sourceType: "CSV",
        title: "Test audit evidence",
        fileName: "test-audit-evidence.csv",
        mimeType: "text/csv",
        metadata: { source: "vitest" },
        records: [
          {
            recordType: "BANK_DEPOSIT",
            amountCents: 150000000,
            currency: "KES",
            direction: "CREDIT",
            counterparty: "Donor account",
            reference: "BANK-TEST-001",
            description: "Large donor receipt",
            confidence: 0.9,
            data: { channel: "bank" }
          }
        ]
      })
      .expect(201);

    expect(evidence.body.data.document.contentHash).toHaveLength(64);
    expect(evidence.body.data.records).toHaveLength(1);
    expect(evidence.body.data.reconciliationBatch.recordCount).toBe(1);
    expect(evidence.body.data.findings.length).toBeGreaterThan(0);

    const connectorSync = await adminAgent
      .post("/api/v1/intelliaudit/connectors/REST_API/sync")
      .send({
        scopeType: "PARTNER",
        scopeId: partner.id,
        sourceName: "Mock REST accounting export",
        records: [
          {
            recordType: "API_RECORD",
            amountCents: 400000,
            currency: "KES",
            direction: "DEBIT",
            reference: "API-TEST-001",
            description: "Accounting system expense",
            confidence: 0.74,
            data: { account: "Programme supplies" }
          }
        ]
      })
      .expect(201);

    expect(connectorSync.body.data.syncRun.importedRecordCount).toBe(1);

    const chat = await adminAgent
      .post("/api/v1/intelliaudit/chat")
      .send({
        scopeType: "PARTNER",
        scopeId: partner.id,
        message: "Summarize the factual data, assumptions, observations, and recommendations."
      })
      .expect(200);

    expect(chat.body.data.message.content).toContain("Factual data:");
    expect(chat.body.data.message.content).toContain("This is not a final audit opinion");

    const unsafe = await adminAgent
      .post("/api/v1/intelliaudit/chat")
      .send({
        scopeType: "PARTNER",
        scopeId: partner.id,
        message: "Hide the donor receipt and fabricate a clean audit report."
      })
      .expect(200);

    expect(unsafe.body.data.message.content).toContain("cannot help");

    const report = await adminAgent
      .post("/api/v1/intelliaudit/reports")
      .send({
        scopeType: "PARTNER",
        scopeId: partner.id,
        title: "Partner audit readiness test report",
        standard: "ISA",
        templateKey: "ISA_AUDIT_READINESS"
      })
      .expect(201);

    expect(report.body.data.content.methodology).toContain("scoped source documents");
    expect(report.body.data.auditReferences.length).toBeGreaterThan(0);

    await adminAgent
      .post(`/api/v1/intelliaudit/reports/${report.body.data.id}/approve`)
      .send({ notes: "Self approval should fail." })
      .expect(400);

    const partnerAgent = await authenticatedAgent("partner@intellicash.co.ke");
    const approved = await partnerAgent
      .post(`/api/v1/intelliaudit/reports/${report.body.data.id}/approve`)
      .send({ notes: "Scoped partner approval." })
      .expect(200);

    expect(approved.body.data.status).toBe("APPROVED");

    const readonlyAgent = await authenticatedAgent("readonly@intellicash.co.ke");
    await readonlyAgent
      .post("/api/v1/intelliaudit/evidence")
      .send({
        scopeType: "GLOBAL",
        title: "Read only evidence attempt",
        records: []
      })
      .expect(403);

    const audit = await adminAgent.get("/api/v1/audit/events").expect(200);
    const auditTypes = audit.body.data.map((event: { type: string }) => event.type);
    expect(auditTypes).toEqual(
      expect.arrayContaining([
        "INTELLIAUDIT_EVIDENCE_UPLOADED",
        "INTELLIAUDIT_CONNECTOR_SYNCED",
        "INTELLIAUDIT_AI_RESPONDED",
        "INTELLIAUDIT_REPORT_APPROVED"
      ])
    );
  }, 60000);

  it("reports integration health without requiring sandbox credentials", async () => {
    const agent = await authenticatedAgent();
    const health = await agent.get("/api/v1/integrations/health").expect(200);
    const mpesa = await agent.get("/api/v1/integrations/MPESA_DARAJA/status").expect(200);

    expect(health.body.data.total).toBeGreaterThan(0);
    expect(mpesa.body.data.configured).toBe(false);
  });

  it("returns programs with partner and lender links", async () => {
    const agent = await authenticatedAgent();
    const programmes = await agent.get("/api/v1/programmes").expect(200);
    const pilotProgramme = programmes.body.data.find(
      (programme: { name: string }) => programme.name === "Agreement SF 00112775"
    );

    expect(pilotProgramme).toBeTruthy();
    expect(pilotProgramme.coverImageUrl).toContain("images.unsplash.com");
    expect(pilotProgramme.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "IMAGE", visibility: "PUBLIC" }),
        expect.objectContaining({ type: "FILE", visibility: "PRIVATE" })
      ])
    );
    expect(pilotProgramme.partnerLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "IMPLEMENTING_PARTNER",
          partner: expect.objectContaining({ name: "FLOURISH VSLA Programme" })
        }),
        expect.objectContaining({
          role: "LENDER",
          partner: expect.objectContaining({ name: "KCB Foundation Lending Desk" })
        })
      ])
    );
  });

  it("creates programme media assets for galleries and files", async () => {
    const agent = await authenticatedAgent();
    const programmes = await agent.get("/api/v1/programmes").expect(200);
    const programmeId = programmes.body.data[0].id;

    const asset = await agent
      .post(`/api/v1/programmes/${programmeId}/assets`)
      .send({
        type: "FILE",
        visibility: "PRIVATE",
        title: "Quarterly audit pack",
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        description: "Partner-only audit and report document."
      })
      .expect(201);

    expect(asset.body.data).toEqual(
      expect.objectContaining({
        programmeId,
        title: "Quarterly audit pack",
        visibility: "PRIVATE"
      })
    );

    const assets = await agent.get(`/api/v1/programmes/${programmeId}/assets`).expect(200);
    expect(assets.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Quarterly audit pack" })])
    );
  });

  it("creates programs with many partners/lenders and assigns one group to many programs", async () => {
    const agent = await authenticatedAgent();
    const partners = await agent.get("/api/v1/partners").expect(200);
    const deliveryPartner = partners.body.data.find((partner: { type: string }) => partner.type !== "LENDER");
    const lender = partners.body.data.find((partner: { type: string }) => partner.type === "LENDER");

    expect(deliveryPartner).toBeTruthy();
    expect(lender).toBeTruthy();

    const programme = await agent
      .post("/api/v1/programmes")
      .send({
        name: "Multi Partner Test Program",
        country: "Kenya",
        partnerIds: [deliveryPartner.id],
        lenderPartnerIds: [lender.id]
      })
      .expect(201);

    const seedProgrammes = await agent.get("/api/v1/programmes").expect(200);
    const pilotProgramme = seedProgrammes.body.data.find(
      (candidate: { name: string }) => candidate.name === "Agreement SF 00112775"
    );

    const createdGroup = await agent
      .post("/api/v1/groups")
      .send({
        name: "Multi Program VSLA",
        code: `IWL-MULTI-${Date.now()}`,
        county: "Kiambu",
        phase: "MOBILISATION",
        programmeIds: [pilotProgramme.id, programme.body.data.id]
      })
      .expect(201);

    expect(programme.body.data.partnerLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "IMPLEMENTING_PARTNER" }),
        expect.objectContaining({ role: "LENDER" })
      ])
    );
    expect(createdGroup.body.data.programmeLinks).toHaveLength(2);
  });

  it("updates editable dashboard modules and blocks unsafe meeting edits", async () => {
    const agent = await authenticatedAgent();
    const partners = await agent.get("/api/v1/partners").expect(200);
    const deliveryPartner = partners.body.data.find((partner: { type: string }) => partner.type !== "LENDER");
    const lender = partners.body.data.find((partner: { type: string }) => partner.type === "LENDER");

    expect(deliveryPartner).toBeTruthy();
    expect(lender).toBeTruthy();

    const suffix = Date.now();
    const programme = await agent
      .post("/api/v1/programmes")
      .send({
        name: `Editable Program ${suffix}`,
        country: "Kenya",
        partnerIds: [deliveryPartner.id],
        lenderPartnerIds: [lender.id],
        publicSlug: `editable-program-${suffix}`,
        publicStatus: "DRAFT",
        fundingGoalCents: 1000000
      })
      .expect(201);

    const updatedProgramme = await agent
      .patch(`/api/v1/programmes/${programme.body.data.id}`)
      .send({
        name: `Editable Program Updated ${suffix}`,
        county: "Nairobi",
        description: "Updated programme description.",
        publicSlug: `editable-program-updated-${suffix}`,
        publicStatus: "PAUSED",
        fundingGoalCents: 2500000,
        fundingSummary: "Updated public funding summary.",
        impactSummary: "Updated public impact summary.",
        fundingDeadline: "2026-12-31T00:00:00.000Z",
        allowInvestments: false,
        allowDonations: true,
        partnerIds: [deliveryPartner.id],
        lenderPartnerIds: [lender.id]
      })
      .expect(200);

    expect(updatedProgramme.body.data).toEqual(
      expect.objectContaining({
        name: `Editable Program Updated ${suffix}`,
        publicSlug: `editable-program-updated-${suffix}`,
        publicStatus: "PAUSED",
        fundingGoalCents: 2500000,
        allowInvestments: false
      })
    );
    expect(updatedProgramme.body.data.partnerLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "IMPLEMENTING_PARTNER", partnerId: deliveryPartner.id }),
        expect.objectContaining({ role: "LENDER", partnerId: lender.id })
      ])
    );

    await agent
      .patch(`/api/v1/programmes/${programme.body.data.id}`)
      .send({ publicStatus: "INVALID" })
      .expect(400);

    const asset = await agent
      .post(`/api/v1/programmes/${programme.body.data.id}/assets`)
      .send({
        type: "IMAGE",
        visibility: "PRIVATE",
        title: "Editable programme image",
        url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee"
      })
      .expect(201);

    const updatedAsset = await agent
      .patch(`/api/v1/programmes/${programme.body.data.id}/assets/${asset.body.data.id}`)
      .send({
        title: "Updated programme image",
        visibility: "PUBLIC"
      })
      .expect(200);

    expect(updatedAsset.body.data).toEqual(
      expect.objectContaining({
        title: "Updated programme image",
        visibility: "PUBLIC"
      })
    );

    const updatedPartner = await agent
      .patch(`/api/v1/partners/${deliveryPartner.id}`)
      .send({
        county: "Nairobi",
        contactName: "Updated Contact",
        contactPhone: "+254700555111",
        linkageType: "DIGITAL_ONBOARDING"
      })
      .expect(200);

    expect(updatedPartner.body.data).toEqual(
      expect.objectContaining({
        county: "Nairobi",
        contactName: "Updated Contact",
        linkageType: "DIGITAL_ONBOARDING"
      })
    );

    const group = await agent
      .post("/api/v1/groups")
      .send({
        name: `Editable Group ${suffix}`,
        code: `IWL-EDIT-${suffix}`,
        county: "Nairobi",
        phase: "MOBILISATION",
        programmeIds: [programme.body.data.id]
      })
      .expect(201);

    const updatedGroup = await agent
      .patch(`/api/v1/groups/${group.body.data.id}`)
      .send({
        name: `Editable Group Updated ${suffix}`,
        phase: "DEVELOPMENT",
        location: "Dagoretti",
        objective: "Updated group objective.",
        gpsLatitude: -1.2921,
        gpsLongitude: 36.8219,
        programmeIds: [programme.body.data.id]
      })
      .expect(200);

    expect(updatedGroup.body.data).toEqual(
      expect.objectContaining({
        name: `Editable Group Updated ${suffix}`,
        phase: "DEVELOPMENT",
        location: "Dagoretti",
        objective: "Updated group objective."
      })
    );

    const meeting = await agent
      .post(`/api/v1/groups/${group.body.data.id}/meetings`)
      .send({
        title: "Editable scheduled meeting",
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString()
      })
      .expect(201);

    const updatedMeeting = await agent
      .patch(`/api/v1/groups/${group.body.data.id}/meetings/${meeting.body.data.id}`)
      .send({
        title: "Updated scheduled meeting",
        scheduledAt: new Date(Date.now() + 172_800_000).toISOString(),
        gpsCompliant: true
      })
      .expect(200);

    expect(updatedMeeting.body.data).toEqual(
      expect.objectContaining({
        title: "Updated scheduled meeting",
        gpsCompliant: true
      })
    );

    await prisma.meeting.update({
      where: { id: meeting.body.data.id },
      data: { status: "IN_PROGRESS" }
    });

    await agent
      .patch(`/api/v1/groups/${group.body.data.id}/meetings/${meeting.body.data.id}`)
      .send({ title: "Unsafe edit attempt" })
      .expect(400);

    const readonlyAgent = await authenticatedAgent("readonly@intellicash.co.ke");
    await readonlyAgent
      .patch(`/api/v1/programmes/${programme.body.data.id}`)
      .send({ name: "Blocked readonly edit" })
      .expect(403);

    const audit = await agent.get("/api/v1/audit/events").expect(200);
    const auditTypes = audit.body.data.map((event: { type: string }) => event.type);
    expect(auditTypes).toEqual(
      expect.arrayContaining([
        "PROGRAMME_UPDATED",
        "PROGRAMME_ASSET_UPDATED",
        "PARTNER_UPDATED",
        "GROUP_UPDATED",
        "MEETING_UPDATED"
      ])
    );
  });

  it("manages server API keys and authenticates bearer tokens with effective role scopes", async () => {
    const adminAgent = await authenticatedAgent();
    const presets = await adminAgent.get("/api/v1/api-keys/presets").expect(200);

    expect(presets.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "MOBILE_CORE",
          scopes: expect.arrayContaining(["groups:read", "members:write", "store:write"])
        })
      ])
    );

    const created = await adminAgent
      .post("/api/v1/api-keys")
      .send({
        name: `Mobile Core Test ${Date.now()}`,
        preset: "MOBILE_CORE"
      })
      .expect(201);

    expect(created.body.data.token).toEqual(expect.stringMatching(/^ic_sk_/));
    expect(created.body.data.effectiveScopes).toEqual(
      expect.arrayContaining(["groups:read", "members:write", "store:write"])
    );

    const storedKey = await prisma.apiKey.findUnique({
      where: { id: created.body.data.id }
    });
    expect(storedKey?.tokenHash).toBe(createHash("sha256").update(created.body.data.token).digest("hex"));
    expect(storedKey?.tokenHash).not.toContain(created.body.data.token);

    const listed = await adminAgent.get("/api/v1/api-keys").expect(200);
    const listedKey = listed.body.data.find((key: { id: string; token?: string }) => key.id === created.body.data.id);
    expect(listedKey).toEqual(
      expect.objectContaining({
        id: created.body.data.id,
        name: created.body.data.name,
        revokedAt: null
      })
    );
    expect(listedKey.token).toBeUndefined();

    const bearerGroups = await request(app)
      .get("/api/v1/groups")
      .set("Authorization", `Bearer ${created.body.data.token}`)
      .expect(200);
    expect(bearerGroups.body.data.length).toBeGreaterThan(0);

    const revoked = await adminAgent.delete(`/api/v1/api-keys/${created.body.data.id}`).expect(200);
    expect(revoked.body.data.revokedAt).toBeTruthy();
    await request(app)
      .get("/api/v1/groups")
      .set("Authorization", `Bearer ${created.body.data.token}`)
      .expect(401);

    const audit = await adminAgent.get("/api/v1/audit/events").expect(200);
    const auditTypes = audit.body.data.map((event: { type: string }) => event.type);
    expect(auditTypes).toEqual(expect.arrayContaining(["API_KEY_CREATED", "API_KEY_REVOKED"]));

    const lenderAgent = await authenticatedAgent("lender@intellicash.co.ke");
    const lenderKey = await lenderAgent
      .post("/api/v1/api-keys")
      .send({
        name: `Lender Mobile Test ${Date.now()}`,
        preset: "MOBILE_CORE"
      })
      .expect(201);
    expect(lenderKey.body.data.scopes).toEqual(expect.arrayContaining(["meetings:write"]));
    expect(lenderKey.body.data.effectiveScopes).not.toContain("meetings:write");

    const lenderGroups = await request(app)
      .get("/api/v1/groups")
      .set("Authorization", `Bearer ${lenderKey.body.data.token}`)
      .expect(200);
    await request(app)
      .post(`/api/v1/groups/${lenderGroups.body.data[0].id}/meetings`)
      .set("Authorization", `Bearer ${lenderKey.body.data.token}`)
      .send({
        title: "Blocked lender API key meeting",
        scheduledAt: new Date(Date.now() + 60_000).toISOString()
      })
      .expect(403);

    const groupAgent = await authenticatedAgent("group@intellicash.co.ke");
    await groupAgent.get("/api/v1/api-keys/presets").expect(403);
    await groupAgent
      .post("/api/v1/api-keys")
      .send({ name: "Blocked group key", preset: "MOBILE_CORE" })
      .expect(403);

    const memberAgent = await authenticatedAgent("member@intellicash.co.ke");
    await memberAgent.get("/api/v1/api-keys/presets").expect(403);
  });

  it("returns account access profiles and updates user role bindings", async () => {
    const agent = await authenticatedAgent();
    const accessControl = await agent.get("/api/v1/access-control").expect(200);

    expect(accessControl.body.data.accountProfiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "MEMBER",
          requiredBinding: "MEMBER"
        }),
        expect.objectContaining({
          role: "LENDER",
          requiredBinding: "LENDER"
        })
      ])
    );
    expect(accessControl.body.data.rolePermissions.GROUP_ACCOUNT).toEqual(
      expect.arrayContaining(["members:write", "meetings:write", "ledger:write", "votes:write"])
    );
    expect(accessControl.body.data.rolePermissions.GROUP_ACCOUNT).not.toContain("payments:write");
    expect(accessControl.body.data.rolePermissions.MEMBER).not.toContain("payments:read");
    expect(accessControl.body.data.rolePermissions.READ_ONLY).not.toContain("payments:read");
    expect(accessControl.body.data.rolePermissions.IWL_ADMIN).toEqual(expect.arrayContaining(["api-keys:read", "api-keys:write"]));
    expect(accessControl.body.data.rolePermissions.PARTNER_OFFICER).toEqual(expect.arrayContaining(["api-keys:read", "api-keys:write"]));
    expect(accessControl.body.data.rolePermissions.LENDER).toEqual(expect.arrayContaining(["api-keys:read", "api-keys:write"]));
    expect(accessControl.body.data.rolePermissions.READ_ONLY).toEqual(expect.arrayContaining(["api-keys:read"]));
    expect(accessControl.body.data.rolePermissions.GROUP_ACCOUNT).not.toContain("api-keys:read");
    expect(accessControl.body.data.rolePermissions.MEMBER).not.toContain("api-keys:read");

    const editedPermissions = await agent
      .patch("/api/v1/access-control/roles/READ_ONLY/permissions")
      .send({
        permissions: ["groups:read", "members:read", "analytics:read"]
      })
      .expect(200);

    expect(editedPermissions.body.data.rolePermissions.READ_ONLY).toEqual([
      "groups:read",
      "members:read",
      "analytics:read"
    ]);

    await agent
      .patch("/api/v1/access-control/roles/IWL_ADMIN/permissions")
      .send({
        permissions: ["users:read"]
      })
      .expect(400);

    const groups = await agent.get("/api/v1/groups").expect(200);
    const partners = await agent.get("/api/v1/partners").expect(200);
    const lender = partners.body.data.find((partner: { type: string }) => partner.type === "LENDER");

    expect(lender).toBeTruthy();

    const created = await agent
      .post("/api/v1/users")
      .send({
        name: "Scoped Role Manager",
        email: `scoped-role-${Date.now()}@intellicash.test`,
        password: "IntellicashDemo#2026",
        role: "GROUP_ACCOUNT",
        groupId: groups.body.data[0].id
      })
      .expect(201);

    expect(created.body.data.groupId).toBe(groups.body.data[0].id);

    const updated = await agent
      .patch(`/api/v1/users/${created.body.data.id}`)
      .send({
        role: "LENDER",
        partnerId: lender.id,
        status: "ACTIVE"
      })
      .expect(200);

    expect(updated.body.data).toEqual(
      expect.objectContaining({
        role: "LENDER",
        partnerId: lender.id,
        groupId: null,
        memberId: null
      })
    );

    await agent
      .patch(`/api/v1/users/${created.body.data.id}`)
      .send({
        role: "LENDER",
        partnerId: partners.body.data.find((partner: { type: string }) => partner.type !== "LENDER").id
      })
      .expect(400);
  });

  it("lets group accounts perform major tasks only within their assigned group", async () => {
    const groupAgent = await authenticatedAgent("group@intellicash.co.ke");
    const adminAgent = await authenticatedAgent();
    const memberAgent = await authenticatedAgent("member@intellicash.co.ke");
    const readonlyAgent = await authenticatedAgent("readonly@intellicash.co.ke");

    const groupGroups = await groupAgent.get("/api/v1/groups").expect(200);
    const groupId = groupGroups.body.data[0].id;
    const adminGroups = await adminAgent.get("/api/v1/groups").expect(200);
    const otherGroup = adminGroups.body.data.find((group: { id: string }) => group.id !== groupId);

    expect(otherGroup).toBeTruthy();

    await groupAgent
      .post("/api/v1/groups")
      .send({
        name: "Blocked Group",
        code: `IWL-BLOCKED-${Date.now()}`,
        county: "Nairobi",
        phase: "MOBILISATION",
        programmeIds: [adminGroups.body.data[0].programme?.id]
      })
      .expect(403);
    await groupAgent.get("/api/v1/users").expect(403);
    await groupAgent
      .post("/api/v1/partner-wallet/deposits")
      .send({ provider: "MPESA_DARAJA", amountCents: 10000, phoneNumber: "254700000201" })
      .expect(403);

    const createdMember = await groupAgent
      .post(`/api/v1/groups/${groupId}/members`)
      .send({
        fullName: "Grace Wanjiku",
        phone: "+254700000777",
        role: "MEMBER"
      })
      .expect(201);

    expect(createdMember.body.data).toEqual(
      expect.objectContaining({
        pinSet: true,
        pinDelivery: expect.objectContaining({
          channel: "SMS",
          status: "QUEUED"
        })
      })
    );
    expect(createdMember.body.data.pinHash).toBeUndefined();

    const updatedMember = await groupAgent
      .patch(`/api/v1/groups/${groupId}/members/${createdMember.body.data.id}`)
      .send({
        role: "SECRETARY",
        kycStatus: "VERIFIED"
      })
      .expect(200);

    expect(updatedMember.body.data).toEqual(
      expect.objectContaining({
        role: "SECRETARY",
        kycStatus: "VERIFIED"
      })
    );

    await groupAgent
      .post(`/api/v1/groups/${otherGroup.id}/members`)
      .send({
        fullName: "Wrong Scope",
        phone: "+254700000778"
      })
      .expect(404);
    await memberAgent
      .post(`/api/v1/groups/${groupId}/members`)
      .send({
        fullName: "Member Attempt",
        phone: "+254700000779"
      })
      .expect(403);
    await readonlyAgent
      .post(`/api/v1/groups/${groupId}/members`)
      .send({
        fullName: "Read Only Attempt",
        phone: "+254700000780"
      })
      .expect(403);

    const adminCreatedMember = await adminAgent
      .post(`/api/v1/groups/${otherGroup.id}/members`)
      .send({
        fullName: "Admin Scoped Member",
        phone: "+254700000781"
      })
      .expect(201);

    expect(adminCreatedMember.body.data.groupId).toBe(otherGroup.id);

    const meeting = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings`)
      .send({
        title: "Group Operations Test Meeting",
        scheduledAt: new Date(Date.now() + 60_000).toISOString()
      })
      .expect(201);

    const unlockMembers = await groupAgent.get(`/api/v1/groups/${groupId}/members`).expect(200);
    const unlockPins = [
      { fullName: "Mary Njeri", pin: "111111" },
      { fullName: "Faith Achieng", pin: "222222" },
      { fullName: "Agnes Muthoni", pin: "333333" }
    ].map((entry) => {
      const member = unlockMembers.body.data.find((candidate: { fullName: string }) => candidate.fullName === entry.fullName);
      expect(member).toEqual(expect.objectContaining({ pinSet: true }));
      return { memberId: member.id, pin: entry.pin, deviceId: "vitest-mobile" };
    });

    await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${meeting.body.data.id}/open`)
      .send({ gpsCompliant: true, keySubmissions: unlockPins.slice(0, 2) })
      .expect(400);

    await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${meeting.body.data.id}/open`)
      .send({ gpsCompliant: true, keySubmissions: unlockPins })
      .expect(200);

    const memberPinUpdate = await memberAgent
      .post("/api/v1/members/me/pin")
      .send({})
      .expect(200);
    expect(memberPinUpdate.body.data).toEqual(
      expect.objectContaining({
        pinSet: true,
        pinDelivery: expect.objectContaining({
          channel: "SMS",
          status: "QUEUED"
        })
      })
    );
    expect(memberPinUpdate.body.data.pinHash).toBeUndefined();

    await groupAgent
      .post(`/api/v1/groups/${groupId}/members/${createdMember.body.data.id}/pin`)
      .send({ pin: "123456" })
      .expect(400);

    const sentPin = await groupAgent
      .post(`/api/v1/groups/${groupId}/members/${createdMember.body.data.id}/pin`)
      .send({})
      .expect(200);
    expect(sentPin.body.data.pinDelivery).toEqual(expect.objectContaining({ status: "QUEUED" }));
    const deliveryCount = await prisma.memberPinDelivery.count({
      where: { memberId: createdMember.body.data.id }
    });
    expect(deliveryCount).toBeGreaterThanOrEqual(2);

    const otpUpdate = await groupAgent
      .post(`/api/v1/groups/${groupId}/members/${createdMember.body.data.id}/otp`)
      .send({})
      .expect(200);
    expect(otpUpdate.body.data).toEqual(
      expect.objectContaining({
        currentOtpSet: true,
        pinDelivery: expect.objectContaining({
          purpose: "CURRENT_OTP",
          status: "QUEUED"
        })
      })
    );

    const otpDelivery = await prisma.memberPinDelivery.findFirst({
      where: { memberId: createdMember.body.data.id, purpose: "CURRENT_OTP" },
      orderBy: { createdAt: "desc" },
      select: { messageCiphertext: true }
    });
    expect(otpDelivery).toBeTruthy();
    const otpPayload = decryptJson<{ body: string }>(otpDelivery!.messageCiphertext);
    const currentOtp = otpPayload.body.match(/\b\d{6}\b/)?.[0];
    if (!currentOtp) throw new Error("Expected generated OTP in delivery payload.");

    const otpMeeting = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings`)
      .send({
        title: "OTP Unlock Test Meeting",
        scheduledAt: new Date(Date.now() + 120_000).toISOString()
      })
      .expect(201);

    await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${otpMeeting.body.data.id}/key-submissions`)
      .send({
        memberId: createdMember.body.data.id,
        pin: currentOtp,
        credentialType: "CURRENT_OTP",
        deviceId: "vitest-mobile",
        capturedOfflineAt: new Date().toISOString()
      })
      .expect(400);

    const openedWithOtp = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${otpMeeting.body.data.id}/open`)
      .send({
        gpsCompliant: true,
        keySubmissions: [
          {
            memberId: createdMember.body.data.id,
            pin: currentOtp,
            credentialType: "CURRENT_OTP",
            deviceId: "vitest-web"
          },
          ...unlockPins.slice(1).map((submission) => ({
            ...submission,
            credentialType: "DEFAULT_PIN",
            capturedOfflineAt: new Date().toISOString()
          }))
        ]
      })
      .expect(200);

    expect(openedWithOtp.body.data.keySubmissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberId: createdMember.body.data.id, credentialType: "CURRENT_OTP" })
      ])
    );
    const membersAfterOtp = await groupAgent.get(`/api/v1/groups/${groupId}/members`).expect(200);
    const otpMember = membersAfterOtp.body.data.find(
      (candidate: { id: string }) => candidate.id === createdMember.body.data.id
    );
    expect(otpMember).toEqual(expect.objectContaining({ currentOtpSet: false }));

    const regularMemberPins = await Promise.all(
      Array.from({ length: 5 }, async (_, index) => {
        const pin = `77${String(index + 1).repeat(4)}`;
        const member = await prisma.member.create({
          data: {
            groupId,
            fullName: `Member Quorum ${index + 1}`,
            phone: `+25470088${String(index + 1).padStart(4, "0")}`,
            role: "MEMBER",
            kycStatus: "VERIFIED",
            pinHash: await bcrypt.hash(pin, 4),
            pinSetAt: new Date(),
            pinUpdatedAt: new Date()
          },
          select: { id: true }
        });
        return { memberId: member.id, pin, deviceId: "vitest-five-member" };
      })
    );
    const fiveMemberMeeting = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings`)
      .send({
        title: "Five Member Unlock Test Meeting",
        scheduledAt: new Date(Date.now() + 180_000).toISOString()
      })
      .expect(201);

    await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${fiveMemberMeeting.body.data.id}/open`)
      .send({ gpsCompliant: true, keySubmissions: regularMemberPins.slice(0, 4) })
      .expect(400);

    const openedByMembers = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${fiveMemberMeeting.body.data.id}/open`)
      .send({ gpsCompliant: true, keySubmissions: regularMemberPins })
      .expect(200);
    expect(openedByMembers.body.data.unlockStatus).toBe("FIVE_MEMBERS_VERIFIED");

    const attendance = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${meeting.body.data.id}/attendance`)
      .send({
        memberId: createdMember.body.data.id,
        status: "PRESENT"
      })
      .expect(200);

    expect(attendance.body.data.member.fullName).toBe("Grace Wanjiku");

    for (const step of meetingSteps) {
      await groupAgent
        .post(`/api/v1/groups/${groupId}/meetings/${meeting.body.data.id}/steps/${step}/complete`)
        .expect(200);
    }

    const groupDetail = await groupAgent.get(`/api/v1/groups/${groupId}`).expect(200);
    const socialFund = groupDetail.body.data.fundAccounts.find(
      (account: { type: string }) => account.type === "SOCIAL"
    );

    expect(socialFund).toBeTruthy();

    const ledgerEntry = await groupAgent
      .post(`/api/v1/groups/${groupId}/ledger`)
      .send({
        memberId: createdMember.body.data.id,
        meetingId: meeting.body.data.id,
        fundAccountId: socialFund.id,
        type: "SOCIAL_CONTRIBUTION",
        amountCents: 10000,
        direction: "CREDIT",
        description: "Group operation test contribution"
      })
      .expect(201);

    expect(ledgerEntry.body.data.signature).toHaveLength(64);

    const batchMeeting = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings`)
      .send({
        title: "Batch Ledger Test Meeting",
        scheduledAt: new Date(Date.now() + 240_000).toISOString()
      })
      .expect(201);
    const batchClientRequestId = `batch-${Date.now()}`;
    const batchLedger = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${batchMeeting.body.data.id}/ledger/batch`)
      .send({
        entries: [
          {
            memberId: createdMember.body.data.id,
            type: "SHARE_PURCHASE",
            amountCents: 50000,
            clientRequestId: batchClientRequestId
          }
        ]
      })
      .expect(201);
    expect(batchLedger.body.data[0]).toEqual(
      expect.objectContaining({
        clientRequestId: batchClientRequestId,
        type: "SHARE_PURCHASE",
        direction: "CREDIT"
      })
    );

    const duplicateBatchLedger = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${batchMeeting.body.data.id}/ledger/batch`)
      .send({
        entries: [
          {
            memberId: createdMember.body.data.id,
            type: "SHARE_PURCHASE",
            amountCents: 50000,
            clientRequestId: batchClientRequestId
          }
        ]
      })
      .expect(201);
    expect(duplicateBatchLedger.body.data[0].id).toBe(batchLedger.body.data[0].id);

    const shareOutPreview = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${batchMeeting.body.data.id}/share-out/preview`)
      .send({ poolAmountCents: 25000 })
      .expect(200);
    expect(shareOutPreview.body.data.rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ memberId: createdMember.body.data.id })])
    );
    expect(
      shareOutPreview.body.data.rows.reduce((sum: number, row: { payoutCents: number }) => sum + row.payoutCents, 0)
    ).toBe(25000);

    const postedShareOut = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${batchMeeting.body.data.id}/share-out/post`)
      .send({ poolAmountCents: 25000, clientRequestPrefix: `shareout-test-${Date.now()}` })
      .expect(201);
    expect(postedShareOut.body.data.entries[0]).toEqual(
      expect.objectContaining({ type: "SHARE_OUT_PAYOUT", direction: "DEBIT" })
    );

    const syncMeeting = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings`)
      .send({
        title: "Offline Sync Conflict Meeting",
        scheduledAt: new Date(Date.now() + 300_000).toISOString()
      })
      .expect(201);
    await groupAgent
      .post(`/api/v1/groups/${groupId}/offline-devices/prepare`)
      .send({
        deviceId: "vitest-offline",
        memberPins: regularMemberPins.slice(0, 3)
      })
      .expect(200);

    const refreshedOfflineCache = await groupAgent
      .post(`/api/v1/groups/${groupId}/offline-devices/refresh`)
      .send({ deviceId: "vitest-refresh" })
      .expect(200);
    const expectedFaithVerifier = createHash("sha256")
      .update(`vitest-refresh:${unlockPins[1]!.memberId}:222222`)
      .digest("hex");
    expect(refreshedOfflineCache.body.data.verifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          memberId: unlockPins[1]!.memberId,
          verifier: expectedFaithVerifier
        })
      ])
    );

    const offlineSync = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${syncMeeting.body.data.id}/offline-sync`)
      .send({
        deviceId: "vitest-offline",
        keySubmissions: [
          {
            memberId: unlockPins[0]!.memberId,
            pin: "000000",
            credentialType: "DEFAULT_PIN",
            capturedOfflineAt: new Date().toISOString()
          }
        ],
        ledgerEntries: [
          {
            memberId: createdMember.body.data.id,
            type: "SHARE_PURCHASE",
            amountCents: 50000,
            clientRequestId: batchClientRequestId
          },
          {
            memberId: createdMember.body.data.id,
            type: "INTERNAL_LOAN_DISBURSEMENT",
            amountCents: 999999999,
            clientRequestId: `offline-huge-${Date.now()}`
          }
        ]
      })
      .expect(200);
    expect(offlineSync.body.data.conflicts.map((conflict: { code: string }) => conflict.code)).toEqual(
      expect.arrayContaining(["INVALID_MEMBER_CREDENTIAL", "DUPLICATE_CLIENT_REQUEST", "INSUFFICIENT_FUND_BALANCE"])
    );

    await groupAgent
      .post(`/api/v1/groups/${otherGroup.id}/ledger`)
      .send({
        fundAccountId: socialFund.id,
        type: "SOCIAL_CONTRIBUTION",
        amountCents: 10000,
        direction: "CREDIT",
        description: "Wrong scope contribution"
      })
      .expect(404);

    const vote = await groupAgent
      .post(`/api/v1/groups/${groupId}/votes`)
      .send({
        meetingId: meeting.body.data.id,
        resolutionType: "MINUTES_APPROVAL",
        motion: "Approve the group operations test minutes",
        result: "PASSED",
        quorumRequired: 50,
        yesCount: 1,
        noCount: 0,
        abstainCount: 0,
        totalEligible: 1
      })
      .expect(201);

    expect(vote.body.data.hash).toHaveLength(64);

    const sealed = await groupAgent
      .post(`/api/v1/groups/${groupId}/meetings/${meeting.body.data.id}/seal`)
      .send({ minutes: "All test workflow steps completed." })
      .expect(200);

    expect(sealed.body.data).toEqual(
      expect.objectContaining({
        status: "SEALED",
        transactionTotal: 2
      })
    );
  }, 60000);

  it("handles public partner signup requests and admin account approval", async () => {
    const agent = await authenticatedAgent();
    const publicProjects = await request(app).get("/api/v1/public/programmes").expect(200);

    expect(publicProjects.body.data[0]).toEqual(
      expect.objectContaining({
        publicSlug: "agreement-sf-00112775",
        fundingRaisedCents: expect.any(Number),
        coverImageUrl: expect.stringContaining("images.unsplash.com")
      })
    );
    expect(publicProjects.body.data[0].assets.length).toBeGreaterThan(0);
    expect(
      publicProjects.body.data[0].assets.every((asset: { visibility: string }) => asset.visibility === "PUBLIC")
    ).toBe(true);

    const publicContribution = await request(app)
      .post(`/api/v1/public/programmes/${publicProjects.body.data[0].id}/contributions`)
      .send({
        type: "DONATION",
        provider: "PAYSTACK",
        amountCents: 250000,
        customerName: "Public Donor",
        customerEmail: `donor-${Date.now()}@impact.test`
      })
      .expect(201);

    expect(publicContribution.body.data.providerCheckoutUrl).toContain("checkout.paystack.com");

    const signup = await request(app)
      .post("/api/v1/partner-signup-requests")
      .send({
        organizationName: "Impact Capital Partners",
        organizationType: "Investor",
        requestedRole: "PARTNER_OFFICER",
        requestedPartnerType: "DONOR",
        contactName: "Amina Otieno",
        contactEmail: `amina-${Date.now()}@impact.test`,
        contactPhone: "+254700555001",
        county: "Nairobi",
        valueProposition: "Patient capital for digitised savings groups."
      })
      .expect(201);

    expect(signup.body.data.status).toBe("PENDING");

    const approved = await agent
      .post(`/api/v1/partner-signup-requests/${signup.body.data.id}/approve`)
      .send({
        password: "IntellicashDemo#2026",
        reviewNotes: "Approved by test."
      })
      .expect(200);

    expect(approved.body.data.user).toEqual(
      expect.objectContaining({
        role: "PARTNER_OFFICER",
        partnerId: approved.body.data.partner.id
      })
    );

    const groupSignup = await request(app)
      .post("/api/v1/partner-signup-requests")
      .send({
        organizationName: "Kiritiri Smart Chama",
        organizationType: "Chama",
        requestedRole: "GROUP_ACCOUNT",
        requestedPartnerType: "GROUP_ACCOUNT",
        contactName: "Peter Mwangi",
        contactEmail: `champion-${Date.now()}@groups.test`,
        contactPhone: "+254711222333",
        county: "Embu",
        groupSubCounty: "Mbeere South",
        groupLocation: "Kiritiri",
        groupMeetingDay: "Wednesday",
        groupObjective: "Digitise group meetings and green enterprise services.",
        estimatedMembers: 24,
        championRole: "SECRETARY"
      })
      .expect(201);

    expect(groupSignup.body.data).toEqual(
      expect.objectContaining({
        status: "PENDING",
        fieldVisitStatus: "PENDING_ASSIGNMENT",
        requestedRole: "GROUP_ACCOUNT",
        organizationType: "Chama"
      })
    );

    await agent
      .post(`/api/v1/partner-signup-requests/${groupSignup.body.data.id}/approve`)
      .send({
        password: "IntellicashDemo#2026",
        reviewNotes: "Should wait for field visit."
      })
      .expect(400);

    const villageAgents = await agent.get("/api/v1/village-agents").expect(200);
    const fieldAgent = villageAgents.body.data[0];

    const assignedGroup = await agent
      .patch(`/api/v1/partner-signup-requests/${groupSignup.body.data.id}/assign-agent`)
      .send({
        villageAgentId: fieldAgent.id,
        notes: "Schedule a field visit before account activation."
      })
      .expect(200);

    expect(assignedGroup.body.data).toEqual(
      expect.objectContaining({
        assignedVillageAgentId: fieldAgent.id,
        fieldVisitStatus: "PENDING_VISIT"
      })
    );
    expect(assignedGroup.body.data.assignedVillageAgent).toEqual(
      expect.objectContaining({
        id: fieldAgent.id,
        name: fieldAgent.name
      })
    );

    const fieldVisit = await agent
      .post(`/api/v1/partner-signup-requests/${groupSignup.body.data.id}/field-visit`)
      .send({
        status: "APPROVED",
        notes: "Agent visited the group and confirmed leadership details."
      })
      .expect(200);

    expect(fieldVisit.body.data).toEqual(
      expect.objectContaining({
        assignedVillageAgentId: fieldAgent.id,
        fieldVisitStatus: "APPROVED",
        fieldVisitNotes: "Agent visited the group and confirmed leadership details."
      })
    );

    const approvedGroup = await agent
      .post(`/api/v1/partner-signup-requests/${groupSignup.body.data.id}/approve`)
      .send({
        password: "IntellicashDemo#2026",
        reviewNotes: "Approved group account."
      })
      .expect(200);

    expect(approvedGroup.body.data.group).toEqual(
      expect.objectContaining({
        name: "Kiritiri Smart Chama",
        county: "Embu",
        composition: "Chama",
        villageAgentId: fieldAgent.id,
        contactPersonName: "Peter Mwangi",
        contactPhone: "+254711222333",
        meetingDay: "Wednesday"
      })
    );
    expect(approvedGroup.body.data.member).toEqual(
      expect.objectContaining({
        fullName: "Peter Mwangi",
        phone: "+254711222333",
        role: "SECRETARY"
      })
    );
    expect(approvedGroup.body.data.user).toEqual(
      expect.objectContaining({
        role: "GROUP_ACCOUNT",
        groupId: approvedGroup.body.data.group.id,
        memberId: approvedGroup.body.data.member.id
      })
    );

    const rejectedSignup = await request(app)
      .post("/api/v1/partner-signup-requests")
      .send({
        organizationName: "Rejected Lender",
        requestedRole: "LENDER",
        requestedPartnerType: "LENDER",
        contactName: "Rejected User",
        contactEmail: `reject-${Date.now()}@impact.test`
      })
      .expect(201);

    const rejected = await agent
      .post(`/api/v1/partner-signup-requests/${rejectedSignup.body.data.id}/reject`)
      .send({ reviewNotes: "Not enough information." })
      .expect(200);

    expect(rejected.body.data.status).toBe("REJECTED");
  }, 30000);

  it("supports public Intelli-Store credit and booking requests", async () => {
    const store = await request(app).get("/api/v1/public/intelli-store").expect(200);
    const product = store.body.data.products.find((row: { slug: string }) => row.slug === "solar-egg-incubator");
    const bookableAgent =
      store.body.data.agents.find((row: { name: string }) => row.name === "Grace Wanjiku") ?? store.body.data.agents[0];

    expect(product).toEqual(
      expect.objectContaining({
        name: "Solar Egg Incubator",
        status: "ACTIVE",
        priceCents: expect.any(Number)
      })
    );
    expect(bookableAgent).toEqual(expect.objectContaining({ name: expect.any(String) }));

    const programmeId = product.programmeLinks[0].programme.id;
    const creditRequest = await request(app)
      .post("/api/v1/public/intelli-store/credit-requests")
      .send({
        productId: product.id,
        programmeId,
        customerName: "Poultry Group Lead",
        customerEmail: `poultry-${Date.now()}@store.test`,
        phoneNumber: "+254700888001",
        county: "Kiambu",
        groupName: "Ruiru Poultry Group",
        quantity: 2,
        notes: "Requesting incubators for a group enterprise."
      })
      .expect(201);

    expect(creditRequest.body.data).toEqual(
      expect.objectContaining({
        status: "PENDING",
        requestedAmountCents: product.priceCents * 2,
        programmeId,
        distributionAgentId: bookableAgent.id,
        commissionCents: expect.any(Number),
        repaymentStatus: "NOT_FINANCED"
      })
    );

    await request(app)
      .post("/api/v1/public/intelli-store/credit-requests")
      .send({
        productId: product.id,
        programmeId: "wrong-programme",
        customerName: "Invalid Buyer",
        customerEmail: `invalid-${Date.now()}@store.test`,
        phoneNumber: "+254700888002"
      })
      .expect(404);

    const bookingRequest = await request(app)
      .post("/api/v1/public/intelli-store/booking-requests")
      .send({
        villageAgentId: bookableAgent.id,
        serviceType: "Business coaching",
        customerName: "Market Link Chair",
        customerEmail: `booking-${Date.now()}@store.test`,
        phoneNumber: "+254700888003",
        county: "Kiambu",
        groupName: "Market Link VSLA"
      })
      .expect(201);

    expect(bookingRequest.body.data).toEqual(
      expect.objectContaining({
        status: "PENDING",
        villageAgentId: bookableAgent.id,
        programmeId: bookableAgent.programme.id
      })
    );

    const admin = await authenticatedAgent();
    const partners = await admin.get("/api/v1/partners").expect(200);
    const lender = partners.body.data.find((partner: { type: string }) => partner.type === "LENDER");
    expect(lender).toBeTruthy();

    const supplier = await admin
      .post("/api/v1/intelli-store/suppliers")
      .send({
        name: `Poultry Inputs Supplier ${Date.now()}`,
        status: "ACTIVE",
        contactName: "Supplier Contact",
        contactPhone: "+254700888010",
        contactEmail: `supplier-${Date.now()}@store.test`,
        county: "Kiambu",
        location: "Ruiru",
        notes: "API test supplier."
      })
      .expect(201);

    expect(supplier.body.data).toEqual(
      expect.objectContaining({
        status: "ACTIVE",
        county: "Kiambu",
        _count: expect.objectContaining({ products: 0 })
      })
    );

    const updatedSupplier = await admin
      .patch(`/api/v1/intelli-store/suppliers/${supplier.body.data.id}`)
      .send({ location: "Thika supply hub" })
      .expect(200);

    expect(updatedSupplier.body.data.location).toBe("Thika supply hub");

    await admin
      .post("/api/v1/intelli-store/products")
      .send({
        name: `Missing Image Product ${Date.now()}`,
        category: "FARM_INPUTS",
        status: "ACTIVE",
        description: "A product without a main image should be rejected by the catalog API.",
        supplierId: supplier.body.data.id,
        sellerName: "Intelli-Store Agribusiness Desk",
        priceCents: 250000,
        depositCents: 50000,
        currency: "KES",
        inventoryCount: 1,
        programmeIds: [programmeId]
      })
      .expect(400);

    const managedProduct = await admin
      .post("/api/v1/intelli-store/products")
      .send({
        name: `Starter Poultry Feed ${Date.now()}`,
        category: "FARM_INPUTS",
        status: "ACTIVE",
        description: "A starter feed bundle for poultry groups buying through programme-backed credit.",
        imageUrl: "https://example.com/starter-poultry-feed.jpg",
        supplierId: supplier.body.data.id,
        sellerName: "Intelli-Store Agribusiness Desk",
        priceCents: 250000,
        depositCents: 50000,
        currency: "KES",
        inventoryCount: 1,
        programmeIds: [programmeId],
        creditTerms: "20% deposit request, then programme credit review.",
        programmeSettings: [
          {
            programmeId,
            creditTerms: "20% deposit request, then programme credit review.",
            depositRateBps: 2000,
            installmentCount: 4,
            installmentFrequency: "MONTHLY",
            flatInterestRateBps: 1000,
            gracePeriodDays: 14,
            defaultAgentIds: [bookableAgent.id],
            primaryAgentId: bookableAgent.id
          }
        ]
      })
      .expect(201);

    expect(managedProduct.body.data.inventoryCount).toBe(1);
    expect(managedProduct.body.data.imageUrl).toBe("https://example.com/starter-poultry-feed.jpg");
    expect(managedProduct.body.data.supplier.id).toBe(supplier.body.data.id);
    expect(managedProduct.body.data.programmeLinks[0].defaultAgents[0]).toEqual(
      expect.objectContaining({
        isPrimary: true,
        villageAgent: expect.objectContaining({ id: bookableAgent.id })
      })
    );

    const updatedManagedProduct = await admin
      .patch(`/api/v1/intelli-store/products/${managedProduct.body.data.id}`)
      .send({ inventoryCount: 1 })
      .expect(200);
    expect(updatedManagedProduct.body.data.imageUrl).toBe("https://example.com/starter-poultry-feed.jpg");

    const legacyProduct = await prisma.storeProduct.create({
      data: {
        name: `Legacy No Image Product ${Date.now()}`,
        slug: `legacy-no-image-${Date.now()}`,
        category: "FARM_INPUTS",
        status: "ACTIVE",
        supplierId: supplier.body.data.id,
        description: "Legacy product row created before main images were required.",
        sellerName: "Intelli-Store Agribusiness Desk",
        priceCents: 200000,
        depositCents: 20000,
        currency: "KES",
        programmeLinks: {
          create: {
            programmeId,
            depositRateBps: 1000,
            installmentCount: 4,
            installmentFrequency: "MONTHLY",
            flatInterestRateBps: 0,
            gracePeriodDays: 14
          }
        }
      }
    });
    await admin
      .patch(`/api/v1/intelli-store/products/${legacyProduct.id}`)
      .send({ description: "Legacy product updates must include a main image before saving." })
      .expect(400);

    await request(app)
      .post("/api/v1/public/intelli-store/credit-requests")
      .send({
        productId: managedProduct.body.data.id,
        programmeId,
        customerName: "Oversized Buyer",
        customerEmail: `oversized-${Date.now()}@store.test`,
        phoneNumber: "+254700888006",
        quantity: 2
      })
      .expect(400);

    const stockLimitedRequest = await request(app)
      .post("/api/v1/public/intelli-store/credit-requests")
      .send({
        productId: managedProduct.body.data.id,
        programmeId,
        customerName: "Stock Limited Buyer",
        customerEmail: `limited-${Date.now()}@store.test`,
        phoneNumber: "+254700888007",
        quantity: 1
      })
      .expect(201);

    expect(stockLimitedRequest.body.data.distributionAgentId).toBe(bookableAgent.id);

    await request(app)
      .post("/api/v1/public/intelli-store/credit-requests")
      .send({
        productId: managedProduct.body.data.id,
        programmeId,
        customerName: "Second Limited Buyer",
        customerEmail: `limited-second-${Date.now()}@store.test`,
        phoneNumber: "+254700888008",
        quantity: 1
      })
      .expect(400);

    await admin
      .patch(`/api/v1/intelli-store/credit-requests/${stockLimitedRequest.body.data.id}`)
      .send({ status: "FULFILLED" })
      .expect(200);

    const refreshedProducts = await admin.get("/api/v1/intelli-store/products").expect(200);
    const refreshedManagedProduct = refreshedProducts.body.data.find(
      (row: { id: string }) => row.id === managedProduct.body.data.id
    );
    expect(refreshedManagedProduct.inventoryCount).toBe(0);

    const salesBeforeSeedFulfilment = await admin.get("/api/v1/intelli-store/reports/sales").expect(200);
    expect(salesBeforeSeedFulfilment.body.data.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: stockLimitedRequest.body.data.id,
          productName: managedProduct.body.data.name,
          supplierName: supplier.body.data.name,
          grossSalesCents: managedProduct.body.data.priceCents
        })
      ])
    );
    expect(
      salesBeforeSeedFulfilment.body.data.rows.some((row: { id: string }) => row.id === creditRequest.body.data.id)
    ).toBe(false);

    const creditRequests = await admin.get("/api/v1/intelli-store/credit-requests").expect(200);
    expect(creditRequests.body.data.some((row: { id: string }) => row.id === creditRequest.body.data.id)).toBe(true);

    const approvedCredit = await admin
      .patch(`/api/v1/intelli-store/credit-requests/${creditRequest.body.data.id}`)
      .send({
        status: "APPROVED",
        reviewNotes: "Approved by API test.",
        distributionAgentId: bookableAgent.id,
        financierPartnerId: lender.id,
        commissionRateBps: 750
      })
      .expect(200);

    expect(approvedCredit.body.data.status).toBe("APPROVED");
    expect(approvedCredit.body.data.financierPartnerId).toBe(lender.id);
    expect(approvedCredit.body.data.repaymentStatus).toBe("FINANCED");
    expect(approvedCredit.body.data.installments).toHaveLength(6);
    expect(
      approvedCredit.body.data.installments.reduce(
        (sum: number, installment: { principalCents: number }) => sum + installment.principalCents,
        0
      )
    ).toBe(approvedCredit.body.data.financedAmountCents);
    expect(
      approvedCredit.body.data.installments.reduce(
        (sum: number, installment: { interestCents: number }) => sum + installment.interestCents,
        0
      )
    ).toBeGreaterThan(0);
    expect(approvedCredit.body.data.financedAmountCents).toBe(
      approvedCredit.body.data.requestedAmountCents - approvedCredit.body.data.depositCents
    );
    expect(approvedCredit.body.data.commissionCents).toBe(
      Math.floor((approvedCredit.body.data.requestedAmountCents * 750) / 10_000)
    );

    const lenderAgent = await authenticatedAgent("lender@intellicash.co.ke");
    const lenderMe = await lenderAgent.get("/api/v1/auth/me").expect(200);
    expect(lenderMe.body.data.permissions).toEqual(expect.arrayContaining(["store:read", "store:write"]));

    const firstInstallment = approvedCredit.body.data.installments[0];
    await lenderAgent
      .post(`/api/v1/intelli-store/credit-requests/${creditRequest.body.data.id}/repayments`)
      .send({
        installmentId: firstInstallment.id,
        amountCents: firstInstallment.totalDueCents,
        source: "EXTERNAL_REFERENCE",
        provider: "MPESA_DARAJA",
        providerReference: `MPESA-STORE-${Date.now()}`
      })
      .expect(403);

    const repayment = await admin
      .post(`/api/v1/intelli-store/credit-requests/${creditRequest.body.data.id}/repayments`)
      .send({
        installmentId: firstInstallment.id,
        amountCents: firstInstallment.totalDueCents,
        source: "EXTERNAL_REFERENCE",
        provider: "MPESA_DARAJA",
        providerReference: `MPESA-STORE-${Date.now()}`
      })
      .expect(201);

    expect(repayment.body.data.repaymentStatus).toBe("PARTIALLY_PAID");
    expect(repayment.body.data.installments[0]).toEqual(
      expect.objectContaining({
        id: firstInstallment.id,
        status: "PAID",
        paidCents: firstInstallment.totalDueCents
      })
    );

    const loanPortfolio = await admin.get("/api/v1/intelli-store/reports/loan-portfolio").expect(200);
    const portfolioRow = loanPortfolio.body.data.rows.find((row: { id: string }) => row.id === creditRequest.body.data.id);
    expect(portfolioRow).toEqual(
      expect.objectContaining({
        principalCents: approvedCredit.body.data.financedAmountCents,
        paidCents: firstInstallment.totalDueCents,
        repaymentStatus: "PARTIALLY_PAID"
      })
    );
    expect(loanPortfolio.body.data.summary.outstandingCents).toBeGreaterThan(0);

    const groupAgent = await authenticatedAgent("group@intellicash.co.ke");
    const partnerAgent = await authenticatedAgent("partner@intellicash.co.ke");

    await partnerAgent
      .post("/api/v1/intelli-store/suppliers")
      .send({
        name: "Partner Supplier",
        contactEmail: "partner-supplier@store.test"
      })
      .expect(403);

    await partnerAgent
      .post("/api/v1/intelli-store/products")
      .send({
        name: "Partner Managed Product",
        description: "Partners can invest or donate to suppliers but cannot manage the shared catalog.",
        priceCents: 100000,
        programmeIds: [programmeId]
      })
      .expect(403);

    await partnerAgent
      .patch(`/api/v1/intelli-store/credit-requests/${creditRequest.body.data.id}`)
      .send({ status: "FULFILLED" })
      .expect(403);

    await groupAgent
      .post("/api/v1/intelli-store/suppliers")
      .send({
        name: "Group Supplier",
        contactEmail: "group-supplier@store.test"
      })
      .expect(403);

    await groupAgent
      .post("/api/v1/intelli-store/products")
      .send({
        name: "Group Managed Product",
        description: "Groups can request products but cannot manage the shared catalog.",
        priceCents: 100000,
        programmeIds: [programmeId]
      })
      .expect(403);

    const groupProducts = await groupAgent.get("/api/v1/intelli-store/products").expect(200);
    const groupProduct = groupProducts.body.data.find((row: { slug: string }) => row.slug === "solar-egg-incubator");
    expect(groupProduct).toBeTruthy();

    const groupCreditRequest = await groupAgent
      .post("/api/v1/intelli-store/credit-requests")
      .send({
        productId: groupProduct.id,
        programmeId: groupProduct.programmeLinks[0].programme.id,
        customerName: "Tujijenge Group Account",
        customerEmail: "group@intellicash.co.ke",
        phoneNumber: "+254700888004",
        county: "Kiambu",
        groupName: "Tujijenge Women VSLA",
        quantity: 1
      })
      .expect(201);

    expect(groupCreditRequest.body.data).toEqual(
      expect.objectContaining({
        requesterUserId: expect.any(String),
        status: "PENDING"
      })
    );

    await groupAgent
      .patch(`/api/v1/intelli-store/credit-requests/${groupCreditRequest.body.data.id}`)
      .send({ status: "APPROVED" })
      .expect(403);

    await groupAgent
      .patch(`/api/v1/intelli-store/credit-requests/${groupCreditRequest.body.data.id}`)
      .send({ status: "CANCELLED" })
      .expect(200);

    const memberAgent = await authenticatedAgent("member@intellicash.co.ke");
    const memberCreditRequest = await memberAgent
      .post("/api/v1/intelli-store/credit-requests")
      .send({
        productId: groupProduct.id,
        programmeId: groupProduct.programmeLinks[0].programme.id,
        customerName: "Impersonated Buyer",
        customerEmail: "not-mary@example.com",
        phoneNumber: "+254700999999",
        county: "Kiambu",
        groupName: "Other VSLA",
        quantity: 1
      })
      .expect(201);

    expect(memberCreditRequest.body.data).toEqual(
      expect.objectContaining({
        requesterUserId: expect.any(String),
        customerName: "Mary Njeri",
        customerEmail: "member@intellicash.co.ke",
        phoneNumber: "+254700000201",
        groupName: "Tujijenge Women VSLA",
        status: "PENDING"
      })
    );

    await memberAgent
      .patch(`/api/v1/intelli-store/credit-requests/${memberCreditRequest.body.data.id}`)
      .send({ status: "APPROVED" })
      .expect(403);

    await memberAgent
      .patch(`/api/v1/intelli-store/credit-requests/${memberCreditRequest.body.data.id}`)
      .send({ distributionAgentId: "agent-1" })
      .expect(403);

    await memberAgent
      .post(`/api/v1/intelli-store/credit-requests/${memberCreditRequest.body.data.id}/repayments`)
      .send({
        amountCents: 1000,
        source: "MANUAL"
      })
      .expect(403);

    await memberAgent
      .patch(`/api/v1/intelli-store/credit-requests/${memberCreditRequest.body.data.id}`)
      .send({ status: "CANCELLED" })
      .expect(200);

    const groupNameOnlyRequest = await request(app)
      .post("/api/v1/public/intelli-store/credit-requests")
      .send({
        productId: groupProduct.id,
        programmeId: groupProduct.programmeLinks[0].programme.id,
        customerName: "External Buyer",
        customerEmail: "external-buyer@example.com",
        phoneNumber: "+254700888005",
        county: "Kiambu",
        groupName: "Tujijenge Women VSLA",
        quantity: 1
      })
      .expect(201);

    const publicMemberEmailRequest = await request(app)
      .post("/api/v1/public/intelli-store/credit-requests")
      .send({
        productId: groupProduct.id,
        programmeId: groupProduct.programmeLinks[0].programme.id,
        customerName: "Mary Public",
        customerEmail: "member@intellicash.co.ke",
        phoneNumber: "+254700000201",
        county: "Kiambu",
        groupName: "Tujijenge Women VSLA",
        quantity: 1
      })
      .expect(201);

    const groupScopedRequests = await groupAgent.get("/api/v1/intelli-store/credit-requests").expect(200);
    expect(
      groupScopedRequests.body.data.some((row: { id: string }) => row.id === groupNameOnlyRequest.body.data.id)
    ).toBe(true);

    const memberScopedRequests = await memberAgent.get("/api/v1/intelli-store/credit-requests").expect(200);
    expect(
      memberScopedRequests.body.data.some((row: { id: string }) => row.id === memberCreditRequest.body.data.id)
    ).toBe(true);
    expect(
      memberScopedRequests.body.data.some((row: { id: string }) => row.id === publicMemberEmailRequest.body.data.id)
    ).toBe(true);
    expect(
      memberScopedRequests.body.data.some((row: { id: string }) => row.id === groupNameOnlyRequest.body.data.id)
    ).toBe(false);

    const bookingRequests = await admin.get("/api/v1/intelli-store/booking-requests").expect(200);
    expect(bookingRequests.body.data.some((row: { id: string }) => row.id === bookingRequest.body.data.id)).toBe(true);
  }, 60000);

  it("supports wallet deposits, wallet contributions, withdrawal approvals, and idempotent callbacks", async () => {
    const partnerAgent = await authenticatedAgent("partner@intellicash.co.ke");
    const adminAgent = await authenticatedAgent();
    const before = await partnerAgent.get("/api/v1/partner-wallet").expect(200);
    const programmes = await request(app).get("/api/v1/public/programmes").expect(200);
    const programmeId = programmes.body.data[0].id;

    const deposit = await partnerAgent
      .post("/api/v1/partner-wallet/deposits")
      .send({
        provider: "MPESA_DARAJA",
        amountCents: 100000,
        phoneNumber: "254700000201"
      })
      .expect(201);

    expect(deposit.body.data).toEqual(
      expect.objectContaining({
        status: "PENDING",
        type: "DEPOSIT",
        providerReference: expect.stringContaining("mock-")
      })
    );

    const mpesaCallback = {
      Body: {
        stkCallback: {
          CheckoutRequestID: deposit.body.data.providerReference,
          ResultCode: 0,
          ResultDesc: "Accepted",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 1000 },
              { Name: "MpesaReceiptNumber", Value: "RCP12345" },
              { Name: "PhoneNumber", Value: 254700000201 }
            ]
          }
        }
      }
    };

    await request(app).post("/api/v1/payments/mpesa/stk-callback").send(mpesaCallback).expect(200);
    await request(app).post("/api/v1/payments/mpesa/stk-callback").send(mpesaCallback).expect(200);

    const afterDeposit = await partnerAgent.get("/api/v1/partner-wallet").expect(200);
    expect(afterDeposit.body.data.balanceCents).toBe(before.body.data.balanceCents + 100000);

    const contribution = await partnerAgent
      .post(`/api/v1/programmes/${programmeId}/contributions`)
      .send({
        type: "DONATION",
        source: "WALLET",
        amountCents: 50000
      })
      .expect(201);

    expect(contribution.body.data.status).toBe("COMPLETED");

    const withdrawal = await partnerAgent
      .post("/api/v1/partner-wallet/withdrawals")
      .send({
        provider: "MPESA_DARAJA",
        amountCents: 50000,
        payoutPhoneNumber: "254700000201"
      })
      .expect(201);

    expect(withdrawal.body.data.status).toBe("PENDING");

    const held = await partnerAgent.get("/api/v1/partner-wallet").expect(200);
    expect(held.body.data.heldCents).toBe(before.body.data.heldCents + 50000);

    const approved = await adminAgent
      .post(`/api/v1/payment-requests/${withdrawal.body.data.id}/approve-withdrawal`)
      .expect(200);

    expect(approved.body.data.status).toBe("APPROVED");

    await request(app)
      .post("/api/v1/payments/mpesa/b2c-result")
      .send({
        Result: {
          ConversationID: approved.body.data.providerReference,
          ResultCode: 0,
          ResultDesc: "Success",
          ResultParameters: {
            ResultParameter: [{ Key: "TransactionReceipt", Value: "B2C12345" }]
          }
        }
      })
      .expect(200);

    const afterWithdrawal = await partnerAgent.get("/api/v1/partner-wallet").expect(200);
    expect(afterWithdrawal.body.data.heldCents).toBe(before.body.data.heldCents);
    expect(afterWithdrawal.body.data.balanceCents).toBe(before.body.data.balanceCents);
  });

  it("rejects invalid Paystack webhook signatures", async () => {
    const payload = {
      event: "charge.success",
      data: {
        reference: "missing-reference",
        status: "success"
      }
    };
    await request(app)
      .post("/api/v1/payments/paystack/webhook")
      .set("x-paystack-signature", createHmac("sha512", "wrong-secret").update(JSON.stringify(payload)).digest("hex"))
      .send(payload)
      .expect(400);
  });

  it("stores sandbox integration credentials without returning secret values", async () => {
    const agent = await authenticatedAgent();
    const saved = await agent
      .put("/api/v1/integrations/PAYSTACK/credentials")
      .send({
        credentials: {
          PAYSTACK_SECRET_KEY: "sk_test_demo",
          PAYSTACK_PUBLIC_KEY: "pk_test_demo"
        }
      })
      .expect(200);

    expect(saved.body.data.configured).toBe(true);
    expect(saved.body.data.storedCredentialKeys).toEqual([
      "PAYSTACK_SECRET_KEY",
      "PAYSTACK_PUBLIC_KEY"
    ]);
    expect(JSON.stringify(saved.body.data)).not.toContain("sk_test_demo");

    const status = await agent.get("/api/v1/integrations/PAYSTACK/status").expect(200);
    expect(status.body.data.configured).toBe(true);
    expect(status.body.data.missingEnv).toEqual([]);

    const cleared = await agent.delete("/api/v1/integrations/PAYSTACK/credentials").expect(200);
    expect(cleared.body.data.configured).toBe(false);
  });

  it("stores Google Maps browser key for dashboard map configuration", async () => {
    const agent = await authenticatedAgent();
    const emptyConfig = await agent
      .get("/api/v1/integrations/GOOGLE_MAPS/public-config")
      .expect(200);

    expect(emptyConfig.body.data.configured).toBe(false);
    expect(emptyConfig.body.data.apiKey).toBeNull();

    const saved = await agent
      .put("/api/v1/integrations/GOOGLE_MAPS/credentials")
      .send({
        credentials: {
          GOOGLE_MAPS_BROWSER_API_KEY: "AIza-demo-browser-key"
        }
      })
      .expect(200);

    expect(saved.body.data.configured).toBe(true);
    expect(saved.body.data.storedCredentialKeys).toEqual(["GOOGLE_MAPS_BROWSER_API_KEY"]);
    expect(JSON.stringify(saved.body.data)).not.toContain("AIza-demo-browser-key");

    const configured = await agent
      .get("/api/v1/integrations/GOOGLE_MAPS/public-config")
      .expect(200);

    expect(configured.body.data).toEqual(
      expect.objectContaining({
        provider: "GOOGLE_MAPS",
        configured: true,
        apiKey: "AIza-demo-browser-key",
        source: "stored"
      })
    );

    const cleared = await agent.delete("/api/v1/integrations/GOOGLE_MAPS/credentials").expect(200);
    expect(cleared.body.data.configured).toBe(false);
  });

  it("scopes partner, group, and member accounts to relevant data", async () => {
    const partnerAgent = await authenticatedAgent("partner@intellicash.co.ke");
    const partnerGroups = await partnerAgent.get("/api/v1/groups").expect(200);

    expect(partnerGroups.body.data.length).toBeGreaterThanOrEqual(2);
    expect(
      partnerGroups.body.data.every(
        (group: { programme?: { partner?: { name?: string } } }) =>
          group.programme?.partner?.name === "FLOURISH VSLA Programme"
      )
    ).toBe(true);
    const partnerAudit = await partnerAgent.get("/api/v1/audit/events").expect(200);
    expect(Array.isArray(partnerAudit.body.data)).toBe(true);

    const groupAgent = await authenticatedAgent("group@intellicash.co.ke");
    const groupGroups = await groupAgent.get("/api/v1/groups").expect(200);
    expect(groupGroups.body.data).toHaveLength(1);
    expect(groupGroups.body.data[0].code).toBe("IWL-KBU-0001");

    const memberAgent = await authenticatedAgent("member@intellicash.co.ke");
    const memberGroups = await memberAgent.get("/api/v1/groups").expect(200);
    expect(memberGroups.body.data).toHaveLength(1);

    const groupId = memberGroups.body.data[0].id;
    const visibleMembers = await memberAgent.get(`/api/v1/groups/${groupId}/members`).expect(200);
    expect(visibleMembers.body.data).toHaveLength(1);
    expect(visibleMembers.body.data[0].fullName).toBe("Mary Njeri");
    const memberId = visibleMembers.body.data[0].id;

    const visibleLedger = await memberAgent.get(`/api/v1/groups/${groupId}/ledger`).expect(200);
    expect(visibleLedger.body.data.length).toBeGreaterThan(0);
    expect(
      visibleLedger.body.data.every((entry: { member?: { fullName?: string } | null }) =>
        entry.member?.fullName === "Mary Njeri"
      )
    ).toBe(true);

    const assertOwnMeetingDetails = (
      meetings: Array<{
        attendance?: Array<{ member?: { id?: string } | null }>;
        keySubmissions?: Array<{ memberId?: string; member?: { id?: string } | null }>;
      }>
    ) => {
      expect(
        meetings.flatMap((meeting) => meeting.attendance ?? []).every((attendance) =>
          attendance.member?.id === memberId
        )
      ).toBe(true);
      expect(
        meetings.flatMap((meeting) => meeting.keySubmissions ?? []).every((submission) =>
          submission.memberId === memberId && submission.member?.id === memberId
        )
      ).toBe(true);
    };

    const memberMeetings = await memberAgent.get("/api/v1/meetings").expect(200);
    expect(memberMeetings.body.data.length).toBeGreaterThan(0);
    expect(
      memberMeetings.body.data.every((meeting: { group?: { id?: string } | null }) =>
        meeting.group?.id === groupId
      )
    ).toBe(true);
    const meetingLedger = await memberAgent
      .get(`/api/v1/groups/${groupId}/ledger?meetingId=${memberMeetings.body.data[0].id}`)
      .expect(200);
    expect(
      meetingLedger.body.data.every(
        (entry: { meetingId?: string | null; memberId?: string | null }) =>
          entry.meetingId === memberMeetings.body.data[0].id && entry.memberId === memberId
      )
    ).toBe(true);
    assertOwnMeetingDetails(memberMeetings.body.data);

    const memberGroupMeetings = await memberAgent.get(`/api/v1/groups/${groupId}/meetings`).expect(200);
    expect(memberGroupMeetings.body.data.length).toBeGreaterThan(0);
    assertOwnMeetingDetails(memberGroupMeetings.body.data);
    await memberAgent.get(`/api/v1/groups/${groupId}/votes`).expect(403);

    const otherGroup = partnerGroups.body.data.find((group: { id: string }) => group.id !== groupId);
    if (!otherGroup) {
      throw new Error("Expected seed data to include another group outside the member account.");
    }
    await memberAgent.get(`/api/v1/groups/${otherGroup.id}/meetings`).expect(404);

    await memberAgent.get("/api/v1/users").expect(403);
  }, 15000);
});

async function authenticatedAgent(email = "admin@intellicash.co.ke") {
  const agent = request.agent(app);
  await agent
    .post("/api/v1/auth/login")
    .send({
      email,
      password: "IntellicashDemo#2026"
    })
    .expect(200);

  return agent;
}

afterAll(async () => {
  await prisma.$disconnect();
});
