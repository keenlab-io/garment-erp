/**
 * The platform console only exists in the cloud build (M8 §7.1): self-hosted deployments never
 * mount the `/platform` control-plane endpoints, so the web hides the whole route group. Mirrors
 * the api's `DEPLOYMENT_MODE` (default `cloud`); set `VITE_DEPLOYMENT_MODE=self-hosted` to disable.
 */
export function isCloudMode(): boolean {
  return (import.meta.env.VITE_DEPLOYMENT_MODE as string | undefined)?.trim() !== "self-hosted";
}
