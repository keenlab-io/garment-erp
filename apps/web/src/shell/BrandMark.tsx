/**
 * The product mark: a process-magenta diamond (a spot color pulled on press — the design signature)
 * beside the wordmark. Magenta (`bg-spot`) appears only here and on active/needs-attention states,
 * so it stays meaningful. The diamond is a rotated square; the label carries the name.
 */
export function BrandMark({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="size-4 rotate-45 rounded-sm bg-spot" aria-hidden />
      {withWordmark ? (
        <span className="font-display text-body-strong font-semibold tracking-tight">ERP</span>
      ) : null}
    </span>
  );
}
