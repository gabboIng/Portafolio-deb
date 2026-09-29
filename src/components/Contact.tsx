import { profile } from "../lib/portfolio";
import styles from "./Contact.module.css";

export function Contact() {
  return (
    <section className={styles.section} id="contacto">
      <h2 className={styles.title}>Contacto</h2>
      <p className={styles.lead}>
        ¿Tienes un proyecto en mente o quieres hablar de alguno de estos?
      </p>

      <ul className={styles.links}>
        {profile.email ? (
          <li>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
          </li>
        ) : null}
        {profile.links.map((link) => (
          <li key={link.url}>
            <a href={link.url} target="_blank" rel="noreferrer noopener">
              {link.label}
            </a>
          </li>
        ))}
      </ul>

      {profile.email ? null : (
        // Visible while profile.email is empty so the gap isn't mistaken for an
        // oversight. Remove this block together with the TODO in portfolio.ts.
        <p className={styles.placeholder}>
          Pendiente de agregar un email de contacto.
        </p>
      )}
    </section>
  );
}
