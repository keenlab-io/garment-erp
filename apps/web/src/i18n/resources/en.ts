// English resources for the `shell` namespace. Group 7 adds the remaining namespaces, typed-key
// augmentation, and a th/en completeness check; this file is the shape both locales share.
export const shellEn = {
  nav: {
    dashboard: "Dashboard",
    inventory: "Inventory",
    production: "Production",
    sales: "Sales",
    hr: "HR & Payroll",
    reports: "Reports",
    admin: "Admin & Access",
  },
  topbar: {
    search: "Search",
    searchPlaceholder: "Search or jump to…",
    notifications: "Notifications",
    account: "Account",
    signOut: "Sign out",
    theme: "Theme",
    themeToLight: "Switch to light",
    themeToDark: "Switch to dark",
    language: "ภาษาไทย",
    density: "Density",
    densityComfortable: "Comfortable",
    densityCompact: "Compact",
    openMenu: "Open menu",
    openNav: "Open navigation",
    more: "More",
  },
  breadcrumb: {
    home: "Home",
  },
  a11y: {
    primaryNav: "Main navigation",
    adminNav: "Admin navigation",
    breadcrumb: "Breadcrumb",
    themeToggle: "Toggle color theme",
    densityToggle: "Toggle density",
  },
  palette: {
    placeholder: "Search modules and actions…",
    empty: "No matches.",
    groupNavigate: "Go to",
  },
  page: {
    comingSoon: "Coming soon",
    comingSoonBody: "This module ships in a later milestone. The shell, navigation, and design system are ready for it.",
  },
  dashboard: {
    title: "Dashboard",
    apiHealth: "API health",
    healthy: "Connected",
    unreachable: "API unreachable — is the server running?",
    uptime: "uptime {{seconds}}s",
    invoices: "Invoices",
    invoicesEmpty: "The invoice table lands with the Data Table (M0 Group 5).",
  },
  login: {
    title: "Sign in",
    subtitle: "Authentication wiring lands with M1. This is a placeholder session.",
    continue: "Continue to app",
  },
} as const;
