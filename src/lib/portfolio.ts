/**
 * Single source of truth for everything shown on the site.
 * Edit here, never inside a component.
 */

export interface Project {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** What the work actually demonstrates. Shown as a bullet list. */
  highlights: readonly string[];
  stack: readonly string[];
  repoUrl: string;
  demoUrl?: string;
  featured?: boolean;
  /** Local asset under /public, when there is a screenshot worth showing. */
  image?: string;
}

export interface SkillGroup {
  label: string;
  items: readonly string[];
}

export const profile = {
  greeting: "Hola, soy",
  name: "Gabriel Sanhueza",
  handle: "gabboIng",
  role: "Desarrollador de software",
  tagline: "Construyo aplicaciones web y gráficos en tiempo real.",
  intro:
    "Me interesa el lado visual de la web tanto como el de los datos: " +
    "interfaces que se sienten rápidas y sistemas que hacen algo real.",
  location: "", // TODO: completar
  email: "", // TODO: completar
  links: [
    { label: "GitHub", url: "https://github.com/gabboIng" },
    // TODO: agregar LinkedIn, email, CV cuando los tengas.
  ],
  avatarUrl: "https://avatars.githubusercontent.com/u/291111213?v=4",
} as const;

export const nav = [
  { id: "proyectos", label: "Proyectos" },
  { id: "stack", label: "Stack" },
  { id: "contacto", label: "Contacto" },
] as const;

export const projects: readonly Project[] = [
  {
    slug: "optimized-black-hole",
    name: "Agujero negro en WebGPU",
    tagline: "Relatividad general renderizada en tiempo real",
    description:
      "Trazado de geodésicas relativistas en WGSL: cada píxel dispara un rayo " +
      "que se curva alrededor del horizonte de eventos, cruza el disco de " +
      "accreción hasta dos veces y deforma el campo estelar de fondo. " +
      "Es también el fondo animado de este sitio.",
    highlights: [
      "Geodésicas integrateadas en WGSL con dos cruces del disco y lenteado del cielo",
      "Disco de acreción con FBM de ruido 3D, cizallamiento diferencial y beaming Doppler",
      "Cadena de bloom HDR de tres niveles con umbral suave y desenfoque separable",
      "Tone mapping ACES y precomputado deCoverage sub-píxel para el anillo de fotones",
    ],
    stack: ["TypeScript", "WGSL", "WebGPU", "GLSL-free pipeline"],
    repoUrl: "https://github.com/gabboIng",
    featured: true,
  },
  {
    slug: "animal-friends-sql",
    name: "Animal Friends",
    tagline: "Adopción de mascotas, fullstack",
    description:
      "Aplicación web completa para adopciones: registro de usuarios, " +
      "publicación y edición de mascotas, y un catálogo paginado.",
    highlights: [
      "CRUD completo de mascotas disponibles para adopción",
      "Registro y autenticación de usuarios",
      "Catálogo con paginación",
    ],
    stack: ["JavaScript", "SQL", "Web fullstack"],
    repoUrl: "https://github.com/gabboIng/Animal-Friends-SQL",
  },
  {
    slug: "cielo-claro",
    name: "Cielo Claro",
    tagline: "Dashboard de clima sin framework",
    description:
      "Panel de clima hecho con HTML, CSS y JavaScript puro, consumiendo " +
      "OpenWeather de forma eficiente. Sin build step ni dependencias.",
    highlights: [
      "Consumo paralelo de varios endpoints de OpenWeather",
      "Cero dependencias: HTML, CSS y JS directo",
      "Deploy automático con GitHub Pages",
    ],
    stack: ["JavaScript", "HTML", "CSS", "OpenWeather API"],
    repoUrl: "https://github.com/gabboIng/Cielo-Claro",
    demoUrl: "https://gabboIng.github.io/Cielo-Claro/",
  },
  {
    slug: "gestor-de-tareas",
    name: "Gestor de Tareas",
    tagline: "Offline-first por necesidad",
    description:
      "Gestor de tareas que intenta cargar datos desde JSONPlaceholder y, " +
      "si la conexión falla, sigue funcionando en modo local.",
    highlights: [
      "Degradación elegante: la app no se rompe sin red",
      "Crear, listar, completar y eliminar tareas",
    ],
    stack: ["JavaScript", "REST API", "localStorage"],
    repoUrl: "https://github.com/gabboIng/Gestor-de-Tareas",
  },
  {
    slug: "wallet-sence",
    name: "Wallet Sence",
    tagline: "Billetera virtual, frontend",
    description:
      "Interfaz de billetera virtual: saldos, movimientos y flujo de carga.",
    highlights: ["Interfaz de producto fintech", "Estados de carga y error"],
    stack: ["HTML", "CSS", "JavaScript"],
    repoUrl: "https://github.com/gabboIng/Ejercicio_Wallet_Sence",
  },
  {
    slug: "web-busqueda-trabajo",
    name: "Web Búsqueda de Trabajo",
    tagline: "Buscador de empleo IT",
    description:
      "Sitio orientado a buscar y filtrar ofertas de trabajo en tecnología.",
    highlights: ["Búsqueda y filtrado de ofertas", "Interfaz responsive"],
    stack: ["JavaScript", "HTML", "CSS"],
    repoUrl: "https://github.com/gabboIng/Web-Busqueda-Trabajo",
  },
];

/**
 * Kept to what the public repos and this site actually demonstrate. Anything
 * not backed by a repo or by this site's own source should be removed.
 */
export const skills: readonly SkillGroup[] = [
  {
    label: "Lenguajes",
    items: ["JavaScript", "TypeScript", "HTML", "CSS", "WGSL"],
  },
  { label: "Frontend", items: ["React", "Vite", "CSS Modules"] },
  {
    label: "APIs y plataforma",
    items: [
      "WebGPU",
      "Fetch / REST",
      "IntersectionObserver",
      "ResizeObserver",
    ],
  },
  { label: "Herramientas", items: ["Git", "GitHub Pages", "pnpm"] },
];

/** Rendered in the hero, under the name. */
export const heroBadges = ["WebGPU", "TypeScript", "React"] as const;
