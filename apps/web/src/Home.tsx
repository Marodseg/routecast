import s from './Home.module.css';
import { t } from './i18n';
import { LangToggle, ThemeToggle } from './ui/Toggles/Toggles';

/** Portada provisional hasta la fase 3. */
export function Home() {
  return (
    <main class={s.home}>
      <header class={s.top}>
        <span class={s.brand}>
          <i class={s.mark} aria-hidden="true" />
          Routecast
        </span>
        <span class={s.tools}>
          <LangToggle />
          <ThemeToggle />
        </span>
      </header>
      <section class={`${s.hero} plate`}>
        <h1 class={s.title}>{t().app.name}</h1>
        <p class={s.tagline}>{t().app.tagline}</p>
        <p class={s.body}>{t().app.building}</p>
        <a class={s.cta} href="./dev/gallery/">
          {t().app.gallery} →
        </a>
      </section>
      <footer class={s.footer}>{t().attribution}</footer>
    </main>
  );
}
