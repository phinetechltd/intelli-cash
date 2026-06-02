"use client";

import React, { useState, type FormEvent } from "react";
import { UserRoundCheck } from "@/lib/theme-icons";
import { apiFetch } from "../lib/api";

const defaultRegistration = {
  organizationName: "",
  organizationType: "VSLA",
  county: "",
  groupSubCounty: "",
  groupLocation: "",
  groupMeetingDay: "",
  estimatedMembers: "",
  groupObjective: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  championRole: "CHAIRPERSON"
};

const groupTypes = [
  "VSLA",
  "Chama",
  "Credit Union",
  "SACCO",
  "Cooperative",
  "Agribusiness Cluster",
  "Green Enterprise Project",
  "Other Group"
];

const championRoles = [
  { label: "Chairperson", value: "CHAIRPERSON" },
  { label: "Secretary", value: "SECRETARY" },
  { label: "Treasurer", value: "TREASURER" },
  { label: "Key holder", value: "KEY_HOLDER" },
  { label: "Digital championship lead", value: "CHAIRPERSON" }
];

export function GroupRegistrationSection() {
  const [registration, setRegistration] = useState(defaultRegistration);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await apiFetch("/partner-signup-requests", {
        method: "POST",
        body: JSON.stringify({
          ...registration,
          requestedRole: "GROUP_ACCOUNT",
          requestedPartnerType: "GROUP_ACCOUNT",
          estimatedMembers: registration.estimatedMembers ? Number(registration.estimatedMembers) : undefined,
          groupSubCounty: registration.groupSubCounty || undefined,
          groupLocation: registration.groupLocation || undefined,
          groupMeetingDay: registration.groupMeetingDay || undefined,
          groupObjective: registration.groupObjective || undefined,
          valueProposition: registration.groupObjective || undefined
        })
      });

      setRegistration(defaultRegistration);
      setMessage({
        ok: true,
        text: "Group registration submitted. An IWL admin will review it before the champion account is created."
      });
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Group registration failed"
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="landing-section group-registration-band" id="group-registration">
      <div className="landing-section-header wide">
        <p className="eyebrow">Group Registration</p>
        <h2>Register a VSLA, Chama, credit union, or cooperative</h2>
        <p>
          The champion owns the group account after approval. Capture the group
          profile and champion-owner details so the account is scoped to the
          right group from the start.
        </p>
      </div>

      <form className="partner-signup-form group-registration-form" onSubmit={submitRegistration}>
        <div className="form-section-heading wide-field">
          <UserRoundCheck size={20} />
          <span>Group details</span>
        </div>
        <label>
          <span>Group name</span>
          <input
            onChange={(event) =>
              setRegistration((current) => ({ ...current, organizationName: event.target.value }))
            }
            required
            value={registration.organizationName}
          />
        </label>
        <label>
          <span>Group type</span>
          <select
            onChange={(event) =>
              setRegistration((current) => ({ ...current, organizationType: event.target.value }))
            }
            value={registration.organizationType}
          >
            {groupTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>County</span>
          <input
            onChange={(event) => setRegistration((current) => ({ ...current, county: event.target.value }))}
            required
            value={registration.county}
          />
        </label>
        <label>
          <span>Sub-county</span>
          <input
            onChange={(event) =>
              setRegistration((current) => ({ ...current, groupSubCounty: event.target.value }))
            }
            value={registration.groupSubCounty}
          />
        </label>
        <label>
          <span>Location</span>
          <input
            onChange={(event) =>
              setRegistration((current) => ({ ...current, groupLocation: event.target.value }))
            }
            value={registration.groupLocation}
          />
        </label>
        <label>
          <span>Meeting day</span>
          <input
            onChange={(event) =>
              setRegistration((current) => ({ ...current, groupMeetingDay: event.target.value }))
            }
            placeholder="Tuesday"
            value={registration.groupMeetingDay}
          />
        </label>
        <label>
          <span>Estimated members</span>
          <input
            min="1"
            onChange={(event) =>
              setRegistration((current) => ({ ...current, estimatedMembers: event.target.value }))
            }
            type="number"
            value={registration.estimatedMembers}
          />
        </label>

        <div className="form-section-heading wide-field">
          <UserRoundCheck size={20} />
          <span>Champion owner details</span>
        </div>
        <label>
          <span>Champion name</span>
          <input
            onChange={(event) => setRegistration((current) => ({ ...current, contactName: event.target.value }))}
            required
            value={registration.contactName}
          />
        </label>
        <label>
          <span>Champion email</span>
          <input
            onChange={(event) => setRegistration((current) => ({ ...current, contactEmail: event.target.value }))}
            required
            type="email"
            value={registration.contactEmail}
          />
        </label>
        <label>
          <span>Champion phone</span>
          <input
            onChange={(event) => setRegistration((current) => ({ ...current, contactPhone: event.target.value }))}
            required
            value={registration.contactPhone}
          />
        </label>
        <label>
          <span>Champion role</span>
          <select
            onChange={(event) => setRegistration((current) => ({ ...current, championRole: event.target.value }))}
            value={registration.championRole}
          >
            {championRoles.map((role) => (
              <option key={role.label} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </label>
        <label className="wide-field">
          <span>Group objective or support needed</span>
          <textarea
            onChange={(event) =>
              setRegistration((current) => ({ ...current, groupObjective: event.target.value }))
            }
            value={registration.groupObjective}
          />
        </label>
        {message ? (
          <div className={message.ok ? "notice success wide-field" : "notice warning wide-field"}>
            {message.text}
          </div>
        ) : null}
        <button className="button wide-field" disabled={saving} type="submit">
          {saving ? "Submitting" : "Submit group registration"}
        </button>
      </form>
    </section>
  );
}
