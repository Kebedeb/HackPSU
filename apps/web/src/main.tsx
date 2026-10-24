import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Lang } from '@aman/types';
import { Clinic } from './Clinic';
import { FieldFlow } from './FieldFlow';
import { LangContext, useT } from './i18n';
import { Limits } from './Limits';
import { navigate, usePath } from './router';
import { pendingCount, syncNow } from './store';
import { Voice } from './Voice';
import './styles.css';

function Header() {
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
        <button className="mr-2 flex items-center gap-2" onClick={() => navigate('/')}>
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <span className="text-xl font-black tracking-tight text-teal">Aman</span>
        </button>
        <nav className="flex flex-wrap gap-1">
          {link('/', 'Field')}
          {link('/clinic', t('clinic_link'))}
          {link('/voice', t('voice_link'))}
          {link('/limits', t('limits_link'))}
        </nav>
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

  const page = path.startsWith('/clinic') ? <Clinic /> : path.startsWith('/voice') ? <Voice /> : path.startsWith('/limits') ? <Limits /> : <FieldFlow />;
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <Header />
      <main>{page}</main>
    </LangContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
