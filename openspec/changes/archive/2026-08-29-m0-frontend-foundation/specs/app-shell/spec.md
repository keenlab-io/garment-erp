# app-shell

## ADDED Requirements

### Requirement: Application shell layout
`apps/web` SHALL provide a persistent application shell: a left sidebar (primary navigation, ink-900 chrome per `--color-brand`), a top bar (breadcrumb/page title, global search entry, scan affordance on touch contexts, notifications, language toggle, avatar menu), a content region, and a toast region. The shell persists across route navigation — only the content region remounts.

#### Scenario: Shell persists across navigation
- **WHEN** the user navigates between two routes
- **THEN** the sidebar and top bar do not remount; only the content region changes, and the breadcrumb/page title updates

#### Scenario: Toast region is shell-level
- **WHEN** a toast is raised from any screen
- **THEN** it renders in the shell's toast region at the locked `--z-toast` layer and survives a route change within its display duration

### Requirement: Role-filtered navigation
Each sidebar item SHALL declare the `Permission` codes (typed from `@erp/contracts`) required to see its module. Items whose permissions the current user lacks are **absent** from the nav — never rendered greyed or locked. Admin & Access appears bottom-anchored and only for super admins.

#### Scenario: Unpermitted module is absent
- **WHEN** a user without any `sales.*` permission opens the app
- **THEN** the Sales nav item does not exist in the DOM at all (not disabled, not hidden via CSS)

#### Scenario: Super admin sees everything
- **WHEN** a super-admin user opens the app
- **THEN** all module nav items, including Admin & Access, are visible

### Requirement: Density mechanism on the shell root
The shell SHALL set `data-density` (`comfortable` | `compact` | `touch`) on its root element. Comfortable is the default; Compact is a user toggle persisted across sessions; **Touch is auto-applied** when the route is marked as a kiosk/floor route or the device reports a coarse pointer, and it additionally removes hover-only affordances and raises confirmation thresholds. Manual density choice never overrides the Touch auto-application on kiosk routes.

#### Scenario: Coarse pointer auto-applies Touch
- **WHEN** the app loads on a device matching `(pointer: coarse)` or the user enters a route flagged as kiosk
- **THEN** the shell root carries `data-density="touch"` and controls/rows resolve to the 56/64px Touch token values

#### Scenario: Compact preference persists
- **WHEN** a desktop user switches density to Compact and reloads the app
- **THEN** the shell restores `data-density="compact"` from persisted preference

#### Scenario: Touch removes hover-only affordances
- **WHEN** Touch density is active
- **THEN** no action is reachable only via hover; row actions and tooltips have tap-accessible equivalents

### Requirement: Theme switching
The shell SHALL support light and dark themes via a `data-theme` attribute on the document root: default follows `prefers-color-scheme`, a user toggle overrides it, and the choice persists across sessions.

#### Scenario: System preference is the default
- **WHEN** a user with no stored theme preference and OS dark mode opens the app
- **THEN** the shell renders with `data-theme="dark"`

#### Scenario: Explicit choice wins and persists
- **WHEN** the user toggles to light and reloads
- **THEN** the shell renders light regardless of the OS preference

### Requirement: Command palette
A command palette SHALL open on Cmd/Ctrl-K from anywhere in the shell, offering grouped navigation and actions. Entries are permission-filtered with the same rules as the nav (unpermitted entries absent). Baseline keyboard map: `⌘K` palette, `/` focus search, `Esc` close.

#### Scenario: Palette opens and navigates
- **WHEN** the user presses Ctrl/Cmd-K and selects a module entry
- **THEN** the palette closes and the app navigates to that module's route

#### Scenario: Palette respects permissions
- **WHEN** a user without `iam.role.manage` opens the palette and searches "roles"
- **THEN** no role-management entry is offered

### Requirement: Responsive collapse
On viewports below the `--bp-md` breakpoint the shell SHALL collapse to a bottom tab bar plus a drawer for overflow navigation, with content in a single column; on tablet the sidebar is collapsible. The same role-filtering applies to the tab bar and drawer.

#### Scenario: Mobile shell
- **WHEN** the viewport is narrower than 768px
- **THEN** the sidebar is replaced by a bottom tab bar + drawer, and the content region is single-column

### Requirement: Session context feeds the shell
The shell SHALL consume an authenticated session context exposing the current user (identity, super-admin flag, and permission set typed as `Permission[]` from `@erp/contracts`). Nav filtering, the command palette, and the permission-aware UI layer all read this single context; the shell renders an unauthenticated state (login route) when no session exists.

#### Scenario: No session shows login
- **WHEN** the app loads without a valid session
- **THEN** the user is routed to the login screen and no shell navigation is rendered

#### Scenario: One permission source
- **WHEN** the session context's permission set changes (e.g. re-login after a role change)
- **THEN** nav, palette, and gated UI all reflect the new set without a full page reload
