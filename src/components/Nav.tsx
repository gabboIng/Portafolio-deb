import { useEffect, useState } from "react";

import { nav, profile } from "../lib/portfolio";
import styles from "./Nav.module.css";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={styles.header} data-scrolled={scrolled}>
      <nav className={styles.nav} aria-label="Principal">
        <a className={styles.brand} href="#top">
          <span className={styles.mark} aria-hidden="true" />
          {profile.name}
        </a>
        <ul className={styles.links}>
          {nav.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>{item.label}</a>
            </li>
          ))}
        </ul>
        <a
          className={styles.cta}
          href={profile.links[0].url}
          target="_blank"
          rel="noreferrer noopener"
        >
          GitHub
        </a>
      </nav>
    </header>
  );
}
