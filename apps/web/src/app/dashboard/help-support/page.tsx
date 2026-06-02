import Link from "next/link";
import { BookOpenText, CircleHelp, LifeBuoy, Mail, MessageCircle } from "@/lib/theme-icons";

export default function HelpSupportPage() {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Help</p>
          <h2>Help & Support</h2>
        </div>
        <Link className="button secondary" href="/dashboard">
          Dashboard
        </Link>
      </section>

      <section className="account-action-grid">
        <article className="data-card account-action-card">
          <header>
            <div>
              <h3>Account support</h3>
              <span>Profile, login, access, and role questions.</span>
            </div>
            <LifeBuoy size={18} />
          </header>
          <a className="button" href="mailto:support@intellicash.co.ke">
            <Mail size={16} />
            Email support
          </a>
        </article>

        <article className="data-card account-action-card">
          <header>
            <div>
              <h3>Meeting help</h3>
              <span>Default PIN, current OTP, offline unlock, and meeting records.</span>
            </div>
            <CircleHelp size={18} />
          </header>
          <Link className="button secondary" href="/dashboard/meetings">
            <MessageCircle size={16} />
            Open meetings
          </Link>
        </article>

        <article className="data-card account-action-card">
          <header>
            <div>
              <h3>Guides</h3>
              <span>Review your account setup, settings, and available modules.</span>
            </div>
            <BookOpenText size={18} />
          </header>
          <Link className="button secondary" href="/dashboard/account">
            Account guide
          </Link>
        </article>
      </section>
    </>
  );
}
