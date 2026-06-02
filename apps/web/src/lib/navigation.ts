import {
  Activity,
  BookOpenText,
  Bot,
  BarChart3,
  ClipboardList,
  FileText,
  FolderKanban,
  Landmark,
  LockKeyhole,
  Settings,
  ShieldCheck,
  ShoppingBag,
  UserCog,
  UsersRound,
  WalletCards
} from "@/lib/theme-icons";

export const navigationItems = [
  { label: "Dashboard", href: "/dashboard", icon: BarChart3, roles: ["IWL_ADMIN", "PARTNER_OFFICER", "GROUP_ACCOUNT", "MEMBER", "LENDER", "READ_ONLY"] },
  { label: "Meetings", href: "/dashboard/meetings", icon: Activity, roles: ["IWL_ADMIN", "PARTNER_OFFICER", "GROUP_ACCOUNT", "MEMBER", "READ_ONLY"] },
  { label: "Passbook", href: "/dashboard/passbook", icon: BookOpenText, roles: ["MEMBER"] },
  { label: "Users", href: "/dashboard/users", icon: UserCog, roles: ["IWL_ADMIN"] },
  { label: "Payments", href: "/dashboard/payments", icon: WalletCards, roles: ["IWL_ADMIN"] },
  { label: "Programs", href: "/dashboard/programmes", icon: FolderKanban, roles: ["IWL_ADMIN", "PARTNER_OFFICER", "MEMBER", "LENDER", "READ_ONLY"] },
  { label: "Intelli-Store", href: "/dashboard/intelli-store", icon: ShoppingBag, roles: ["IWL_ADMIN", "PARTNER_OFFICER", "GROUP_ACCOUNT", "MEMBER", "LENDER", "READ_ONLY"] },
  { label: "Reports", href: "/dashboard/reports", icon: ClipboardList, roles: ["IWL_ADMIN", "PARTNER_OFFICER", "GROUP_ACCOUNT", "LENDER", "READ_ONLY"] },
  { label: "IntelliAudit", href: "/dashboard/intelliaudit", icon: Bot, roles: ["IWL_ADMIN", "PARTNER_OFFICER", "LENDER", "READ_ONLY"] },
  { label: "Groups", href: "/dashboard/groups", icon: UsersRound, roles: ["IWL_ADMIN", "PARTNER_OFFICER", "LENDER", "READ_ONLY"] },
  { label: "Partners", href: "/dashboard/partners", icon: Landmark, roles: ["IWL_ADMIN", "PARTNER_OFFICER", "READ_ONLY"] },
  { label: "VA / CBT", href: "/dashboard/agents", icon: ShieldCheck, roles: ["IWL_ADMIN", "PARTNER_OFFICER", "READ_ONLY"] },
  { label: "Audit", href: "/dashboard/audit", icon: FileText, roles: ["IWL_ADMIN", "PARTNER_OFFICER", "LENDER", "READ_ONLY"] },
  { label: "API Docs", href: "/dashboard/api-docs", icon: BookOpenText, roles: ["IWL_ADMIN", "PARTNER_OFFICER", "LENDER", "READ_ONLY"] },
  { label: "Integrations", href: "/dashboard/integrations", icon: LockKeyhole, roles: ["IWL_ADMIN", "PARTNER_OFFICER", "LENDER", "READ_ONLY"] },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["IWL_ADMIN", "READ_ONLY"] }
];
