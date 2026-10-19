import { useRotatingLine } from "../lib/useRotatingLine";
import { profile } from "../lib/portfolio";
import styles from "./Hero.module.css";

export function Hero() {
  const active = useRotatingLine(profile.taglines);

  /*
   * Joined here rather than written out as one string so the separator can only
   * ever appear between two things that exist: profile.location is still empty
   * behind its TODO, and a hardcoded "· Chile" would leave a dangling separator
   * the moment it is filled in or removed.
   */
  const label = [profile.role, profile.location].filter(Boolean).join(" · ");

  return (
    <section className={styles.hero} id="top">
      <div className={styles.content}>
        <p className={styles.label} data-reveal="item">
          <span>{label}</span>
          <span className={styles.rule} aria-hidden="true" />
        </p>

        <h1 className={styles.name} data-reveal="item">
          {profile.name}
        </h1>

        {/*
          Every line is present in the DOM and stacked in one grid cell, so the
          swap is pure opacity and transform on a fixed box: the block never
          changes size mid-rotation, and the longest line reserves the width.
          The inactive ones are removed from the a11y tree, so `aria-live`
          announces the sentence that arrived and not the whole list.
        */}
        <div className={styles.tagline} data-reveal="item">
          <div className={styles.taglineStack} aria-live="polite">
            {profile.taglines.map((line, i) => (
              <p
                key={line}
                className={styles.taglineLine}
                data-active={i === active}
                aria-hidden={i !== active}
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
