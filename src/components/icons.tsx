type IconProps = {
  className?: string;
};

export function IconX({ className }: IconProps) {
  return (
    <svg viewBox="0 0 98 100" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M58.204 42.321 94.612 0h-8.627L54.371 36.747 29.122 0H0l38.182 55.568L0 99.949h8.628l33.384-38.807 26.665 38.807H97.8L58.202 42.321Zm-11.817 13.737-3.869-5.534L11.737 6.495h13.252l24.841 35.533 3.868 5.533 32.291 46.188H72.736L46.387 56.06Z"
      />
    </svg>
  );
}

export function IconDiscord({ className }: IconProps) {
  return (
    <svg viewBox="0 0 127.14 96.36" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.26 8.09C5.79 32.65-3.73 56.45 1.17 80.26a105.73 105.73 0 0 0 32.17 16.1 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.1c5.43-27.59-4.64-51.14-18.9-72.19ZM42.45 65.69c-6.23 0-11.38-5.67-11.38-12.64s5-12.64 11.38-12.64S54 46 53.89 53.05 48.84 65.69 42.45 65.69Zm42.24 0c-6.23 0-11.38-5.67-11.38-12.64s5-12.64 11.38-12.64 11.53 5.75 11.38 12.64S91.07 65.69 84.69 65.69Z"
      />
    </svg>
  );
}

export function IconTelegram({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.9-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
      />
    </svg>
  );
}

export function IconChevron({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 3.5 11 8 6 12.5"
      />
    </svg>
  );
}

export function IconCopy({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <rect
        x="5.2"
        y="5.2"
        width="8"
        height="8"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M3.4 10.2V3.6A1.2 1.2 0 0 1 4.6 2.4h6.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconLink({ className }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <g transform="rotate(45 32 32)" fill="currentColor">
        <path d="M20 31 V18 A12 12 0 0 1 44 18 V31 Z" opacity="0.7" />
        <path d="M20 33 V46 A12 12 0 0 0 44 46 V33 Z" opacity="0.9" />
      </g>
    </svg>
  );
}

