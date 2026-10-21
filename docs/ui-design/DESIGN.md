# Design System: EquiFlow — Reference-led Stitch V2

Status: Ready for Review, 2026-09-27. This is a design specification, not evidence of screens generated on Stitch.

## 1. Visual Theme & Atmosphere

Recreate the light, restrained equestrian management interface in the three supplied reference boards. White surfaces, pale neutral canvas, forest-green controls, thin borders, compact legible tables, generous but practical spacing. Density 6/10, variance 3/10, motion 2/10. This is daily operational software for five roles. Vietnamese is the primary interface language. Do not turn it into a luxury marketing website, dark trading dashboard or sports-center membership product.

Reference priority: explicit user corrections > supplied image boards > SRS/blueprint business rules > this design system > generic taste defaults. The old dark/gold Stitch prompts are superseded. Preserve the reference brand wordmark as a supplied asset if available; use a plain EquiFlow wordmark until an isolated logo asset is supplied. Do not invent a new logo.

## 2. Color Palette & Roles

| Token | Value | Function |
|---|---|---|
| Canvas | #F5F6F3 | Application background |
| Surface | #FFFFFF | Forms, table and workspace surfaces |
| Forest | #315D4B | Single brand accent: primary buttons, selected navigation, links |
| Forest deep | #234437 | Hover state and brand text |
| Forest wash | #EAF1EC | Selected rows, restrained secondary emphasis |
| Ink | #202B28 | Main text |
| Muted | #65716B | Supporting text |
| Border | #DCE3DD | 1px separators and field edges |
| Positive | #276442 / #E8F3EB | Label “Đủ điều kiện” plus check icon |
| Warning | #875B15 / #FFF4DD | Label “Cần theo dõi” plus warning icon |
| Critical | #922D3C / #FAE9EB | Medical Lock, injury and destructive confirmation |
| Quarantine | #65517D / #F1EDF6 | Label “Cách ly” plus isolation icon |

Semantic status colors are not additional decorative accents. Quarantine purple follows FR-008; never use it for gradients, glow or general buttons. Never rely on color alone. Validate text contrast before design acceptance.

## 3. Typography Rules

UI: Manrope, fallback Segoe UI/sans-serif; preserve Vietnamese diacritics. Manrope follows the existing reference direction; it overrides generic skill font recommendations. Numeric data: tabular numerals, optional DM Sans. Brand wordmark may preserve its supplied lettering; all software headings and body text use sans-serif.

Page title 28/36px, weight 700; section 18/26px, 650; body 14–16/22–24px; labels 14/20px, 600; metadata 12/18px, never essential instructions at this size. Auth heading 32/40px. Avoid all-uppercase long Vietnamese sentences. Auth instructions max 55ch, reports max 70ch.

## 4. Component Stylings

- Primary buttons: forest fill, white text, radius 7px, height 44px, 16px horizontal padding. One primary action per local task. Secondary outlined; destructive burgundy only for medical/security actions.
- Inputs: visible label above, 44px height, radius 6px, helper/error below. Required marker explained. Focus ring clearly visible. Do not use placeholder as label. Password reveal has an accessible name.
- Panels: radius 10px, border 1px; shadow only for auth container, menus and dialogs. No large floating glass cards.
- Tables: clear header, 56px rows, alternating hover rather than heavy striping; one row action menu; filter result count and pagination. Keep units with numeric column headers.
- Badges: text + icon; health status and lifecycle status are separate fields. Medical Lock is a separate restriction, not a synonym for every injury or lifecycle status.
- Dialogs: title, short consequence, editable required reason when relevant, cancel and confirm. Focus contained, Escape/cancel supported, return focus after close. Saving failure preserves input.
- Skeletons fit final layout; empty state explains next action based on role. Loading, empty, validation, network failure, forbidden and success are specified for each screen.
- Charts: label units and dates; no invented trend, financial value, AI risk percentage or health score. Design-only rows, if necessary, are visibly marked “Dữ liệu minh họa”. Prefer honest empty states without sample business records.

## 5. Layout Principles

Desktop artboard 1440×1000 (extend vertically when content requires it). Sidebar 224px, top bar 64px, main padding 28–32px, gap 20–24px, content max width 1400px. Sidebar is white with forest-tinted active item, not a dark rail. Use one consistent shell across role portals; navigation items follow the role matrix.

Auth: isolated split layout, 44% form / 56% equestrian visual region, no authenticated sidebar. Form max width 400px. The horse image must be a supplied/licensed asset; never crop a full reference board and present its embedded UI as a new screen. If no isolated horse photo is available, use a neutral editorial brand panel until asset selection. Login and registration are separate screens, not a form with mixed actions.

Medical record: selected horse and restriction banner at top. Main area 62% anatomy / 38% clinical details. The supplied anatomy image keeps its 900:600 aspect ratio with object-fit contain. Pins are intentional overlays on the image content, never on the letterbox or labels. No overlapping text or panels. Layout overlay exception is limited to annotation markers.

Desktop website only: verify at 1280, 1440 and 1920px. Preserve readable tables, visible controls and stable anatomy marker coordinates when resizing a desktop browser. No mobile/tablet deliverable.

## 6. Motion & Interaction

Operational calm: 120–180ms opacity/transform feedback, no perpetual decorative motion or stagger delaying urgent information. Skeleton shimmer only while loading; disable animation for reduced-motion. Medical restrictions appear immediately. Avoid glows, background video, particle effects and 3D orbit controls. These task-oriented rules intentionally override the skill's perpetual-motion defaults.

## 7. Anti-Patterns (Banned)

No pedigree tree, pedigree tab, ancestor fields or pedigree export. No video player, video upload, video library or play button. No 3D anatomy, fabricated muscle layer, front/rear view selector without matching supplied assets. No dark/gold theme, neon, glassmorphism, gradient text, generic three-card marketing rows, emoji icons, fake AI certainty, role picker at login, or public selection of staff privileges. Do not include a sixth Jockey login role; the SRS has five roles and jockey assignment is a personnel record.

## 8. Exact anatomy asset

Use `assets/so-do-giai-phau.png`, a byte-for-byte copy of `../images/sơ đồ giải phẫu.png` relative to the parent ui-design directory. Display title “Sơ đồ giải phẫu 2D — hệ xương”. Keep labels and background as supplied; do not redraw, remove background or invent medical details. The checker pattern is visibly present in the supplied image; do not claim it has been made transparent.

Only the supplied side view is available. Select body region AND anatomical side in text fields; do not infer left/right from the drawing. Store proposed normalized marker coordinates relative to the image itself, with an asset version and body-region identifier. Markers must survive resizing and keyboard users must select a region from a list. Exact persistence schema is a future implementation decision.
