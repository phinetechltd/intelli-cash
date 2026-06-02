import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Clock3,
  Mail,
  MapPinned,
  MessageCircle,
  Phone,
  Send,
  Sprout,
  UsersRound
} from "@/lib/theme-icons";
import { PublicSiteFooter } from "../../components/public-site-footer";
import { PublicSiteHeader } from "../../components/public-site-header";

const playStoreUrl = "https://play.google.com/store/apps/details?id=com.intellicash.app";

export const metadata: Metadata = {
  title: "Contact Intelli-Cash",
  description: "Contact Intelli-Cash for group registration, partner support, green enterprise services, and digital championship operations."
};

const contactChannels = [
  {
    title: "Email",
    text: "Send group, partner, lender, or support questions.",
    value: "support@intellicash.co.ke",
    href: "mailto:support@intellicash.co.ke",
    icon: Mail
  },
  {
    title: "Phone",
    text: "Call or message the Intelli-Cash service desk.",
    value: "+254 700 000 000",
    href: "tel:+254700000000",
    icon: Phone
  },
  {
    title: "Field support",
    text: "Coordinate village agent visits and digital championship onboarding.",
    value: "Kenya field operations",
    href: "mailto:support@intellicash.co.ke?subject=Field%20support%20request",
    icon: MapPinned
  }
];

const inquiryTypes = [
  { label: "Group registration", icon: UsersRound },
  { label: "Partner or donor support", icon: Building2 },
  { label: "Green enterprise services", icon: Sprout },
  { label: "Technical support", icon: MessageCircle }
];

export default function ContactPage() {
  return (
    <main className="contact-page">
      <section className="contact-hero">
        <PublicSiteHeader ariaLabel="Contact navigation" playStoreUrl={playStoreUrl} showAccessLinks={false} />
        <div className="contact-hero-copy">
          <p className="eyebrow">Contact Us</p>
          <h1>Talk to Intelli-Cash</h1>
          <p>
            Reach the team for VSLA, Chama, credit union, partner, lender, and
            green enterprise support across digital championship services.
          </p>
          <div className="hero-actions">
            <a className="button" href="mailto:support@intellicash.co.ke?subject=Intelli-Cash%20inquiry">
              Email support
              <Send size={18} />
            </a>
            <Link className="button secondary light" href="/#group-registration">
              Register group
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section className="contact-summary-grid" aria-label="Contact options">
        {contactChannels.map((channel) => {
          const Icon = channel.icon;
          return (
            <a className="contact-channel-card" href={channel.href} key={channel.title}>
              <Icon size={22} />
              <span>{channel.title}</span>
              <strong>{channel.value}</strong>
              <small>{channel.text}</small>
            </a>
          );
        })}
      </section>

      <section className="landing-section contact-workspace" aria-labelledby="contact-form-title">
        <div className="landing-section-header wide">
          <p className="eyebrow">Send an Inquiry</p>
          <h2 id="contact-form-title">Choose the support path that fits your work</h2>
          <p>
            Use this page for group account onboarding, village-agent field
            coordination, partner services, green enterprise support, and
            platform help.
          </p>
        </div>

        <div className="contact-layout">
          <div className="contact-info-panel">
            <h3>What we can help with</h3>
            <div className="contact-topic-list">
              {inquiryTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <div className="contact-topic" key={type.label}>
                    <Icon size={18} />
                    <span>{type.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="contact-service-note">
              <Clock3 size={19} />
              <div>
                <strong>Response window</strong>
                <span>Most support requests are reviewed during business hours.</span>
              </div>
            </div>
          </div>

          <form
            action="mailto:support@intellicash.co.ke"
            className="contact-form-panel"
            encType="text/plain"
            method="post"
          >
            <label className="credential-field">
              <span>Name</span>
              <input name="name" placeholder="Your name" required />
            </label>
            <label className="credential-field">
              <span>Email</span>
              <input name="email" placeholder="you@example.com" required type="email" />
            </label>
            <label className="credential-field">
              <span>Phone</span>
              <input name="phone" placeholder="+254..." />
            </label>
            <label className="credential-field">
              <span>Inquiry type</span>
              <select name="inquiryType" defaultValue="Group registration">
                <option>Group registration</option>
                <option>Partner or donor support</option>
                <option>Green enterprise services</option>
                <option>Technical support</option>
              </select>
            </label>
            <label className="credential-field contact-message-field">
              <span>Message</span>
              <textarea name="message" placeholder="Tell us what you need help with." required />
            </label>
            <div className="contact-form-actions">
              <button className="button" type="submit">
                Send inquiry
                <Send size={16} />
              </button>
              <a className="button secondary" href="tel:+254700000000">
                Call support
                <Phone size={16} />
              </a>
            </div>
          </form>
        </div>
      </section>

      <PublicSiteFooter playStoreUrl={playStoreUrl} showAccessLinks={false} />
    </main>
  );
}
