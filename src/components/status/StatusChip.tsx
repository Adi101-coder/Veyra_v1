export type StatusKind = "position" | "execution" | "confidence" | "settlement" | "order";

export type StatusTone = "neutral" | "pending" | "success" | "danger";

type StatusEntry = { label: string; tone: StatusTone };

const POSITION: Record<string, StatusEntry> = {
  pending: { label: "Awaiting fill", tone: "pending" },
  adjusting: { label: "Adjusting", tone: "pending" },
  partial: { label: "Partially filled", tone: "pending" },
  filled: { label: "Filled", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
  failed: { label: "Not filled", tone: "danger" },
};

const EXECUTION: Record<string, StatusEntry> = {
  created: { label: "Queued", tone: "pending" },
  submitted: { label: "At venue", tone: "pending" },
  open: { label: "At venue", tone: "pending" },
  unknown: { label: "At venue", tone: "pending" },
  filled: { label: "Filled", tone: "success" },
  partial: { label: "Partial fill", tone: "pending" },
  rejected: { label: "Rejected", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
  noop: { label: "No trade needed", tone: "neutral" },
};

const CONFIDENCE: Record<string, StatusEntry> = {
  pending: { label: "Executing", tone: "pending" },
  filled: { label: "Applied", tone: "success" },
  partial: { label: "Partly applied", tone: "pending" },
  failed: { label: "Not applied", tone: "danger" },
  noop: { label: "Applied (no trade)", tone: "neutral" },
};

const SETTLEMENT: Record<string, StatusEntry> = {
  queued: { label: "Settling", tone: "pending" },
  signing: { label: "Settling", tone: "pending" },
  signed: { label: "Settling", tone: "pending" },
  submitted: { label: "Settling", tone: "pending" },
  confirmed: { label: "Settled", tone: "success" },
  reverted: { label: "Settlement failed", tone: "danger" },
  failed: { label: "Settlement failed", tone: "danger" },
};

/** "order": a value that may be an execution status or a position/prediction status. */
const ORDER: Record<string, StatusEntry> = { ...POSITION, ...EXECUTION };

const TABLES: Record<StatusKind, Record<string, StatusEntry>> = {
  position: POSITION,
  execution: EXECUTION,
  confidence: CONFIDENCE,
  settlement: SETTLEMENT,
  order: ORDER,
};

export function describeStatus(kind: StatusKind, status: string | null | undefined): StatusEntry {
  const raw = status ?? "";
  const entry = Object.hasOwn(TABLES[kind], raw) ? TABLES[kind][raw] : undefined;
  return entry ?? { label: raw || "—", tone: "neutral" };
}

export function isKnownStatus(kind: StatusKind, status: string | null | undefined) {
  return Boolean(status && Object.hasOwn(TABLES[kind], status));
}

export function statusLabel(kind: StatusKind, status: string | null | undefined) {
  return describeStatus(kind, status).label;
}

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-[rgba(26,26,26,0.06)] text-[#8a8a8a]",
  pending: "bg-[#f3ead8] text-[#8a6a32]",
  success: "bg-[#e7f4ec] text-[#2f9e6e]",
  danger: "bg-[rgba(196,92,106,0.12)] text-[#c45c6a]",
};

export function StatusChip({
  kind,
  status,
  className = "",
}: {
  kind: StatusKind;
  status: string | null | undefined;
  className?: string;
}) {
  const { label, tone } = describeStatus(kind, status);
  return (
    <span
      title={status ?? undefined}
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${TONE_CLASS[tone]} ${className}`}
    >
      {label}
    </span>
  );
}
