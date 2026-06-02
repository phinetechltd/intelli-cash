export type ApiDocMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface MobileApiEndpoint {
  method: ApiDocMethod;
  path: string;
  title: string;
  permission?: string;
  summary: string;
  request?: string;
  response: string;
  notes?: string[];
}

export interface MobileApiModule {
  id: string;
  title: string;
  description: string;
  endpoints: MobileApiEndpoint[];
}

export const mobileApiModules: MobileApiModule[] = [
  {
    id: "auth",
    title: "Auth And API Keys",
    description: "Use server API keys from the admin panel for mobile backend integrations.",
    endpoints: [
      {
        method: "GET",
        path: "/api-keys/presets",
        title: "List API key presets",
        permission: "api-keys:read",
        summary: "Returns supported key presets, including MOBILE_CORE.",
        response: "Array of presets with id, name, description, and scopes."
      },
      {
        method: "POST",
        path: "/api-keys",
        title: "Create mobile API key",
        permission: "api-keys:write",
        summary: "Creates a server key for the signed-in account. The token is returned once.",
        request: '{ "name": "Mobile backend production", "preset": "MOBILE_CORE" }',
        response: "API key metadata plus one-time token."
      },
      {
        method: "DELETE",
        path: "/api-keys/{id}",
        title: "Revoke API key",
        permission: "api-keys:write",
        summary: "Revokes one API key owned by the signed-in account.",
        response: "Revoked API key metadata."
      }
    ]
  },
  {
    id: "programmes",
    title: "Programmes",
    description: "Read programme context for group and store workflows.",
    endpoints: [
      {
        method: "GET",
        path: "/programmes",
        title: "List scoped programmes",
        permission: "programmes:read",
        summary: "Returns programmes visible to the API key owner.",
        response: "Array of programmes with partner, lender links, public status, and counts."
      }
    ]
  },
  {
    id: "groups",
    title: "Groups And Members",
    description: "Sync group profiles, member rosters, and member updates for field apps.",
    endpoints: [
      {
        method: "GET",
        path: "/groups",
        title: "List scoped groups",
        permission: "groups:read",
        summary: "Returns groups visible to the account scope.",
        response: "Array of groups with programme, VA, member counts, and credit scores."
      },
      {
        method: "GET",
        path: "/groups/{id}",
        title: "Get group detail",
        permission: "groups:read",
        summary: "Returns one group with programme links and operational context.",
        response: "Group record."
      },
      {
        method: "GET",
        path: "/groups/{id}/members",
        title: "List group members",
        permission: "members:read",
        summary: "Returns group members visible to the key owner.",
        response: "Array of member records."
      },
      {
        method: "POST",
        path: "/groups/{id}/members",
        title: "Create member",
        permission: "members:write",
        summary: "Creates a member inside a scoped group.",
        request: '{ "fullName": "Mary Njeri", "phone": "+254700000201", "role": "MEMBER" }',
        response: "Created member record."
      },
      {
        method: "PATCH",
        path: "/groups/{id}/members/{memberId}",
        title: "Update member",
        permission: "members:write",
        summary: "Updates member role, KYC status, or active status.",
        request: '{ "role": "TREASURER", "kycStatus": "VERIFIED", "status": "ACTIVE" }',
        response: "Updated member record."
      }
    ]
  },
  {
    id: "meetings",
    title: "Meetings And Security",
    description: "Run the secure meeting workflow from mobile clients.",
    endpoints: [
      {
        method: "GET",
        path: "/groups/{id}/meetings",
        title: "List group meetings",
        permission: "meetings:read",
        summary: "Returns meetings for one group with steps and attendance context.",
        response: "Array of meeting records."
      },
      {
        method: "POST",
        path: "/groups/{id}/meetings",
        title: "Schedule meeting",
        permission: "meetings:write",
        summary: "Creates a scheduled group meeting.",
        request: '{ "title": "Week 12 Meeting", "scheduledAt": "2026-06-03T07:00:00.000Z" }',
        response: "Created meeting record."
      },
      {
        method: "POST",
        path: "/groups/{id}/meetings/{meetingId}/key-submissions",
        title: "Submit meeting keys",
        permission: "meeting-keys:write",
        summary: "Submits one or more member PIN confirmations for the three-key unlock.",
        request: '{ "submissions": [{ "memberId": "member-id", "pin": "111111", "deviceId": "field-phone-1" }] }',
        response: "Verified submission count and open-readiness."
      },
      {
        method: "POST",
        path: "/groups/{id}/meetings/{meetingId}/open",
        title: "Open meeting",
        permission: "meetings:write",
        summary: "Opens a meeting after three distinct active member keys are verified.",
        request: '{ "gpsCompliant": true, "keySubmissions": [] }',
        response: "Meeting with active workflow steps."
      },
      {
        method: "POST",
        path: "/groups/{id}/meetings/{meetingId}/attendance",
        title: "Record attendance",
        permission: "meetings:write",
        summary: "Creates or updates one member attendance record.",
        request: '{ "memberId": "member-id", "status": "PRESENT" }',
        response: "Attendance record with member context."
      },
      {
        method: "POST",
        path: "/groups/{id}/meetings/{meetingId}/steps/{step}/complete",
        title: "Complete meeting step",
        permission: "meetings:write",
        summary: "Marks the next valid workflow step complete.",
        response: "Updated meeting record."
      },
      {
        method: "POST",
        path: "/groups/{id}/meetings/{meetingId}/seal",
        title: "Seal meeting",
        permission: "meetings:write",
        summary: "Closes a meeting after all workflow steps are complete.",
        request: '{ "minutes": "Meeting closed and balances confirmed." }',
        response: "Sealed meeting record."
      }
    ]
  },
  {
    id: "ledger",
    title: "Ledger And Votes",
    description: "Append group financial records and General Assembly decisions.",
    endpoints: [
      {
        method: "GET",
        path: "/groups/{id}/ledger",
        title: "List ledger entries",
        permission: "ledger:read",
        summary: "Returns ledger records scoped to a group.",
        response: "Array of signed ledger entries."
      },
      {
        method: "POST",
        path: "/groups/{id}/ledger",
        title: "Append ledger entry",
        permission: "ledger:write",
        summary: "Appends a signed ledger entry for a group fund account.",
        request: '{ "memberId": "member-id", "type": "SHARE_PURCHASE", "amountCents": 250000, "direction": "CREDIT", "description": "5 shares" }',
        response: "Created ledger entry."
      },
      {
        method: "GET",
        path: "/groups/{id}/votes",
        title: "List votes",
        permission: "votes:read",
        summary: "Returns group votes and resolutions.",
        response: "Array of vote records."
      },
      {
        method: "POST",
        path: "/groups/{id}/votes",
        title: "Record vote",
        permission: "votes:write",
        summary: "Records a General Assembly vote outcome with quorum and ballot totals.",
        request: '{ "resolutionType": "INTERNAL_LOAN_APPROVAL", "motion": "Approve loan", "result": "PASSED", "quorumRequired": 75, "yesCount": 5, "noCount": 0, "abstainCount": 1, "totalEligible": 6 }',
        response: "Created vote record."
      }
    ]
  },
  {
    id: "store",
    title: "Intelli-Store",
    description: "Request productive assets, track fulfilment, and manage credit repayment workflows.",
    endpoints: [
      {
        method: "GET",
        path: "/intelli-store/products",
        title: "List store products",
        permission: "store:read",
        summary: "Returns products available to the account scope.",
        response: "Array of products with supplier, programme links, terms, and VA defaults."
      },
      {
        method: "GET",
        path: "/intelli-store/credit-requests",
        title: "List credit requests",
        permission: "store:read",
        summary: "Returns scoped product credit requests.",
        response: "Array of credit requests with product, programme, financier, installments, and repayments."
      },
      {
        method: "POST",
        path: "/intelli-store/credit-requests",
        title: "Create credit request",
        permission: "store:write",
        summary: "Creates a product request on behalf of a group or customer.",
        request: '{ "productId": "product-id", "programmeId": "programme-id", "customerName": "Tujijenge VSLA", "customerEmail": "group@example.test", "phoneNumber": "+254700000001", "quantity": 1 }',
        response: "Created store credit request."
      }
    ]
  },
  {
    id: "sync",
    title: "Mobile Sync Notes",
    description: "Use server-side idempotency and local queues around the scoped REST API.",
    endpoints: [
      {
        method: "GET",
        path: "/auth/me",
        title: "Validate current credential",
        summary: "Use this endpoint as a lightweight credential and scope check.",
        response: "Current user profile and effective permissions.",
        notes: [
          "Responses are wrapped as { data: ... }.",
          "Errors are wrapped as { error: { code, message, details?, traceId? } } and return X-Request-Id.",
          "Use ISO 8601 timestamps and integer cents for money.",
          "Queue mobile writes locally and retry only after checking the last server state."
        ]
      }
    ]
  }
];

