"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { IconCheck, IconCopy } from "@/components/landing/icons";

function highlight(code: string) {
  if (code.startsWith("npm ")) {
    const parts = code.split(" ");
    return (
      <>
        <span className="text-[#65758b]">{parts[0]}</span>
        {parts.slice(1).map((part, index) => (
          <span
            key={`${part}-${index}`}
            className={part.startsWith("@") ? "text-[#182d4a]" : "text-[#182d4a]"}
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
        <span className="text-[#182d4a]">{line}</span>
      ) : (
        <span className="text-[#536780]">{line || " "}</span>
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
      whileHover={{ borderColor: "rgba(38,91,255,0.45)" }}
      className="group relative overflow-hidden rounded-2xl border border-[#dce5f1] bg-[#ffffff] transition-colors"
    >
      <div className="flex items-center justify-between border-b border-[#dce5f1] px-4 py-2">
        <span className="font-mono text-[10px] tracking-[0.18em] text-[#657da0] uppercase">
          {lang}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-[#65758b] transition hover:text-[#265bff]"
        >
          {copied ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6 text-[#182d4a]">
        <code>{highlight(code)}</code>
      </pre>
    </motion.div>
  );
}
