import AppShell from '@/app/components/layout/AppShell';

/**
 * Home, Notes, Calendar, Archive and Recently deleted share one app shell:
 * the navigation rail (a bottom tab bar on phones) and the modals its menus
 * open. A route group, so the URLs stay /, /notes, /calendar, …; sign-in
 * pages sit outside it and get no navigation.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