export function allMobileApiEndpoints() {
  return mobileApiModules.flatMap((module) =>
    module.endpoints.map((endpoint) => ({
      ...endpoint,
      module: module.title
    }))
  );
}

function pathToOpenApi(path: string) {
  return path.replace(/\{([^}]+)\}/g, "{$1}");
}

export function buildMobileOpenApiSpec(apiBaseUrl: string) {
  const baseUrl = apiBaseUrl.replace(/\/$/, "");
  const paths: Record<string, Record<string, unknown>> = {};

  mobileApiModules.forEach((module) => {
    module.endpoints.forEach((endpoint) => {
      const openApiPath = pathToOpenApi(endpoint.path);
      const method = endpoint.method.toLowerCase();
      paths[openApiPath] = paths[openApiPath] ?? {};
      paths[openApiPath][method] = {
        tags: [module.title],
        summary: endpoint.title,
        description: [
          endpoint.summary,
          endpoint.permission ? `Required permission: ${endpoint.permission}.` : "",
          ...(endpoint.notes ?? [])
        ].filter(Boolean).join("\n\n"),
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: endpoint.response
          },
          "400": { description: "Validation or business-rule error." },
          "401": { description: "Missing or invalid bearer token." },
          "403": { description: "Bearer token does not have the required effective scope." }
        },
        ...(endpoint.request
          ? {
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    example: JSON.parse(endpoint.request)
                  }
                }
              }
            }
          : {})
      };
    });
  });

  return {
    openapi: "3.1.0",
    info: {
      title: "Intellicash Mobile Integration API",
      version: "1.0.0",
      description: "Curated API catalog for mobile and server integrations."
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "ic_sk"
        }
      }
    },
    paths
  };
}
