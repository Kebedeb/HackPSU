import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Lang } from '@aman/types';
import { CostOptions } from './CostOptions';
import { FieldFlow } from './FieldFlow';
import { LangContext, useT } from './i18n';
import { Limits } from './Limits';
import { ROLE_LINKS, roleAllows, roleHome, useRole, type Role } from './role';
import { RolePicker } from './RolePicker';
import { navigate, usePath } from './router';
import { pendingCount, syncNow } from './store';
import { Voice } from './Voice';
import './styles.css';

// Leaflet is only needed on the clinic dashboard, so keep it out of the field app's main bundle.
const Clinic = lazy(() => import('./Clinic').then((m) => ({ default: m.Clinic })));

function Header({ role, onChangeRole }: { role: Role | null; onChangeRole: () => void }) {
  const { t } = useT();
  const path = usePath();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = () => void pendingCount().then(setPending);
    const goOnline = () => {
      setOnline(true);
      void syncNow().then(refresh);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const id = window.setInterval(refresh, 2000);
    refresh();
    if (navigator.onLine) void syncNow().then(refresh);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(id);
    };
  }, []);

  const link = (to: string, label: string) => (
    <button key={to} className={`rounded-lg px-2 py-1 text-sm font-semibold ${path === to ? 'bg-teal text-paper' : 'text-teal hover:bg-teal-soft'}`} onClick={() => navigate(to)}>
      {label}
    </button>
  );

  return (
    <header className="no-print sticky top-0 z-[1000] border-b border-ink/10 bg-paper/95 backdrop-blur" dir="ltr">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2">
        <button className="mr-2 flex items-center gap-2" onClick={() => role && navigate(roleHome(role))}>
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <span className="text-xl font-black tracking-tight text-teal">Aman</span>
        </button>
        {role && (
          <nav className="flex flex-wrap gap-1">
            {ROLE_LINKS[role].map((l) => link(l.to, t(l.labelKey)))}
            <button className="rounded-lg px-2 py-1 text-sm font-semibold text-ink-soft underline hover:bg-ink/5" onClick={onChangeRole}>
              {t(`role_${role}`)} · {t('change_role')}
            </button>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-1 font-bold ${online ? 'bg-home-bg text-home' : 'bg-soon-bg text-soon'}`}>{online ? t('online') : t('offline')}</span>
          {pending > 0 && (
            <button className="rounded-full bg-teal px-3 py-1 font-bold text-paper" onClick={() => void syncNow().then(() => pendingCount().then(setPending))}>
              {t('sync_now')} ({pending} {t('queued')})
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function App() {
  const path = usePath();
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('aman.lang') as Lang) || 'en');
  useEffect(() => {
    localStorage.setItem('aman.lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const [role, setRole] = useRole();
  const allowed = role !== null && roleAllows(role, path);
  useEffect(() => {
    if (role && !allowed) navigate(roleHome(role), { replace: true });
  }, [role, allowed]);

  const page = !role ? (
    <RolePicker onPick={setRole} />
  ) : !allowed ? null : path.startsWith('/clinic') ? (
    <Clinic />
  ) : path.startsWith('/voice') ? (
    <Voice />
  ) : path.startsWith('/costs') ? (
    <CostOptions />
  ) : path.startsWith('/limits') ? (
    <Limits />
  ) : (
    <FieldFlow />
  );
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <Header role={role} onChangeRole={() => setRole(null)} />
      <main>
        <Suspense fallback={null}>{page}</Suspense>
      </main>
    </LangContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
