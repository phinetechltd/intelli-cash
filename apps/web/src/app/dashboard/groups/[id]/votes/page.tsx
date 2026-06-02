"use client";

import React from "react";
import type { FormEvent } from "react";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Vote } from "@/lib/theme-icons";
import { resolutionTypes } from "@intellicash/shared";
import { apiFetch, humanizeEnum } from "../../../../../lib/api";
import { DataTable } from "../../../../../components/dashboard/data-table";
import type { MeetingRow, User, VoteRow } from "../../../../../components/dashboard/types";

interface GroupSummary {
  id: string;
  name: string;
  code: string;
}

const defaultForm = {
  meetingId: "",
  resolutionType: "MINUTES_APPROVAL",
  motion: "",
  result: "PASSED",
  quorumRequired: "50",
  yesCount: "0",
  noCount: "0",
  abstainCount: "0",
  totalEligible: "1"
};

export default function GroupVotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    const [groupResponse, voteResponse, meetingResponse, meResponse] = await Promise.all([
      apiFetch<GroupSummary>(`/groups/${id}`),
      apiFetch<VoteRow[]>(`/groups/${id}/votes`),
      apiFetch<MeetingRow[]>(`/groups/${id}/meetings`),
      apiFetch<User>("/auth/me")
    ]);
    setGroup(groupResponse);
    setVotes(voteResponse);
    setMeetings(meetingResponse);
    setUser(meResponse);
  }

  useEffect(() => {
    let mounted = true;
    loadPage()
      .catch((loadError) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Votes failed to load");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  const canWrite = user?.permissions?.includes("votes:write") ?? false;

  async function createVote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const vote = await apiFetch<VoteRow>(`/groups/${id}/votes`, {
        method: "POST",
        body: JSON.stringify({
          meetingId: form.meetingId || undefined,
          resolutionType: form.resolutionType,
          motion: form.motion,
          result: form.result,
          quorumRequired: Number(form.quorumRequired),
          yesCount: Number(form.yesCount),
          noCount: Number(form.noCount),
          abstainCount: Number(form.abstainCount),
          totalEligible: Number(form.totalEligible)
        })
      });
      setForm(defaultForm);
      await loadPage();
      setMessage({ ok: true, text: `${humanizeEnum(vote.resolutionType)} recorded.` });
    } catch (saveError) {
      setMessage({ ok: false, text: saveError instanceof Error ? saveError.message : "Vote failed to save" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <section className="page-heading">
        <div>
          <Link className="inline-back" href={`/dashboard/groups/${id}`}>
            <ArrowLeft size={17} />
            {group?.name ?? "Group"}
          </Link>
          <p className="eyebrow">Group Votes</p>
          <h2>{group?.code ?? "Votes"}</h2>
        </div>
        <span className="pill">{votes.length} votes</span>
      </section>

      {message ? <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div> : null}

      {canWrite ? (
        <section className="data-card">
          <header>
            <h3>Record Vote</h3>
          </header>
          <form className="credential-form" onSubmit={createVote}>
            <div className="credential-grid">
              <label className="credential-field">
                <span>Meeting</span>
                <select
                  onChange={(event) => setForm((current) => ({ ...current, meetingId: event.target.value }))}
                  value={form.meetingId}
                >
                  <option value="">No meeting</option>
                  {meetings.map((meeting) => (
                    <option key={meeting.id} value={meeting.id}>
                      {meeting.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="credential-field">
                <span>Resolution</span>
                <select
                  onChange={(event) => setForm((current) => ({ ...current, resolutionType: event.target.value }))}
                  value={form.resolutionType}
                >
                  {resolutionTypes.map((type) => (
                    <option key={type} value={type}>
                      {humanizeEnum(type)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="credential-field">
                <span>Result</span>
                <select
                  onChange={(event) => setForm((current) => ({ ...current, result: event.target.value }))}
                  value={form.result}
                >
                  <option value="PASSED">Passed</option>
                  <option value="FAILED">Failed</option>
                  <option value="TIED">Tied</option>
                  <option value="DEFERRED">Deferred</option>
                </select>
              </label>
              <label className="credential-field">
                <span>Motion</span>
                <input
                  onChange={(event) => setForm((current) => ({ ...current, motion: event.target.value }))}
                  required
                  value={form.motion}
                />
              </label>
              <label className="credential-field">
                <span>Quorum %</span>
                <input
                  min="0"
                  max="100"
                  onChange={(event) => setForm((current) => ({ ...current, quorumRequired: event.target.value }))}
                  required
                  type="number"
                  value={form.quorumRequired}
                />
              </label>
              <label className="credential-field">
                <span>Yes</span>
                <input
                  min="0"
                  onChange={(event) => setForm((current) => ({ ...current, yesCount: event.target.value }))}
                  required
                  type="number"
                  value={form.yesCount}
                />
              </label>
              <label className="credential-field">
                <span>No</span>
                <input
                  min="0"
                  onChange={(event) => setForm((current) => ({ ...current, noCount: event.target.value }))}
                  required
                  type="number"
                  value={form.noCount}
                />
              </label>
              <label className="credential-field">
                <span>Abstain</span>
                <input
                  min="0"
                  onChange={(event) => setForm((current) => ({ ...current, abstainCount: event.target.value }))}
                  required
                  type="number"
                  value={form.abstainCount}
                />
              </label>
              <label className="credential-field">
                <span>Total eligible</span>
                <input
                  min="1"
                  onChange={(event) => setForm((current) => ({ ...current, totalEligible: event.target.value }))}
                  required
                  type="number"
                  value={form.totalEligible}
                />
              </label>
            </div>
            <div className="credential-actions">
              <button className="button" disabled={saving} type="submit">
                <Vote size={16} />
                {saving ? "Saving" : "Record vote"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="data-card">
        <header>
          <h3>Votes</h3>
        </header>
        <DataTable
          columns={[
            {
              key: "resolution",
              header: "Resolution",
              value: (vote) => `${humanizeEnum(vote.resolutionType)} ${vote.motion}`,
              cell: (vote) => (
                <>
                  <strong>{humanizeEnum(vote.resolutionType)}</strong>
                  <br />
                  <span>{vote.motion}</span>
                </>
              )
            },
            { key: "result", header: "Result", value: (vote) => vote.result },
            { key: "yes", header: "Yes", value: (vote) => vote.yesCount },
            { key: "no", header: "No", value: (vote) => vote.noCount },
            {
              key: "time",
              header: "Time",
              value: (vote) => new Date(vote.createdAt).getTime(),
              cell: (vote) => new Date(vote.createdAt).toLocaleString("en-KE")
            }
          ]}
          exportName={`${group?.code ?? "group"}-votes`}
          getRowKey={(vote) => vote.id}
          rows={votes}
          title="Votes"
        />
      </section>
    </>
  );
}
