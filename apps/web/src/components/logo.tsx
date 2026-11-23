export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect width="22" height="22" rx="6" fill="var(--color-accent)" />
        <path d="M6.5 8.5h9M6.5 11.5h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6.5 14.5h3.5l2 2v-2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">Converso</span>}
    </span>
  );
}
