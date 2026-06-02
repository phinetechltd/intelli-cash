import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { demoAccounts, demoPassword } from "@intellicash/shared";
import AccountPage from "../src/app/dashboard/account/page";
import ApiDocsPage from "../src/app/dashboard/api-docs/page";
import DashboardOverviewPage from "../src/app/dashboard/page";
import MemberPassbookPage from "../src/app/dashboard/passbook/page";
import IntelliAuditPage from "../src/app/dashboard/intelliaudit/page";
import DashboardIntelliStorePage from "../src/app/dashboard/intelli-store/page";
import MeetingsPage from "../src/app/dashboard/meetings/page";
import AgentsPage from "../src/app/dashboard/agents/page";
import GroupsPage from "../src/app/dashboard/groups/page";
import LoginPage from "../src/app/login/page";
import AdminLoginPage from "../src/app/admin-login/page";
import PartnerLoginPage from "../src/app/partner-login/page";
import SettingsPage from "../src/app/dashboard/settings/page";
import PaymentsAdminPage from "../src/app/dashboard/payments/page";
import ProgrammesPage from "../src/app/dashboard/programmes/page";
import ReportsPage from "../src/app/dashboard/reports/page";
import IntelliStorePage from "../src/app/intelli-store/page";
import LandingPage from "../src/app/page";
import ContactPage from "../src/app/contact/page";
import PublicPartnersPage from "../src/app/partners/page";
import { DashboardShell } from "../src/components/dashboard/dashboard-shell";
import { formatKes, humanizeEnum } from "../src/lib/api";
import { navigationItems } from "../src/lib/navigation";

const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useParams: () => ({}),
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: routerPushMock })
}));

function SmokeSurface() {
  return (
    <main>
      {navigationItems.map((item) => (
        <a href={item.href} key={item.label}>
          {item.label}
        </a>
      ))}
    </main>
  );
}

