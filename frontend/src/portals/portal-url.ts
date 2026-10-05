export type PortalUrlEnv = {
  VITE_USER_PORTAL_URL?: string;
  VITE_STAFF_PORTAL_URL?: string;
  VITE_ADMIN_PORTAL_URL?: string;
};

export function getPortalUrl(portal: 'user' | 'staff' | 'admin', env: PortalUrlEnv, currentOrigin: string): string {
  const configured = {
    user: env.VITE_USER_PORTAL_URL,
    staff: env.VITE_STAFF_PORTAL_URL,
    admin: env.VITE_ADMIN_PORTAL_URL,
  }[portal]?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const url = new URL(currentOrigin);
  url.port = String({ user: 5173, staff: 5174, admin: 5175 }[portal]);
  return url.origin;
}

/** Cross-origin navigation deliberately carries no credentials. */
export function redirectToPortal(url: string): void {
  window.location.assign(url);
}
