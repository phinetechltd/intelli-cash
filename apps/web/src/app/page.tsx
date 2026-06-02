import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  ShoppingBag,
  UsersRound
} from "@/lib/theme-icons";
import { PublicSiteFooter } from "../components/public-site-footer";
import { PublicSiteHeader } from "../components/public-site-header";
import { IntelliStoreSection } from "../components/intelli-store-section";
import { GroupRegistrationSection } from "../components/group-registration-section";

const playStoreUrl =
  "https://play.google.com/store/apps/details?id=com.intellicash.app";

type IllustrationKind =
  | "champions"
  | "enterprise"
  | "groups"
  | "partners"
  | "lenders"
  | "training"
  | "finance"
  | "payments"
  | "banking"
  | "marketing"
  | "ai"
  | "web3"
  | "reports"
  | "map"
  | "package"
  | "trust"
  | "growth";

const operatingSignals = [
  { label: "Digital championship", illustration: "champions" },
  { label: "Green enterprise finance", illustration: "enterprise" },
  { label: "Digital marketing services", illustration: "marketing" },
  { label: "AI business support", illustration: "ai" },
  { label: "Impact partner reports", illustration: "reports" }
] as const satisfies ReadonlyArray<{ label: string; illustration: IllustrationKind }>;

const partnerLogos = [
  {
    name: "The Coca-Cola Foundation",
    href: "https://www.coca-colacompany.com/shared-future/coca-cola-foundation",
    src: "/partners/coca-cola-foundation.jpg",
    programmes: ["Green enterprise grants", "Digital championship services"]
  },
  {
    name: "County Government of Embu",
    href: "https://embu.go.ke/",
    src: "/partners/embu-county-government.png",
    programmes: ["County group registration", "Agriculture enterprise support"]
  },
  {
    name: "Rainforest Alliance",
    href: "https://www.rainforest-alliance.org/",
    src: "/partners/rainforest-alliance.png",
    programmes: ["Climate-smart agriculture", "Green market readiness"]
  },
  {
    name: "Intelli-Wealth",
    href: "https://intelliwealth.org/",
    src: "/partners/intelli-wealth.png",
    programmes: ["Intelli-Cash platform", "AI and digital marketing support"]
  }
];

const audienceCards = [
  {
    title: "For digital championship teams",
    text: "Coordinate enterprise onboarding, demand capture, campaigns, customer follow-up, and trusted digital records in one workflow.",
    illustration: "champions"
  },
  {
    title: "For green enterprises",
    text: "Farmers, makers, suppliers, and climate-smart businesses get finance, market access, mobile payments, and simple digital operations.",
    illustration: "enterprise"
  },
  {
    title: "For VSLAs, Chamas, and credit unions",
    text: "Savings groups, cooperatives, SACCOs, and agribusiness clusters can manage meetings, passbooks, stock requests, repayments, and records that support access to credit and green-enterprise grants.",
    illustration: "groups"
  },
  {
    title: "For partners",
    text: "NGOs, donors, government programmes, and accelerators get banking infrastructure, quality reports, and realistic impact evidence.",
    illustration: "partners"
  },
  {
    title: "For lenders and funds",
    text: "Enterprise activity, service history, digital records, and field quality help identify green businesses ready for responsible capital.",
    illustration: "lenders"
  },
  {
    title: "For coaches and trainers",
    text: "Field teams can guide digital championship services for finance, digital marketing, AI support, customer follow-up, and reporting.",
    illustration: "training"
  }
] as const satisfies ReadonlyArray<{ title: string; text: string; illustration: IllustrationKind }>;

const workflowSteps = [
  {
    title: "Activate digital championship",
    text: "Set up service coverage for VSLAs, Chamas, credit unions, cooperatives, and green enterprises that need growth support.",
    illustration: "map"
  },
  {
    title: "Package the offer",
    text: "Capture the product, service, price, location, stock, story, and finance need so the enterprise is ready to sell.",
    illustration: "package"
  },
  {
    title: "Launch digital marketing",
    text: "Promote products, collect leads, coordinate orders, and keep the customer journey simple for groups and enterprises.",
    illustration: "marketing"
  },
  {
    title: "Move money safely",
    text: "Use Paystack, M-Pesa, KCB Buni, partner wallets, and Web3 rails to support payments, payouts, and programme funding.",
    illustration: "payments"
  },
  {
    title: "Guide with AI services",
    text: "Use AI support for business prompts, product descriptions, customer messages, training guidance, and next-best actions.",
    illustration: "ai"
  },
  {
    title: "Report prosperity",
    text: "Show enterprise activity, market reach, service quality, learning progress, and impact signals that partners can trust.",
    illustration: "growth"
  }
] as const satisfies ReadonlyArray<{ title: string; text: string; illustration: IllustrationKind }>;