describe("web smoke helpers", () => {
  it("renders admin navigation targets", () => {
    render(<SmokeSurface />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Account")).not.toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
    expect(screen.getByText("Intelli-Store")).toBeInTheDocument();
    expect(screen.getByText("IntelliAudit")).toBeInTheDocument();
    expect(screen.getByText("API Docs")).toBeInTheDocument();
    expect(screen.getByText("Integrations")).toBeInTheDocument();
  });

  it("scopes the API Docs navigation item to integration roles", () => {
    const apiDocs = navigationItems.find((item) => item.href === "/dashboard/api-docs");

    expect(apiDocs).toEqual(
      expect.objectContaining({
        label: "API Docs",
        roles: ["IWL_ADMIN", "PARTNER_OFFICER", "LENDER", "READ_ONLY"]
      })
    );
    expect(apiDocs?.roles).not.toContain("GROUP_ACCOUNT");
    expect(apiDocs?.roles).not.toContain("MEMBER");
  });

  it("keeps group account navigation focused on app actions", () => {
    const groupItems = navigationItems.filter((item) => item.roles.includes("GROUP_ACCOUNT"));

    expect(groupItems.map((item) => item.label)).toEqual([
      "Dashboard",
      "Meetings",
      "Intelli-Store",
      "Reports"
    ]);
    expect(groupItems.map((item) => item.label)).not.toContain("Groups");
  });

  it("orders member navigation as dashboard, meetings, then passbook", () => {
    const memberItems = navigationItems.filter((item) => item.roles.includes("MEMBER"));

    expect(memberItems.slice(0, 3).map((item) => item.label)).toEqual([
      "Dashboard",
      "Meetings",
      "Passbook"
    ]);
  });

  it("shows in-app notifications in the dashboard shell", async () => {
    routerPushMock.mockReset();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      let data: unknown = {};

      if (url.includes("/auth/me") && init?.method === "PATCH") {
        data = {
          id: "member-user",
          name: "Mary Njeri",
          email: "member@intellicash.co.ke",
          role: "MEMBER",
          languagePreference: "KISWAHILI",
          groupId: "group-1",
          memberId: "member-1",
          permissions: ["groups:read", "meetings:read", "ledger:read"],
          group: { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001" },
          member: { id: "member-1", fullName: "Mary Njeri", phone: "+254700000201" }
        };
      } else if (url.includes("/auth/me")) {
        data = {
          id: "member-user",
          name: "Mary Njeri",
          email: "member@intellicash.co.ke",
          role: "MEMBER",
          languagePreference: "ENGLISH",
          groupId: "group-1",
          memberId: "member-1",
          permissions: ["groups:read", "meetings:read", "ledger:read"],
          group: { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001" },
          member: { id: "member-1", fullName: "Mary Njeri", phone: "+254700000201" }
        };
      } else if (url.endsWith("/notifications/n-1/read") && init?.method === "POST") {
        data = {
          id: "n-1",
          title: "Meeting starts today",
          body: "Week 9 meeting is ready.",
          type: "MEETING",
          href: "/dashboard/meetings",
          readAt: "2026-06-01T09:00:00.000Z",
          createdAt: "2026-06-01T08:00:00.000Z"
        };
      } else if (url.endsWith("/notifications")) {
        data = [
          {
            id: "n-1",
            title: "Meeting starts today",
            body: "Week 9 meeting is ready.",
            type: "MEETING",
            href: "/dashboard/meetings",
            readAt: null,
            createdAt: "2026-06-01T08:00:00.000Z"
          },
          {
            id: "n-2",
            title: "Passbook updated",
            body: "Your latest share purchase is visible.",
            type: "PASSBOOK",
            href: "/dashboard/passbook",
            readAt: null,
            createdAt: "2026-06-01T07:00:00.000Z"
          }
        ];
      } else if (url.endsWith("/notifications/read-all") && init?.method === "POST") {
        data = { updated: 2 };
      }

      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <DashboardShell>
        <div>Dashboard body</div>
      </DashboardShell>
    );

    const notificationButton = await screen.findByRole("button", {
      name: /Notifications, 2 unread/
    });
    const languageButton = screen.getByRole("button", {
      name: /Change language, current English/i
    });
    fireEvent.click(languageButton);
    expect(screen.getByRole("menuitemradio", { name: /Kiswahili/i })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Kiswahili/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/auth/me"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ languagePreference: "KISWAHILI" })
        })
      )
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Change language, current Kiswahili/i })).toBeInTheDocument()
    );

    const profileButton = screen.getByRole("button", {
      name: /Open profile menu for Mary Njeri/i
    });
    expect(profileButton).toHaveAttribute("title", "Mary Njeri");
    fireEvent.click(profileButton);
    expect(screen.getByRole("menuitem", { name: /Account/i })).toHaveAttribute("href", "/dashboard/account");
    expect(screen.getByRole("menuitem", { name: /Settings/i })).toHaveAttribute("href", "/dashboard/settings");
    expect(screen.getByRole("menuitem", { name: /Help & Support/i })).toHaveAttribute("href", "/dashboard/help-support");

    fireEvent.click(notificationButton);

    expect(await screen.findByText("Meeting starts today")).toBeInTheDocument();
    expect(screen.getByText("Passbook updated")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Meeting starts today/ }));

    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith("/dashboard/meetings"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/notifications/n-1/read"),
      expect.objectContaining({ method: "POST" })
    );
    vi.unstubAllGlobals();
  });

  it("renders group account PWA install controls and app bottom tabs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const data = url.includes("/auth/me")
          ? {
              id: "group-user",
              name: "Tujijenge Group Account",
              email: "group@intellicash.co.ke",
              role: "GROUP_ACCOUNT",
              groupId: "group-1",
              permissions: ["groups:read", "meetings:read", "store:read", "reports:approve"],
              group: { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001" }
            }
          : [];

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(
      <DashboardShell>
        <div>Group dashboard body</div>
      </DashboardShell>
    );

    expect(await screen.findByRole("button", { name: /Download app/i })).toBeInTheDocument();
    const bottomTabs = screen.getByLabelText("Group account app navigation");
    expect(within(bottomTabs).getByText("Dashboard")).toBeInTheDocument();
    expect(within(bottomTabs).getByText("Meetings")).toBeInTheDocument();
    expect(within(bottomTabs).getByText("Store")).toBeInTheDocument();
    expect(within(bottomTabs).getByText("Reports")).toBeInTheDocument();
    expect(within(bottomTabs).queryByText("Groups")).not.toBeInTheDocument();
    expect(within(bottomTabs).queryByText("Entry")).not.toBeInTheDocument();
    expect(within(bottomTabs).getByText("Account")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows admin-managed group account PWA settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const data = url.includes("/auth/me")
          ? {
              id: "admin-user",
              name: "IWL Platform Admin",
              email: "admin@intellicash.co.ke",
              role: "IWL_ADMIN",
              languagePreference: "ENGLISH"
            }
          : url.includes("/integrations/health")
            ? { configured: 2, total: 4, providers: [] }
            : { status: "ok" };

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<SettingsPage />);

    expect(await screen.findByText("Group Account PWA")).toBeInTheDocument();
    expect(screen.getByText("Admin managed install experience")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manifest/i })).toHaveAttribute("href", "/manifest.webmanifest");
    expect(screen.getByRole("link", { name: /Service worker/i })).toHaveAttribute("href", "/sw.js");
    vi.unstubAllGlobals();
  });

  it("lets admin assign a VA / CBT and record field visit before group account approval", async () => {
    const fieldAgent = {
      id: "agent-1",
      name: "Grace Wanjiku",
      phone: "+254700000101",
      status: "ACTIVE",
      county: "Kiambu",
      digitalLiteracyScore: 91,
      caseloadLimit: 20,
      programme: null,
      groups: [],
      _count: { groups: 2 }
    };
    let signupRequest = {
      id: "signup-1",
      organizationName: "Kiritiri Smart Chama",
      organizationType: "Chama",
      requestedRole: "GROUP_ACCOUNT",
      requestedPartnerType: "GROUP_ACCOUNT",
      contactName: "Peter Mwangi",
      contactEmail: "peter@groups.test",
      contactPhone: "+254711222333",
      county: "Embu",
      groupSubCounty: "Mbeere South",
      groupLocation: "Kiritiri",
      groupMeetingDay: "Wednesday",
      groupObjective: "Digitise group meetings.",
      estimatedMembers: 24,
      championRole: "SECRETARY",
      assignedVillageAgentId: null as string | null,
      assignedVillageAgent: null as typeof fieldAgent | null,
      fieldVisitStatus: "PENDING_ASSIGNMENT",
      fieldVisitNotes: null as string | null,
      status: "PENDING",
      reviewNotes: null as string | null,
      createdAt: "2026-06-01T08:00:00.000Z"
    };
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        calls.push({ url, body });

        if (url.includes("/assign-agent") && init?.method === "PATCH") {
          signupRequest = {
            ...signupRequest,
            assignedVillageAgentId: String(body.villageAgentId),
            assignedVillageAgent: fieldAgent,
            fieldVisitStatus: "PENDING_VISIT",
            fieldVisitNotes: String(body.notes ?? "")
          };
          return new Response(JSON.stringify({ data: signupRequest }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        if (url.includes("/field-visit") && init?.method === "POST") {
          signupRequest = {
            ...signupRequest,
            fieldVisitStatus: String(body.status),
            fieldVisitNotes: String(body.notes ?? "")
          };
          return new Response(JSON.stringify({ data: signupRequest }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        if (url.includes("/approve") && init?.method === "POST") {
          signupRequest = { ...signupRequest, status: "APPROVED", reviewNotes: "Approved from admin payments dashboard." };
          return new Response(JSON.stringify({ data: { request: signupRequest } }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        const data = url.includes("/partner-signup-requests")
          ? [signupRequest]
          : url.includes("/payment-requests")
            ? []
            : url.includes("/village-agents")
              ? [fieldAgent]
              : {};

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<PaymentsAdminPage />);

    expect(await screen.findByText("Kiritiri Smart Chama")).toBeInTheDocument();
    const createButton = screen.getByRole("button", { name: /Create account/i });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Assign VA / CBT for Kiritiri Smart Chama"), {
      target: { value: "agent-1" }
    });
    fireEvent.change(screen.getByLabelText("Field visit notes for Kiritiri Smart Chama"), {
      target: { value: "Schedule field visit." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    expect(await screen.findByText("Kiritiri Smart Chama assigned for field visit.")).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes("/assign-agent") && call.body.villageAgentId === "agent-1")).toBe(true);

    fireEvent.change(screen.getByLabelText("Field visit notes for Kiritiri Smart Chama"), {
      target: { value: "Agent confirmed the group." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Visit ok" }));

    expect(await screen.findByText("Kiritiri Smart Chama field visit approved.")).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes("/field-visit") && call.body.status === "APPROVED")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Create account/i }));
    expect(await screen.findByText("Kiritiri Smart Chama account created.")).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes("/approve") && call.body.password === "IntellicashDemo#2026")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("formats operational values", () => {
    expect(formatKes(1250000)).toContain("12,500");
    expect(humanizeEnum("IWL_ADMIN")).toBe("Iwl Admin");
  });

  it("signs into a demo account from the login page", async () => {
    const account = demoAccounts.find((demoAccount) => demoAccount.role === "PARTNER_OFFICER")!;
    let requestBody: Record<string, unknown> | null = null;
    routerPushMock.mockReset();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              id: "partner-user",
              email: account.email,
              role: account.role,
              permissions: ["partners:read"]
            }
          })
        } as Response;
      })
    );

    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /Partner Officer/ }));

    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith("/dashboard"));
    expect(requestBody).toEqual({ email: account.email, password: demoPassword });

    vi.unstubAllGlobals();
  });

  it("separates admin and partner login entry pages", () => {
    render(<AdminLoginPage />);

    expect(screen.getByRole("heading", { name: "Admin operations access" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Admin sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Iwl Admin/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Partner Officer/ })).not.toBeInTheDocument();

    render(<PartnerLoginPage />);

    expect(screen.getByRole("heading", { name: "Partner finance access" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Partner sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Partner Officer/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lender/ })).toBeInTheDocument();
  });

  it("renders API docs, creates one-time keys, and revokes active keys", async () => {
    let keys: Array<{
      id: string;
      name: string;
      scopes: string[];
      effectiveScopes: string[];
      lastUsedAt: string | null;
      createdAt: string;
      revokedAt: string | null;
    }> = [
      {
        id: "key-1",
        name: "Mobile backend staging",
        scopes: ["groups:read", "members:write"],
        effectiveScopes: ["groups:read", "members:write"],
        lastUsedAt: null,
        createdAt: "2026-05-26T08:00:00.000Z",
        revokedAt: null
      }
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        let data: unknown = {};
        let status = 200;

        if (url.includes("/auth/me")) {
          data = {
            id: "admin-1",
            name: "IWL Platform Admin",
            email: "admin@intellicash.co.ke",
            role: "IWL_ADMIN",
            permissions: ["api-keys:read", "api-keys:write"]
          };
        } else if (url.endsWith("/api-keys/presets")) {
          data = [
            {
              id: "MOBILE_CORE",
              name: "Mobile Core",
              description: "Programmes, groups, members, meetings, ledger, votes, and store operations.",
              scopes: ["groups:read", "members:write", "store:write"]
            }
          ];
        } else if (url.endsWith("/api-keys") && init?.method === "POST") {
          status = 201;
          const created = {
            id: "key-created",
            name: "Mobile backend integration",
            scopes: ["groups:read", "members:write", "store:write"],
            effectiveScopes: ["groups:read", "members:write", "store:write"],
            lastUsedAt: null,
            createdAt: "2026-05-26T09:00:00.000Z",
            revokedAt: null,
            token: "ic_sk_created_once"
          };
          keys = [
            {
              id: created.id,
              name: created.name,
              scopes: created.scopes,
              effectiveScopes: created.effectiveScopes,
              lastUsedAt: created.lastUsedAt,
              createdAt: created.createdAt,
              revokedAt: created.revokedAt
            },
            ...keys
          ];
          data = created;
        } else if (url.includes("/api-keys/") && init?.method === "DELETE") {
          const keyId = url.split("/").pop();
          keys = keys.map((key) =>
            key.id === keyId ? { ...key, revokedAt: "2026-05-26T10:00:00.000Z" } : key
          );
          data = keys.find((key) => key.id === keyId);
        } else if (url.endsWith("/api-keys")) {
          data = keys;
        }

        return new Response(JSON.stringify({ data }), {
          status,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<ApiDocsPage />);

    expect(await screen.findByRole("heading", { name: "API Docs" })).toBeInTheDocument();
    expect(screen.getByText("API Keys")).toBeInTheDocument();
    expect(screen.getByText("Mobile API Catalog")).toBeInTheDocument();
    expect(screen.getByText("OpenAPI JSON")).toBeInTheDocument();
    expect(screen.getByText("Mobile Core Preset")).toBeInTheDocument();
    expect(screen.getAllByText(/Authorization: Bearer ic_sk_your_key/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Create API key/ }));
    expect(await screen.findByText("ic_sk_created_once")).toBeInTheDocument();

    const revokeButtons = screen.getAllByRole("button", { name: /Revoke/ });
    expect(revokeButtons.length).toBeGreaterThan(0);
    fireEvent.click(revokeButtons[0]!);
    expect(await screen.findByText("Revoked")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("hides group creation when the user lacks group write permission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "group-user",
            name: "Tujijenge Group Account",
            email: "group@intellicash.co.ke",
            role: "GROUP_ACCOUNT",
            permissions: ["groups:read", "members:write"]
          };
        } else if (url.includes("/programmes")) {
          data = [];
        } else if (url.includes("/groups")) {
          data = [
            {
              id: "group-1",
              name: "Tujijenge VSLA",
              code: "IWL-KBU-0001",
              phase: "INTENSIVE",
              county: "Kiambu",
              programmeLinks: [],
              creditScores: [{ score: 82 }],
              _count: { members: 6, meetings: 1, votes: 1 }
            }
          ];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<GroupsPage />);

    expect(await screen.findByText("Tujijenge VSLA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    expect(screen.queryByText("Create group")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders VA / CBT edit controls for write users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "admin-1",
            name: "IWL Platform Admin",
            email: "admin@intellicash.co.ke",
            role: "IWL_ADMIN",
            permissions: ["village-agents:read", "village-agents:write", "groups:read", "programmes:read"]
          };
        } else if (url.includes("/village-agents")) {
          data = [
            {
              id: "agent-1",
              name: "Grace Wanjiku",
              phone: "+254700000101",
              email: "grace@intellicash.test",
              status: "ACTIVE",
              digitalLiteracyScore: 91,
              caseloadLimit: 20,
              county: "Kiambu",
              programme: { id: "programme-1", name: "Kiambu Programme", country: "Kenya", partner: { name: "FLOURISH" }, _count: { groups: 2, villageAgents: 1 } },
              groups: [
                { id: "group-1", name: "Tujijenge VSLA", code: "IWL-KBU-0001", county: "Kiambu", phase: "INTENSIVE" },
                { id: "group-2", name: "Umoja Savings Group", code: "IWL-KBU-0002", county: "Kiambu", phase: "DEVELOPMENT" }
              ],
              _count: { groups: 2 }
            }
          ];
        } else if (url.includes("/programmes")) {
          data = [
            {
              id: "programme-1",
              name: "Kiambu Programme",
              country: "Kenya",
              partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 0, webhookSubscriptions: 0 } },
              _count: { groups: 2, villageAgents: 1 }
            }
          ];
        } else if (url.includes("/groups")) {
          data = [
            {
              id: "group-1",
              name: "Tujijenge VSLA",
              code: "IWL-KBU-0001",
              phase: "INTENSIVE",
              county: "Kiambu",
              programmeLinks: [],
              creditScores: [{ score: 82 }],
              _count: { members: 6, meetings: 1, votes: 1 }
            },
            {
              id: "group-2",
              name: "Umoja Savings Group",
              code: "IWL-KBU-0002",
              phase: "DEVELOPMENT",
              county: "Kiambu",
              programmeLinks: [],
              creditScores: [{ score: 78 }],
              _count: { members: 8, meetings: 1, votes: 1 }
            }
          ];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<AgentsPage />);

    expect(await screen.findByText("Grace Wanjiku")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    expect(screen.getByText("Create VA / CBT")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Tujijenge VSLA, Umoja Savings Group")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("opens the programme editor with public fields and sends a patch", async () => {
    let patchedBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "admin-1",
            name: "IWL Platform Admin",
            email: "admin@intellicash.co.ke",
            role: "IWL_ADMIN",
            permissions: ["programmes:read", "programmes:write", "groups:read", "partners:read"]
          };
        } else if (url.includes("/programmes/programme-1") && init?.method === "PATCH") {
          patchedBody = JSON.parse(String(init.body));
          data = {
            id: "programme-1",
            name: patchedBody?.name,
            country: "Kenya",
            county: "Kiambu",
            publicSlug: patchedBody?.publicSlug,
            publicStatus: patchedBody?.publicStatus,
            fundingGoalCents: patchedBody?.fundingGoalCents,
            allowInvestments: patchedBody?.allowInvestments,
            allowDonations: patchedBody?.allowDonations,
            partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 0, webhookSubscriptions: 0 } },
            partnerLinks: [],
            assets: [],
            groupLinks: [],
            _count: { groups: 1, groupLinks: 1, villageAgents: 0, partnerLinks: 1 }
          };
        } else if (url.endsWith("/programmes")) {
          data = [
            {
              id: "programme-1",
              name: "Kiambu Programme",
              country: "Kenya",
              county: "Kiambu",
              description: "Pilot programme.",
              coverImageUrl: "",
              publicSlug: "kiambu-programme",
              publicStatus: "DRAFT",
              fundingGoalCents: 1200000,
              fundingSummary: "Funding summary.",
              impactSummary: "Impact summary.",
              fundingDeadline: "2026-12-31T00:00:00.000Z",
              allowInvestments: true,
              allowDonations: true,
              partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 0, webhookSubscriptions: 0 } },
              partnerLinks: [
                { id: "link-1", role: "IMPLEMENTING_PARTNER", partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 0, webhookSubscriptions: 0 } } }
              ],
              assets: [],
              groupLinks: [],
              _count: { groups: 1, groupLinks: 1, villageAgents: 0, partnerLinks: 1 }
            }
          ];
        } else if (url.includes("/groups")) {
          data = [];
        } else if (url.includes("/partners")) {
          data = [
            {
              id: "partner-1",
              name: "FLOURISH",
              type: "NGO",
              status: "ACTIVE",
              apiScope: "PROGRAMME",
              _count: { programmes: 1, users: 0, webhookSubscriptions: 0 }
            }
          ];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<ProgrammesPage />);

    expect((await screen.findAllByText("Kiambu Programme")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(screen.getByText("Edit Program")).toBeInTheDocument();
    expect(screen.getByDisplayValue("kiambu-programme")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Program name"), { target: { value: "Kiambu Programme Updated" } });
    fireEvent.click(screen.getByRole("button", { name: /Save program/ }));

    await screen.findByText("Kiambu Programme Updated program updated.");
    expect(patchedBody).toEqual(
      expect.objectContaining({
        name: "Kiambu Programme Updated",
        publicSlug: "kiambu-programme",
        publicStatus: "DRAFT",
        fundingGoalCents: 1200000,
        allowInvestments: true,
        allowDonations: true
      })
    );
    vi.unstubAllGlobals();
  });

  it("renders group-scoped reports without privileged account datasets", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "group-user",
            name: "Tujijenge Group Account",
            email: "group@intellicash.co.ke",
            role: "GROUP_ACCOUNT",
            groupId: "group-1",
            permissions: [
              "programmes:read",
              "groups:read",
              "meetings:read",
              "ledger:read",
              "votes:read",
              "analytics:read"
            ],
            group: { id: "group-1", name: "Tujijenge VSLA", code: "IWL-KBU-0001" }
          };
        } else if (url.includes("/analytics/portfolio")) {
          data = {
            groups: 1,
            members: 12,
            activeMeetings: 0,
            totalSavingsCents: 1250000,
            repaymentRate: 91,
            averageCreditScore: 82,
            phaseDistribution: {},
            integrationConfigured: 0,
            integrationTotal: 0
          };
        } else if (url.includes("/reports/foundation")) {
          data = {
            account: {
              userId: "group-user",
              name: "Tujijenge Group Account",
              email: "group@intellicash.co.ke",
              role: "GROUP_ACCOUNT",
              scopeType: "GROUP",
              scopeId: "group-1",
              scopeName: "Tujijenge VSLA (IWL-KBU-0001)",
              permissions: []
            },
            visibility: {
              fundAccounts: true,
              ledgerEntries: true,
              users: false,
              meetings: true,
              votes: true,
              importedKpis: false
            },
            fundAccounts: [
              {
                id: "fund-1",
                type: "SOCIAL",
                balanceCents: 1250000,
                currency: "KES",
                group: {
                  id: "group-1",
                  name: "Tujijenge VSLA",
                  code: "IWL-KBU-0001",
                  county: "Kiambu",
                  phase: "INTENSIVE",
                  sourceSystem: null,
                  programme: { name: "Kiambu Programme" },
                  villageAgent: null,
                  _count: { members: 12, meetings: 1, votes: 1 }
                }
              }
            ],
            ledgerEntries: [],
            users: [],
            meetings: [],
            votes: [],
            ftmaCountyVslaKpis: [],
            ftmaCountyVslaTrainingMetrics: [],
            ftmaCountyFscKpis: []
          };
        } else if (url.includes("/groups")) {
          data = [
            {
              id: "group-1",
              name: "Tujijenge VSLA",
              code: "IWL-KBU-0001",
              phase: "INTENSIVE",
              county: "Kiambu",
              sourceSystem: null,
              villageAgent: null,
              programme: { name: "Kiambu Programme", partner: { name: "Scope Partner" } },
              programmeLinks: [],
              creditScores: [{ score: 82 }],
              _count: { members: 12, meetings: 1, votes: 1 }
            }
          ];
        } else if (url.includes("/programmes")) {
          data = [
            {
              id: "programme-1",
              name: "Kiambu Programme",
              country: "Kenya",
              county: "Kiambu",
              partner: { id: "partner-1", name: "Scope Partner", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 0, webhookSubscriptions: 0 } },
              partnerLinks: [],
              assets: [],
              groupLinks: [],
              _count: { groups: 1, villageAgents: 0, partnerLinks: 0, groupLinks: 0 }
            }
          ];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<ReportsPage />);

    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.queryByText("Partner Linkage Register")).not.toBeInTheDocument();
    expect(screen.queryByText("Integration Readiness Matrix")).not.toBeInTheDocument();
    expect(screen.queryByText("User Access and RBAC")).not.toBeInTheDocument();
    expect(screen.queryByText("FtMA VSLA County KPI")).not.toBeInTheDocument();
    expect(calls.some((url) => url.includes("/partners"))).toBe(false);
    expect(calls.some((url) => url.includes("/village-agents"))).toBe(false);
    expect(calls.some((url) => url.includes("/audit/events"))).toBe(false);
    expect(calls.some((url) => url.includes("/integrations/health"))).toBe(false);
    vi.unstubAllGlobals();
  });

  it("hides report families when the backing platform data is not visible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "observer-user",
            name: "Scoped Observer",
            email: "observer@intellicash.co.ke",
            role: "READ_ONLY",
            permissions: ["analytics:read"]
          };
        } else if (url.includes("/analytics/portfolio")) {
          data = {
            groups: 0,
            members: 0,
            activeMeetings: 0,
            totalSavingsCents: 0,
            repaymentRate: 0,
            averageCreditScore: 0,
            phaseDistribution: {},
            integrationConfigured: 0,
            integrationTotal: 0
          };
        } else if (url.includes("/reports/foundation")) {
          data = {
            account: {
              userId: "observer-user",
              name: "Scoped Observer",
              email: "observer@intellicash.co.ke",
              role: "READ_ONLY",
              scopeType: "PLATFORM",
              scopeId: null,
              scopeName: "Limited oversight",
              permissions: ["analytics:read"]
            },
            visibility: {
              fundAccounts: false,
              ledgerEntries: false,
              users: false,
              meetings: false,
              votes: false,
              importedKpis: false
            },
            fundAccounts: [],
            ledgerEntries: [],
            users: [],
            meetings: [],
            votes: [],
            ftmaCountyVslaKpis: [],
            ftmaCountyVslaTrainingMetrics: [],
            ftmaCountyFscKpis: []
          };
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<ReportsPage />);

    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByLabelText("Financial. No financial access")).toBeInTheDocument();
    expect(screen.queryByText("Fund Balance Register")).not.toBeInTheDocument();
    expect(screen.queryByText("Append-only Ledger Transactions")).not.toBeInTheDocument();
    expect(screen.queryByText("User Access and RBAC")).not.toBeInTheDocument();
    expect(screen.queryByText("Meeting Monitor Report")).not.toBeInTheDocument();
    expect(screen.queryByText("FtMA Training and Linkage KPI")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders public partner projects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "programme-1",
                name: "Kiambu Scale Project",
                country: "Kenya",
                county: "Kiambu",
                publicSlug: "kiambu-scale-project",
                publicStatus: "ONGOING",
                fundingGoalCents: 10000000,
                fundingRaisedCents: 3500000,
                fundingSummary: "Digitise partner-backed VSLA records.",
                impactSummary: "Transparent savings-group growth.",
                allowInvestments: true,
                allowDonations: true,
                partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 1, webhookSubscriptions: 0 } },
                partnerLinks: [],
                groupLinks: [],
                _count: { groups: 2, groupLinks: 2, villageAgents: 1 }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    render(<PublicPartnersPage />);

    expect(await screen.findByText("Kiambu Scale Project")).toBeInTheDocument();
    expect(screen.getByText("Submit request")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders the landing page Intelli-Store section from public store data", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/partner-signup-requests") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              id: "signup-1",
              status: "PENDING"
            }
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
          JSON.stringify({
            data: {
              products: [
                {
                  id: "product-1",
                  name: "Solar Egg Incubator",
                  slug: "solar-egg-incubator",
                  category: "AGRI_EQUIPMENT",
                  status: "ACTIVE",
                  description: "A poultry asset available through programme-backed credit.",
                  imageUrl: "https://example.com/incubator.jpg",
                  sellerName: "Intelli-Store Agribusiness Desk",
                  priceCents: 8500000,
                  depositCents: 850000,
                  currency: "KES",
                  creditSummary: "Request programme-backed credit.",
                  fulfilmentSummary: "Delivered after review.",
                  programmeLinks: [
                    {
                      id: "link-1",
                      creditTerms: "10% deposit request, then programme review.",
                      programme: {
                        id: "programme-1",
                        name: "Kiambu Programme",
                        country: "Kenya",
                        partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 1, webhookSubscriptions: 0 } },
                        _count: { groups: 2, groupLinks: 2, villageAgents: 1 }
                      }
                    }
                  ]
                }
              ],
              agents: [
                {
                  id: "agent-1",
                  name: "Grace Wanjiku",
                  phone: "+254700000101",
                  status: "ACTIVE",
                  county: "Kiambu",
                  digitalLiteracyScore: 91,
                  caseloadLimit: 20,
                  programme: {
                    id: "programme-1",
                    name: "Kiambu Programme",
                    country: "Kenya",
                    partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 1, webhookSubscriptions: 0 } },
                    _count: { groups: 2, groupLinks: 2, villageAgents: 1 }
                  },
                  _count: { groups: 2 }
                }
              ],
              serviceTypes: ["Business coaching", "Digital records training"]
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<LandingPage />);

    expect(screen.getByText("Digital Championship Platform")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Intelli-Cash" })).toBeInTheDocument();
    expect(screen.getByText("VSLAs, Chamas, credit unions")).toBeInTheDocument();
    expect(screen.getByText("AI + digital marketing")).toBeInTheDocument();
    expect(screen.getByText("Finance, Marketing, and AI Services")).toBeInTheDocument();
    expect(screen.getAllByText("Digital marketing services").length).toBeGreaterThan(0);
    expect(screen.getByText("AI service support")).toBeInTheDocument();
    expect(screen.getAllByText("Green enterprise finance").length).toBeGreaterThan(0);
    expect(screen.getByText("Paystack payments")).toBeInTheDocument();
    expect(screen.getByText("M-Pesa and KCB Buni")).toBeInTheDocument();
    expect(screen.getAllByText("BTC and Ethereum contracts").length).toBeGreaterThan(0);
    expect(screen.getByText("Simple impact views for green enterprise support")).toBeInTheDocument();
    expect(screen.getByText("Service reach")).toBeInTheDocument();
    expect(screen.getByText("Enterprise growth")).toBeInTheDocument();
    expect(screen.getByText("Field quality")).toBeInTheDocument();
    expect(screen.getByText("Impact learning")).toBeInTheDocument();
    expect(screen.queryByText(/repayment behaviour/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/payment movement/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Admin sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Admin login/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Partner login/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visit The Coca-Cola Foundation" })).toHaveAttribute(
      "href",
      "https://www.coca-colacompany.com/shared-future/coca-cola-foundation"
    );
    expect(screen.getByRole("link", { name: "Visit County Government of Embu" })).toHaveAttribute("href", "https://embu.go.ke/");
    expect(screen.getByRole("link", { name: "Visit Rainforest Alliance" })).toHaveAttribute("href", "https://www.rainforest-alliance.org/");
    expect(screen.getByRole("link", { name: "Visit Intelli-Wealth" })).toHaveAttribute("href", "https://intelliwealth.org/");
    expect(screen.getByAltText("The Coca-Cola Foundation logo")).toHaveAttribute("src", "/partners/coca-cola-foundation.jpg");
    expect(screen.getByAltText("County Government of Embu logo")).toHaveAttribute("src", "/partners/embu-county-government.png");
    expect(screen.getByAltText("Rainforest Alliance logo")).toHaveAttribute("src", "/partners/rainforest-alliance.png");
    expect(screen.getByAltText("Intelli-Wealth logo")).toHaveAttribute("src", "/partners/intelli-wealth.png");
    expect(await screen.findByText("Solar Egg Incubator")).toBeInTheDocument();
    expect(screen.getByAltText(/Digital championship workspace with quick access modules/i)).toHaveAttribute("src", "/screenshots/member-dashboard.png");
    expect(screen.getByAltText(/Meetings calendar:/i)).toHaveAttribute("src", "/screenshots/member-meetings.png");
    expect(screen.getByAltText(/Transaction table:/i)).toHaveAttribute("src", "/screenshots/member-passbook.png");
    expect(screen.getByText("Request on credit")).toBeInTheDocument();
    expect(screen.getByText("Grace Wanjiku")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Contact us/i }).some((link) => link.getAttribute("href") === "/contact")).toBe(true);

    expect(screen.getByText("Register a VSLA, Chama, credit union, or cooperative")).toBeInTheDocument();
    expect(screen.getByText("Champion owner details")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Kiritiri Smart Chama" } });
    fireEvent.change(screen.getByLabelText("County"), { target: { value: "Embu" } });
    fireEvent.change(screen.getByLabelText("Sub-county"), { target: { value: "Mbeere South" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Kiritiri" } });
    fireEvent.change(screen.getByLabelText("Meeting day"), { target: { value: "Wednesday" } });
    fireEvent.change(screen.getByLabelText("Estimated members"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("Champion name"), { target: { value: "Peter Mwangi" } });
    fireEvent.change(screen.getByLabelText("Champion email"), { target: { value: "peter@groups.test" } });
    fireEvent.change(screen.getByLabelText("Champion phone"), { target: { value: "+254711222333" } });
    fireEvent.change(screen.getByLabelText("Group objective or support needed"), {
      target: { value: "Digitise meetings and green enterprise requests." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit group registration" }));

    await screen.findByText(/Group registration submitted/i);
    const signupCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/partner-signup-requests"));
    expect(signupCall).toBeTruthy();
    expect(JSON.parse(String(signupCall?.[1]?.body))).toEqual(
      expect.objectContaining({
        organizationName: "Kiritiri Smart Chama",
        requestedRole: "GROUP_ACCOUNT",
        requestedPartnerType: "GROUP_ACCOUNT",
        county: "Embu",
        groupSubCounty: "Mbeere South",
        estimatedMembers: 24,
        contactName: "Peter Mwangi",
        contactPhone: "+254711222333"
      })
    );
    vi.unstubAllGlobals();
  });

  it("renders the public contact page with support channels", () => {
    render(<ContactPage />);

    expect(screen.getByRole("heading", { name: "Talk to Intelli-Cash" })).toBeInTheDocument();
    expect(screen.getAllByText("Group registration").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Partner or donor support").length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole("link", { name: /Email support/i })
        .some((link) => link.getAttribute("href") === "mailto:support@intellicash.co.ke?subject=Intelli-Cash%20inquiry")
    ).toBe(true);
    expect(screen.getByRole("button", { name: /Send inquiry/i })).toBeInTheDocument();
  });

  it("keeps the landing page free of dashboard access links for signed-in users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const data = url.includes("/auth/me")
          ? {
              id: "admin-user",
              name: "Admin User",
              email: "admin@intellicash.co.ke",
              role: "IWL_ADMIN"
            }
          : {
              products: [],
              agents: [],
              serviceTypes: []
            };

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<LandingPage />);

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /Dashboard/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Admin login/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Partner login/i })).not.toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("renders the public Intelli-Store page with cart controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              products: [
                {
                  id: "product-1",
                  name: "Solar Egg Incubator",
                  slug: "solar-egg-incubator",
                  category: "AGRI_EQUIPMENT",
                  status: "ACTIVE",
                  description: "A poultry asset available through programme-backed credit.",
                  imageUrl: "https://example.com/incubator.jpg",
                  sellerName: "Intelli-Store Agribusiness Desk",
                  priceCents: 8500000,
                  depositCents: 850000,
                  currency: "KES",
                  creditSummary: "Request programme-backed credit.",
                  fulfilmentSummary: "Delivered after review.",
                  programmeLinks: [
                    {
                      id: "link-1",
                      creditTerms: "10% deposit request, then programme review.",
                      programme: {
                        id: "programme-1",
                        name: "Kiambu Programme",
                        country: "Kenya",
                        partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 1, webhookSubscriptions: 0 } },
                        _count: { groups: 2, groupLinks: 2, villageAgents: 1 }
                      }
                    }
                  ]
                }
              ],
              agents: [
                {
                  id: "agent-1",
                  name: "Grace Wanjiku",
                  phone: "+254700000101",
                  status: "ACTIVE",
                  county: "Kiambu",
                  digitalLiteracyScore: 91,
                  caseloadLimit: 20,
                  programme: {
                    id: "programme-1",
                    name: "Kiambu Programme",
                    country: "Kenya",
                    partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 1, webhookSubscriptions: 0 } },
                    _count: { groups: 2, groupLinks: 2, villageAgents: 1 }
                  },
                  _count: { groups: 2 }
                }
              ],
              serviceTypes: ["Business coaching", "Digital records training"]
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    render(<IntelliStorePage />);

    expect(await screen.findByText("Solar Egg Incubator")).toBeInTheDocument();
    expect(screen.getByText("Cart")).toBeInTheDocument();
    expect(screen.getByText("Add to cart")).toBeInTheDocument();
    expect(screen.getAllByText("Grace Wanjiku").length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("renders a member VSLA dashboard with scoped store activity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "member-user",
            name: "Mary Njeri",
            email: "member@intellicash.co.ke",
            role: "MEMBER",
            groupId: "group-1",
            memberId: "member-1",
            permissions: ["groups:read", "members:read", "meetings:read", "ledger:read", "store:read", "store:write"],
            group: { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001" },
            member: { id: "member-1", fullName: "Mary Njeri", phone: "+254700000201" }
          };
        } else if (url.includes("/groups/group-1/members")) {
          data = [
            {
              id: "member-1",
              fullName: "Mary Njeri",
              phone: "+254700000201",
              role: "CHAIRPERSON",
              kycStatus: "VERIFIED",
              status: "ACTIVE",
              pinSet: true
            }
          ];
        } else if (url.includes("/groups/group-1/ledger")) {
          data = [
            {
              id: "ledger-0",
              type: "SHARE_PURCHASE",
              amountCents: 300000,
              direction: "CREDIT",
              description: "Cycle 1 shares",
              signature: "signed",
              createdAt: "2026-04-10T08:00:00.000Z",
              member: { fullName: "Mary Njeri" },
              fundAccount: { type: "INTERNAL_LOAN", currency: "KES" }
            },
            {
              id: "ledger-00",
              type: "SHARE_OUT_PAYOUT",
              amountCents: 360000,
              direction: "DEBIT",
              description: "Cycle 1 share-out",
              signature: "signed",
              createdAt: "2026-04-30T16:00:00.000Z",
              member: { fullName: "Mary Njeri" },
              fundAccount: { type: "INTERNAL_LOAN", currency: "KES" }
            },
            {
              id: "ledger-1",
              type: "SHARE_PURCHASE",
              amountCents: 500000,
              direction: "CREDIT",
              description: "Weekly shares",
              signature: "signed",
              createdAt: "2026-05-20T08:00:00.000Z",
              member: { fullName: "Mary Njeri" },
              fundAccount: { type: "INTERNAL_LOAN", currency: "KES" }
            },
            {
              id: "ledger-2",
              type: "SOCIAL_CONTRIBUTION",
              amountCents: 50000,
              direction: "DEBIT",
              description: "Social fund withdrawal",
              signature: "signed",
              createdAt: "2026-06-02T10:30:00.000Z",
              member: { fullName: "Jane Wairimu" },
              fundAccount: { type: "SOCIAL", currency: "KES" }
            }
          ];
        } else if (url.includes("/analytics/portfolio")) {
          data = { members: 1, totalSavingsCents: 500000, activeMeetings: 1, averageCreditScore: 82, repaymentRate: 93 };
        } else if (url.endsWith("/groups")) {
          data = [
            {
              id: "group-1",
              name: "Tujijenge Women VSLA",
              code: "IWL-KBU-0001",
              phase: "GROWTH",
              county: "Kiambu",
              cycleNumber: 2,
              creditScores: [{ score: 82, computedAt: "2026-05-20T08:00:00.000Z" }],
              _count: { members: 1, meetings: 1, votes: 0, ledgerEntries: 1 }
            }
          ];
        } else if (url.includes("/meetings")) {
          data = [
            {
              id: "meeting-1",
              groupId: "group-1",
              title: "Weekly meeting",
              status: "SCHEDULED",
              scheduledAt: "2026-06-03T08:00:00.000Z",
              gpsCompliant: true,
              steps: [],
              attendance: [],
              keySubmissions: []
            }
          ];
        } else if (url.includes("/intelli-store/products")) {
          data = [
            {
              id: "product-1",
              name: "Solar Egg Incubator",
              slug: "solar-egg-incubator",
              category: "AGRI_EQUIPMENT",
              status: "ACTIVE",
              description: "A poultry asset available through programme-backed credit.",
              priceCents: 8500000,
              depositCents: 850000,
              currency: "KES",
              programmeLinks: []
            }
          ];
        } else if (url.includes("/intelli-store/credit-requests")) {
          data = [
            {
              id: "request-1",
              productId: "product-1",
              programmeId: "programme-1",
              requesterUserId: "member-user",
              customerName: "Mary Njeri",
              customerEmail: "member@intellicash.co.ke",
              phoneNumber: "+254700000201",
              groupName: "Tujijenge Women VSLA",
              quantity: 1,
              requestedAmountCents: 8500000,
              depositCents: 850000,
              financedAmountCents: 7650000,
              commissionRateBps: 500,
              commissionCents: 425000,
              repaymentStatus: "FINANCED",
              status: "APPROVED",
              createdAt: "2026-05-20T08:00:00.000Z",
              product: {
                id: "product-1",
                name: "Solar Egg Incubator",
                slug: "solar-egg-incubator",
                category: "AGRI_EQUIPMENT",
                status: "ACTIVE",
                description: "A poultry asset available through programme-backed credit.",
                priceCents: 8500000,
                depositCents: 850000,
                currency: "KES",
                programmeLinks: []
              },
              installments: [
                {
                  id: "installment-1",
                  requestId: "request-1",
                  sequence: 1,
                  dueDate: "2026-06-20T08:00:00.000Z",
                  principalCents: 1275000,
                  interestCents: 0,
                  totalDueCents: 1275000,
                  paidCents: 0,
                  status: "DUE"
                }
              ],
              repayments: []
            }
          ];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<DashboardOverviewPage />);

    expect(await screen.findByRole("heading", { name: "My dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Quick access")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Meetings/ }).map((link) => link.getAttribute("href"))).toContain("/dashboard/meetings");
    expect(screen.getAllByRole("link", { name: /Passbook/ }).map((link) => link.getAttribute("href"))).toContain("/dashboard/passbook");
    expect(screen.getAllByRole("link", { name: /Intelli-Store/ }).map((link) => link.getAttribute("href"))).toContain("/dashboard/intelli-store");
    expect(screen.getByRole("heading", { level: 3, name: "Member" })).toBeInTheDocument();
    expect(screen.getByText("Store requests")).toBeInTheDocument();
    expect(screen.getAllByText("Solar Egg Incubator").length).toBeGreaterThan(0);
    expect(screen.getByRole("article", { name: "Cycle shares. Cycle 2" })).toBeInTheDocument();
    expect(screen.getByText("Cycle 1 share-out")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(screen.getByText("Weekly shares")).toBeInTheDocument();
    expect(screen.getByText("Social fund withdrawal")).toBeInTheDocument();
    expect(screen.queryByText("Jane Wairimu")).not.toBeInTheDocument();
    expect(screen.queryByText("Group Members")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it.each([
    {
      role: "GROUP_ACCOUNT",
      heading: "Group dashboard",
      cards: ["Next meetings", "Members", "Records", "Requests", "Reports", "Account"]
    },
    {
      role: "PARTNER_OFFICER",
      heading: "Partner service dashboard",
      cards: ["Programmes", "Groups reached", "Live sessions", "Service quality", "Reports", "VA / CBT support"],
      hidesSavings: true
    },
    {
      role: "LENDER",
      heading: "Application review dashboard",
      cards: ["Applications", "Groups for review", "Credit signals", "Evidence", "Reports"],
      hidesSavings: true
    },
    {
      role: "READ_ONLY",
      heading: "Oversight dashboard",
      cards: ["Reports", "Audit events", "Groups", "Integration status", "Public projects"]
    },
    {
      role: "IWL_ADMIN",
      heading: "Operations control dashboard",
      cards: ["Access requests", "Groups", "Partners", "Programmes", "Payments", "Integrations", "Audit"]
    }
  ])("renders the $role role dashboard", async ({ role, heading, cards, hidesSavings }) => {
    const permissionMap: Record<string, string[]> = {
      GROUP_ACCOUNT: ["groups:read", "members:read", "meetings:read", "ledger:read", "store:read", "store:write"],
      PARTNER_OFFICER: [
        "partners:read",
        "programmes:read",
        "village-agents:read",
        "groups:read",
        "members:read",
        "meetings:read",
        "ledger:read",
        "store:read",
        "audit:read",
        "integrations:read"
      ],
      LENDER: [
        "programmes:read",
        "groups:read",
        "members:read",
        "ledger:read",
        "store:read",
        "audit:read",
        "integrations:read"
      ],
      READ_ONLY: [
        "partners:read",
        "programmes:read",
        "village-agents:read",
        "groups:read",
        "members:read",
        "meetings:read",
        "ledger:read",
        "store:read",
        "audit:read",
        "integrations:read"
      ],
      IWL_ADMIN: ["users:read", "payments:read", "partners:read", "programmes:read", "groups:read", "store:read", "audit:read", "integrations:read"]
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: `${role.toLowerCase()}-user`,
            name: `${humanizeEnum(role)} User`,
            email: `${role.toLowerCase()}@intellicash.co.ke`,
            role,
            permissions: permissionMap[role],
            groupId: role === "GROUP_ACCOUNT" ? "group-1" : null,
            partnerId: role === "PARTNER_OFFICER" || role === "LENDER" ? "partner-1" : null,
            group: role === "GROUP_ACCOUNT" ? { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001" } : null,
            partner: role === "PARTNER_OFFICER" || role === "LENDER" ? { id: "partner-1", name: "Green Capital" } : null
          };
        } else if (url.includes("/groups/group-1/members")) {
          data = [
            {
              id: "member-1",
              fullName: "Mary Njeri",
              phone: "+254700000201",
              role: "CHAIRPERSON",
              kycStatus: "VERIFIED",
              status: "ACTIVE",
              pinSet: true
            },
            {
              id: "member-2",
              fullName: "Jane Wairimu",
              phone: "+254700000202",
              role: "TREASURER",
              kycStatus: "VERIFIED",
              status: "ACTIVE",
              pinSet: true
            }
          ];
        } else if (url.includes("/groups/group-1/ledger")) {
          data = [
            {
              id: "ledger-1",
              type: "SHARE_PURCHASE",
              amountCents: 500000,
              direction: "CREDIT",
              description: "Weekly shares",
              signature: "signed",
              createdAt: "2026-05-20T08:00:00.000Z",
              member: { fullName: "Mary Njeri" },
              fundAccount: { type: "INTERNAL_LOAN", currency: "KES" }
            }
          ];
        } else if (url.includes("/analytics/portfolio")) {
          data = {
            groups: 2,
            members: 42,
            activeMeetings: 1,
            totalSavingsCents: 7200000,
            averageCreditScore: 78,
            repaymentRate: 91,
            integrationConfigured: 2,
            integrationTotal: 3,
            phaseDistribution: []
          };
        } else if (url.endsWith("/groups")) {
          data = [
            {
              id: "group-1",
              name: "Tujijenge Women VSLA",
              code: "IWL-KBU-0001",
              phase: "GROWTH",
              county: "Kiambu",
              cycleNumber: 2,
              creditScores: [{ score: 82, computedAt: "2026-05-20T08:00:00.000Z" }],
              _count: { members: 2, meetings: 2, votes: 0, ledgerEntries: 1 }
            },
            {
              id: "group-2",
              name: "Kiritiri Green Youth",
              code: "IWL-EMB-0002",
              phase: "INTENSIVE",
              county: "Embu",
              cycleNumber: 1,
              creditScores: [{ score: 74, computedAt: "2026-05-19T08:00:00.000Z" }],
              _count: { members: 40, meetings: 1, votes: 0, ledgerEntries: 0 }
            }
          ];
        } else if (url.includes("/meetings")) {
          data = [
            {
              id: "meeting-1",
              groupId: "group-1",
              title: "Weekly meeting",
              status: "IN_PROGRESS",
              scheduledAt: "2026-06-03T08:00:00.000Z",
              gpsCompliant: true,
              transactionTotal: 2,
              unlockStatus: "OPEN",
              steps: [],
              attendance: [],
              keySubmissions: [],
              group: { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001", county: "Kiambu" }
            }
          ];
        } else if (url.includes("/integrations/health")) {
          data = {
            configured: 2,
            total: 3,
            statuses: [
              {
                provider: "mpesa",
                displayName: "M-Pesa",
                configured: true,
                enabled: true,
                mode: "sandbox",
                requiredEnv: [],
                missingEnv: [],
                envCredentialKeys: [],
                storedCredentialKeys: [],
                networkTestsAllowed: false
              },
              {
                provider: "paystack",
                displayName: "Paystack",
                configured: false,
                enabled: true,
                mode: "sandbox",
                requiredEnv: ["PAYSTACK_SECRET_KEY"],
                missingEnv: ["PAYSTACK_SECRET_KEY"],
                envCredentialKeys: [],
                storedCredentialKeys: [],
                networkTestsAllowed: false
              }
            ]
          };
        } else if (url.includes("/audit/events")) {
          data = [
            {
              id: "audit-1",
              type: "REPORT_APPROVED",
              entityType: "REPORT",
              entityId: "report-1",
              createdAt: "2026-05-22T08:00:00.000Z",
              hash: "hash",
              actor: { id: "admin", name: "Admin User", email: "admin@intellicash.co.ke", role: "IWL_ADMIN" }
            }
          ];
        } else if (url.includes("/intelli-store/credit-requests")) {
          data = [
            {
              id: "request-1",
              productId: "product-1",
              programmeId: "programme-1",
              requesterUserId: "member-user",
              customerName: "Mary Njeri",
              customerEmail: "member@intellicash.co.ke",
              phoneNumber: "+254700000201",
              groupName: "Tujijenge Women VSLA",
              quantity: 1,
              requestedAmountCents: 8500000,
              depositCents: 850000,
              financedAmountCents: 7650000,
              commissionRateBps: 500,
              commissionCents: 425000,
              repaymentStatus: "FINANCED",
              status: "APPROVED",
              createdAt: "2026-05-20T08:00:00.000Z",
              product: {
                id: "product-1",
                name: "Solar Egg Incubator",
                slug: "solar-egg-incubator",
                category: "AGRI_EQUIPMENT",
                status: "ACTIVE",
                description: "A poultry asset available through programme-backed credit.",
                priceCents: 8500000,
                depositCents: 850000,
                currency: "KES",
                programmeLinks: []
              },
              installments: [],
              repayments: []
            }
          ];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<DashboardOverviewPage />);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();

    for (const card of cards) {
      expect(screen.getByRole("heading", { level: 3, name: card })).toBeInTheDocument();
    }

    if (hidesSavings) {
      expect(screen.queryByText("Savings tracked")).not.toBeInTheDocument();
    }

    vi.unstubAllGlobals();
  });

  it("renders member meetings as a calendar and opens details with a map", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "member-user",
            name: "Mary Njeri",
            email: "member@intellicash.co.ke",
            role: "MEMBER",
            groupId: "group-1",
            memberId: "member-1",
            permissions: ["groups:read", "meetings:read", "ledger:read"],
            group: { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001" },
            member: { id: "member-1", fullName: "Mary Njeri", phone: "+254700000201" }
          };
        } else if (url.endsWith("/groups")) {
          data = [
            {
              id: "group-1",
              name: "Tujijenge Women VSLA",
              code: "IWL-KBU-0001",
              phase: "GROWTH",
              county: "Kiambu",
              gpsLatitude: -1.0333,
              gpsLongitude: 37.0693,
              _count: { members: 1, meetings: 1, votes: 0, ledgerEntries: 1 }
            }
          ];
        } else if (url.includes("/meetings")) {
          data = [
            {
              id: "meeting-1",
              groupId: "group-1",
              title: "Weekly meeting",
              status: "SCHEDULED",
              scheduledAt: "2026-06-03T08:00:00.000Z",
              openedAt: null,
              closedAt: null,
              unlockStatus: "LOCKED",
              gpsCompliant: true,
              transactionTotal: 500000,
              minutes: null,
              group: {
                id: "group-1",
                name: "Tujijenge Women VSLA",
                code: "IWL-KBU-0001",
                county: "Kiambu",
                gpsLatitude: -1.0333,
                gpsLongitude: 37.0693
              },
              steps: [{ id: "step-1", step: "ATTENDANCE", status: "PENDING", name: "Attendance" }],
              attendance: [{ id: "attendance-1", status: "PRESENT", member: { fullName: "Mary Njeri", role: "MEMBER" } }],
              keySubmissions: []
            }
          ];
        } else if (url.includes("/groups/group-1/ledger")) {
          data = [
            {
              id: "ledger-1",
              memberId: "member-1",
              meetingId: "meeting-1",
              type: "SHARE_PURCHASE",
              amountCents: 100000,
              direction: "CREDIT",
              description: "10 shares bought",
              signature: "signed",
              createdAt: "2026-06-03T08:00:00.000Z",
              member: { fullName: "Mary Njeri" },
              meeting: { id: "meeting-1", title: "Weekly meeting", scheduledAt: "2026-06-03T08:00:00.000Z" },
              fundAccount: { type: "INTERNAL_LOAN", currency: "KES" }
            },
            {
              id: "ledger-2",
              memberId: "member-1",
              meetingId: "meeting-1",
              type: "SOCIAL_CONTRIBUTION",
              amountCents: 50000,
              direction: "CREDIT",
              description: "Social fund payment",
              signature: "signed",
              createdAt: "2026-06-03T08:05:00.000Z",
              member: { fullName: "Mary Njeri" },
              meeting: { id: "meeting-1", title: "Weekly meeting", scheduledAt: "2026-06-03T08:00:00.000Z" },
              fundAccount: { type: "SOCIAL", currency: "KES" }
            }
          ];
        } else if (url.includes("/integrations/GOOGLE_MAPS/public-config")) {
          data = { provider: "GOOGLE_MAPS", displayName: "Google Maps", configured: false, apiKey: null, source: "none" };
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<MeetingsPage />);

    expect(await screen.findByRole("heading", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByText("Meeting dates for your group.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Month" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    expect(document.querySelector(".meeting-calendar-grid.week-view")).not.toBeNull();
    expect(document.querySelector(".meeting-calendar-date-row")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Day" }));
    expect(document.querySelector(".meeting-calendar-day-view")).not.toBeNull();
    expect(document.querySelector(".meeting-calendar-day-header")).not.toBeNull();
    expect(screen.getAllByText("Weekly meeting").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Passbook" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Passbook" }));
    expect(await screen.findByRole("heading", { name: "Passbook" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Passbook meeting summary" })).toBeInTheDocument();
    expect(screen.getByText("10 shares")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Weekly meeting/ }));
    expect(screen.getByRole("table", { name: "Weekly meeting transactions" })).toBeInTheDocument();
    expect(screen.getByText("Social fund payment")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Meetings" }));
    expect(await screen.findByRole("heading", { name: "Calendar" })).toBeInTheDocument();

    const viewButtons = screen.getAllByRole("button", { name: /View/i });
    expect(viewButtons.length).toBeGreaterThan(0);
    fireEvent.click(viewButtons[0]!);

    expect(await screen.findByRole("dialog", { name: /Weekly meeting details/i })).toBeInTheDocument();
    expect(screen.getByText("Workflow")).toBeInTheDocument();
    expect(document.querySelector(".member-meeting-detail-map")).not.toBeNull();
    expect(await screen.findByText("My Transactions")).toBeInTheDocument();
    expect(screen.getByText("10 shares bought")).toBeInTheDocument();
    expect(screen.getByText("Social fund payment")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders the member passbook page from meeting ledger records", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "member-user",
            name: "Mary Njeri",
            email: "member@intellicash.co.ke",
            role: "MEMBER",
            groupId: "group-1",
            memberId: "member-1",
            permissions: ["groups:read", "ledger:read"],
            group: { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001" },
            member: { id: "member-1", fullName: "Mary Njeri", phone: "+254700000201" }
          };
        } else if (url.endsWith("/groups")) {
          data = [
            {
              id: "group-1",
              name: "Tujijenge Women VSLA",
              code: "IWL-KBU-0001",
              phase: "GROWTH",
              county: "Kiambu",
              creditScores: [],
              _count: { members: 1, meetings: 1, votes: 0, ledgerEntries: 4 }
            }
          ];
        } else if (url.includes("/groups/group-1/ledger")) {
          data = [
            {
              id: "ledger-1",
              memberId: "member-1",
              meetingId: "meeting-1",
              type: "SHARE_PURCHASE",
              amountCents: 100000,
              direction: "CREDIT",
              description: "10 shares bought",
              signature: "signed",
              createdAt: "2026-06-03T08:00:00.000Z",
              meeting: { id: "meeting-1", title: "Weekly meeting", scheduledAt: "2026-06-03T08:00:00.000Z" }
            },
            {
              id: "ledger-2",
              memberId: "member-1",
              meetingId: "meeting-1",
              type: "SOCIAL_CONTRIBUTION",
              amountCents: 50000,
              direction: "CREDIT",
              description: "Social fund",
              signature: "signed",
              createdAt: "2026-06-03T08:05:00.000Z",
              meeting: { id: "meeting-1", title: "Weekly meeting", scheduledAt: "2026-06-03T08:00:00.000Z" }
            },
            {
              id: "ledger-3",
              memberId: "member-1",
              meetingId: "meeting-1",
              type: "LOAN_REPAYMENT",
              amountCents: 250000,
              direction: "CREDIT",
              description: "Loan repayment",
              signature: "signed",
              createdAt: "2026-06-03T08:10:00.000Z",
              meeting: { id: "meeting-1", title: "Weekly meeting", scheduledAt: "2026-06-03T08:00:00.000Z" }
            }
          ];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<MemberPassbookPage />);

    expect(await screen.findByRole("heading", { level: 2, name: "Passbook" })).toBeInTheDocument();
    expect(screen.getByText("Weekly meeting")).toBeInTheDocument();
    expect(screen.getByText("10 shares")).toBeInTheDocument();
    expect(screen.getAllByText("Social fund").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Loan repayment").length).toBeGreaterThan(0);
    expect(screen.getByRole("table", { name: "Passbook meeting summary" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Weekly meeting/ }));
    expect(screen.getByText("10 shares bought")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Weekly meeting transactions" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders the member account profile and settings page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/uploads/avatar")) {
          data = {
            kind: "avatar",
            url: "http://localhost:4000/uploads/avatar/mary.png",
            path: "/uploads/avatar/mary.png",
            fileName: "mary.png",
            mimeType: "image/png",
            size: 8
          };
        } else if (url.includes("/auth/me") && init?.method === "PATCH") {
          const body = JSON.parse(String(init.body ?? "{}")) as {
            name: string;
            avatarUrl: string | null;
            languagePreference: string;
          };
          data = {
            id: "member-user",
            name: body.name,
            email: "member@intellicash.co.ke",
            role: "MEMBER",
            groupId: "group-1",
            memberId: "member-1",
            avatarUrl: body.avatarUrl,
            languagePreference: body.languagePreference,
            permissions: ["groups:read", "members:read", "meetings:read", "store:read"],
            group: { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001" },
            member: { id: "member-1", fullName: "Mary Njeri", phone: "+254700000201" }
          };
        } else if (url.includes("/auth/me")) {
          data = {
            id: "member-user",
            name: "Mary Njeri",
            email: "member@intellicash.co.ke",
            role: "MEMBER",
            groupId: "group-1",
            memberId: "member-1",
            avatarUrl: null,
            languagePreference: "KISWAHILI",
            permissions: ["groups:read", "members:read", "meetings:read", "store:read"],
            group: { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001" },
            member: { id: "member-1", fullName: "Mary Njeri", phone: "+254700000201" }
          };
        } else if (url.endsWith("/groups/group-1")) {
          data = {
            id: "group-1",
            name: "Tujijenge Women VSLA",
            code: "IWL-KBU-0001",
            phase: "GROWTH",
            county: "Kiambu",
            meetingDay: "Wednesday",
            creditScores: [],
            _count: { members: 1, meetings: 1, votes: 0, ledgerEntries: 1 }
          };
        } else if (url.endsWith("/groups/group-1/members")) {
          data = [
            {
              id: "member-1",
              groupId: "group-1",
              fullName: "Mary Njeri",
              phone: "+254700000201",
              role: "MEMBER",
              kycStatus: "VERIFIED",
              status: "ACTIVE",
              pinSet: true,
              defaultPinSet: true,
              pinSetAt: "2026-05-20T08:00:00.000Z",
              currentOtpSet: false,
              currentOtpIssuedAt: null,
              currentOtpExpiresAt: null,
              joinedAt: "2026-01-15T08:00:00.000Z"
            }
          ];
        } else if (url.endsWith("/members/me/otp")) {
          data = {
            id: "member-1",
            groupId: "group-1",
            fullName: "Mary Njeri",
            phone: "+254700000201",
            role: "MEMBER",
            kycStatus: "VERIFIED",
            status: "ACTIVE",
            pinSet: true,
            defaultPinSet: true,
            currentOtpSet: true,
            currentOtpIssuedAt: "2026-06-01T10:00:00.000Z",
            currentOtpExpiresAt: "2026-06-01T10:10:00.000Z"
          };
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<AccountPage />);

    expect(await screen.findByRole("heading", { name: "Profile and Settings" })).toBeInTheDocument();
    expect(screen.getByText("Member Record")).toBeInTheDocument();
    expect(screen.getByText("Meeting Settings")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Linked Group")).toBeInTheDocument();
    expect(screen.getAllByText("Mary Njeri").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Preferred language")).toHaveValue("KISWAHILI");
    expect(screen.getByRole("option", { name: "Kiembu (Embu)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Gikuyu (Kikuyu)" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Change profile photo"), {
      target: { files: [new File(["avatar"], "mary.png", { type: "image/png" })] }
    });
    expect(await screen.findByText("Avatar updated.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Send OTP/i }));

    expect(await screen.findByText("Current meeting OTP sent.")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders member Intelli-Store as products, requests, and read-only credit", async () => {
    let requestBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "member-user",
            name: "Mary Njeri",
            email: "member@intellicash.co.ke",
            role: "MEMBER",
            groupId: "group-1",
            memberId: "member-1",
            permissions: ["store:read", "store:write", "programmes:read", "groups:read"],
            group: { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001" },
            member: { id: "member-1", fullName: "Mary Njeri", phone: "+254700000201" }
          };
        } else if (url.includes("/intelli-store/products")) {
          data = [
            {
              id: "product-1",
              name: "Solar Egg Incubator",
              slug: "solar-egg-incubator",
              category: "AGRI_EQUIPMENT",
              status: "ACTIVE",
              supplierId: "supplier-1",
              supplier: { id: "supplier-1", name: "Intelli-Store Agribusiness Desk", status: "ACTIVE", _count: { products: 1 } },
              description: "A poultry asset available through programme-backed credit.",
              priceCents: 8500000,
              depositCents: 850000,
              currency: "KES",
              programmeLinks: [
                {
                  id: "link-1",
                  creditTerms: "10% deposit request.",
                  depositRateBps: 1000,
                  installmentCount: 6,
                  installmentFrequency: "MONTHLY",
                  flatInterestRateBps: 1200,
                  gracePeriodDays: 30,
                  defaultAgents: [],
                  programme: {
                    id: "programme-1",
                    name: "Kiambu Programme",
                    country: "Kenya",
                    partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 1, webhookSubscriptions: 0 } },
                    _count: { groups: 2, groupLinks: 2, villageAgents: 1 }
                  }
                }
              ]
            }
          ];
        } else if (url.includes("/intelli-store/credit-requests") && init?.method === "POST") {
          requestBody = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
          data = {
            id: "request-2",
            productId: "product-1",
            programmeId: "programme-1",
            requesterUserId: "member-user",
            customerName: "Mary Njeri",
            customerEmail: "member@intellicash.co.ke",
            phoneNumber: "+254700000201",
            groupName: "Tujijenge Women VSLA",
            quantity: 1,
            requestedAmountCents: 8500000,
            depositCents: 850000,
            financedAmountCents: 0,
            commissionRateBps: 500,
            commissionCents: 425000,
            repaymentStatus: "NOT_FINANCED",
            status: "PENDING",
            createdAt: new Date().toISOString(),
            product: { name: "Solar Egg Incubator" },
            installments: [],
            repayments: []
          };
        } else if (url.includes("/intelli-store/credit-requests")) {
          data = [];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<DashboardIntelliStorePage />);

    expect(await screen.findByRole("heading", { name: "My Store" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Products/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /My requests/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Credit/ })).toBeInTheDocument();
    expect(screen.queryByText("Suppliers")).not.toBeInTheDocument();
    expect(screen.queryByText("Finance")).not.toBeInTheDocument();
    expect(screen.queryByText("Sales")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Request$/ }));
    expect(screen.queryByText("Distribution VA / CBT")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Request$/ }));

    await waitFor(() =>
      expect(requestBody).toEqual(
        expect.objectContaining({
          productId: "product-1",
          programmeId: "programme-1",
          customerName: "Mary Njeri",
          customerEmail: "member@intellicash.co.ke",
          phoneNumber: "+254700000201",
          groupName: "Tujijenge Women VSLA",
          quantity: 1
        })
      )
    );

    vi.unstubAllGlobals();
  });

  it("requires a main image before saving a store product", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "admin-1",
            name: "IWL Platform Admin",
            email: "admin@intellicash.co.ke",
            role: "IWL_ADMIN",
            permissions: ["store:read", "store:write", "programmes:read", "partners:read", "village-agents:read"]
          };
        } else if (url.includes("/intelli-store/reports/sales")) {
          data = {
            summary: { fulfilledRequests: 0, quantity: 0, grossSalesCents: 0, depositCents: 0, financedValueCents: 0, commissionCents: 0 },
            rows: []
          };
        } else if (url.includes("/intelli-store/reports/loan-portfolio")) {
          data = {
            summary: {
              principalCents: 0,
              interestCents: 0,
              totalDueCents: 0,
              paidCents: 0,
              outstandingCents: 0,
              overdueCents: 0,
              aging: { currentCents: 0, days1To30Cents: 0, days31To60Cents: 0, days61To90Cents: 0, days90PlusCents: 0 }
            },
            rows: []
          };
        } else if (url.includes("/programmes")) {
          data = [
            {
              id: "programme-1",
              name: "Kiambu Programme",
              country: "Kenya",
              partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 1, webhookSubscriptions: 0 } },
              _count: { groups: 1, groupLinks: 1, villageAgents: 1 }
            }
          ];
        } else {
          data = [];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<DashboardIntelliStorePage />);

    expect(await screen.findByRole("heading", { name: "Intelli-Store" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getAllByRole("button", { name: /Add product/ })[0]!);
    expect(screen.getByText("Main image")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create product/ })).toBeDisabled();
    vi.unstubAllGlobals();
  });

  it("renders the account Intelli-Store page for product requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "group-user",
            name: "Tujijenge Group Account",
            email: "group@intellicash.co.ke",
            role: "GROUP_ACCOUNT",
            groupId: "group-1",
            permissions: ["store:read", "store:write", "programmes:read", "groups:read"],
            group: { id: "group-1", name: "Tujijenge VSLA", code: "IWL-KBU-0001" }
          };
        } else if (url.includes("/intelli-store/products")) {
          data = [
            {
              id: "product-1",
              name: "Solar Egg Incubator",
              slug: "solar-egg-incubator",
              category: "AGRI_EQUIPMENT",
              status: "ACTIVE",
              supplierId: "supplier-1",
              supplier: {
                id: "supplier-1",
                name: "Intelli-Store Agribusiness Desk",
                status: "ACTIVE",
                _count: { products: 1 }
              },
              description: "A poultry asset available through programme-backed credit.",
              priceCents: 8500000,
              depositCents: 850000,
              currency: "KES",
              programmeLinks: [
                {
                  id: "link-1",
                  creditTerms: "10% deposit request.",
                  depositRateBps: 1000,
                  installmentCount: 6,
                  installmentFrequency: "MONTHLY",
                  flatInterestRateBps: 1200,
                  gracePeriodDays: 30,
                  defaultAgents: [
                    {
                      id: "default-agent-1",
                      isPrimary: true,
                      villageAgent: {
                        id: "agent-1",
                        name: "Grace Wanjiku",
                        phone: "+254700000101",
                        status: "ACTIVE",
                        digitalLiteracyScore: 91,
                        caseloadLimit: 20,
                        _count: { groups: 2 }
                      }
                    }
                  ],
                  programme: {
                    id: "programme-1",
                    name: "Kiambu Programme",
                    country: "Kenya",
                    partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 1, webhookSubscriptions: 0 } },
                    _count: { groups: 2, groupLinks: 2, villageAgents: 1 }
                  }
                }
              ]
            }
          ];
        } else if (url.includes("/intelli-store/suppliers")) {
          data = [
            {
              id: "supplier-1",
              name: "Intelli-Store Agribusiness Desk",
              status: "ACTIVE",
              contactName: "Supplier Contact",
              county: "Kiambu",
              location: "Ruiru",
              _count: { products: 1 }
            }
          ];
        } else if (url.includes("/intelli-store/reports/sales")) {
          data = {
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
        } else if (url.includes("/intelli-store/reports/loan-portfolio")) {
          data = {
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
        } else if (url.includes("/intelli-store/credit-requests")) {
          data = [
            {
              id: "request-1",
              productId: "product-1",
              programmeId: "programme-1",
              requesterUserId: "group-user",
              distributionAgentId: "agent-1",
              financierPartnerId: null,
              customerName: "Tujijenge Buyer",
              customerEmail: "group@intellicash.co.ke",
              phoneNumber: "+254700000001",
              county: "Kiambu",
              groupName: "Tujijenge VSLA",
              quantity: 1,
              requestedAmountCents: 8500000,
              depositCents: 850000,
              financedAmountCents: 0,
              commissionRateBps: 500,
              commissionCents: 425000,
              repaymentStatus: "NOT_FINANCED",
              status: "PENDING",
              createdAt: new Date().toISOString(),
              installments: [],
              repayments: [],
              product: {
                id: "product-1",
                name: "Solar Egg Incubator",
                slug: "solar-egg-incubator",
                category: "AGRI_EQUIPMENT",
                status: "ACTIVE",
                description: "A poultry asset available through programme-backed credit.",
                priceCents: 8500000,
                depositCents: 850000,
                currency: "KES",
                programmeLinks: []
              },
              distributionAgent: {
                id: "agent-1",
                name: "Grace Wanjiku",
                phone: "+254700000101",
                status: "ACTIVE",
                digitalLiteracyScore: 91,
                caseloadLimit: 20,
                _count: { groups: 2 }
              }
            }
          ];
        } else if (url.includes("/intelli-store/booking-requests")) {
          data = [];
        } else if (url.includes("/village-agents")) {
          data = [
            {
              id: "agent-1",
              name: "Grace Wanjiku",
              phone: "+254700000101",
              status: "ACTIVE",
              digitalLiteracyScore: 91,
              caseloadLimit: 20,
              _count: { groups: 2 }
            }
          ];
        } else if (url.includes("/programmes")) {
          data = [
            {
              id: "programme-1",
              name: "Kiambu Programme",
              country: "Kenya",
              partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 1, webhookSubscriptions: 0 } },
              _count: { groups: 2, groupLinks: 2, villageAgents: 1 }
            }
          ];
        } else if (url.includes("/partners")) {
          data = [];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<DashboardIntelliStorePage />);

    expect(await screen.findByRole("heading", { name: "My Requests" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Products/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Group requests/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Credit/ })).toBeInTheDocument();
    expect(screen.queryByText("Sales")).not.toBeInTheDocument();
    expect(screen.queryByText("Suppliers")).not.toBeInTheDocument();
    expect(screen.getByText("Solar Egg Incubator")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Group requests/ }));
    expect(screen.getByText("Request product")).toBeInTheDocument();
    expect(screen.getAllByText("Solar Egg Incubator").length).toBeGreaterThan(0);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders partner Intelli-Store as supplier investment support only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "partner-user",
            name: "Partner Officer",
            email: "partner@intellicash.co.ke",
            role: "PARTNER_OFFICER",
            partnerId: "partner-1",
            permissions: ["store:read", "store:write", "programmes:read", "partners:read"],
            partner: { id: "partner-1", name: "FLOURISH" }
          };
        } else if (url.includes("/intelli-store/products")) {
          data = [
            {
              id: "product-1",
              name: "Solar Egg Incubator",
              slug: "solar-egg-incubator",
              category: "AGRI_EQUIPMENT",
              status: "ACTIVE",
              supplierId: "supplier-1",
              supplier: { id: "supplier-1", name: "Green Supplier", status: "ACTIVE", _count: { products: 1 } },
              description: "A poultry asset available through programme-backed credit.",
              imageUrl: "https://example.com/incubator.jpg",
              priceCents: 8500000,
              depositCents: 850000,
              currency: "KES",
              programmeLinks: [
                {
                  id: "link-1",
                  creditTerms: "10% deposit request.",
                  depositRateBps: 1000,
                  installmentCount: 6,
                  installmentFrequency: "MONTHLY",
                  flatInterestRateBps: 0,
                  gracePeriodDays: 30,
                  defaultAgents: [],
                  programme: {
                    id: "programme-1",
                    name: "Kiambu Programme",
                    country: "Kenya",
                    partner: { id: "partner-1", name: "FLOURISH", type: "NGO", status: "ACTIVE", apiScope: "PROGRAMME", _count: { programmes: 1, users: 1, webhookSubscriptions: 0 } },
                    _count: { groups: 1, groupLinks: 1, villageAgents: 0 }
                  }
                }
              ]
            }
          ];
        } else if (url.includes("/intelli-store/suppliers")) {
          data = [
            {
              id: "supplier-1",
              name: "Green Supplier",
              status: "ACTIVE",
              contactName: "Supplier Contact",
              county: "Kiambu",
              location: "Ruiru",
              _count: { products: 1 }
            }
          ];
        } else if (url.includes("/intelli-store/credit-requests")) {
          data = [
            {
              id: "request-1",
              productId: "product-1",
              programmeId: "programme-1",
              requesterUserId: "group-user",
              distributionAgentId: "agent-1",
              financierPartnerId: null,
              customerName: "Tujijenge Buyer",
              customerEmail: "group@intellicash.co.ke",
              phoneNumber: "+254700000001",
              groupName: "Tujijenge VSLA",
              quantity: 1,
              requestedAmountCents: 8500000,
              depositCents: 850000,
              financedAmountCents: 0,
              commissionRateBps: 500,
              commissionCents: 425000,
              repaymentStatus: "NOT_FINANCED",
              status: "APPROVED",
              createdAt: new Date().toISOString(),
              installments: [],
              repayments: [],
              product: { id: "product-1", name: "Solar Egg Incubator", priceCents: 8500000 },
              programme: { id: "programme-1", name: "Kiambu Programme" }
            }
          ];
        } else if (url.includes("/intelli-store/reports/sales")) {
          data = {
            summary: { fulfilledRequests: 0, quantity: 0, grossSalesCents: 0, depositCents: 0, financedValueCents: 0, commissionCents: 0 },
            rows: []
          };
        } else if (url.includes("/intelli-store/reports/loan-portfolio")) {
          data = {
            summary: {
              principalCents: 5000000,
              interestCents: 0,
              totalDueCents: 5000000,
              paidCents: 0,
              outstandingCents: 5000000,
              overdueCents: 0,
              aging: { currentCents: 5000000, days1To30Cents: 0, days31To60Cents: 0, days61To90Cents: 0, days90PlusCents: 0 }
            },
            rows: []
          };
        } else if (url.includes("/intelli-store/booking-requests")) {
          data = [];
        } else if (url.includes("/village-agents")) {
          data = [];
        } else if (url.includes("/programmes")) {
          data = [];
        } else if (url.includes("/partners")) {
          data = [{ id: "partner-1", name: "FLOURISH", type: "NGO" }];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<DashboardIntelliStorePage />);

    expect(await screen.findByRole("heading", { name: "Supplier investment desk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Products/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Suppliers/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Applications/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Invest \/ Donate/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Impact/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add product/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add supplier/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Distribution")).not.toBeInTheDocument();
    expect(screen.queryByText("Bookings")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Invest \/ Donate/ }));

    expect(await screen.findByRole("button", { name: /Save support/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Post repayment/ })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("renders the IntelliAudit workspace shell", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        let data: unknown = {};

        if (url.includes("/auth/me")) {
          data = {
            id: "admin-1",
            name: "IWL Platform Admin",
            email: "admin@intellicash.co.ke",
            role: "IWL_ADMIN"
          };
        } else if (url.includes("/intelliaudit/overview")) {
          data = {
            sources: 1,
            documents: 1,
            records: 2,
            reconciliations: 1,
            findings: 1,
            recommendations: 1,
            reports: 1,
            approvals: 0,
            standards: 3,
            llmConfigured: false,
            connectorNetworkCallsEnabled: false
          };
        } else if (url.includes("/intelliaudit/evidence")) {
          data = {
            sources: [],
            documents: [],
            records: [],
            findings: []
          };
        } else if (url.includes("/intelliaudit/reconciliations")) {
          data = [];
        } else if (url.includes("/intelliaudit/reports")) {
          data = [];
        } else if (url.includes("/intelliaudit/standards")) {
          data = [];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    render(<IntelliAuditPage />);

    expect(await screen.findByRole("heading", { name: "IntelliAudit" })).toBeInTheDocument();
    expect(screen.getByText("Rules mode")).toBeInTheDocument();
    expect(screen.getAllByText("Chat").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evidence").length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
