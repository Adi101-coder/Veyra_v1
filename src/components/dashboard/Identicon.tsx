type IdenticonProps = {
  seed: string;
  className?: string;
};

const palettes = [
  ["#5b8def", "#f2c94c", "#27ae60", "#eb5757"],
  ["#9b51e0", "#56ccf2", "#219653", "#f2994a"],
  ["#2d9cdb", "#6fcf97", "#f2c94c", "#bb6bd9"],
  ["#27ae60", "#2f80ed", "#f2994a", "#eb5757"],
  ["#56ccf2", "#9b51e0", "#219653", "#f2c94c"],
];

function hash(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function Identicon({ seed, className = "h-8 w-8" }: IdenticonProps) {
  if (seed === "open") {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full border border-dashed border-[rgba(24,45,74,0.2)] bg-white text-[10px] text-[#657da0] ${className}`}
      >
        +
      </span>
    );
  }

  const n = hash(seed);
  const palette = palettes[n % palettes.length];
  const cells = Array.from({ length: 25 }, (_, i) => (n >> (i % 12)) & 3);

  return (
    <svg viewBox="0 0 10 10" className={`rounded-full ${className}`} aria-hidden>
      {cells.map((cell, i) => (
        <rect
          key={i}
          x={(i % 5) * 2}
          y={Math.floor(i / 5) * 2}
          width="2"
          height="2"
          fill={palette[cell]}
        />
      ))}
    </svg>
  );
}
