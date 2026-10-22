# REC OD Certificate Pass Portal (frontend prototype)

On-Duty (OD) pass management for Rajalakshmi Engineering College: students apply with proof, faculty review and decide, administrators manage accounts and reports, and approved applications produce a printable A4 pass.

React 19 · TypeScript · Vite · Tailwind CSS 4 · React Router. Same stack as the sibling `certipass-live` app, but a separate project with its own REC purple/gold theme.

> **Prototype, not secure.** Everything runs in the browser (localStorage + IndexedDB). All people, register numbers, events and applications are fictional demo data. Nothing is sent to a real college system, no email is sent, and sign-in protects nothing. Do not enter real passwords or personal data.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

Open on `localhost` or HTTPS (password hashing uses Web Crypto).

## Demo accounts (fictional)

| Role | Username | Password |
|---|---|---|
| Student (CSE) | `aarav.k` | `Student@123` |
| Faculty (CSE) | `meera.r` | `Faculty@123` |
| Admin | `ramesh.c` | `Admin@123` |

Other seeded students use `Student@123`, faculty `Faculty@123`. Profile → "Reset demo data" restores the originals.

## How authorisation works here

The sign-in form never sends a role. `services/auth.ts` reads the role from the stored account. Every read and write in `services/odService.ts` and `services/adminService.ts` re-checks the signed-in account (students see only their own applications, faculty see their department unless granted all, only reviewers can decide, only admins manage accounts). The route guards in `layouts/RequireRole.tsx` only decide what to render. A real backend must enforce the same rules server-side.

## Notes

- **QR verification:** not rendered. It needs a backend that can verify a pass; the pass shows a labelled placeholder instead of a fake code.
- **PDF:** "Download PDF" opens the print dialog (choose *Save as PDF*). The pass prints on one white A4 page.
- **Logo:** the official REC mark (R and torch) is in `public/` (`rec-mark.png`, plus favicon and touch icon). It was cut out of the supplied 1600 px JPEG, so swap in an official vector (SVG) when the college has one. Use it through `components/Logo.tsx`; on small dark surfaces it sits on a white plate rather than being recoloured.
- **Mascot:** `public/mascot.webp` on the sign-in page was cut out of the supplied poster. On the cut-out the chest logo was replaced with the REC mark and the sleeve slogan was removed; it stops at the hoodie hem so the pocket and shoe labels from the poster are not included.
- **DADA logo:** `public/dada-logo.webp` is the supplied DADA logo cut out of its dark background (transparent), so it sits on the white dashboard banners and directly on the sign-in panel (top right) via `DadaLogo` in `components/Logo.tsx`. Only a thin anti-aliased edge is kept; the original's glow is a dark-background effect and reads as haze on white.
- **Documents:** uploads (PDF/JPG/PNG, 5 MB, up to 3) are stored in this browser's IndexedDB so reviewers on the same browser can preview them.

## Layout

`src/pages` (student, faculty, admin, shared) · `src/components` (ui kit, tables, pass, charts) · `src/services` (mock backend) · `src/data/seed.ts` (demo data) · `src/layouts` · `src/index.css` (design tokens + print rules)
