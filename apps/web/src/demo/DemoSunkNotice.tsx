import { useTranslation } from "react-i18next";
import { Badge } from "@erp/ui";

/** The "demo — not delivered" label for a sunk LINE/email send (M10 §6.4). */
export function DemoSunkLabel({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge tone="warning" className={className}>
      {t("demo.sunkLabel")}
    </Badge>
  );
}

export interface SunkMessageCardProps {
  channel: "email" | "line";
  to: string[];
  subject?: string;
  text?: string;
}

/**
 * Renders a would-be outbound message from a demo sandbox: the content the guest would have sent,
 * clearly marked as never delivered.
 */
export function SunkMessageCard({ channel, to, subject, text }: SunkMessageCardProps) {
  const { t } = useTranslation();
  return (
    <div
      data-channel={channel}
      className="flex flex-col gap-1 rounded-md border border-border bg-bg-sunken p-3 text-left text-sm"
    >
      <DemoSunkLabel className="self-start" />
      <p className="text-caption text-text-muted">{t("demo.sunkTo", { to: to.join(", ") })}</p>
      {subject && <p className="text-body-strong text-text-primary">{subject}</p>}
      {text && <p className="whitespace-pre-wrap text-text-primary">{text}</p>}
    </div>
  );
}
