import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MeetingEntryPage from "../src/app/dashboard/meetings/[meetingId]/entry/page";
import MeetingsPage from "../src/app/dashboard/meetings/page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useParams: () => ({}),
  usePathname: () => "/dashboard/meetings",
  useRouter: () => ({ push: vi.fn() })
}));

describe("meeting entry workflow", () => {
  it("shows meeting entry actions for group accounts without adding an Entry tab", async () => {
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
            permissions: ["groups:read", "meetings:read", "meetings:write", "ledger:read"],
            group: { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001" }
          };
        } else if (url.endsWith("/groups")) {
          data = [
            {
              id: "group-1",
              name: "Tujijenge Women VSLA",
              code: "IWL-KBU-0001",
              phase: "INTENSIVE",
              county: "Kiambu",
              gpsLatitude: -1.0333,
              gpsLongitude: 37.0693,
              shareValueCents: 50000,
              maxSharesPerMemberPerMeeting: 10,
              _count: { members: 6, meetings: 1, votes: 0, ledgerEntries: 1 }
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
              unlockStatus: "PENDING",
              gpsCompliant: true,
              transactionTotal: 0,
              minutes: null,
              group: {
                id: "group-1",
                name: "Tujijenge Women VSLA",
                code: "IWL-KBU-0001",
                county: "Kiambu",
              gpsLatitude: -1.0333,
              gpsLongitude: 37.0693,
              shareValueCents: 50000,
              maxSharesPerMemberPerMeeting: 10
            },
              steps: [],
              attendance: [],
              keySubmissions: []
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

    expect(await screen.findByRole("heading", { name: "Meetings" })).toBeInTheDocument();
    const entryLinks = await screen.findAllByRole("link", { name: /Entry/i });
    expect(entryLinks.map((link) => link.getAttribute("href"))).toContain("/dashboard/meetings/meeting-1/entry");
    vi.unstubAllGlobals();
  });

  it("renders the group meeting entry console workflow", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    });
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
            permissions: [
              "groups:read",
              "members:read",
              "meetings:read",
              "meetings:write",
              "meeting-keys:write",
              "ledger:read",
              "ledger:write"
            ],
            group: { id: "group-1", name: "Tujijenge Women VSLA", code: "IWL-KBU-0001" }
          };
        } else if (url.endsWith("/groups")) {
          data = [
            {
              id: "group-1",
              name: "Tujijenge Women VSLA",
              code: "IWL-KBU-0001",
              phase: "INTENSIVE",
              county: "Kiambu",
              shareValueCents: 50000,
              maxSharesPerMemberPerMeeting: 10,
              _count: { members: 3, meetings: 1, votes: 0, ledgerEntries: 2 }
            }
          ];
        } else if (url.endsWith("/groups/group-1")) {
          data = {
            id: "group-1",
            name: "Tujijenge Women VSLA",
            code: "IWL-KBU-0001",
            phase: "INTENSIVE",
            county: "Kiambu",
            fundAccounts: [
              { id: "fund-internal", type: "INTERNAL_LOAN", balanceCents: 250000, currency: "KES" },
              { id: "fund-social", type: "SOCIAL", balanceCents: 40000, currency: "KES" }
            ],
            shareValueCents: 50000,
            maxSharesPerMemberPerMeeting: 10,
            creditScores: [],
            _count: { members: 3, meetings: 1, votes: 0, ledgerEntries: 2 }
          };
        } else if (url.includes("/groups/group-1/meetings/meeting-1")) {
          data = {
            id: "meeting-1",
            groupId: "group-1",
            title: "Weekly meeting",
            status: "SCHEDULED",
            scheduledAt: "2026-06-03T08:00:00.000Z",
            openedAt: null,
            closedAt: null,
            unlockStatus: "PENDING",
            gpsCompliant: true,
            transactionTotal: 2,
            minutes: null,
            group: {
              id: "group-1",
              name: "Tujijenge Women VSLA",
              code: "IWL-KBU-0001",
              county: "Kiambu",
              shareValueCents: 50000,
              maxSharesPerMemberPerMeeting: 10
            },
            steps: [
              { id: "step-1", step: "OPENING_AND_3_KEY_SECURITY", status: "PENDING", name: "Opening & 3-Key Security" }
            ],
            attendance: [{ id: "attendance-1", status: "PRESENT", member: { fullName: "Mary Njeri", role: "CHAIRPERSON" } }],
            keySubmissions: []
          };
        } else if (url.includes("/groups/group-1/members")) {
          data = [
            { id: "member-1", fullName: "Mary Njeri", phone: "+254700000201", role: "CHAIRPERSON", kycStatus: "VERIFIED", status: "ACTIVE", pinSet: true },
            { id: "member-2", fullName: "Faith Achieng", phone: "+254700000202", role: "SECRETARY", kycStatus: "VERIFIED", status: "ACTIVE", pinSet: true },
            { id: "member-3", fullName: "Agnes Muthoni", phone: "+254700000203", role: "TREASURER", kycStatus: "VERIFIED", status: "ACTIVE", pinSet: true }
          ];
        } else if (url.includes("/groups/group-1/offline-devices/refresh")) {
          data = {
            device: { id: "device-1", deviceId: "vitest-device", status: "ACTIVE" },
            verifiers: [
              { memberId: "member-1", fullName: "Mary Njeri", role: "CHAIRPERSON", verifier: "member-1-verifier" },
              { memberId: "member-2", fullName: "Faith Achieng", role: "SECRETARY", verifier: "member-2-verifier" },
              { memberId: "member-3", fullName: "Agnes Muthoni", role: "TREASURER", verifier: "member-3-verifier" }
            ],
            skipped: []
          };
        } else if (url.includes("/groups/group-1/ledger")) {
          data = [
            {
              id: "ledger-1",
              memberId: "member-1",
              meetingId: "meeting-1",
              type: "SHARE_PURCHASE",
              amountCents: 100000,
              direction: "CREDIT",
              description: "Mary Njeri share purchase",
              signature: "signed",
              createdAt: "2026-06-03T08:00:00.000Z",
              member: { id: "member-1", fullName: "Mary Njeri" },
              fundAccount: { id: "fund-internal", type: "INTERNAL_LOAN", currency: "KES" }
            },
            {
              id: "ledger-2",
              memberId: "member-1",
              meetingId: "meeting-1",
              type: "SOCIAL_CONTRIBUTION",
              amountCents: 5000,
              direction: "CREDIT",
              description: "Mary Njeri social fund",
              signature: "signed",
              createdAt: "2026-06-03T08:05:00.000Z",
              member: { id: "member-1", fullName: "Mary Njeri" },
              fundAccount: { id: "fund-social", type: "SOCIAL", currency: "KES" }
            }
          ];
        }

        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      })
    );

    await React.act(async () => {
      render(
        <React.Suspense fallback={<div>Loading entry</div>}>
          <MeetingEntryPage params={Promise.resolve({ meetingId: "meeting-1" })} />
        </React.Suspense>
      );
    });

    expect(await screen.findByText("Meeting Console")).toBeInTheDocument();
    expect(screen.getAllByText("Unlock").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Attendance").length).toBeGreaterThan(0);
    expect(screen.getByText("Share purchase & transactions")).toBeInTheDocument();
    expect(screen.getByText("Share-Out")).toBeInTheDocument();
    expect(screen.getByText("Review & Sync")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(document.querySelector(".meeting-entry-sync-button")).toBeInTheDocument();
    expect(document.querySelector(".meeting-entry-status .button")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Unlock/i }));
    expect(screen.getByRole("button", { name: /Start/i })).toBeInTheDocument();
    expect(screen.getAllByText("Online OTP").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("OTP 1")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Credential 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OTPs" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh offline PINs" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: /Share purchase & transactions/i }));
    expect(screen.getByText("Loan repayment")).toBeInTheDocument();
    expect(screen.getByText("Loan disbursement")).toBeInTheDocument();
    expect(screen.getAllByText("Social fund").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Save entries/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("combobox", { name: "Entry view" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "4" })).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText((content) => content.includes("4 shares"))).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Entry view" }), { target: { value: "all" } });
    expect(screen.getByLabelText("All member meeting entry")).toBeInTheDocument();
    expect(document.querySelector(".meeting-entry-all-member-list")).toBeInTheDocument();
    expect(document.querySelector(".fast-entry-table-wrap")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: /Review & Sync/i }));
    expect(screen.getAllByText("No conflict rows").length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
