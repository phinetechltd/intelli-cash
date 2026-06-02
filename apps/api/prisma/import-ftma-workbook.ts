import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { fundTypes } from "@intellicash/shared";
import { readSheet } from "read-excel-file/node";

const prisma = new PrismaClient();
const sourceSystem = "FTMA_PERFORMANCE";
type SheetRow = unknown[];
type WorkbookSheets = Record<string, SheetRow[]>;

interface VslaKpi {
  county: string;
  metricDate: Date | null;
  vslaGroupCount: number;
  membershipCount: number;
  nhifUptakeRate: number | null;
  externalLoanUptakeRate: number | null;
  actionableMarketingPlanRate: number | null;
  savingsCents: number;
  outstandingLoanCents: number;
  socialFundCents: number;
  sourceRowJson: string;
}

interface VslaOnboardingRow {
  rowNumber: number;
  sourceNo: number;
  name: string;
  county: string;
  location: string | null;
  registeredMembers: number;
  composition: string | null;
  objective: string | null;
  contactName: string | null;
  contactPhone: string | null;
  feedback: string | null;
}

function cell(row: SheetRow, index: number) {
  return row[index - 1];
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

function toInt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const text = cleanText(value);
  if (!text) return 0;
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function toFloat(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanText(value);
  if (!text) return null;
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toCents(value: unknown) {
  const parsed = toFloat(value);
  return parsed === null ? 0 : Math.round(parsed * 100);
}

function toDate(value: unknown) {
  if (value instanceof Date) return value;
  const text = cleanText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateText(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return cleanText(value);
}

function normalizePhone(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, "");

  if (digits.length === 9) return `+254${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+254${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("254")) return `+${digits}`;

  return text;
}

function sourceNo(value: unknown, fallback: number) {
  const parsed = toInt(value);
  return parsed > 0 ? parsed : fallback;
}

function sourceCode(prefix: string, no: number, rowNumber: number) {
  return `${prefix}-${String(no || rowNumber).padStart(4, "0")}-${String(rowNumber).padStart(4, "0")}`;
}

function memberRole(contactName: string | null) {
  const normalized = contactName?.toLowerCase() ?? "";
  if (normalized.includes("chair")) return "CHAIRPERSON";
  if (normalized.includes("secretary")) return "SECRETARY";
  if (normalized.includes("treasurer")) return "TREASURER";
  if (normalized.includes("keeper")) return "KEY_HOLDER";
  return "MEMBER";
}

function contactFullName(groupName: string, contactName: string | null) {
  const generic = ["chairperson", "box keeper", "secretary", "treasurer", "n/a", "na"];
  if (contactName && !generic.includes(contactName.toLowerCase())) return contactName;
  return `${groupName} Contact`;
}

function sourceRow(row: SheetRow, from: number, to: number) {
  const payload: Record<string, unknown> = {};
  for (let index = from; index <= to; index += 1) {
    payload[String(index)] = cell(row, index);
  }
  return JSON.stringify(payload);
}

function sheetRows(workbook: WorkbookSheets, name: string) {
  return workbook[name] ?? [];
}

function readVslaKpis(workbook: WorkbookSheets) {
  const sheet = sheetRows(workbook, "VSLA_KPI");
  const dateRow = sheet.find((row) => cleanText(cell(row, 2))?.toLowerCase() === "date");
  const metricDate = toDate(dateRow ? cell(dateRow, 3) : null);
  const rows: VslaKpi[] = [];

  sheet.forEach((row) => {
    const county = cleanText(cell(row, 2));
    if (!county || ["total", "date", "kpis"].includes(county.toLowerCase())) return;
    if (toInt(cell(row, 3)) === 0 && toInt(cell(row, 4)) === 0) return;

    rows.push({
      county,
      metricDate,
      vslaGroupCount: toInt(cell(row, 3)),
      membershipCount: toInt(cell(row, 4)),
      nhifUptakeRate: toFloat(cell(row, 5)),
      externalLoanUptakeRate: toFloat(cell(row, 6)),
      actionableMarketingPlanRate: toFloat(cell(row, 7)),
      savingsCents: toCents(cell(row, 8)),
      outstandingLoanCents: toCents(cell(row, 9)),
      socialFundCents: toCents(cell(row, 10)),
      sourceRowJson: sourceRow(row, 2, 10)
    });
  });

  return rows;
}

function readVslaOnboarding(workbook: WorkbookSheets) {
  const sheet = sheetRows(workbook, "Onboarding statistics_VSLA");
  const rows: VslaOnboardingRow[] = [];
  sheet.forEach((row, index) => {
    const rowNumber = index + 1;
    const name = cleanText(cell(row, 3));
    const county = cleanText(cell(row, 4));
    if (name?.toLowerCase() === "group name") return;
    if (!name || !county) return;

    rows.push({
      rowNumber,
      sourceNo: sourceNo(cell(row, 2), rowNumber),
      name,
      county,
      location: cleanText(cell(row, 5)),
      registeredMembers: Math.max(1, toInt(cell(row, 6))),
      composition: cleanText(cell(row, 7)),
      objective: cleanText(cell(row, 8)),
      contactName: cleanText(cell(row, 9)),
      contactPhone: normalizePhone(cell(row, 10)),
      feedback: cleanText(cell(row, 11))
    });
  });

  return rows;
}

async function clearPreviousImport() {
  await prisma.ftmaPartnerLinkage.deleteMany();
  await prisma.ftmaCountyFscKpi.deleteMany();
  await prisma.ftmaCountyVslaTrainingMetric.deleteMany();
  await prisma.ftmaCountyVslaKpi.deleteMany();
  await prisma.ftmaImportBatch.deleteMany({ where: { sourceFile: { contains: "FtMA Performance" } } });
  await prisma.programmeGroup.deleteMany({
    where: {
      OR: [
        { programme: { sourceSystem } },
        { group: { sourceSystem } }
      ]
    }
  });
  await prisma.group.deleteMany({ where: { sourceSystem } });
  await prisma.villageAgent.deleteMany({ where: { sourceSystem } });
  await prisma.programmePartner.deleteMany({
    where: {
      OR: [
        { programme: { sourceSystem } },
        { partner: { sourceSystem } }
      ]
    }
  });
  await prisma.programme.deleteMany({ where: { sourceSystem } });
  await prisma.partner.deleteMany({ where: { sourceSystem } });
}

async function importCountyMetrics(workbook: WorkbookSheets) {
  const vslaKpis = readVslaKpis(workbook);
  await prisma.ftmaCountyVslaKpi.createMany({ data: vslaKpis });

  const vslaSheet = sheetRows(workbook, "VSLA");
  if (vslaSheet.length > 0) {
    const rows: Prisma.FtmaCountyVslaTrainingMetricCreateManyInput[] = [];
    vslaSheet.forEach((row) => {
      const county = cleanText(cell(row, 1));
      if (!county || ["total", "county", "basic information"].includes(county.toLowerCase())) return;
      if (toInt(cell(row, 2)) === 0 && toInt(cell(row, 3)) === 0) return;

      rows.push({
        county,
        assessedVslaCount: toInt(cell(row, 2)),
        newGroupsCount: toInt(cell(row, 3)),
        bdsModulesCount: toInt(cell(row, 4)),
        nhifSensitizedCount: toInt(cell(row, 5)),
        linkedToMarketCount: toInt(cell(row, 6)),
        linkedToFinanceCount: toInt(cell(row, 7)),
        marketLinkageCount: toInt(cell(row, 8)),
        inputDistributorLinkageCount: toInt(cell(row, 9)),
        valueAdditionTrainingCount: toInt(cell(row, 10)),
        sourceRowJson: sourceRow(row, 1, 10)
      });
    });
    await prisma.ftmaCountyVslaTrainingMetric.createMany({ data: rows });
  }

  const fscSheet = sheetRows(workbook, "FSC_KPI");
  if (fscSheet.length > 0) {
    const rows: Prisma.FtmaCountyFscKpiCreateManyInput[] = [];
    fscSheet.forEach((row) => {
      const county = cleanText(cell(row, 2));
      if (!county || ["total", "county", "basic information"].includes(county.toLowerCase())) return;
      if (toInt(cell(row, 3)) === 0) return;

      rows.push({
        county,
        fscBdsModulesCount: toInt(cell(row, 3)),
        actionableBusinessPlanRate: toFloat(cell(row, 4)),
        nhifMembershipRate: toFloat(cell(row, 5)),
        financialInstitutionLinkages: toInt(cell(row, 6)),
        marketLinkages: toInt(cell(row, 7)),
        inputDistributorLinkages: toInt(cell(row, 8)),
        otherTrainings: toInt(cell(row, 9)),
        sourceRowJson: sourceRow(row, 2, 9)
      });
    });
    await prisma.ftmaCountyFscKpi.createMany({ data: rows });
  }

  return vslaKpis;
}

async function importPartners(workbook: WorkbookSheets, programmeId: string) {
  const sheet = sheetRows(workbook, "Key partners");
  if (sheet.length === 0) return 0;

  let count = 0;
  for (const [index, row] of sheet.entries()) {
    const rowNumberFallback = index + 1;
    const institutionName = cleanText(cell(row, 5));
    if (institutionName?.toLowerCase() === "onboarded partners/institution") continue;
    if (!institutionName) continue;

    const rowNumber = sourceNo(cell(row, 2), rowNumberFallback);
    const linkageType = cleanText(cell(row, 10));
    const partnerType = linkageType?.toLowerCase().includes("finance") ? "LENDER" : "PARTNER";
    const contactPhone = normalizePhone(cell(row, 12));

    await prisma.ftmaPartnerLinkage.create({
      data: {
        rowNumber,
        dateText: dateText(cell(row, 3)),
        projectOfficer: cleanText(cell(row, 4)),
        institutionName,
        county: cleanText(cell(row, 6)),
        constituency: cleanText(cell(row, 7)),
        valueProposition: cleanText(cell(row, 8)),
        capacity: cleanText(cell(row, 9)),
        linkageType,
        contactName: cleanText(cell(row, 11)),
        contactPhone,
        sourceRowJson: sourceRow(row, 2, 12)
      }
    });

    const partner = await prisma.partner.create({
      data: {
        name: institutionName,
        type: partnerType,
        status: "ACTIVE",
        apiScope: "PROGRAMME",
        county: cleanText(cell(row, 6)),
        contactName: cleanText(cell(row, 11)),
        contactPhone,
        valueProposition: cleanText(cell(row, 8)),
        capacity: cleanText(cell(row, 9)),
        linkageType,
        sourceSystem,
        sourceReference: `Key partners row ${rowNumber}`
      }
    });

    await prisma.programmePartner.create({
      data: {
        programmeId,
        partnerId: partner.id,
        role: partnerType === "LENDER" ? "LENDER" : "PARTNER"
      }
    });
    count += 1;
  }

  return count;
}

async function importFscs(workbook: WorkbookSheets, programmeId: string) {
  const sheet = sheetRows(workbook, "Onboarding statistics_FSCs");
  const countyAgents = new Map<string, string[]>();
  if (sheet.length === 0) return countyAgents;

  for (const [index, row] of sheet.entries()) {
    const rowNumber = index + 1;
    const name = cleanText(cell(row, 4));
    const county = cleanText(cell(row, 6));
    if (name?.toLowerCase() === "fsc name") continue;
    if (!name || !county) continue;

    const sourceReference = sourceCode("FTMA-FSC", sourceNo(cell(row, 2), rowNumber), rowNumber);
    const agent = await prisma.villageAgent.create({
      data: {
        programmeId,
        name,
        phone: normalizePhone(cell(row, 10)) ?? "+254700000000",
        gender: cleanText(cell(row, 5)),
        projectOfficer: cleanText(cell(row, 3)),
        county,
        location: cleanText(cell(row, 7)),
        feedback: cleanText(cell(row, 11)),
        sourceSystem,
        sourceReference,
        caseloadLimit: Math.max(1, toInt(cell(row, 8))),
        digitalLiteracyScore: 80
      }
    });

    countyAgents.set(county, [...(countyAgents.get(county) ?? []), agent.id]);
  }

  return countyAgents;
}

async function importVslas(
  workbook: WorkbookSheets,
  programmeId: string,
  countyAgents: Map<string, string[]>,
  vslaKpis: VslaKpi[]
) {
  const rows = readVslaOnboarding(workbook);
  const kpiByCounty = new Map(vslaKpis.map((kpi) => [kpi.county.toLowerCase(), kpi]));
  const memberTotalsByCounty = rows.reduce<Record<string, number>>((accumulator, row) => {
    const key = row.county.toLowerCase();
    accumulator[key] = (accumulator[key] ?? 0) + row.registeredMembers;
    return accumulator;
  }, {});
  const agentIndexByCounty = new Map<string, number>();

  let memberCount = 0;
  let groupCount = 0;

  for (const row of rows) {
    const agents = countyAgents.get(row.county) ?? [];
    const agentIndex = agentIndexByCounty.get(row.county) ?? 0;
    const villageAgentId = agents.length > 0 ? agents[agentIndex % agents.length] : undefined;
    agentIndexByCounty.set(row.county, agentIndex + 1);

    const code = sourceCode("FTMA-VSLA", row.sourceNo, row.rowNumber);
    const group = await prisma.group.create({
      data: {
        programmeId,
        villageAgentId,
        name: row.name,
        code,
        phase: "MOBILISATION",
        county: row.county,
        subCounty: row.location,
        location: row.location,
        composition: row.composition,
        objective: row.objective,
        contactPersonName: row.contactName,
        contactPhone: row.contactPhone,
        onboardingFeedback: row.feedback,
        sourceSystem,
        sourceReference: code,
        cycleNumber: 1
      }
    });

    await prisma.programmeGroup.create({
      data: {
        programmeId,
        groupId: group.id,
        role: "PRIMARY"
      }
    });

    const kpi = kpiByCounty.get(row.county.toLowerCase());
    const countyMembers = memberTotalsByCounty[row.county.toLowerCase()] || row.registeredMembers;
    const share = row.registeredMembers / countyMembers;
    const balances: Record<string, number> = {
      INTERNAL_LOAN: Math.round((kpi?.savingsCents ?? 0) * share),
      SOCIAL: Math.round((kpi?.socialFundCents ?? 0) * share),
      EXTERNAL_LOAN: Math.round((kpi?.outstandingLoanCents ?? 0) * share),
      GRANT: 0,
      VSLF: 0
    };

    await prisma.fundAccount.createMany({
      data: fundTypes.map((type) => ({
        groupId: group.id,
        type,
        balanceCents: balances[type] ?? 0
      }))
    });

    const score = Math.round(
      45 +
        (kpi?.nhifUptakeRate ?? 0) * 18 +
        (kpi?.externalLoanUptakeRate ?? 0) * 18 +
        (kpi?.actionableMarketingPlanRate ?? 0) * 18
    );
    await prisma.creditScore.create({
      data: {
        groupId: group.id,
        score: Math.max(45, Math.min(95, score)),
        breakdownJson: JSON.stringify({
          nhifUptakeRate: kpi?.nhifUptakeRate ?? null,
          externalLoanUptakeRate: kpi?.externalLoanUptakeRate ?? null,
          actionableMarketingPlanRate: kpi?.actionableMarketingPlanRate ?? null,
          registeredMembers: row.registeredMembers
        })
      }
    });

    const members = [];
    const contactName = contactFullName(row.name, row.contactName);
    members.push({
      groupId: group.id,
      fullName: contactName,
      phone: row.contactPhone ?? "+254700000000",
      role: memberRole(row.contactName),
      kycStatus: "PENDING",
      status: "ACTIVE"
    });

    for (let index = 2; index <= row.registeredMembers; index += 1) {
      members.push({
        groupId: group.id,
        fullName: `${row.name} Member ${index}`,
        phone: "+254700000000",
        role: "MEMBER",
        kycStatus: "PENDING",
        status: "ACTIVE"
      });
    }

    for (let index = 0; index < members.length; index += 500) {
      await prisma.member.createMany({ data: members.slice(index, index + 500) });
    }

    groupCount += 1;
    memberCount += members.length;
  }

  return { groupCount, memberCount };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: npm run import:ftma -w @intellicash/api -- <workbook.xlsx>");
  }

  const workbookPath = resolve(inputPath);
  if (!existsSync(workbookPath)) {
    throw new Error(`Workbook not found: ${workbookPath}`);
  }

  const workbook = Object.fromEntries(
    (
      await Promise.all(
        [
          "VSLA_KPI",
          "Onboarding statistics_VSLA",
          "Onboarding statistics_FSCs",
          "VSLA",
          "FSC_KPI",
          "Key partners"
        ].map(async (sheet) => [sheet, await readSheet(workbookPath, sheet)] as const)
      )
    ).map(([sheet, data]) => [sheet, data as SheetRow[]])
  );

  await clearPreviousImport();

  const sourcePartner = await prisma.partner.create({
    data: {
      name: "FtMA Performance Test Data",
      type: "NGO",
      status: "ACTIVE",
      apiScope: "PROGRAMME",
      sourceSystem,
      sourceReference: basename(workbookPath)
    }
  });
  const programme = await prisma.programme.create({
    data: {
      partnerId: sourcePartner.id,
      name: "FtMA VSLA & FSC Performance",
      country: "Kenya",
      description: "Imported test data from FtMA Performance - VSLA & FSCs workbook.",
      sourceSystem,
      sourceReference: basename(workbookPath)
    }
  });
  await prisma.programmePartner.create({
    data: {
      programmeId: programme.id,
      partnerId: sourcePartner.id,
      role: "IMPLEMENTING_PARTNER"
    }
  });

  const vslaKpis = await importCountyMetrics(workbook);
  const partnerCount = await importPartners(workbook, programme.id);
  const countyAgents = await importFscs(workbook, programme.id);
  const { groupCount, memberCount } = await importVslas(
    workbook,
    programme.id,
    countyAgents,
    vslaKpis
  );
  const fscCount = Array.from(countyAgents.values()).reduce((sum, agents) => sum + agents.length, 0);

  const summary = {
    sourceFile: workbookPath,
    vslaGroups: groupCount,
    members: memberCount,
    fscs: fscCount,
    keyPartners: partnerCount,
    countyVslaKpis: vslaKpis.length
  };

  await prisma.ftmaImportBatch.create({
    data: {
      sourceFile: basename(workbookPath),
      summaryJson: JSON.stringify(summary)
    }
  });

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