const securityRows = [
  ["Know your members", "IPRS KYC, member photos, and role assignment reduce impersonation risk."],
  ["Protect every meeting", "Three independent key-holders approve the session before group money can move."],
  ["Confirm transactions", "Member approvals, payment references, and fund accounts preserve visibility."],
  ["Keep records permanent", "Ledger and audit events are appended, signed, and reviewed instead of overwritten."],
  ["Respect group sovereignty", "General Assembly decisions stay central to loans, grants, elections, and constitution changes."]
];

const partnerOutcomes = [
  {
    title: "Service reach",
    text: "See where digital championship, groups, and green enterprises are active.",
    illustration: "map"
  },
  {
    title: "Enterprise growth",
    text: "Follow training, product support, customer interest, and campaign activity.",
    illustration: "enterprise"
  },
  {
    title: "Field quality",
    text: "Review visits, onboarding, meeting discipline, and service delivery notes.",
    illustration: "trust"
  },
  {
    title: "Impact learning",
    text: "Compare practical outcomes without exposing private financial records.",
    illustration: "reports"
  }
] as const satisfies ReadonlyArray<{ title: string; text: string; illustration: IllustrationKind }>;

const financialRailCards = [
  {
    title: "Green enterprise finance",
    text: "Help groups and green enterprises access credit from savings records, equipment support, enterprise services, and green enterprise related grants.",
    illustration: "finance"
  },
  {
    title: "Paystack payments",
    text: "Card, Airtel Money, and mobile-money checkout for partner deposits, public contributions, and programme funding.",
    illustration: "payments"
  },
  {
    title: "M-Pesa and KCB Buni",
    text: "Mobile-money and banking rails for local payments, payouts, callback tracking, and partner finance workflows.",
    illustration: "banking"
  },
  {
    title: "Digital marketing services",
    text: "Campaign support, product storytelling, lead capture, customer follow-up, and digital sales routines for groups and enterprises.",
    illustration: "marketing"
  },
  {
    title: "AI service support",
    text: "AI-assisted prompts for business coaching, product copy, training messages, customer care, and field next steps.",
    illustration: "ai"
  },
  {
    title: "BTC and Ethereum contracts",
    text: "Web3 contract rails for programmable value movement, contribution tracking, and transparent grant flows.",
    illustration: "web3"
  },
  {
    title: "Quality impact reports",
    text: "Enterprise, portfolio, county, phase, ledger, audit, and programme reports that help partners assess realistic impact.",
    illustration: "reports"
  }
] as const satisfies ReadonlyArray<{ title: string; text: string; illustration: IllustrationKind }>;

const featuredPlatformScreenshot = {
  title: "Digital championship workspace",
  text: "Fast access to meetings, store requests, passbook records, and member support.",
  src: "/screenshots/member-dashboard.png"
};

