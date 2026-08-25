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
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#2a1700'
  on-tertiary-container: '#b87500'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  container-padding: 16px
  card-gap: 12px
---

## Brand & Style
The design system is engineered for a personal finance experience that prioritizes clarity, decisional confidence, and quiet authority. The brand personality is **Analytical** and **Encouraging**, moving away from passive tracking toward active financial orchestration.

The visual style is **Modern Minimalist** with a focus on high-quality data density. It utilizes a card-based architecture to compartmentalize complex financial information into digestible units. The aesthetic should evoke the precision of a high-end banking tool with the approachability of a lifestyle coach. 

**Target Emotional Response:**
- **Control:** Users feel they have a handle on their capital.
- **Optimism:** Green accents emphasize growth rather than just expenditure.
- **Security:** Deep blues and structured layouts signal institutional-grade reliability.

## Colors
This design system uses a logic-driven palette to distinguish between different financial states:

- **Primary (Bleu Nuit):** Used for core navigation, primary text, and structural elements to establish trust and professional grounding.
- **Secondary (Émeraude):** Dedicated to "Growth" indicators—savings, profits, positive balances, and successful targets.
- **Tertiary (Ambre):** Used for "Drifts" or "Behavioral Alerts"—notifying the user when spending patterns deviate from their baseline before it becomes a crisis.
- **Neutral (Ardoise):** Used for secondary information, borders, and inactive states to maintain a low-noise environment.
- **Background:** A very soft off-white (`#F8FAFC`) to reduce eye strain and provide contrast for white surface cards.

## Typography
The system exclusively uses **Inter** to ensure maximum legibility for numerical data. 

**Numerical Precision:** For currency amounts and percentages, use the `data-mono` role which leverages tabular-nums to ensure columns of figures align perfectly for easy scanning.
**Hierarchy:** Use `label-caps` for section headers (e.g., "DÉPENSES RÉCENTES") to create clear visual separation without requiring heavy borders.
**Language:** Ensure line heights are generous enough to accommodate French diacritics (é, à, ç) without clipping.

## Layout & Spacing
This design system follows an **8px grid system** (with 4px increments for tight UI elements). 

**Mobile Layout:**
- **Margins:** Use a standard 16px (`md`) margin for the main container.
- **Gaps:** Cards should have a 12px (`sm`) vertical gap to maintain a sense of distinct but related information.
- **Alignment:** Content within cards should use 16px internal padding for a professional, airy feel.

**Hierarchy of Space:** 
Use larger spacing (`xl`) to separate unrelated sections (e.g., separating the "Global Balance" from "Transaction History").

## Elevation & Depth
Depth is conveyed through a combination of **Tonal Layers** and **Ambient Shadows** to keep the interface feeling light and contemporary.

- **Level 0 (Background):** `#F8FAFC` - The canvas.
- **Level 1 (Cards):** White (`#FFFFFF`) with a very soft, diffused shadow. (Shadow: `0px 4px 12px rgba(15, 23, 42, 0.05)`).
- **Level 2 (Active/Interactive):** Used for items being dragged or primary action buttons. (Shadow: `0px 8px 20px rgba(15, 23, 42, 0.10)`).

Avoid heavy borders. Instead, use a subtle 1px stroke in `#E2E8F0` on cards only if they are placed on a white background to maintain definition.

## Shapes
The shape language is **Rounded**, striking a balance between the precision of finance and the friendliness of a personal assistant.

- **Standard Elements:** 0.5rem (8px) for buttons, input fields, and small cards.
- **Large Containers:** 1rem (16px) for main dashboard cards and bottom sheets.
- **Interactive Indicators:** Small 4px radius for progress bar fills to ensure they feel "contained" within their tracks.

## Components

### Buttons & Controls
- **Primary Action:** Solid Deep Blue (`#0F172A`) with white text. High contrast for "Decisional" actions (e.g., "Confirmer le virement").
- **Secondary Action:** Ghost style with a 1px Slate border.

### Data Indicators
- **Trend Indicators:** 
    - *Positive (Up):* Emerald Green arrow + text.
    - *Warning (Stable/Drift):* Amber arrow + text.
    - *Negative (Down - Expense context):* Slate Blue (neutral) if expected, Red if an error.
- **Progress Bars:** Use a thick 8px track in light grey with a secondary color fill (Emerald) to show goal completion.

### Specialty Components
- **Comparison Charts:** For "Base de Comportement" (Behavioral Baseline) vs "Objectif Financier" (Financial Target), use a layered bar chart. The Baseline is a semi-transparent Slate overlay, while the Target is a crisp Deep Blue outline.
- **Financial "Drift" Cards:** High-priority cards with a soft Amber border and a subtle Coral tint in the background to indicate that a specific budget category is deviating from the user's typical behavior.
- **Transaction Lists:** Clean rows with 16px padding, utilizing `data-mono` for amounts and a small circular icon category (e.g., "Alimentation", "Loisirs").