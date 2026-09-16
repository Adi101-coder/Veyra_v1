"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { IconCheck, IconCopy } from "@/components/landing/icons";

function highlight(code: string) {
  if (code.startsWith("npm ")) {
    const parts = code.split(" ");
    return (
      <>
        <span className="text-[#8f939c]">{parts[0]}</span>
        {parts.slice(1).map((part, index) => (
          <span
            key={`${part}-${index}`}
            className={part.startsWith("@") ? "text-[#cfd5de]" : "text-[#f5f5f5]"}
          >
            {" "}
            {part}
          </span>
        ))}
      </>
    );
  }

  return code.split("\n").map((line, index) => (
    <span key={index} className="block">
      {line.startsWith("import") || line.startsWith("const") || line.startsWith("console") ? (
        <span className="text-[#cfd5de]">{line}</span>
      ) : (
        <span className="text-[#d7dbe2]">{line || " "}</span>
      )}
    </span>
  ));
}

export function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <motion.div
      whileHover={{ borderColor: "rgba(255,255,255,0.14)" }}
      className="group relative overflow-hidden rounded-2xl border border-[#121417] bg-[#0b0c0e] transition-colors"
    >
      <div className="flex items-center justify-between border-b border-[#121417] px-4 py-2">
        <span className="font-mono text-[10px] tracking-[0.18em] text-[#6f737c] uppercase">
          {lang}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-[#8f939c] transition hover:text-white"
        >
          {copied ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-[#f5f5f5]">
        <code>{highlight(code)}</code>
      </pre>
    </motion.div>
  );
}
