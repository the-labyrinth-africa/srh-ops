---
name: Industrial Integrity
colors:
  surface: '#f3faff'
  surface-dim: '#c7dde9'
  surface-bright: '#f3faff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#e6f6ff'
  surface-container: '#dbf1fe'
  surface-container-high: '#d5ecf8'
  surface-container-highest: '#cfe6f2'
  on-surface: '#071e27'
  on-surface-variant: '#40493d'
  inverse-surface: '#1e333c'
  inverse-on-surface: '#dff4ff'
  outline: '#707a6c'
  outline-variant: '#bfcaba'
  surface-tint: '#1b6d24'
  primary: '#0d631b'
  on-primary: '#ffffff'
  primary-container: '#2e7d32'
  on-primary-container: '#cbffc2'
  inverse-primary: '#88d982'
  secondary: '#405c9e'
  on-secondary: '#ffffff'
  secondary-container: '#9cb7ff'
  on-secondary-container: '#294787'
  tertiary: '#923357'
  on-tertiary: '#ffffff'
  tertiary-container: '#b14b6f'
  on-tertiary-container: '#ffedf0'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a3f69c'
  primary-fixed-dim: '#88d982'
  on-primary-fixed: '#002204'
  on-primary-fixed-variant: '#005312'
  secondary-fixed: '#dae2ff'
  secondary-fixed-dim: '#b1c5ff'
  on-secondary-fixed: '#001946'
  on-secondary-fixed-variant: '#274484'
  tertiary-fixed: '#ffd9e2'
  tertiary-fixed-dim: '#ffb1c7'
  on-tertiary-fixed: '#3f001c'
  on-tertiary-fixed-variant: '#7f2448'
  background: '#f3faff'
  on-background: '#071e27'
  surface-variant: '#cfe6f2'
  status-planned: '#546E7A'
  status-assigned: '#3949AB'
  status-on-route: '#FB8C00'
  status-in-progress: '#1976D2'
  status-completed: '#2E7D32'
  status-reported: '#1B5E20'
  status-delayed: '#E65100'
  status-cancelled: '#C62828'
  status-action-req: '#D32F2F'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.05em
  kpi-value:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 48px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter-sm: 12px
  gutter-md: 20px
  margin-mobile: 16px
  margin-desktop: 32px
  sidebar-width: 260px
---

## Brand & Style
The design system is built for the high-stakes, operational environment of oil recovery and environmental services. It projects a personality of **unfailing reliability, precision, and environmental stewardship**. The target audience ranges from logistics planners in high-density office environments to field technicians requiring rapid, clear information on mobile devices.

The visual style is **Corporate / Modern** with a focus on industrial utility. It prioritizes data density and functional clarity over decorative trends. By utilizing a "utility-first" approach, the interface ensures that safety and traceability remain the primary focus, avoiding any visual clutter that could lead to operational errors. The emotional response should be one of professional trust—users should feel they are using a tool that is as robust and dependable as the physical machinery they operate.

## Colors
The color palette is rooted in "Industrial Green," symbolizing both environmental responsibility and operational safety. This is balanced by a deep "Nautical Blue" derived from the legacy brand, providing a sense of established authority and stability. 

A sophisticated range of slate-toned neutrals is used to manage UI hierarchy and borders without the harshness of pure black. The semantic system is critical: status colors are distinct and high-contrast, designed to be instantly recognizable in lists or on maps. Each status color is paired with a specific iconography set to ensure accessibility for color-blind users and visibility in various lighting conditions (e.g., outdoor glare on mobile devices).

## Typography
This design system uses **Hanken Grotesk** for its technical precision and exceptional legibility. It is a modern sans-serif that balances the geometric nature of industrial design with humanist touches that maintain readability in dense tables.

The hierarchy is structured to support high-density data visualization. We introduce a `kpi-value` role specifically for dashboard metrics to ensure critical numbers are visible at a glance. On mobile, headlines are scaled down to preserve screen real estate, while body text remains at 14-16px to ensure touch-targets and readability are not compromised for field workers wearing gloves or operating in high-motion environments.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a base 4px/8px rhythm to ensure perfect alignment of modular components. 

- **Desktop (Back-office):** Utilizes a persistent 260px lateral sidebar for primary navigation. The content area uses a 12-column grid with 20px gutters. Information density is high, favoring "compact" views for data tables.
- **Mobile (Field App):** Shifts to a "Bottom Navigation" model to prioritize one-handed thumb access. Margins are fixed at 16px to maximize the width of action cards. 
- **Reflow Rules:** Components like KPIs and Status Badges stack vertically on mobile but align horizontally in desktop table cells. Modular "Phases" are designed to be inserted as new grid rows or sidebar modules without disrupting existing workflows.

## Elevation & Depth
In line with the industrial utility philosophy, depth is primarily conveyed through **Tonal Layers** rather than heavy shadows.

- **Surface Levels:** The background uses a very light grey (`#F5F7F8`), with cards and containers using pure white to "pop" forward.
- **Low-Contrast Outlines:** Instead of shadows, 1px solid borders in a neutral mid-grey (`#CFD8DC`) are used to define component boundaries. This ensures the UI remains crisp on low-quality industrial monitors.
- **Interactive Depth:** Only active modals and floating action buttons (FAB) on mobile utilize a subtle, low-opacity "Ambient Shadow" (10% opacity, 8px blur) to indicate they sit at the highest z-index.
- **Overlays:** Full-screen overlays for signatures or photo capture use a 60% neutral-grey backdrop to focus user attention entirely on the task at hand.

## Shapes
The shape language is **Soft (0.25rem)**, reflecting a professional and modern SaaS aesthetic while maintaining the structural rigidity expected of an industrial tool. 

- **Standard Elements:** Buttons, input fields, and status badges use the 4px (`rounded`) corner radius.
- **Containers:** Large cards and dashboard modules use 8px (`rounded-lg`) to provide a clear visual distinction between the page background and content blocks.
- **Status Badges:** Use a "semi-pill" look (8px radius) to differentiate them from square-shaped input fields or data cells, ensuring they are recognized as interactive or informative labels.

## Components
- **Buttons:** Primary buttons use the Industrial Green background with white text. Secondary buttons use the Nautical Blue outline with a 1px stroke. All buttons must have a minimum height of 48px on mobile for accessibility.
- **Status Badges:** These are the core of the system. Each badge must include a 16px icon (e.g., a truck for "On Route", a checkmark for "Completed") paired with a text label. The background is a 10% opacity tint of the status color with a 100% opacity border.
- **Cards:** Dashboard cards feature a "header-less" design for KPIs and a "titled" design for mission details. They should have no shadow but a clear 1px border.
- **Input Fields:** Use a 1px neutral border that transitions to the Primary Green on focus. Labels are always persistent (not floating) to ensure clarity during data entry.
- **Data Tables:** High-density tables use zebra-striping with a very light neutral tint. Status badges within tables are condensed to "icon-only" on small tablet screens to preserve space.
- **Tactical Signature Pad:** A specialized component for client validation; it must be full-screen on mobile with a high-contrast black "ink" on a white background.