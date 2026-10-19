# Sime Darby Property — Homepage Design Specification

Reference: [simedarbyproperty.com/home](https://www.simedarbyproperty.com/home/)  
Inspected: 18 October 2026, Asia/Kuala_Lumpur  
Deliverable: an implementation guide for recreating the reference homepage.

## 1. Scope and evidence

Recreate the public homepage's visual system, section order, navigation, carousels, search entry points, responsive layouts, footer, and active campaign banner. Destination pages and search results are linked surfaces, outside this homepage specification. This document records the reference website; it does not change SimeGuardian's product requirements.

The investigation used the official [Reverse Engineer Anything / REA repository](https://github.com/morluto/rea), its `rea-agents@6.7.0` CLI, direct inspection of the delivered HTML/CSS/JavaScript, and visual inspection of downloaded hero, background, and logo images. REA's [static JavaScript workflow](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/references/javascript-applications.md) was used without registering an MCP server or changing project dependencies.

Evidence labels used below:

- **Source:** present in the downloaded HTML, stylesheet, or script. Sizes are declared CSS values, rather than measured browser geometry.
- **Asset:** visually verified in a downloaded image.
- **Recommendation:** a proposed implementation choice, including accessibility improvements.
- **Unverified:** requires a rendered browser or destination-page check. Browser access was unavailable; no desktop/mobile screenshots or live interaction tests were captured.

### Source index

| ID | Public source | What it establishes |
| --- | --- | --- |
| H | [Homepage HTML](https://www.simedarbyproperty.com/home/) | Section order, active markup, image sources, inline styles, carousel initialization, filtering |
| C | [Main stylesheet](https://www.simedarbyproperty.com/home/css/style.css?v172) | Fonts, colors, cards, accordion, masks, responsive overrides |
| S | [Hero stylesheet](https://www.simedarbyproperty.com/home/css/sliderhere.css?v172) | Hero height, text position, dots, arrows, transitions |
| N | [Shared navigation stylesheet](https://www.simedarbyproperty.com/home/css/simply.css?lastupdated=29Sep2026) | Logo, header, menus, navigation typography and mobile states |
| NC | [Additional navigation stylesheet](https://www.simedarbyproperty.com/home/css/nav.css?v172) | Navigation positioning and utility styles |
| J | [Homepage script](https://www.simedarbyproperty.com/home/js/main.js?v172) | Scroll animation, search, business selection, placeholder animation |
| M | [Menu markup and behavior](https://www.simedarbyproperty.com/home/js/menu.js?lastupdated=12Oct2026) | Desktop/mobile links, nested panels, search toggle |
| NJ | [Navigation behavior](https://www.simedarbyproperty.com/home/js/main-navbar.js?lastupdated=28July) | Navigation state handlers |
| SC | [Carousel stylesheet](https://www.simedarbyproperty.com/home/css/splide.css?v172) | Investment carousel controls |
| F | [Footer script](https://www.simedarbyproperty.com/themes/custom/bartik/menu/sdp-footer.js?lastupdated=8Oct2026) | Footer content, social links, dynamic copyright year |
| FC | [Footer stylesheet](https://www.simedarbyproperty.com/themes/custom/bartik/menu/css/sdp-footer.css?lastupdated=28Aug2026) | Footer backgrounds, type, spacing, mobile stacking |

### REA provenance

The local input contained the HTML, six stylesheets, five downloaded first-party scripts, and two inline scripts extracted into separate `.js` files. Files were parsed as inert text; website JavaScript was not executed.

| Field | Result |
| --- | --- |
| Tool | `rea-agents@6.7.0`, `analyze-javascript-application` |
| Evidence ID | `ev_7cec36843c047fde14e8c983d809c14072b057da3f7cb5184bf09c09eb6246e0` |
| Input directory SHA-256 | `c40e50ab53fd595c37d176cbaff36e90ca8c574a90ccf90783944fe692fce225` |
| Homepage HTML SHA-256 | `e2cf88658d16be22681cb496b5dc826b4e24bac90998ff51ebb01b8a36f52a5f` |
| Main stylesheet SHA-256 | `f5fd0bccd699ce38322f9d8c39c518158d394c876bdf344a31d4c17ccc9d7a80` |
| Analysis statistics | 7 JavaScript files parsed; 0 parse failures; 13,028 AST nodes visited |
| Coverage | Partial graph coverage; primitive-string budget reached; dynamic relationships remain unresolved |
| Inline handling | REA does not analyze HTML inline bodies directly; both bodies were also supplied as standalone scripts |
| Environment limitation | Node 25.9.0 completed this run but is outside REA 6.7.0's declared supported Node versions |

Downloaded inputs and the complete approximately 12.9 MB REA record are temporary working files under `/private/tmp/sime-site-evidence` and `/private/tmp/sime-rea-analysis.json`. They are not bundled with this document. The source links and hashes above identify the inspected version; future website changes can produce different results. REA's partial static graph is supporting evidence, not proof of runtime behavior or visual fidelity.

## 2. Visual direction

The page combines a corporate brand presentation with property discovery. The distinctive elements are a red/orange layered brand emblem, geometric sans-serif typography, centered uppercase red section headings, soft gray patterned backgrounds, rounded photographic surfaces, and prominent carousel treatments.

**Asset:** the first hero is a red field with overlapping orange and yellow emblem shapes rising from the lower left. It contains no photography. The main page background uses a much larger, faint version of this motif in light gray. The logo is a red rounded shield with stacked white lettering and orange/yellow layers along its right edge.

**Source:** photography appears in later hero slides, the business accordion, biodiversity feature, township cards, property launches, industrial feature, investor feature, and investment carousel. Use the actual image assets when matching the reference; their composition is a major part of the layout.

## 3. Page architecture

```text
Page
├── Preloader overlay: animated brand emblem
├── Global navigation: desktop bar / mobile menu
├── Hero: seven slides + search + pagination
├── Our Businesses: six-panel expanding image accordion
├── Sustainability: nature background + emblem-shaped image + flying elements
├── Township Developments: fan / coverflow carousel
├── New Launches: category selector + property carousel
├── Industrial: full-width image feature
├── Investor Relations: image cover + quote embed + three resource cards
├── Investment: single-image carousel
├── About Us: full-width image + heading + CTA
├── Footer: contact / social / legal
└── Fixed SJ50 campaign banner at viewport bottom
```

The main content flows vertically. The hero and selected promotional features span the viewport width; discovery sections use centered content. Source section anchors are `#business-venture`, `#sustainability`, `#township`, `#new-launch`, `#industrial`, `#investor-relation`, `#investment`, and `#about-us`. [H]

## 4. Design tokens

### Color

| Role | Source value | Application |
| --- | --- | --- |
| Section-heading red | `#ea0009` | Main uppercase headings |
| Brand/footer red | `#d71920` | Footer base; brand asset also contains related reds |
| CTA text red | `#ba0000` | White pill buttons |
| Main warm gradient | `linear-gradient(45deg, #cc0009 56%, #ff4b00, #ff7900)` | Search submit button, category-selector border |
| Emblem gradient stops | `#fcaf17`, `#f58220`, `#f15a22`, `#d71920` | Preloader SVG |
| Industrial accent | `#df6436` | 9px top border on industrial section |
| Light transition gray | `#e8e8ea` | Sustainability-to-township blend |
| Dropdown fill | `#e1e1e1` | Property category selector |
| Dropdown hover | `#bd0202` with white text | Category options |
| Dark text | `#000000`, `#231f20`, `#121212` | Titles and navigation states |
| Light text/surface | `#ffffff` | Hero copy, photo overlays, buttons, footer copy |

Several legacy green and gold variables also exist in `:root`; they are not the primary palette for this homepage. [C, H, FC]

### Typography

| Element | Family | Declared desktop size | Compact override |
| --- | --- | --- | --- |
| Main section heading | Metropolis Bold | 30px; uppercase; 1px tracking | `5.6vw` at ≤1028px |
| Body paragraph | Metropolis Regular | `1.1rem` | 15px; line-height 1.3 at ≤1028px |
| First hero headline | Metropolis Bold | 35px; uppercase | 22px at ≤1024px |
| Hero category label | Metropolis Bold | `1.7rem`; uppercase | 24px at ≤1024px |
| First hero supporting copy | Metropolis SemiBold | 16px | `3.2vw` at ≤1024px |
| Other hero supporting heading | Metropolis SemiBold | `1rem` | 14px at ≤1024px |
| Desktop navigation | Metropolis SemiBold | 14px; 0.25px tracking | Replaced by mobile menu |
| Property name | Metropolis Bold | 16px; max-width 19ch | Same base rule |
| Property township | Metropolis SemiBold | 13px | Same base rule |
| Standard white CTA | Montserrat, mapped weight 800 | 15px | Smaller horizontal padding |
| Footer labels / numbers | Montserrat | 12px / `1.35rem` | Centered stack |

Source fonts live under `https://www.simedarbyproperty.com/home/fonts/`: `Metropolis-Regular.otf`, `Metropolis-Medium.otf`, `Metropolis-SemiBold.otf`, `Metropolis-Bold.otf`, and Montserrat TTF variants. The footer also declares Montserrat WOFF/WOFF2 under `/themes/custom/bartik/menu/fonts/`. [C, S, N, FC]

**Recommendation:** preserve font metrics with these families where available. Use a sans-serif fallback and `font-display: swap`. The reference names its weight files as separate Metropolis families; a recreation may map those files to one family with explicit weights. This is an implementation choice.

### Shape, spacing, and depth

| Element | Declared treatment |
| --- | --- |
| Standard CTA | 25px radius; `10px 42px` padding; compact `6px 28px` |
| Property / township image cards | 20px radius |
| Business accordion outer frame | 32px radius; active panel around 30px |
| Hero search | 46px radius; 50px input height |
| Category selector | 30px radius; 2px gradient outline |
| Accordion | 980px maximum width; 400px height on desktop |
| Property carousel | 950px maximum width |
| Investment carousel | Maximum width `60vw` on desktop |
| Footer container | 1180px maximum width; footer padding `40px 0` |
| Navigation side padding | 64px on desktop |

The source uses Bootstrap `.container`/`.row` structure and spacing utilities such as `py-5`, `mb-4`, and `mt-5`. **Recommendation:** use 48px section padding and 16–24px component gaps as starting values, then verify rendered spacing. Keep rounded surfaces and shadows concentrated on image cards and controls. [C, H, N, FC]

## 5. Section specifications

### 5.1 Global navigation

**Desktop source layout:** logo at the left, seven primary links in the middle, search and a more-menu icon at the right. Although its wrapper is named `.center-nav`, the logo precedes the link group in the flex layout. The logo frame is 100 × 46px with 30px right margin. The main bar has a 64px minimum height and a dark-to-transparent gradient over the hero. [M, N]

Primary links, in order: About Us, Our Businesses, Investor Relations, Sustainability, SDP Capital, Campaign, Contact Us. Investor Relations points to `#investor-relation`; SDP Capital points to `/capital/`. About Us, Our Businesses, Sustainability, and Campaign have expandable navigation surfaces. [M]

Expanded navigation uses white panels, dark text, nested categories, township lists, and image-backed destinations. Residential navigation exposes townships and then individual properties; mobile navigation exposes nested screens with Back controls. A separate more-menu provides additional destinations. [M, N, NJ]

**Search source behavior:** the desktop search icon expands a search field. Escape and outside clicks close that field. Header and hero submissions trim and URL-encode nonempty input, then navigate to relative `search.html?s=<encoded-query>`; from `/home/`, that resolves to `/home/search.html`. A separate mobile search form uses `/search.html?q=...`. Preserve this distinction when documenting the original; resolve it deliberately when implementing search. [M, J]

**Mobile source layout:** a fixed logo-and-menu deck replaces desktop navigation around the 1200px media breakpoint. The mobile deck declares an 84px height. The menu includes Home, the primary categories, and partner/service marks. Opening the mobile menu locks body scroll. [N, M]

**Recommendation:** implement expandable links as buttons with `aria-expanded`; give panels explicit close behavior, keyboard navigation, Escape support, and focus restoration. Exact scroll-triggered header appearance remains unverified.

### 5.2 Hero

**Source layout:** `.sliderbanner` and its slides occupy `100vh`, with full-width, `object-fit: cover` imagery. White text sits over each slide. The first slide centers its text on desktop; later slides align text toward the left. Text has a soft dark shadow. Desktop left text uses `left: 15%` with a transform; compact layouts move it to `left: 7%`. [H, S]

| Order | Subject | Desktop asset | Mobile asset |
| --- | --- | --- | --- |
| 1 | Brand introduction | `slider/slide1.jpg?v5` | `slider/slide1m.jpg?v5` |
| 2 | Property development | `slider/slide3.jpg?v5` | `slider/slide3m.jpg?v5` |
| 3 | Industrial | `slider/slide4.jpg?v6` | `slider/slide4m.jpg?v6` |
| 4 | Retail | `slider/slide5.jpg?v3` | `slider/slide5m.jpg?v3` |
| 5 | Leisure | `slider/leisurew.jpg?v5` | `slider/leisurem.jpg?v5` |
| 6 | Investment | `slider/slide7.jpg?v4` | `slider/slide7m.jpg?v4` |
| 7 | Sustainability | `slider/slide2.jpg?v2` | `slider/slide2m.jpg?v3` |

Asset paths in this table resolve against `https://www.simedarbyproperty.com/home/`. Hero `<picture>` sources switch at 768px. The opening headline is **“A BOLD NEW ERA BEGINS”**, followed by a compact explanation of the company's business areas. [H]

**Source interaction:** Slick initialization requests looping autoplay at 4000ms, 800ms fade transitions, dots, arrows, and progressive image loading. Source settings disable pause on hover/focus. The image animation zooms from scale 1.2 to 1. White arrows sit near the left and right edges; CSS hides them at ≤1024px. Dot styles include competing circular and stick rules, so the final dot shape needs browser confirmation. [H, S]

**Search:** centered near the bottom, 5rem above the section bottom via wrapper padding; form max-width `45vw`, increasing to `90vw` in compact layout. A white rounded input contains a red-to-orange submit pill at the right. Desktop submit size is 73 × 43px; compact size is 56 × 32px. Placeholder phrases cycle every 3000ms with a 70ms typing interval. [C, J]

**Recommendation:** provide a visible search label, a carousel pause control, pause on keyboard focus, and reduced-motion support. Use `100svh` where needed to stabilize mobile viewport height. These are deliberate improvements over the source settings.

### 5.3 Our Businesses

Centered red heading and one short supporting line, followed by an expanding photographic accordion. Categories are Residential, Commercial, Industrial, Retail, Leisure, and Investment. Industrial is initially active in the delivered HTML. [H]

**Desktop:** a 400px-tall horizontal group with overlapping rounded panels. Inactive panels declare a 90px minimum width and rotated vertical white labels. The active panel grows, reveals its title and short description over a bottom black gradient, and hides its vertical label. Small red previous/next arrows sit outside the group. Images come from `ast-residential.jpg`, `ast-commercial.jpg`, `ast-industrial.jpg`, `ast-retail-m.jpg`, `ast-leisure.jpg`, and `ast-investment.jpg`. [C]

**Source behavior:** hover activates a panel after 400ms; click also activates it. Previous/next buttons wrap across panels. Desktop clicks attempt a 600ms scroll to the panel's target. Residential and Commercial also set the corresponding New Launches filter. On compact layouts, the accordion becomes a vertical stack of 65px closed rows, with the active panel around `35ch` tall and a visible Learn More CTA. Accordion arrows disappear. [J, C]

**Source caveats:** Retail and Leisure target `#retail` and `#leisure`, which do not exist in the captured homepage. The compact stylesheet hides the fifth panel, Leisure. These are observed source quirks. **Recommendation:** keep all six categories available and route unresolved categories to confirmed destinations; do not invent destination URLs.

### 5.4 Sustainability

Centered heading, one short biodiversity line, white pill CTA to `/sustainability/`, and a prominent nature image clipped to the brand-emblem silhouette. The desktop masked image declares 560 × 452px; its alpha mask is `images/shape-sdp.png`, with the image `images/img-fly.jpg`. The section background is `images/sus-bg.jpg`, blending into `#e8e8ea` toward the bottom. [H, C]

Three animated decorative assets—`element-butterfly.gif`, `element-butterfly-2.gif`, and `element-fly.gif`—float around the main composition. Source animation brings the masked image from blurred, rotated, scale-0.8 opacity-zero to clear, upright, full scale over 2 seconds. Decorative elements enter over 1.8 seconds and continue a gentle 10px vertical float. [J]

**Recommendation:** retain this distinctive mask and surrounding whitespace. Treat flying elements as decorative with empty alternative text. Ensure the image is visible when animation is disabled or JavaScript fails.

### 5.5 Township Developments

Centered red heading and short community-oriented subtitle above a horizontally overflowing fan of township photographs. Cards declare 180 × 220px, 20px corners, dark bottom overlays, white names, and small white CTAs. Gradient fades at both edges blend the carousel into the light gray section. [H, C]

Source order: City of Elmina, KL East, Melawati, KLGCC Resort, Bandar Bukit Raja, Upcoming Precinct, Serenia City, Bandar University Pagoh, Nilai Impian, Planter's Haven, Bandar Ainsdale, Ara Damansara, Subang Jaya City Centre, Putra Heights. Labels are a snapshot; the source varies some spelling between this section and navigation. [H]

**Source behavior:** centered, looping Swiper coverflow with autoplay every 5000ms, rotation 80, stretch −50, depth −280, modifier 0.3, scale 1.4, and no slide shadows. Cards have hover enlargement and image zoom. Pagination is hidden by CSS; previous/next controls use custom red arrows. [H]

**Recommendation:** preserve the fan composition on desktop, allow touch swiping on mobile, and make the destination usable without hover. Final transform geometry and the interaction between inline hover transforms and Swiper require rendered verification.

### 5.6 New Launches

Centered heading, short introductory line, a compact category selector, then a property carousel. Options are All, Residential, Commercial, and Industrial. The selector is 200px wide inside a 220px wrapper, with a light gray fill, 30px corners, a 2px warm-gradient outline, and a chevron that rotates when open. The white options panel has 8px corners and red hover rows. [H]

Each card contains a rounded property photograph, property name below, township below the name, and optional photo overlays for tenure, launch status, size, or rooms. Desktop image height is 278px. A black-to-transparent detail overlay fades in over 0.4 seconds on hover. Property names use 16px bold text; township labels use 13px text. [C]

The captured markup contains 26 launch cards. Representative entries include AURA, Masterpiece Plus Collection, Prestige Collection 1, Avira Hills 2, Seroja Gardens, Ara Bloc, and SJCC East One. Category is card data; AURA is commercial and Masterpiece Plus Collection is industrial. Use actual data attributes when reproducing filtering. [H]

**Source behavior:** selecting a category rebuilds slides and reinitializes Swiper. All excludes an `extracard` placeholder. Navigation/pagination are hidden when the filtered count is three or fewer. Autoplay is commented out. Swiper requests three visible slides at ≥1024px, two at ≥768px, and one at ≥320px; the desktop stylesheet also requests staggered overlapping transforms at ≥1028px. Some effect values are inconsistent, so the final arrangement remains unverified. [H, C]

**Compact layout:** image height becomes `72vw`, slide padding becomes `0 4ch`, and arrows become 30px controls. **Recommendation:** show essential details on touch and keyboard focus, preserve a useful empty state, and adjust control visibility to the actual number of visible cards. Keep full card links rather than creating separate competing click targets.

### 5.7 Industrial feature

Full-width photographic section with a 9px orange top border, a large white uppercase headline, supporting copy with orange emphasis, and a white CTA to `/industrial/`. Desktop image: `images/ass33-2.jpg?v4`; mobile image: `images/ind-mob.jpg`. The image switches through Bootstrap's `md` display classes. [H, C]

Desktop text overlays the image; compact rules center text near the top and use a black section base. Supporting copy becomes 15px with a maximum width around 32ch. Orange text emphasis animates on scroll. [C, J]

### 5.8 Investor Relations

An image-backed cover (`images/ir-cover.jpg`) carries a white heading, a white CTA to `/investor-relations/`, and an embedded stock-quote surface. A curved image divider (`images/curve.png`) transitions toward the section below. [H, C]

Quote source: [listed-company integration](https://simedarbyproperty.listedcompany.com/includes/integration_stock_quotes.html). The iframe declares full width, no border, and rounded corners; compact rules set a `61ch` height and 40px radius. Its live content was not inspected. Old hard-coded quote markup is commented out and should not be treated as current data. [H, C]

Three resource cards provide Share Price Performance, Bursa Announcements, and Latest Quarterly Results. They use red/orange image surfaces (`red-1.png`, `red-3.png`, `red-2.png`), centered white headings, and a small arrow. Desktop requests a three-card layout; compact presentation uses a centered carousel. Hover lifts cards by 10px. [H, C]

**Recommendation:** keep quotes configurable and give the embed a loading/error state and accessible title. A static recreation may use clearly labeled sample data. Do not present captured or invented quotes as current.

### 5.9 Investment

Centered red heading and white CTA to `/capital/`, followed by a single-image carousel with 20px corners. Its desktop frame is at most `60vw`; image height is `57vh` with `object-fit: cover`. Compact width becomes 100%, with image height `32ch`. White asset names sit near the photograph's upper right with text shadow. [H, C]

Seven source slides: KL East Mall, Elmina Lakeside Mall, KLGCC Mall, Oasis Block G & F, Metrohub 1, Metrohub 2, and Regen Rehab. The first three have mall destinations; the last four use `href="#"` placeholders in the captured markup. [H]

**Source behavior:** Splide loop, one slide per view/move, 1000ms transition, arrows and pagination, autoplay disabled. **Recommendation:** retain inactive captions for items without confirmed destinations rather than opening a blank fragment in another tab.

### 5.10 About Us

A full-width image section closes the editorial content. Desktop asset is `images/aboutimg2.png`; mobile uses the CDN asset listed below. Heading and white CTA sit over the upper portion; the CTA points to `/who-we-are/about-us`. Compact rules move the text block into normal flow with a negative bottom margin to overlap the image. [H, C]

### 5.11 Footer and campaign banner

**Footer:** red `#d71920` base with a decorative background, white text, 1180px maximum content width, and 40px vertical padding. Desktop has three contact/social groups, a thin divider, and a bottom legal/copyright row. Compact layouts stack and center the groups and hide the divider. [F, FC]

Content includes toll-free and international phone links, business hours, four social icons, and links for Sitemap, Privacy Notice, Scam Notice, Terms of Use, and Help & Support. The copyright year is generated from the current date. Social icons are 35 × 35px. Footer decoration switches from `footer-w.png?v3` to `footer-m.png?v2`. [F, FC]

**Active campaign:** a full-width SJ50 image banner is fixed to the viewport bottom at z-index 9998, linking to `/sj50/`. It has desktop/mobile art direction at 768px. A 64px spacer follows the page content; banner image height itself is automatic. [H]

The back-to-top element is commented out, despite related CSS/JavaScript remaining in the source. Other seasonal popup/banner code is also commented out or explicitly hidden. Do not add those controls when reproducing this captured version. **Recommendation:** size campaign clearance from the rendered banner height so the footer and focused controls remain reachable.

## 6. Responsive behavior

The reference uses several different breakpoints. Preserve their observed roles before simplifying them.

| Breakpoint | Source changes |
| --- | --- |
| Around 1200px | Desktop navigation gives way to mobile navigation/menu |
| ≤1028px | Business accordion becomes vertical; body becomes 15px; headings use 5.6vw; content/card sizing changes |
| ≥1028px | Desktop stagger/overlap rules apply to property cards |
| ≤1024px | Hero arrows hidden; hero type/position changes; footer stacks |
| ≥1024px | Property carousel requests three visible slides; investor carousel requests three cards |
| ≥768px | Property carousel requests two visible slides until the larger breakpoint |
| ≤768px | Mobile hero and campaign image sources selected |
| Below Bootstrap `md` | Industrial/About Us mobile image variants selected |

**Recommendation:** validate at 1440 × 900, 1280 × 800, 1024 × 768, 768 × 1024, and 390 × 844. Inspect boundary widths around 1200, 1028, 1024, and 768px. The overlap between media rules and carousel settings is a known area requiring runtime checks. Keep a 16–24px minimum mobile gutter and prevent decorative transforms from creating horizontal page scrolling.

## 7. Motion and state reference

| Surface | Source declaration | Recreation requirement |
| --- | --- | --- |
| Preloader | Fixed white overlay; animated SVG emblem; body scroll locked until hero initialization | Release scroll and show content even if animation fails |
| Hero | 4s autoplay; 800ms fade; zoom-out image entrance | Seven selectable slides, active indicator, pause/reduced-motion controls |
| Section entrances | AOS initialized with 1200ms duration | Content must remain available with motion disabled |
| Business panels | 400ms hover delay; active/inactive panel states; wrapped arrows | Equivalent click, touch, and keyboard access |
| Business navigation | 600ms animated scroll to existing target | Account for fixed header; respect reduced motion |
| Sustainability | Masked-image reveal, decorative fly-in and float | Static composed fallback |
| Townships | 5s autoplay; coverflow; hover zoom | Touch navigation and usable links at rest |
| Property cards | Hover overlay with 0.4s opacity transition | Details on focus and touch |
| Category selector | Closed/open; chevron rotation; selected option | Keyboard-operable selection and dismissal |
| Investor resources | 10px hover lift | Focus treatment without layout shift |
| Investment carousel | Manual looping; 1000ms slide transition | Previous/next and direct selection |

Source motion settings are descriptive. Pause, focus, fallback, and reduced-motion requirements above are implementation recommendations.

## 8. Asset map

Resolve all `/home/` paths below against `https://www.simedarbyproperty.com`. Preserve aspect ratio, crop intentionally with `object-fit`, and use desktop/mobile pairs where supplied. URLs identify the original assets; bulk media downloading is outside this deliverable.

| Role | Asset path / URL |
| --- | --- |
| Logo | `/home/images/sdp-logo-coloured.png?v2` |
| Main background | `/home/images/body-bg-2.jpg` |
| Hero assets | Seven desktop/mobile pairs in §5.2 |
| Business images | `/home/images/ast-residential.jpg?v2`, `ast-commercial.jpg?v2`, `ast-industrial.jpg?v2`, `ast-retail-m.jpg?v2`, `ast-leisure.jpg?v2`, `ast-investment.jpg?v3` in the same directory |
| Compact commercial image | `/home/images/ast-comm-mob.jpg?V2` |
| Sustainability background / image / mask | `/home/images/sus-bg.jpg`, `/home/images/img-fly.jpg`, `/home/images/shape-sdp.png` |
| Flying decoration | `/home/images/element-butterfly.gif`, `element-butterfly-2.gif`, `element-fly.gif` in the same directory |
| Township examples | `/home/images/ts-coe.jpg?v2`, `/home/images/ts-kleast.jpg`, `/home/images/ts-new.jpg`, `/home/images/BBR-view.jpg` |
| Hero arrows | `/home/images/white-next.svg` (previous is mirrored) |
| Business arrows | `/home/images/red-prev.svg?v2`, `/home/images/red-next.svg?v2` |
| Township arrows | `/home/images/arrowprev.svg?V2`, `/home/images/arrownext.svg?V2` |
| Property arrows | `/home/images/fornext.svg?V2` (previous is rotated) |
| Search icon | `/home/images/search-icon-lite.svg` |
| Industrial pair | `/home/images/ass33-2.jpg?v4`, `/home/images/ind-mob.jpg` |
| Investor cover / curve | `/home/images/ir-cover.jpg`, `/home/images/curve.png` |
| Investor cards / arrow | `/home/images/red-1.png`, `/home/images/red-3.png`, `/home/images/red-2.png`, `/home/images/next-box.png` |
| Investment images | `/home/images/ast-6.jpg?v3`, then `ast1.jpg?v2`, `ast3.jpg?v2`, `ast4.jpg?v2`, `ast5.jpg?v2`, `ast6.jpg?v2`, `ast7.jpg?v2` in the same directory |
| Desktop About Us | `/home/images/aboutimg2.png` |
| Mobile About Us | `https://imagedelivery.net/TdjZsXzzZt_je48pBzV3SA/62f57253-1a15-449a-97f5-e7f691741600/1200` |
| Footer background pair | `/themes/custom/bartik/menu/img/footer-w.png?v3`, `/themes/custom/bartik/menu/img/footer-m.png?v2` |
| Footer social icons | `/themes/custom/bartik/menu/img/footer-fb.svg?v3`, `footer-insta.svg?v3`, `footer-tiktok.svg?v3`, `footer-youtube.svg?v3` in the same directory |
| Desktop SJ50 banner | `https://imagedelivery.net/TdjZsXzzZt_je48pBzV3SA/dc667b7e-4a4d-4100-5400-966d44961200/1920` |
| Mobile SJ50 banner | `https://imagedelivery.net/TdjZsXzzZt_je48pBzV3SA/da002cc0-7a1e-4c25-c6e9-b60599376a00/w=1200` |
| Example launch image: AURA | `https://imagedelivery.net/TdjZsXzzZt_je48pBzV3SA/41bfe3c2-0a04-4885-c965-b015f20f2200/800` |

## 9. Implementation handoff

Use the existing application's framework and components. The original loads Bootstrap, jQuery, Slick, Swiper, Splide, AOS, and GSAP; those are evidence about the delivered implementation, not mandatory dependencies for a recreation. Avoid introducing several slider libraries for the same interaction.

Suggested component boundaries are the ten visible page sections, a shared header/footer, a shared pill CTA, and the recurring image-card treatment. Keep changing content in simple arrays: hero `{ desktopImage, mobileImage, heading, description }`, business `{ name, image, target, category }`, township `{ name, image, href }`, launch `{ name, township, category, image, href, details }`, and investment `{ name, image, href }`. Use one selected category and one active index per carousel.

Build in this order:

1. Match fonts, palette, brand imagery, section widths, and vertical order.
2. Match desktop hero, header, accordion, and image crops.
3. Add compact navigation, image variants, and stacked layouts.
4. Add carousel controls, filtering, search navigation, and focus states.
5. Add motion after the static content works; keep campaign content and quote data replaceable.

For a SimeGuardian interface, these visual tokens may be reused while its workflows continue to come from [the product requirements](REQUIREMENTS.md). Applying this design to the application itself is a separate implementation task.

## 10. Verification checklist and remaining gaps

Completed for this specification:

- [x] Inspected active HTML, primary/shared stylesheets, first-party behavior, and injected header/footer sources.
- [x] Ran the official REA static analyzer and recorded its identity, statistics, and partial-coverage limitations.
- [x] Visually inspected the opening hero asset, main gray background asset, and colored logo asset.
- [x] Recorded section order, core design values, responsive declarations, asset locations, and interaction settings.
- [x] Distinguished active SJ50 banner markup from commented-out seasonal and back-to-top code.

Required when implementing the website:

- [ ] Compare rendered desktop/mobile screenshots with the live reference after fonts and images load.
- [ ] Verify final CSS cascade, hero dot appearance, carousel transforms, header scroll states, and mobile image crops.
- [ ] Exercise every carousel, category filter, search form, nested menu, and confirmed destination link.
- [ ] Check keyboard order, visible focus, menu dismissal, carousel pause, reduced motion, and touch access to card details.
- [ ] Ensure fixed navigation and the campaign banner do not cover focused elements or footer content.
- [ ] Verify stock-embed loading/failure states and external destination availability.

The specification is based on public source declarations and selected image inspection. Pixel-level similarity, live behavior, destination pages, and the remaining media assets have not been visually validated. Campaigns, properties, links, and live quote content can change after the inspection date.
