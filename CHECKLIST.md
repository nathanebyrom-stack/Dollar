# Dollar — Build Checklist

Tick items only when the work is committed and visible in the repo. One step at a time, in order.
Steps 3 onwards replaced by Jenny, 18 Oct 2026, to follow DOLLAR-SHOWCASE-PLAN.md (v3).

## 1. Skeleton
- [x] Folder structure, index.html, shared header/footer, 404
- [x] netlify.toml (publish dir, pretty URLs, security headers)
- [x] Routes: /, /about, /contact, /services/web-design, /services/marketing, /services/workflow-automation, /work/fluid-process-uk, /work/aoe-engineering, /work/moss-and-memory, /privacy
- [x] About and Privacy placeholders in place

## 2. Design tokens
- [x] tokens.css: colour (PROVISIONAL until Canva codes arrive), type, spacing, radii, shadows
- [x] motion.js: shared GSAP eases and durations, reduced-motion handling
- [x] Chakra Petch + body font loaded

## 3. Phase 0: Architecture (no site code)
- [x] ARCHITECTURE.md written (file structure, module graph, scene graph, scroll timeline per Home scene, quality tiers, capture pipeline, CSP changes, asset list with gaps)
- [x] **Nathan approves ARCHITECTURE.md** (approved 20 Oct 2026; Nathan asked Jenny to decide D2–D8, see DOLLAR-SHOWCASE-PLAN.md section 11) (Nathan or Jenny ticks this. Until it is ticked, nothing below may start.)

## 4. Phase 1: Brand swap and shell
- [x] Confirmed brand colours in tokens.css, PROVISIONAL marks removed, AA re-checked
- [x] Header and footer use src/assets/brand/34-automation-plate.svg
- [x] Space Grotesk (display) and IBM Plex Mono (labels) self-hosted and wired in; Chakra Petch kept for the wordmark only
- [x] Three.js, GSAP ScrollTrigger and Lenis vendored with vendor/README.md
- [x] /work/ index route added to pages.json, header and footer
- [x] Smooth scroll wired, respecting reduced motion

## 5. Phase 2: 3D core (per HERO.md)
- [x] Procedural die, materials, lighting, environment
- [x] Scroll camera and Services face rolls
- [x] Quality tiers (High / Mid / Low) and no-WebGL path
- [x] Reduced-motion path with pre-rendered stills

## 6. Phase 3: Work gallery
- [ ] Capture pipeline (tools/capture) and Fluid Process UK recordings
- [ ] 3D frames with video textures, play only in view
- [ ] Plain card-list fallback with status badges

## 7. Phase 4: Services and automation graph
- [ ] Web design page
- [ ] Marketing page
- [ ] Workflow automation page
- [ ] Animated workflow graph (Home scene 4)

## 8. Phase 5: Case studies
- [ ] Case-study template
- [ ] Fluid Process UK (Live)
- [ ] AOE Engineering (In build, placeholder)
- [ ] Moss & Memory (Concept, high-res photoreal section only)

## 9. Phase 6: About, Contact, Privacy
- [ ] About structure with photo slot
- [ ] Contact form working (Netlify Forms)
- [ ] Privacy page structure (full UK GDPR text before launch)

## 10. Phase 7: Copy
- [ ] Nathan's copy dropped in, humanized and slop-gated
- [ ] Edie fact-check passed

## 11. Phase 8: Quality pass and launch
- [ ] SEO: titles, descriptions, Open Graph, sitemap, robots
- [ ] Mobile speed: main content < 2.5 s; Lighthouse targets met
- [ ] Accessibility: WCAG 2.1 AA
- [ ] Chrome, Safari, Firefox, Edge, iOS, Android
- [ ] Launch checklist complete
- [ ] Nathan's written sign-off
- [ ] Domain pointed (only after sign-off)
