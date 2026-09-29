import { skills } from "../lib/portfolio";
import styles from "./Skills.module.css";

export function Skills() {
  return (
    <section className={styles.section} id="stack">
      <h2 className={styles.title}>Stack</h2>
      <div className={styles.groups}>
        {skills.map((group) => (
          <div key={group.label} className={styles.group}>
            <h3 className={styles.label}>{group.label}</h3>
            <ul className={styles.items}>
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
