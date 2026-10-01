import { BlackHoleBackground } from "./components/BlackHoleBackground";
import { Contact } from "./components/Contact";
import { Hero } from "./components/Hero";
import { Nav } from "./components/Nav";
import { Projects } from "./components/Projects";
import { Skills } from "./components/Skills";
import { useIntroReveal } from "./lib/reveal";
import styles from "./App.module.css";

export function App() {
  const { revealed, onSettled } = useIntroReveal();

  return (
    <div className={styles.shell} data-revealed={revealed}>
      <BlackHoleBackground onSettled={onSettled} />
      <Nav />
      <main>
        <Hero />
        <Projects />
        <Skills />
        <Contact />
      </main>
    </div>
  );
}
