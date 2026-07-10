import * as React from "react";
import { INK_CHIPS, CHIP_ACTIVE_STATE_TOKEN, type InkChipStatus } from "@erp/design-tokens";
import { cn } from "../lib/cn";

/**
 * A token specimen sheet — the workbench's proof that theme × density × locale switching works
 * purely through token re-resolution. Not a shipped primitive (Task 3 owns those); it exists to
 * exercise surfaces, the Ink-Chip signature, the type scale, and density-driven sizing at once.
 * Styled exclusively with semantic token utilities (no primitive names, no raw hex).
 */
export function TokenMatrix() {
  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-display text-text-primary">Ink &amp; Substrate</h1>
        <p className="text-sm text-text-secondary">
          Token workbench — flip theme, density, and locale from the toolbar; every surface below
          re-resolves without a single component variant.
        </p>
      </header>

      <Section title="Surfaces">
        <div className="flex flex-wrap gap-3">
          {SURFACES.map((s) => (
            <Swatch key={s.label} className={s.className} label={s.label} />
          ))}
        </div>
      </Section>

      <Section title="Accents &amp; status">
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((s) => (
            <Swatch key={s.label} className={s.className} label={s.label} onDark={s.onDark} />
          ))}
        </div>
      </Section>

      <Section title="Ink-Chips — status is never color alone">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(INK_CHIPS) as InkChipStatus[]).map((status) => (
            <Chip key={status} token={INK_CHIPS[status].token} glyph={INK_CHIPS[status].glyph} label={INK_CHIPS[status].label} />
          ))}
          <Chip token={CHIP_ACTIVE_STATE_TOKEN} glyph="◆" label="Matched" active />
        </div>
      </Section>

      <Section title="Type scale (Latin + Thai)">
        <div className="flex flex-col gap-2">
          {TYPE_SPECIMENS.map((t) => (
            <div key={t.label} className="flex items-baseline gap-4">
              <span className="w-24 shrink-0 text-caption text-text-muted font-mono">{t.label}</span>
              <span className={t.className}>{t.sample}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Density — row sizing from tokens">
        <div className="flex flex-col gap-2">
          <DensityRow />
          <p className="text-caption text-text-muted">
            Row height, inline padding, and font size read <code className="font-mono">--density-*</code>;
            switch to Compact or Touch to watch the row reflow.
          </p>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-h3 text-text-secondary uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ className, label, onDark }: { className: string; label: string; onDark?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex h-16 w-28 items-end rounded-md border border-border p-2 shadow-sm",
          className,
          onDark ? "text-text-inverse" : "text-text-primary",
        )}
      >
        <span className="text-caption font-mono opacity-80">{label}</span>
      </div>
    </div>
  );
}

function Chip({
  token,
  glyph,
  label,
  active,
}: {
  token: string;
  glyph: string;
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
        active ? "border-spot bg-accent-subtle" : "border-border bg-bg-surface",
      )}
    >
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `var(${token})` }} />
      <span aria-hidden className="font-mono text-text-secondary">{glyph}</span>
      <span className="text-text-primary">{label}</span>
    </span>
  );
}

function DensityRow() {
  return (
    <div
      className="flex items-center gap-4 rounded-md border border-border bg-bg-surface text-text-primary"
      style={{
        height: "var(--density-row-h)",
        paddingInline: "var(--density-pad-x)",
        fontSize: "var(--density-font)",
      }}
    >
      <span className="font-sans">แถวข้อมูล / Data row</span>
      <span className="ml-auto font-mono tabular-nums text-text-secondary">1,240.50 ฿</span>
    </div>
  );
}

const SURFACES = [
  { label: "bg-app", className: "bg-bg-app" },
  { label: "surface", className: "bg-bg-surface" },
  { label: "raised", className: "bg-bg-surface-raised" },
  { label: "sunken", className: "bg-bg-sunken" },
  { label: "paper", className: "bg-bg-paper" },
] as const;

const ACCENTS = [
  { label: "accent", className: "bg-accent", onDark: true },
  { label: "bright", className: "bg-accent-bright", onDark: true },
  { label: "spot", className: "bg-spot", onDark: true },
  { label: "success", className: "bg-success", onDark: true },
  { label: "warning", className: "bg-warning", onDark: true },
  { label: "danger", className: "bg-danger", onDark: true },
  { label: "info", className: "bg-info", onDark: true },
] as const;

const TYPE_SPECIMENS = [
  { label: "display", className: "font-display text-display text-text-primary", sample: "ใบสั่งผลิต Production" },
  { label: "h2", className: "font-display text-h2 text-text-primary", sample: "รายการสินค้า Line items" },
  { label: "body", className: "font-sans text-body text-text-primary", sample: "เนื้อความปกติสำหรับการอ่าน — regular reading copy" },
  { label: "caption", className: "font-sans text-caption text-text-muted", sample: "คำอธิบายย่อ — caption text" },
  { label: "mono", className: "font-mono text-mono tabular-nums text-text-primary", sample: "SO-2026-000142  ฿12,400.00" },
] as const;
