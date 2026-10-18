import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  PlatformLoginBody,
  SubscriptionInvoicesQuery,
  SupportSessionsQuery,
  TenantsQuery,
} from "@erp/contracts";
import { platformApi } from "./platform-client.js";
import { clearPlatformTokens, setPlatformTokens } from "./platform-token-store.js";

/** Query keys for the `platform` domain — one place so invalidation and keys can't drift. */
export const platformKeys = {
  all: ["platform"] as const,
  tenantsAll: () => [...platformKeys.all, "tenants"] as const,
  tenants: (query: Partial<TenantsQuery> = {}) => [...platformKeys.tenantsAll(), query] as const,
  plans: () => [...platformKeys.all, "plans"] as const,
  features: (tenantId: string) => [...platformKeys.all, "features", tenantId] as const,
  sessionsAll: () => [...platformKeys.all, "support-sessions"] as const,
  sessions: (query: Partial<SupportSessionsQuery> = {}) => [...platformKeys.sessionsAll(), query] as const,
};

export function usePlatformLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (credentials: PlatformLoginBody) => {
      const response = await platformApi.platform.login.mutation({ body: credentials });
      if (response.status !== 200) throw response;
      return response.body;
    },
    onSuccess: (tokens) => {
      queryClient.clear();
      setPlatformTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
    },
  });
}

/** Best-effort server revoke, then always drop the local session. */
export async function platformSignOut(): Promise<void> {
  try {
    await platformApi.platform.logout.mutation({});
  } catch {
    // Local sign-out must succeed even if the revoke call can't reach the api.
  }
  clearPlatformTokens();
}

export function usePlatformMeQuery() {
  return platformApi.platform.me.useQuery([...platformKeys.all, "me"]);
}

export function useTenantsQuery(query: Partial<TenantsQuery> = {}) {
  return platformApi.platform.listTenants.useQuery(platformKeys.tenants(query), { query });
}

export function usePlansQuery() {
  return platformApi.platform.listPlans.useQuery(platformKeys.plans());
}

export function useCreateTenantMutation() {
  const queryClient = useQueryClient();
  return platformApi.platform.createTenant.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.tenantsAll() });
    },
  });
}

export function useSetTenantStatusMutation() {
  const queryClient = useQueryClient();
  return platformApi.platform.setTenantStatus.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.tenantsAll() });
    },
  });
}

export function usePurgeTenantMutation() {
  const queryClient = useQueryClient();
  return platformApi.platform.purgeTenant.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.tenantsAll() });
    },
  });
}

export function useExportTenantMutation() {
  return platformApi.platform.exportTenant.useMutation();
}

export function useTenantFeaturesQuery(tenantId: string) {
  return platformApi.platform.listTenantFeatures.useQuery(platformKeys.features(tenantId), {
    params: { id: tenantId },
  });
}

export function useSetTenantFeatureMutation() {
  const queryClient = useQueryClient();
  return platformApi.platform.setTenantFeature.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.features(variables.params.id) });
    },
  });
}

export function useDeleteTenantFeatureMutation() {
  const queryClient = useQueryClient();
  return platformApi.platform.deleteTenantFeature.useMutation({
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.features(variables.params.id) });
    },
  });
}

export function useSupportSessionsQuery(query: Partial<SupportSessionsQuery> = {}) {
  return platformApi.platform.listSupportSessions.useQuery(platformKeys.sessions(query), { query });
}

export function useCreateSupportSessionMutation() {
  const queryClient = useQueryClient();
  return platformApi.platform.createSupportSession.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.sessionsAll() });
    },
  });
}

export function useRevokeSupportSessionMutation() {
  const queryClient = useQueryClient();
  return platformApi.platform.revokeSupportSession.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.sessionsAll() });
    },
  });
}

// ── M9 subscription billing ──────────────────────────────────────────────────

export const billingKeys = {
  subscription: (tenantId: string) => [...platformKeys.all, "subscription", tenantId] as const,
  invoicesAll: () => [...platformKeys.all, "subscription-invoices"] as const,
  invoices: (query: Partial<SubscriptionInvoicesQuery>) => [...billingKeys.invoicesAll(), query] as const,
};

/** The tenant's subscription; a 404 simply means it has none yet (rendered as an empty state). */
export function useTenantSubscriptionQuery(tenantId: string) {
  return platformApi.platform.getTenantSubscription.useQuery(
    billingKeys.subscription(tenantId),
    { params: { id: tenantId } },
    { queryKey: billingKeys.subscription(tenantId), retry: false },
  );
}

export function useCreateSubscriptionMutation() {
  const queryClient = useQueryClient();
  return platformApi.platform.createSubscription.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.all });
    },
  });
}

export function useSubscriptionInvoicesQuery(query: Partial<SubscriptionInvoicesQuery>) {
  return platformApi.platform.listSubscriptionInvoices.useQuery(billingKeys.invoices(query), { query });
}

function invalidateBilling(queryClient: ReturnType<typeof useQueryClient>) {
  // Mark-paid moves the term, status and tenant lifecycle, so refresh all of them.
  void queryClient.invalidateQueries({ queryKey: billingKeys.invoicesAll() });
  void queryClient.invalidateQueries({ queryKey: [...platformKeys.all, "subscription"] });
  void queryClient.invalidateQueries({ queryKey: platformKeys.tenantsAll() });
}

export function useIssueSubscriptionInvoiceMutation() {
  const queryClient = useQueryClient();
  return platformApi.platform.issueSubscriptionInvoice.useMutation({
    onSuccess: () => invalidateBilling(queryClient),
  });
}

export function useMarkInvoicePaidMutation() {
  const queryClient = useQueryClient();
  return platformApi.platform.markSubscriptionInvoicePaid.useMutation({
    onSuccess: () => invalidateBilling(queryClient),
  });
}

export function useVoidInvoiceMutation() {
  const queryClient = useQueryClient();
  return platformApi.platform.voidSubscriptionInvoice.useMutation({
    onSuccess: () => invalidateBilling(queryClient),
  });
}

export function useComputeQuoteMutation() {
  return platformApi.platform.computeQuote.useMutation();
}

export function useQuotePdfMutation() {
  return platformApi.platform.getQuotePdf.useMutation();
}
