import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { Icon } from "@erp/ui";
import { SubscriptionStatus } from "@erp/contracts";
import { useDateFormat } from "../i18n/use-formatters.js";
import { useSession } from "../session/session-context";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days until `graceEndsAt` (rounded up), never negative. */
export function graceDaysLeft(graceEndsAt: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(graceEndsAt).getTime() - now.getTime()) / DAY_MS));
}

/**
 * The `IN_GRACE` renewal countdown (M9 §6.2). The term has ended but the tenant is still fully
 * writable until `grace_ends_at`; the banner counts down to that date. Once the grace runs out the
 * tenant is `READ_ONLY` and `TenantReadOnlyBanner` (M8's mechanism) carries the renewal message
 * instead, so this renders nothing for any status other than `IN_GRACE`.
 */
export function TenantGraceBanner({ now = new Date() }: { now?: Date }) {
  const { t } = useTranslation();
  const { tenant } = useSession();
  const dateFormat = useDateFormat({ dateStyle: "medium" });
  const subscription = tenant?.subscription;

  if (subscription?.status !== SubscriptionStatus.IN_GRACE) return null;

  const days = graceDaysLeft(subscription.grace_ends_at, now);

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warning bg-warning-subtle px-4 py-2 text-sm text-warning-on"
    >
      <Icon icon={Clock} size={16} />
      <span>
        {days <= 1
          ? t("tenant.graceBannerLastDay")
          : t("tenant.graceBanner", {
              date: dateFormat.format(new Date(subscription.grace_ends_at)),
              days,
            })}
      </span>
    </div>
  );
}
