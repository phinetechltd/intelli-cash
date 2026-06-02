"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, Menu, X } from "@/lib/theme-icons";
import { ThemeToggle } from "./theme-toggle";

interface PublicSiteHeaderProps {
  ariaLabel?: string;
  allowMobileMenu?: boolean;
  playStoreUrl: string;
  showAccessLinks?: boolean;
}

const platformLinks = [
  { label: "Services", href: "/#platform" },
  { label: "Group registration", href: "/#group-registration" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Intelli-Store", href: "/intelli-store" },
  { label: "Trust", href: "/#governance" }
];

const partnerLinks = [
  { label: "Partners", href: "/partners" },
  { label: "Projects", href: "/partners#projects" },
  { label: "Request access", href: "/partners#signup" }
];

export function PublicSiteHeader({
  allowMobileMenu = true,
  ariaLabel = "Website navigation",
  playStoreUrl,
  showAccessLinks = true
}: PublicSiteHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = () => setIsOpen(false);

  return (
    <nav
      className={`landing-nav ${isOpen ? "public-nav-open" : ""} ${
        allowMobileMenu ? "" : "public-nav-inline"
      }`}
      aria-label={ariaLabel}
    >
      <Link className="landing-brand" href="/" onClick={closeMenu}>
        <img
          alt="Intelli Cash - Trusted Financial Partner"
          className="brand-logo landing-logo"
          src="/brand/intelli-cash-logo.png"
        />
      </Link>
      {allowMobileMenu ? (
        <button
          aria-expanded={isOpen}
          aria-label={isOpen ? "Close website menu" : "Open website menu"}
          className="icon-button public-nav-toggle"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          {isOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      ) : null}
      <div className="landing-nav-actions">
        <Link className="landing-nav-link" href="/" onClick={closeMenu}>
          Home
        </Link>
        <Link className="landing-nav-link" href="/contact" onClick={closeMenu}>
          Contact us
        </Link>
        <div className="nav-menu-group">
          <button className="nav-menu-trigger" type="button" aria-haspopup="true">
            Services
            <ChevronDown size={15} />
          </button>
          <div className="nav-submenu">
            {platformLinks.map((link) => (
              <Link href={link.href} key={link.href} onClick={closeMenu}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="nav-menu-group">
          <button className="nav-menu-trigger" type="button" aria-haspopup="true">
            Partners
            <ChevronDown size={15} />
          </button>
          <div className="nav-submenu">
            {partnerLinks.map((link) => (
              <Link href={link.href} key={link.href} onClick={closeMenu}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="nav-menu-group">
          <button className="nav-menu-trigger" type="button" aria-haspopup="true">
            App
            <ChevronDown size={15} />
          </button>
          <div className="nav-submenu">
            <a href={playStoreUrl} onClick={closeMenu} rel="noopener noreferrer" target="_blank">
              <Download size={15} />
              Play Store
            </a>
            {showAccessLinks ? (
              <>
                <Link href="/partner-login" onClick={closeMenu}>
                  Partner login
                </Link>
                <Link href="/admin-login" onClick={closeMenu}>
                  Admin login
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <ThemeToggle />
        {showAccessLinks ? (
          <Link className="button secondary light" href="/partner-login" onClick={closeMenu}>
            Partner login
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
