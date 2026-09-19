"use client";

import { useState } from "react";
import { categories } from "@/lib/markets";
import { describeBettingError } from "@/lib/betting";

const MAX_TITLE = 160;

/** Proposing a question. The server caps how many a wallet may add per round. */
export function ProposalForm({
  onSubmit,
}: {
  onSubmit: (input: { title: string; category: string }) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("crypto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), category });
      setTitle("");
    } catch (err) {
      setError(describeBettingError(err, "Could not add that question."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 rounded-[22px] border border-[rgba(26,26,26,0.08)] bg-white px-5 py-5">
      <label htmlFor="proposal-title" className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a8a8a]">
        Propose a question
      </label>
      <input
        id="proposal-title"
        value={title}
        onChange={(event) => setTitle(event.target.value.slice(0, MAX_TITLE))}
        placeholder="Will …? Make it settle to a clear yes or no."
        className="mt-2 w-full rounded-lg border border-[rgba(26,26,26,0.14)] bg-[#faf8f4] px-3 py-2.5 font-serif text-[16px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a]"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {categories
            .filter((option) => option.id !== "all")
            .map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setCategory(option.id)}
                className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                  category === option.id
                    ? "border-[#1a1a1a] bg-[#1a1a1a] text-white"
                    : "border-[rgba(26,26,26,0.14)] text-[#6a6a6a] hover:border-[#1a1a1a]"
                }`}
              >
                {option.label}
              </button>
            ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-[#9a9a9a]">
            {title.length}/{MAX_TITLE}
          </span>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded-full border border-[#1a1a1a] bg-[#1a1a1a] px-5 py-1.5 font-serif text-[14px] text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add question"}
          </button>
        </div>
      </div>
      {error ? <p className="mt-3 font-mono text-[11px] text-[#a34a4a]">{error}</p> : null}
    </form>
  );
}
