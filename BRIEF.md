# Dollar — Build Brief: www.34automation.com

Master copy: Claude Doc "34 Automation Website — Build Brief" (edited by Nathan or Jenny only).
This file is a read-only copy. Dollar never edits it. Last synced: 12 Oct 2026.

## The job
Dollar's only job is to build and launch www.34automation.com. No outreach, no social posts, no inbox.
- Done when: all 10 launch pages are built, copy is final and humanized, mobile speed and accessibility score well, Nathan signs off, and it is live on the domain.
- Bar: the site is the ultimate showcase. A prospect who has just received their mockup should land here and think "wow" within five seconds.
- Target: end of October 2026. Quality wins over the date, but the build must not drift.

## Positioning
34 Automation builds the work first. Other agencies charge before producing anything; 34 shows a finished design or working AI workflow before the prospect asks.
- Audience: small UK businesses that want to build trust, show the quality of what they do, and replace a dated website.
- The site is proof. Free designs only go out through proactive outreach to pre-qualified prospects. The site must never offer free builds or invite unqualified enquiries.
- CTA: conversion-focused but secondary to trust. Default "Start a conversation" → Contact (Nathan to confirm).
- The site is also the visual home for Instagram, LinkedIn and all promotional channels.

## Services (one page each)
| Service | Covers |
|---|---|
| Web design | New websites, redesigns, updates to existing sites |
| Marketing | Integrated marketing: content, social, SEO |
| Workflow automation | AI and automated workflows built into how the business runs |

## Visual direction
Cinematic 3D on a dark industrial base: the site itself proves 34 can build.
- Colour: graphite base, silver light and glow, gold sparingly for the logo and die only.
- Type: Chakra Petch for the "34 / AUTOMATION" wordmark and display headings; a clean sans for body.
- Brand source: 34 Automation brand kit in Canva. Until exact codes arrive, use provisional tokens and mark them PROVISIONAL.
- Build: hand-coded HTML, CSS, JavaScript; Three.js for 3D, GSAP for motion; Netlify hosting from this repo.
- Hero: fixed by Nathan choosing one of three hero concepts. Do not build the hero until HERO.md exists.
- Performance: lighter 3D fallback on mobile, honour prefers-reduced-motion, main content visible within 2.5 s on mobile.
- Reuse: colour, type, spacing and motion live in one tokens file so social channels share the look.

## Pages at launch (10)
| Page | Content at launch |
|---|---|
| Home | Hero stating build-first model, three services, case-study highlights, CTA |
| About (trust page) | Nathan's story and photo: structure now, story added later |
| Contact | Simple form and contact details |
| Web design | Service page |
| Marketing | Service page |
| Workflow automation | Service page |
| Case study: Fluid Process UK | Existing work + LinkedIn flip-process content; placeholder until assets land |
| Case study: AOE Engineering | Before-and-after of the site rebuild; placeholder until new AOE site is live |
| Case study: Moss & Memory | Project highlights; placeholder until gallery is unblocked |
| Privacy policy | Placeholder now, full UK GDPR policy before launch |
Blog comes after launch.

## Content rules
- Direct, human tone in Nathan's voice, UK English. All copy goes through the humanize pass before it is final.
- Name him Nathan, never Frank. Never mention Reabrook.
- No invented results, figures, client quotes or endorsements. Use a visible [PLACEHOLDER: …] until Nathan confirms.
- Nothing from old agents' workbooks or past drafts. This brief is the only source.

## Build order (do not skip ahead)
1. Repo skeleton, Netlify config, all 10 page routes incl. About and Privacy placeholders.
2. Design-tokens file: colour, type, spacing, motion.
3. Chosen hero in full 3D with mobile fallback (needs HERO.md).
4. Finish Home.
5. Three service pages.
6. Case-study template, then the three case studies with placeholders.
7. Finish About and Contact, form working.
8. SEO, speed, accessibility and cross-browser pass.
9. Launch checklist and Nathan's sign-off. Only then point the domain.

## Out of scope
Prospecting and outreach mockups; Instagram and LinkedIn posts; the blog; Photoshop asset work.
