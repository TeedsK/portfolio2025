# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (Vite)
npm run build    # Type-check with tsc, then build for production
npm run lint     # Run ESLint
npm run preview  # Preview production build locally
```

## Architecture Overview

This is a React 19 + TypeScript portfolio site using Vite as the build system. The site features an interactive landing page with real-time OCR demonstrations and animated visualizations.

### Key Technologies
- **React 19** with TypeScript (strict mode)
- **Vite** with path aliases (`@pages`, `@components`, `@utils`, `@assets`)
- **GSAP** for complex animations
- **TensorFlow.js** for client-side ML inference (EMNIST character recognition)
- **Ant Design** for UI components

### Source Structure

```
src/
├── pages/landing/           # Main landing page
│   ├── sections/            # Page sections (Hero, WorkExperience, AStarCreativity, Projects)
│   ├── components/          # Landing-specific components (OCR overlays, visualizations)
│   ├── hooks/               # Custom hooks (useOcrProcessing)
│   ├── visuals/             # Canvas-based visualizations (PathfinderCanvas, NetworkGraphViz)
│   └── utils/               # Landing utilities (path geometry, animation gates, constants)
├── components/              # Shared components (SiteHeader, InlineWordToggle)
├── utils/
│   └── ml/                  # ML utilities (segmentation.ts, preprocess.ts)
└── types/                   # TypeScript interfaces
```

### Core Systems

**OCR Pipeline** (`Hero.tsx` + `useOcrProcessing.ts`):
- Processes two image/video sources simultaneously
- Uses TensorFlow.js with EMNIST model for character recognition
- `findCharacterBoxes()` in `segmentation.ts` extracts character bounding boxes using flood-fill connected components
- Results animate through a neural network visualization before displaying

**Animation Coordination**:
- `landingAnimationGate.ts` controls when landing animations run (prevents animations on other pages)
- GSAP timelines coordinate multi-stage animations (media collapse, scale transitions, text reveals)
- `PathManager` class handles curved path geometry for beam animations

**A* Pathfinder** (`PathfinderCanvas.tsx`):
- Canvas-based maze generation using binary tree algorithm
- Real-time A* pathfinding with animated visualization
- Supports auto, fixed, and custom (interactive) modes

### Static Assets

ML models and media assets are in `/public/`:
- `/public/models/` - EMNIST TensorFlow.js model files
- Images/videos for OCR demos (`text_screenshot.png`, `hello_and_welcome.png`, etc.)
