# Portafolio — Gabriel Sanhueza

Portafolio personal con un **agujero negro renderizado en WebGPU** como fondo fijo
de toda la página. El texto y el contenido no dependen de WebGPU: es una mejora
progresiva, no un requisito.

> Para ver el fondo necesitas un navegador con WebGPU habilitado
> (Chrome/Edge 113+, Safari 26+). Sin él, el sitio sigue funcionando con un
> gradiente estático.

## Stack

- **Vite** + **React 19** + **TypeScript**
- **WGSL** + [vgpu](https://vgpu.sh) para el render del agujero negro
- **CSS Modules** + custom properties. Sin Tailwind, sin framework de estilos

## Puesta en marcha

```bash
pnpm install
pnpm dev        # servidor de desarrollo
pnpm build      # typecheck + build de producción
pnpm preview    # sirve el build
pnpm typecheck  # solo tsc --noEmit
```

## Editar el contenido

**Todo el contenido vive en `src/lib/portfolio.ts`.** No edites los componentes
para cambiar textos: se leen de ahí.

Ahí van nombre, links, proyectos, stack y contacto. Los `TODO` marcan lo que
falta por completar (email y ubicación, por ahora).

## El fondo WebGPU

`src/blackhole/` es el renderer. Son 9 shaders WGSL y una cadena de pases:

```
bake → refine → shade → bloom (3 niveles) → composite
```

- `bake.wgsl` traza las geodésicas relativistas y guarda los impactos
- `refine.wgsl` refina el anillo de fotones con cobertura sub-píxel
- `shade.wgsl` colorea el disco, las estrellas y el campo estelar de fondo
- `bloom.wgsl` extrae y desenfoca el halo
- `composite.wgsl` combina, tone mapea y expone a pantalla

Los shaders se cargan con `wgslVitePlugin()` de `@vgpu/wgsl` (ver `vite.config.js`).

### Ajustes que se tocan seguido

Estos son los valores que conviene conocer, porque cambiar cualquiera de ellos
mueve el aspecto de forma bastante directa:

| Valor | Dónde | Qué hace |
|---|---|---|
| `centerX` / `centerY` | `settings.ts` | Apuntado de la cámara en NDC. El hero original usaba `0.8 / 0.3` para dejar el espacio de texto a la izquierda. |
| `centerFade` | `settings.ts` | Oscurece una banda horizontal por el medio, para legibilidad. En `1` apagaba el agujero negro, porque la banda cae justo sobre él. |
| `EXPOSURE` | `composite.wgsl` | Brillo general del disco. Bajarlo oscurece el agujero negro, no solo el disco. |
| `SATURATION` | `composite.wgsl` | En `0.0` a propósito: el disco se queda en escala de grises y no compite con el acento ámbar de la interfaz. |

`mouseYaw` mueve la escena con el puntero; en móvil se desactiva.

## Rendimiento y fallback

- **30 fps** con `frameLoop({ fps: 30 })` — no la tasa del monitor
- **dpr 0.7** — el buffer del canvas es menor que la pantalla y se escala por CSS
- **`prefers-reduced-motion`** — dibuja un solo frame y no anima
- El loop se detiene cuando la pestaña está oculta o el canvas sale de pantalla
- Si falta WebGPU o el dispositivo falla, se mantiene un gradiente CSS y el sitio
  queda igual de legible. Los errores se registran en consola, nunca se muestran
  como una pantalla.

## Deploy

Build estático en `dist/`. Pensado para GitHub Pages.

Dos cosas hacen falta para desplegar en un subdirectorio
(`gabboIng.github.io/portafolio/`):

1. **`base` en Vite.** Sin esto los assets se piden en `/assets/...` en vez de
   `/portafolio/assets/...` y dan 404:

   ```js
   // vite.config.js
   export default defineConfig({
     base: "/portafolio/",
     // ...
   });
   ```

2. **`.nojekyll`** en la raíz de `dist/`, para que GitHub no procese los
   archivos con Jekyll. Se puede generar con `scripts/` en vez de a mano con
   `echo`, que no funciona en Windows.

Nada de esto está hecho todavía; es lo que falta para el primer deploy.

## Estructura

```
src/
  blackhole/     renderer WebGPU: WGSL + pipeline + settings
  components/    secciones de la página, cada una con su .module.css
  lib/
    portfolio.ts  ← todo el contenido editable
    motion.ts     helpers de prefers-reduced-motion
  styles/
    tokens.css    paleta, tipografía, spacing
    global.css    reset y estilos base
```

## Nota sobre versiones

`@vitejs/plugin-react` está en **4.x** a propósito. La versión 6 importa
`vite/internal`, que no está exportado por Vite 5: el build pasa pero el shader
falla al compilar en runtime. Si actualizas, suben plugin-react y Vite juntos.
