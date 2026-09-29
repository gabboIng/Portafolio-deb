import { BlackHoleBackground } from "./components/BlackHoleBackground";
import { Contact } from "./components/Contact";
import { Hero } from "./components/Hero";
import { Nav } from "./components/Nav";
import { Projects } from "./components/Projects";
import { Skills } from "./components/Skills";

export function App() {
  return (
    <>
      <BlackHoleBackground />
      <Nav />
      <main>
        <Hero />
        <Projects />
        <Skills />
        <Contact />
      </main>
    </>
  );
}
