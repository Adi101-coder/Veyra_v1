"use client";

import { useState } from "react";
import { categories } from "@/lib/markets";
import { Shell } from "@/components/Shell";

export function WriteView() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="bg-[#f3f1ec]">
      <Shell className="max-w-[720px] py-12 sm:py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#8a8a8a]">
          Write
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-[-0.02em] text-[#1a1a1a]">
          Create a market.
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-7 text-[#5a5a5a]">
          Frame a future event as a yes/no question. Resolution rules lock before anyone can take a seat.
        </p>

        {submitted ? (
          <p className="mt-10 rounded-2xl border border-[rgba(26,26,26,0.1)] bg-white px-6 py-8 text-sm text-[#5a5a5a]">
            Market queued. Public listing opens with the live floor — you&apos;ll see it under New.
          </p>
        ) : (
          <form
            className="mt-10 flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
            }}
          >
            <label className="block">
              <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
                Question
              </span>
              <input
                required
                placeholder="Will France defeat Spain in the quarter-final?"
                className="w-full rounded-xl border border-[rgba(26,26,26,0.12)] bg-white px-4 py-3 text-sm outline-none focus:border-[#1a1a1a]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
                Category
              </span>
              <select
                className="w-full rounded-xl border border-[rgba(26,26,26,0.12)] bg-white px-4 py-3 text-sm outline-none focus:border-[#1a1a1a]"
                defaultValue="sports"
              >
                {categories
                  .filter((item) => item.id !== "all")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8a8a]">
                Resolution date
              </span>
              <input
                required
                type="date"
                className="w-full rounded-xl border border-[rgba(26,26,26,0.12)] bg-white px-4 py-3 text-sm outline-none focus:border-[#1a1a1a]"
              />
            </label>
            <button
              type="submit"
              className="mt-2 self-start rounded-full bg-[#111111] px-6 py-2.5 text-sm font-medium text-white"
            >
              Publish market
            </button>
          </form>
        )}
      </Shell>
    </div>
  );
}
