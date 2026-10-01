import { heroBadges, profile } from "../lib/portfolio";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className={styles.hero} id="top">
      <div className={styles.content}>
        <p className={styles.eyebrow} data-reveal="item">
          {profile.role}
        </p>
        <h1 className={styles.name} data-reveal="item">
          {profile.name}
        </h1>
        <p className={styles.tagline} data-reveal="item">
          {profile.tagline}
        </p>
        <p className={styles.intro} data-reveal="item">
          {profile.intro}
        </p>

        <div className={styles.actions} data-reveal="item">
          <a className={styles.primary} href="#proyectos">
            Ver proyectos
          </a>
          {profile.links.map((link) => (
            <a
              key={link.url}
              className={styles.secondary}
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {link.label}
            </a>
          ))}
        </div>

        <ul
          className={styles.badges}
          aria-label="Tecnologías principales"
          data-reveal="item"
        >
          {heroBadges.map((badge) => (
            <li key={badge}>{badge}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
