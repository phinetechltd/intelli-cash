import React from "react";
import Link from "next/link";
import { Download } from "@/lib/theme-icons";

interface PublicSiteFooterProps {
  playStoreUrl: string;
  showAccessLinks?: boolean;
}

const footerLinks = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/#platform" },
  { label: "Group registration", href: "/#group-registration" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Intelli-Store", href: "/intelli-store" },
  { label: "Partners", href: "/partners" },
  { label: "Projects", href: "/partners#projects" },
  { label: "Request access", href: "/partners#signup" },
  { label: "Contact us", href: "/contact" }
];

const accessLinks = [
  { label: "Partner login", href: "/partner-login" },
  { label: "Admin login", href: "/admin-login" }
];

export function PublicSiteFooter({ playStoreUrl, showAccessLinks = true }: PublicSiteFooterProps) {
  return (
    <footer className="public-site-footer">
      <div className="footer-brand-block">
        <Link className="landing-brand footer-brand" href="/">
          <img
            alt="Intelli Cash - Trusted Financial Partner"
            className="brand-logo footer-logo"
            src="/brand/intelli-cash-logo.png"
          />
        </Link>
        <p>
          Secure digital operations, portfolio visibility, and project funding
          for savings groups, partners, lenders, and donors.
        </p>
      </div>
      <nav className="footer-link-grid" aria-label="Footer navigation">
        {footerLinks.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
        {showAccessLinks
          ? accessLinks.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))
          : null}
        <a href={playStoreUrl} rel="noopener noreferrer" target="_blank">
          <Download size={16} />
          Play Store
        </a>
      </nav>
    </footer>
  );
}
