---
name: L'Équilibre Financier
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#474552'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#787584'
  outline-variant: '#c8c4d5'
  surface-tint: '#5a4ebb'
  primary: '#584cb9'
  on-primary: '#ffffff'
  primary-container: '#7165d3'
  on-primary-container: '#fffbff'
  inverse-primary: '#c6bfff'
  secondary: '#5d5d67'
  on-secondary: '#ffffff'
  secondary-container: '#e3e1ed'
  on-secondary-container: '#64636d'
  tertiary: '#6d43b7'
  on-tertiary: '#ffffff'
  tertiary-container: '#865dd2'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dfff'
  primary-fixed-dim: '#c6bfff'
  on-primary-fixed: '#160066'
  on-primary-fixed-variant: '#4234a2'
  secondary-fixed: '#e3e1ed'
  secondary-fixed-dim: '#c7c5d1'
  on-secondary-fixed: '#1a1b23'
  on-secondary-fixed-variant: '#46464f'
  tertiary-fixed: '#ebdcff'
  tertiary-fixed-dim: '#d3bbff'
  on-tertiary-fixed: '#260059'
  on-tertiary-fixed-variant: '#572ba0'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
---

## Brand & Style
The design system centers on high-end personal finance management, emphasizing clarity, calm, and precision. The brand personality is sophisticated and trustworthy, aiming to reduce the cognitive load of financial planning through a **Minimalist Modern** aesthetic. 

The interface leverages heavy whitespace and a refined color palette to evoke a sense of order and premium quality. It avoids unnecessary ornamentation, relying instead on purposeful typography and subtle tonal shifts to guide the user's attention. The emotional response is one of confidence and serenity—transforming complex data into a digestible, elegant experience.

## Colors
The color strategy uses a **Soft light violet** (#8B80F0) as the primary anchor, symbolizing innovation and calm within the financial space. The background is a stark, clean **#FFFFFF**, ensuring maximum legibility and a contemporary "gallery" feel.

- **Primary:** Used for main actions, active states, and brand highlights.
- **Surface/Secondary:** A very pale violet (#F5F3FF) used for container backgrounds and subtle grouping.
- **Accent/Tertiary:** A deep, sophisticated plum-tinted violet (#4C1D95) for high-contrast text or critical focal points.
- **Neutral:** Slate grays are used for secondary text and borders to maintain a professional, grounded atmosphere without competing with the violet hues.

## Typography
This design system utilizes **Inter** exclusively to lean into its systematic, utilitarian, and highly legible nature. 

- **Headlines:** Use tighter letter spacing and semi-bold weights to create a strong visual hierarchy.
- **Body:** Standardized at 16px for optimal readability in data-heavy views.
- **Labels:** Utilized for secondary data, table headers, and captions, often paired with slightly increased letter spacing for clarity at smaller sizes.
- **Scale:** Large display sizes are reserved for account balances and high-level summaries, while mobile alternatives ensure the UI remains functional on smaller screens.

## Layout & Spacing
The layout follows a **Fluid Grid** model with high-margin boundaries to maintain the minimalist aesthetic. 

- **Grid:** A 12-column grid for desktop, 8-column for tablet, and 4-column for mobile.
- **Rhythm:** An 8px base unit (linear scale) governs all padding and margins. 
- **Density:** High-end financial tools require "breathing room." Use `xl` (40px) spacing between major sections and `md` (16px) for internal component padding.
- **Alignment:** Content should be center-aligned in a max-width container (1280px) on large screens to prevent horizontal eye strain.

## Elevation & Depth
Elevation is conveyed through **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows. This maintains the "clean white" requirement while providing necessary structure.

- **Level 0 (Background):** Pure #FFFFFF.
- **Level 1 (Cards/Containers):** Use a 1px border of #E2E8F0 (Neutral-light) or a subtle background fill of #F5F3FF (Secondary).
- **Interactive Elevation:** On hover, components may utilize a very soft, diffused ambient shadow (0px 4px 20px rgba(139, 128, 240, 0.08)) to indicate interactivity without breaking the flat aesthetic.
- **Depth:** Use layering (e.g., a violet button on a white card) to denote importance rather than Z-index shadow stacking.

## Shapes
In alignment with the "L'Équilibre" (Balance) theme, the shape language uses **Rounded (8px)** corners. This radius provides a friendly, modern feel that softens the "coldness" of financial data while remaining professional enough for enterprise use.

- **Standard (8px):** Buttons, Input fields, and small Cards.
- **Large (16px):** Primary dashboard widgets and modal containers.
- **Extra Large (24px):** Large promotional banners or featured sections.
- **Pill:** Reserved specifically for status indicators (Chips) and search bars.

## Components
- **Buttons:** Primary buttons use a solid #8B80F0 fill with white text. Secondary buttons use the #F5F3FF fill with #8B80F0 text. Tertiary buttons are text-only with a medium-weight violet label.
- **Input Fields:** 1px border (#E2E8F0) with 8px corner radius. On focus, the border transitions to Primary Violet (#8B80F0) with a subtle 2px outer glow.
- **Cards:** White background with a soft 1px border. No shadow by default. Headers within cards should use `label-sm` in uppercase for a structured, organized look.
- **Chips:** Pill-shaped with a light violet background (#F5F3FF) and Primary Violet text (#8B80F0). Use these for transaction categories (e.g., "Dining," "Investment").
- **Lists:** Clean rows separated by 1px horizontal dividers (#F1F5F9). No vertical lines. Use `body-md` for primary list text and `label-md` in Neutral for metadata.
- **Data Visualizations:** Charts should utilize a monochromatic violet scale for multi-series data to maintain the sophisticated brand aesthetic, using varying opacities of the Primary color.