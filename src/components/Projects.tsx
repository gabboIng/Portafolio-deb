import { projects, type Project } from "../lib/portfolio";
import styles from "./Projects.module.css";

function ProjectCard({ project }: { project: Project }) {
  return (
    <article className={styles.card} data-featured={project.featured}>
      <header className={styles.cardHeader}>
        <div>
          <h3 className={styles.name}>{project.name}</h3>
          <p className={styles.tagline}>{project.tagline}</p>
        </div>
        {project.featured ? (
          <span className={styles.flag}>Fondo de este sitio</span>
        ) : null}
      </header>

      <p className={styles.description}>{project.description}</p>

      <ul className={styles.highlights}>
        {project.highlights.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <ul className={styles.stack} aria-label={`Tecnologías de ${project.name}`}>
        {project.stack.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <div className={styles.links}>
        <a href={project.repoUrl} target="_blank" rel="noreferrer noopener">
          Código
        </a>
        {project.demoUrl ? (
          <a href={project.demoUrl} target="_blank" rel="noreferrer noopener">
            Demo
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function Projects() {
  const featured = projects.filter((project) => project.featured);
  const rest = projects.filter((project) => !project.featured);

  return (
    <section className={styles.section} id="proyectos">
      <h2 className={styles.title}>Proyectos</h2>

      {featured.map((project) => (
        <ProjectCard key={project.slug} project={project} />
      ))}

      <div className={styles.grid}>
        {rest.map((project) => (
          <ProjectCard key={project.slug} project={project} />
        ))}
      </div>
    </section>
  );
}
