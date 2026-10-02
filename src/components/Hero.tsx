import { profile } from "../lib/portfolio";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className={styles.hero} id="top">
      <div className={styles.content}>
        <p className={styles.greeting} data-reveal="item">
          {profile.greeting}
        </p>
        <h1 className={styles.name} data-reveal="item">
          {profile.name}
        </h1>
        <p className={styles.role} data-reveal="item">
          {profile.role}
        </p>
        <p className={styles.tagline} data-reveal="item">
          {profile.tagline}
        </p>
      </div>
    </section>
  );
}
