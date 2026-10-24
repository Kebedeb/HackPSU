import { LANG_NAMES } from '@aman/content';
import { LANGS, type Lang } from '@aman/types';
import { useT } from './i18n';
import { ROLES, type Role } from './role';

const ICON: Record<Role, string> = { health_worker: '🩺', family: '👪', clinic: '🏥' };

export function RolePicker({ onPick }: { onPick: (r: Role) => void }) {
  const { t, lang, setLang, dir } = useT();
  return (
    <div dir={dir} lang={lang} className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-10 pt-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('choose_language')}>
        {LANGS.map((l: Lang) => (
          <button key={l} lang={l} className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${lang === l ? 'border-teal bg-teal text-paper' : 'border-teal/30 text-teal'}`} onClick={() => setLang(l)}>
            {LANG_NAMES[l]}
          </button>
        ))}
      </div>
      <h1 className="text-3xl font-extrabold leading-tight">{t('role_title')}</h1>
      <div className="grid gap-3">
        {ROLES.map((r) => (
          <button key={r} className="btn-quiet justify-start gap-4 text-start" onClick={() => onPick(r)}>
            <span aria-hidden className="text-3xl">
              {ICON[r]}
            </span>
            <span className="flex flex-col">
              <span className="text-xl font-bold">{t(`role_${r}`)}</span>
              <span className="text-sm font-normal text-ink-soft">{t(`role_${r}_hint`)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