const secondaryPlatformScreenshots = [
  {
    title: "Meetings calendar",
    text: "Monthly, weekly, and daily visibility for group and enterprise sessions.",
    src: "/screenshots/member-meetings.png"
  },
  {
    title: "Transaction table",
    text: "Simple meeting and activity records organized by date and context.",
    src: "/screenshots/member-passbook.png"
  }
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <PublicSiteHeader
          ariaLabel="Landing navigation"
          playStoreUrl={playStoreUrl}
          showAccessLinks={false}
        />

        <div className="landing-hero-content">
          <p className="eyebrow">Digital Championship Platform</p>
          <h1>Intelli-Cash</h1>
          <p>
            Finance, digital marketing, and AI services for VSLAs, Chamas,
            credit unions, cooperatives, and green enterprises growing with
            agriculture, technology, and climate-smart enterprise.
          </p>
          <div className="hero-actions">
            <a
              className="button app-store-button"
              href={playStoreUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Download size={18} />
              Download on Play Store
            </a>
            <a className="button secondary light" href="#platform">
              Explore services
              <ArrowRight size={18} />
            </a>
            <a className="button secondary light" href="#group-registration">
              Register group
              <UsersRound size={18} />
            </a>
            <Link className="button secondary light" href="/intelli-store">
              Intelli-Store
              <ShoppingBag size={18} />
            </Link>
          </div>
          <div className="hero-metrics" aria-label="Platform highlights">
            <span>Digital championship</span>
            <span>VSLAs, Chamas, credit unions</span>
            <span>Green enterprise finance</span>
            <span>AI + digital marketing</span>
          </div>
        </div>
        <div className="landing-hero-scene" aria-hidden="true">
          <LandingIllustration kind="champions" />
        </div>
      </section>

      <section className="landing-signal-band proof-strip" aria-label="Platform signals">
        {operatingSignals.map((signal) => (
          <div className="landing-signal" key={signal.label}>
            <LandingIllustration compact kind={signal.illustration} />
            <span>{signal.label}</span>
          </div>
        ))}
      </section>

      <section className="partner-proof-row" id="partners" aria-labelledby="partner-proof-title">
        <div className="partner-proof-copy">
          <p className="eyebrow">Our Partners</p>
          <h2 id="partner-proof-title">Built with partners growing green enterprise opportunity</h2>
        </div>
        <div className="partner-logo-grid">
          {partnerLogos.map((partner) => (
            <a
              aria-label={`Visit ${partner.name}`}
              className="partner-logo-card"
              href={partner.href}
              key={partner.name}
              rel="noopener noreferrer"
              target="_blank"
            >
              <img alt={`${partner.name} logo`} loading="lazy" src={partner.src} />
              <strong>{partner.name}</strong>
              <ul className="partner-program-list" aria-label={`${partner.name} programs`}>
                {partner.programmes.map((programme) => (
                  <li key={programme}>{programme}</li>
                ))}
              </ul>
            </a>
          ))}
        </div>
      </section>

      <section className="landing-section intro-section" id="platform">
        <div className="landing-section-header wide">
          <p className="eyebrow">Prosperity Toolkit</p>
          <h2>Digital championship for VSLAs, Chamas, credit unions, agriculture, technology, finance, marketing, and AI</h2>
          <p>
            Intelli-Cash helps VSLAs, Chamas, credit unions, cooperatives,
            farms, suppliers, shops, makers, and climate-smart businesses
            organize customers, capital, records, and confidence.
          </p>
        </div>
        <div className="audience-grid">
          {audienceCards.map((card) => (
            <article className="pillar-card audience-card illustrated-card" key={card.title}>
              <LandingIllustration kind={card.illustration} />
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section financial-rails-section" aria-labelledby="financial-rails-title">
        <div className="landing-section-header wide">
          <p className="eyebrow">Finance, Marketing, and AI Services</p>
          <h2 id="financial-rails-title">A service stack for digital championship and green enterprise growth</h2>
          <p>
            Intelli-Cash connects field activity to payment rails, digital
            campaigns, AI support, partner wallets, Web3 contracts, and quality
            reports that show practical enterprise growth.
          </p>
        </div>
        <div className="financial-rails-grid">
          {financialRailCards.map((card) => (
            <article className="financial-rail-card illustrated-card" key={card.title}>
              <LandingIllustration kind={card.illustration} />
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section platform-preview-section" aria-labelledby="platform-preview-title">
        <div className="landing-section-header wide">
          <p className="eyebrow">Digital Championship Workspace</p>
          <h2 id="platform-preview-title">Simple records for meetings, enterprise requests, payments, and progress</h2>
          <p>
            Members and service teams can keep group records, store requests,
            meetings, and transactions organized while partners focus on
            service quality and impact.
          </p>
        </div>
        <div className="platform-preview-layout">
          <figure className="platform-shot platform-shot-main">
            <img
              alt="Digital championship workspace with quick access modules, summary metrics, upcoming meetings, transactions, and member details"
              height={1100}
              loading="lazy"
              src={featuredPlatformScreenshot.src}
              width={1440}
            />
            <figcaption>
              <strong>{featuredPlatformScreenshot.title}</strong>
              <span>{featuredPlatformScreenshot.text}</span>
            </figcaption>
          </figure>
          <div className="platform-shot-stack">
            {secondaryPlatformScreenshots.map((screenshot) => (
              <figure className="platform-shot" key={screenshot.src}>
                <img
                  alt={`${screenshot.title}: ${screenshot.text}`}
                  height={1100}
                  loading="lazy"
                  src={screenshot.src}
                  width={1440}
                />
                <figcaption>
                  <strong>{screenshot.title}</strong>
                  <span>{screenshot.text}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section works-section" id="how-it-works">
        <div className="landing-section-header">
          <p className="eyebrow">How Intelli-Cash Works</p>
          <h2>From digital championship to green enterprise growth</h2>
        </div>
        <div className="workflow-grid">
          {workflowSteps.map((step, index) => (
            <article className="workflow-step illustrated-card" key={step.title}>
              <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
              <LandingIllustration kind={step.illustration} />
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <IntelliStoreSection />

      <GroupRegistrationSection />

      <section className="landing-section governance-band" id="governance">
        <div className="governance-copy">
          <p className="eyebrow">Trust Architecture</p>
          <h2>Built to make finance, service delivery, and impact easier to trust</h2>
          <p>
            Intelli-Cash keeps the discipline of savings groups and partner
            finance: members see records, payments are traceable, approvals are
            controlled, and enterprise activity can be reviewed.
          </p>
        </div>
        <div className="governance-table">
          {securityRows.map(([label, value]) => (
            <div className="governance-row" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section partner-section">
        <div className="partner-copy">
          <p className="eyebrow">For Partners, Donors, MFIs, and Government</p>
          <h2>Simple impact views for green enterprise support</h2>
          <p>
            Partners can understand service reach, digital championship activity, enterprise
            support, and field quality through simple public-facing reports.
            Sensitive financial records stay out of this landing-page view.
          </p>
        </div>
        <div className="partner-outcomes">
          {partnerOutcomes.map((outcome) => (
            <div className="partner-outcome illustrated-outcome" key={outcome.title}>
              <LandingIllustration compact kind={outcome.illustration} />
              <strong>{outcome.title}</strong>
              <span>{outcome.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section app-download-band">
        <div className="download-copy">
          <p className="eyebrow">Android App</p>
          <h2>Put green enterprise services in the hands of digital championship teams</h2>
          <p>
            Download Intelli-Cash for field teams, VSLAs, Chamas, credit
            unions, cooperatives, and savings-group users who want to grow
            finance, customers, and technology adoption around real enterprises.
          </p>
        </div>
        <div className="download-actions">
          <a
            className="button app-store-button"
            href={playStoreUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Download size={18} />
            Download on Play Store
          </a>
          <Link className="button secondary" href="#platform">
            Explore services
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
      <PublicSiteFooter playStoreUrl={playStoreUrl} showAccessLinks={false} />
    </main>
  );
}

function LandingIllustration({
  kind,
  compact = false
}: {
  kind: IllustrationKind;
  compact?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`landing-illustration ${compact ? "compact" : ""}`}
      focusable="false"
      viewBox="0 0 320 220"
    >
      <rect className="illustration-panel" height="204" rx="30" width="292" x="14" y="8" />
      <circle className="illustration-sun" cx="254" cy="48" r="22" />
      <path
        className="illustration-blob"
        d="M40 66c15-24 49-39 84-30 31 8 42 31 76 27 27-3 48-24 74-11 24 12 30 45 17 72-18 39-75 43-119 43-55 0-121-4-144-42-12-20-11-49 12-59Z"
      />
      <ellipse className="illustration-ground" cx="160" cy="181" rx="104" ry="15" />
      <g className="illustration-person left-person">
        <circle className="illustration-skin" cx="82" cy="104" r="13" />
        <path className="illustration-hair" d="M69 101c2-15 17-21 28-12 8 7 2 16-7 16-9 0-14-6-21-4Z" />
        <path className="illustration-shirt-alt" d="M61 146c3-24 11-35 24-35 15 0 23 12 27 35Z" />
        <path className="illustration-line" d="M70 147l-6 32M101 147l8 32" />
        <path className="illustration-line" d="M104 125l22-14" />
      </g>
      <g className="illustration-person right-person">
        <circle className="illustration-skin" cx="236" cy="109" r="12" />
        <path className="illustration-hair" d="M224 108c0-12 11-22 24-14 7 5 8 13 3 18-8-8-18-4-27-4Z" />
        <path className="illustration-shirt" d="M215 149c3-23 10-34 23-34s22 12 25 34Z" />
        <path className="illustration-line" d="M224 149l-8 31M254 149l7 31" />
        <path className="illustration-line" d="M218 129l-20-12" />
      </g>
      <IllustrationObject kind={kind} />
      <path className="illustration-leaf" d="M45 151c16-17 37-20 54-10-17 23-41 29-54 10Z" />
      <path className="illustration-line" d="M48 151c18-2 33-4 48-10" />
    </svg>
  );
}

function IllustrationObject({ kind }: { kind: IllustrationKind }) {
  switch (kind) {
    case "enterprise":
      return (
        <g className="illustration-object">
          <rect className="illustration-card-fill" height="42" rx="8" width="70" x="125" y="118" />
          <path className="illustration-line" d="M125 132h70M142 118v42M177 118v42" />
          <path className="illustration-leaf" d="M158 115c-8-22 8-41 30-42 2 24-10 39-30 42Z" />
          <path className="illustration-accent" d="M151 119c-19-12-20-35-5-50 17 14 18 34 5 50Z" />
          <path className="illustration-line" d="M159 119c5-24 16-38 30-46M151 119c-3-18-4-32-5-50" />
        </g>
      );
    case "groups":
      return (
        <g className="illustration-object">
          <rect className="illustration-card-fill" height="46" rx="12" width="102" x="111" y="113" />
          <path className="illustration-line" d="M125 136h74M141 121v-13M162 121v-13M183 121v-13" />
          <circle className="illustration-accent" cx="141" cy="100" r="10" />
          <circle className="illustration-gold" cx="162" cy="96" r="10" />
          <circle className="illustration-shirt" cx="183" cy="100" r="10" />
        </g>
      );
    case "partners":
      return (
        <g className="illustration-object">
          <rect className="illustration-card-fill" height="66" rx="14" width="104" x="108" y="86" />
          <path className="illustration-line" d="M127 122l25 18 45-48" />
          <path className="illustration-accent" d="M123 104h32l12 13-20 18-35-20Z" />
          <path className="illustration-gold" d="M199 104h-32l-12 13 20 18 35-20Z" />
        </g>
      );
    case "lenders":
      return (
        <g className="illustration-object">
          <rect className="illustration-card-fill" height="84" rx="10" width="78" x="121" y="72" />
          <path className="illustration-line" d="M138 130V98M160 130v-46M182 130v-26M133 135h54" />
          <circle className="illustration-gold" cx="205" cy="142" r="18" />
          <path className="illustration-line" d="M198 142h14M205 135v14" />
        </g>
      );
    case "training":
      return (
        <g className="illustration-object">
          <rect className="illustration-card-fill" height="64" rx="9" width="102" x="109" y="78" />
          <path className="illustration-line" d="M124 100h45M124 116h70M124 132h48M198 142l14 21" />
          <path className="illustration-accent" d="M177 95l12 8-12 8Z" />
        </g>
      );
    case "finance":
      return (
        <g className="illustration-object">
          <rect className="illustration-card-fill" height="58" rx="12" width="98" x="111" y="105" />
          <path className="illustration-line" d="M111 121h98M179 134h28" />
          <circle className="illustration-gold" cx="194" cy="135" r="8" />
          <path className="illustration-leaf" d="M135 101c-10-24 12-44 36-37 0 25-14 38-36 37Z" />
          <path className="illustration-line" d="M136 101c10-15 21-27 35-37" />
        </g>
      );
    case "payments":
      return (
        <g className="illustration-object">
          <rect className="illustration-dark-fill" height="92" rx="14" width="56" x="131" y="68" />
          <rect className="illustration-card-fill" height="67" rx="8" width="42" x="138" y="81" />
          <path className="illustration-line" d="M148 101h24M148 116h24M148 132h13" />
          <circle className="illustration-gold" cx="193" cy="94" r="15" />
          <path className="illustration-line" d="M187 94h13M194 87v14" />
        </g>
      );
    case "banking":
      return (
        <g className="illustration-object">
          <path className="illustration-card-fill" d="M107 104h106v20H107Z" />
          <path className="illustration-accent" d="M99 104l61-40 61 40Z" />
          <path className="illustration-line" d="M119 124v42M142 124v42M165 124v42M188 124v42M104 166h112" />
        </g>
      );
    case "marketing":
      return (
        <g className="illustration-object">
          <path className="illustration-card-fill" d="M107 121l65-31v63l-65-24Z" />
          <path className="illustration-accent" d="M172 90c16 4 28 17 28 32s-12 28-28 32Z" />
          <path className="illustration-line" d="M104 129l17 42M199 98l20-14M205 122h28M199 145l20 14" />
          <circle className="illustration-gold" cx="226" cy="82" r="7" />
        </g>
      );
    case "ai":
      return (
        <g className="illustration-object">
          <rect className="illustration-card-fill" height="68" rx="17" width="88" x="116" y="92" />
          <path className="illustration-line" d="M160 92V75M146 123h1M178 123h1M142 141c12 8 32 8 44 0" />
          <circle className="illustration-gold" cx="160" cy="70" r="8" />
          <path className="illustration-accent" d="M205 84h36v25h-18l-9 11v-11h-9Z" />
        </g>
      );
    case "web3":
      return (
        <g className="illustration-object">
          <circle className="illustration-card-fill" cx="160" cy="116" r="26" />
          <circle className="illustration-accent" cx="112" cy="90" r="16" />
          <circle className="illustration-gold" cx="214" cy="95" r="16" />
          <circle className="illustration-shirt" cx="205" cy="151" r="16" />
          <path className="illustration-line" d="M126 96l28 16M176 111l27-13M179 130l25 18M129 146l27-18" />
          <circle className="illustration-accent" cx="117" cy="150" r="16" />
        </g>
      );
    case "reports":
      return (
        <g className="illustration-object">
          <rect className="illustration-card-fill" height="86" rx="11" width="82" x="118" y="70" />
          <path className="illustration-line" d="M135 94h47M135 112h31M135 135l15-14 16 10 20-25" />
          <circle className="illustration-gold" cx="210" cy="135" r="16" />
          <path className="illustration-line" d="M203 135l6 6 12-15" />
        </g>
      );
    case "map":
      return (
        <g className="illustration-object">
          <path className="illustration-card-fill" d="M104 88l49 17 49-17 18 15v64l-49-17-49 17-18-15Z" />
          <path className="illustration-line" d="M153 105v45M171 105v45" />
          <path className="illustration-accent" d="M160 65c19 0 34 15 34 33 0 24-34 55-34 55s-34-31-34-55c0-18 15-33 34-33Z" />
          <circle className="illustration-card-fill" cx="160" cy="98" r="12" />
        </g>
      );
    case "package":
      return (
        <g className="illustration-object">
          <path className="illustration-card-fill" d="M107 105l53-29 53 29-53 29Z" />
          <path className="illustration-accent" d="M107 105v56l53 28v-55Z" />
          <path className="illustration-gold" d="M213 105v56l-53 28v-55Z" />
          <path className="illustration-line" d="M127 94l53 29M190 92l-53 29" />
        </g>
      );
    case "trust":
      return (
        <g className="illustration-object">
          <path className="illustration-card-fill" d="M160 62l62 24v41c0 40-31 59-62 73-31-14-62-33-62-73V86Z" />
          <path className="illustration-line" d="M133 122l24 24 41-57" />
          <circle className="illustration-gold" cx="207" cy="82" r="12" />
        </g>
      );
    case "growth":
      return (
        <g className="illustration-object">
          <rect className="illustration-card-fill" height="76" rx="11" width="104" x="108" y="86" />
          <path className="illustration-line" d="M125 140l26-24 21 12 34-44M126 152h84" />
          <path className="illustration-leaf" d="M151 107c-1-25 18-38 42-31-3 23-17 36-42 31Z" />
          <circle className="illustration-gold" cx="207" cy="84" r="9" />
        </g>
      );
    case "champions":
    default:
      return (
        <g className="illustration-object">
          <rect className="illustration-card-fill" height="76" rx="13" width="112" x="104" y="73" />
          <path className="illustration-line" d="M122 132h72M122 115h22M153 115h38M122 96h62" />
          <path className="illustration-accent" d="M201 76l20-13v41l-20-11Z" />
          <circle className="illustration-gold" cx="134" cy="97" r="8" />
          <circle className="illustration-shirt" cx="160" cy="97" r="8" />
          <circle className="illustration-accent" cx="186" cy="97" r="8" />
        </g>
      );
  }
}
