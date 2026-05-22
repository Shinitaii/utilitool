# Mobile UI Modernization — Design Spec

**Date**: 2026-05-22  
**Status**: Approved  
**Scope**: Modernize Capacitor mobile app UI (login, home, capture readings, reading history, billings) with iOS productivity app aesthetic. Admin UI remains unchanged.

---

## Design Vision

Transform the mobile app from a 2015-era aesthetic into a clean, spacious, modern design inspired by iOS productivity apps (Reminders, Notes, Apple's task managers). Focus: **minimal chrome, generous whitespace, bold single accent color, large touch targets, soft rounded corners.**

Mobile-first modernization that establishes a reusable design system—can be adopted in admin UI later, but not required.

---

## 1. Color System

### Palette

| Element | Color | Hex | Purpose |
|---------|-------|-----|---------|
| **Background** | Off-white/Cream | `#fbf7ef` | Main surfaces, clean base (matches admin) |
| **Text Primary** | Dark Brown | `#2a251f` | Headlines, body text (matches admin ink) |
| **Text Secondary** | Medium Brown | `#5b524a` | Labels, captions, hints (matches admin ink-2) |
| **Dividers** | Light Brown | `#8a7f74` | Borders, separators (matches admin ink-3) |
| **Accent** | Warm Brown | `#8b5a3c` | Buttons, interactive, focus states (matches admin) |
| **Status Good** | Green | `#2c6b3a` | Success, confirmed (matches admin paid) |
| **Status Warning** | Warm Orange | `#8b5a3c` | Pending, caution (secondary use of accent) |
| **Status Alert** | Red-Brown | `#a23b21` | Error, overdue (matches admin overdue) |

### Why These Choices
- Warm brown palette = warm, inviting, professional (matches admin UI)
- Cream/off-white base = airy, clean feel (iOS productivity app aesthetic)
- Single accent (brown) = cohesive with admin, not overwhelming
- Brown chosen for warmth + modern appeal + excellent readability
- Status colors reuse admin's proven palette for consistency

---

## 2. Typography

| Element | Font Size | Weight | Color | Line Height |
|---------|-----------|--------|-------|-------------|
| **Page Title** | 24px | Bold (600) | gray-900 | 1.2 |
| **Section Header** | 18px | Semibold (600) | gray-900 | 1.25 |
| **Body** | 16px | Regular (400) | gray-900 | 1.5 |
| **Label** | 14px | Medium (500) | gray-700 | 1.4 |
| **Caption** | 12px | Regular (400) | gray-600 | 1.4 |
| **Button Text** | 16px | Semibold (600) | white (on teal) | 1.5 |

### Usage
- **Page titles** (Login, Home, Capture, History, Billings): 24px bold
- **Card headers** (property names, sections): 18px semibold
- **Form labels**: 14px medium
- **Helper text** (hints, status): 12px regular gray-600
- **Button labels**: 16px semibold, white text on teal background

---

## 3. Spacing & Layout

### Base Unit
Tailwind's default spacing (4px increments): `p-2` = 8px, `p-4` = 16px, `p-6` = 24px.

### Padding Standards
- **Container padding** (page level): `p-4` (16px) or `p-6` (24px)
- **Card/section padding**: `p-4` (16px)
- **Form field padding**: `px-4 py-3` (horizontal 16px, vertical 12px)
- **Button padding**: `px-4 py-3` (horizontal 16px, vertical 12px) minimum
- **Tight spacing** (between related items): `gap-2` (8px) or `gap-3` (12px)
- **Breathing room** (between sections): `gap-4` (16px) or `gap-6` (24px)

### Layout Principles
- Generous horizontal margins (not cramped)
- Vertical spacing between sections (whitespace is content)
- Cards/containers stack vertically with breathing room
- Bottom nav should have clear visual separation (border-top, lighter background)

### Safe Areas (Mobile)
Account for notches, rounded corners, bottom nav:
- Top padding after header: `pt-4` or `pt-6`
- Bottom padding before nav: `pb-20` (5rem, accounts for fixed bottom nav)

---

## 4. Components

### 4.1 Buttons

**Primary Button (CTA)**
```
Background: #8b5a3c (warm brown, matches admin accent)
Text: white, font-semibold, text-base
Padding: px-4 py-3
Border-radius: rounded-lg (0.5rem / 8px)
Width: Full (mobile context)
Min height: 48px (touch target)
Hover: slightly darker brown (darken 10%)
Disabled: opacity-50, cursor-not-allowed
```

Example: "Start Session", "Confirm & Submit", "Sign In"

**Secondary Button**
```
Background: bg-gray-100
Text: text-gray-900, font-semibold
Padding: px-4 py-3
Border-radius: rounded-lg
Width: Full or auto
Hover: bg-gray-200
```

Example: "Back", "Cancel"

**Tertiary Button (Link-style)**
```
Background: transparent
Text: text-teal-600, font-semibold
Padding: p-0
Underline: optional (show on hover)
```

Example: "Sign Out", "Need Help?"

**Icon Button**
```
Background: transparent
Size: 44px × 44px (touch target)
Icon color: gray-900 or teal-600
Border-radius: rounded-lg
```

Example: Back arrow, close (X)

---

### 4.2 Cards

```
Background: bg-white
Border: border border-gray-200
Border-radius: rounded-lg (8px)
Padding: p-4
Margin: Stacked with gap-4 or gap-6
Box-shadow: None (flat aesthetic) or shadow-sm (subtle)
```

Use for:
- Property reading cards
- Billing entries
- Session summary
- Status sections

---

### 4.3 Form Inputs

**Text Input / Number Input**
```
Background: white
Border: 1px solid #8a7f74 (light brown divider)
Border-radius: rounded-lg (8px)
Padding: px-4 py-3
Font: text-base
Focus: ring-2 ring-#8b5a3c (brown accent), outline-none
Placeholder: text-#5b524a (medium brown), opacity-70
Min height: 44px (touch target)
```

**Select / Dropdown**
```
Same as text input
Appearance: Standard HTML select or styled wrapper
```

**Date Input**
```
Same as text input
Mobile browser handles native picker
```

---

### 4.4 Headers & Sections

**Page Header**
```
Background: bg-white
Border-bottom: border border-gray-200
Padding: px-4 py-4 (or p-6)
Content:
  - Title: 24px bold
  - Optional subtitle: 14px gray-600
```

**Section Divider**
```
Subtle border: border-t border-gray-200
Spacing: my-4 or my-6
```

---

### 4.5 Bottom Navigation

```
Position: fixed bottom-0 left-0 right-0
Background: white
Border-top: 1px solid #8a7f74 (light brown)
Height: auto (accommodate icon + label)
Padding: p-3
Display: flex, justify-around
Layout: Icon + label per tab

Tab Item:
  - Inactive: text-#5b524a (medium brown), icon medium brown
  - Active: text-#8b5a3c (accent brown), icon accent brown
  - Padding: p-2 or p-3
  - Min width: 60px
```

---

### 4.6 Status Indicators

**Status Pills** (for billings)
```
Padding: px-2 py-1
Border-radius: rounded-full (8px)
Font: text-xs font-medium
Colors:
  - Pending: bg-amber-100 text-amber-800
  - Paid: bg-green-100 text-green-800
  - Overdue: bg-red-100 text-red-800
```

**Status Text** (for reading completeness)
```
Font: text-sm font-semibold
Colors:
  - Complete: text-green-600
  - Incomplete: text-gray-600
```

---

### 4.7 Photo Preview / Camera Section

**Photo Placeholder Button**
```
Border: 2px dashed #8a7f74 (light brown)
Background: #fbf7ef (cream, matches admin)
Border-radius: rounded-lg
Padding: p-6
Text: "📱 Tap to capture meter photo"
Height: aspect-video or auto
Hover: border-#8b5a3c (accent brown), bg-#f5eee5 (slightly darker cream)
```

**Photo Thumbnail** (after capture)
```
Aspect ratio: video (16:9)
Border-radius: rounded-lg
Border: border border-gray-200
Overlay button: "📷 Retake" (positioned bottom-right)
Tap to expand: Full-screen preview (see ImagePreview component)
```

---

## 5. Screen Layouts

### 5.1 Login Screen

```
Background: bg-white
Layout: Centered form card

Structure:
  - Logo / Title (24px bold, centered)
  - Form card:
    - Email field (label + input)
    - Password field (label + input)
    - Error message (if any)
    - Primary button (Sign In)
  - Optional: "Forgot password?" link (bottom, tertiary)

Spacing:
  - Container: centered, max-width 400px
  - Form fields: gap-4
  - Button: mt-6
  - Card padding: p-6
```

### 5.2 Home Screen

```
Header:
  - Title "Utilitool" (#8b5a3c warm brown)
  - Subtitle "Meter Reader"
  - Background: cream (#fbf7ef)

Content:
  - Quick action card: "📱 New Reading Session" (primary button #8b5a3c, full-width)
  - Stats section (2-column grid):
    - "Recent Readings" card
    - "Pending Billings" card
  - Sign Out button (bottom, secondary)

Spacing:
  - Section gaps: gap-6
  - Container padding: p-4
  - Bottom padding: pb-20
```

### 5.3 Capture Readings (All 3 Steps)

**Step 1: Session Setup**
```
Header:
  - Back button (←)
  - Title "New Reading Session"

Form:
  - Meter Group dropdown (label + select)
  - Reading Date picker (label + input)
  - "Start Session" button (primary, full-width)

Spacing:
  - Form gap: gap-6
  - Container padding: p-4
  - Button margin: mt-6
```

**Step 2: Property Cards**
```
Header:
  - Back button (←)
  - Title "Record Readings"

Content:
  - Scrollable property cards:
    - Property name (18px semibold)
    - Photo section (placeholder or thumbnail)
    - Reading input (label + number input)
    - Status indicator
  - Card gap: gap-4
  - Card padding: p-4

Footer (fixed):
  - "Review & Submit" button (primary, full-width)
  - Disabled state: "Complete all readings to continue"
  - Padding: p-4
```

**Step 3: Confirmation**
```
Header:
  - Back button (←)
  - Title "Review & Submit"

Summary Card:
  - Meter Group, Date, Property count, Readings recorded
  - Padding: p-4
  - Spacing: gap-2 between items

Readings List:
  - Each reading as a card: property name + amount
  - Card padding: p-3
  - Card gap: gap-2

Footer (fixed):
  - "Back" button (secondary)
  - "Confirm & Submit" button (primary, green-600 or teal-600)
  - Gap between buttons: gap-2
  - Flex layout
```

### 5.4 Reading History

```
Header:
  - Title "Reading History"

Filter Section:
  - Meter Group dropdown (sticky, below header)
  - Background: bg-white
  - Border-bottom: border-gray-200

Content:
  - Reading cards:
    - Property name + meter group (header)
    - Reading amount + date (grid, 2 columns)
    - Card padding: p-4
    - Card gap: gap-3
  - Empty state: "No readings found"

Bottom Nav: Visible
```

### 5.5 Billings

```
Header:
  - Title "Billings"

Content:
  - Billing cards:
    - Property name + status pill (top row, flex justify-between)
    - Amount display (large, teal-600 or bold)
    - Billing ID (gray text, small)
  - Card padding: p-4
  - Card gap: gap-3
  - Empty state: "No billings found"

Bottom Nav: Visible
```

---

## 6. Global Color Tokens (For Mobile)

Define these as CSS variables in mobile app (e.g., in a global styles file):

```css
:root {
  --color-accent: #8b5a3c;        /* Warm brown (matches admin) */
  --color-text-primary: #2a251f;  /* Dark brown (matches admin ink) */
  --color-text-secondary: #5b524a;/* Medium brown (matches admin ink-2) */
  --color-text-tertiary: #8a7f74; /* Light brown (matches admin ink-3) */
  --color-bg-primary: #fbf7ef;    /* Cream (matches admin paper) */
  --color-bg-secondary: #ffffff;  /* White */
  --color-border: #8a7f74;        /* Light brown (matches admin ink-3) */
  --color-status-good: #2c6b3a;   /* Green (matches admin paid) */
  --color-status-alert: #a23b21;  /* Red-brown (matches admin overdue) */
}
```

**Reusable class patterns:**

```css
/* Containers */
.container-card = p-4 bg-white rounded-lg border border-[#8a7f74]
.container-section = gap-4 mt-6

/* Buttons */
.btn-primary = px-4 py-3 bg-[#8b5a3c] text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50
.btn-secondary = px-4 py-3 bg-[#fbf7ef] text-[#2a251f] font-semibold rounded-lg hover:bg-[#f0eee5]
.btn-full = w-full (applied to buttons)

/* Forms */
.input-base = px-4 py-3 border border-[#8a7f74] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8b5a3c] text-base
.label-base = block text-sm font-medium text-[#2a251f] mb-2

/* Text */
.text-title = text-24px font-bold text-[#2a251f]
.text-section = text-18px font-semibold text-[#2a251f]
.text-body = text-16px font-normal text-[#2a251f]
.text-caption = text-12px font-normal text-[#5b524a]
```

---

## 7. Navigation

### Bottom Tab Navigation

```
Tabs: Home / History / Billings (visible on all screens except Login and CaptureReadings)

Active Tab:
  - Icon: teal-600
  - Label: teal-600
  - Underline or highlight (optional)

Inactive Tab:
  - Icon: gray-600
  - Label: gray-600

CaptureReadings flow: Full-screen, bottom nav hidden, back button in header
```

---

## 8. Accessibility & Touch Targets

- **Minimum tap target:** 44x44px (iOS standard)
- **Button heights:** Minimum 48px
- **Input heights:** Minimum 44px
- **Text contrast:** WCAG AA (4.5:1 for body, 3:1 for large text)
- **Focus states:** Ring on inputs, visible outline on buttons

---

## 9. Animation & Transitions (Optional for Phase 1)

Keep minimal. Suggested:
- Fade-in on page load (200ms)
- Button press feedback (50ms darken)
- Form validation feedback (smooth color change)
- Bottom nav active state (subtle color transition)

---

## 10. Files to Modify

**Mobile App:**
- `mobile/src/screens/Login.svelte` — Apply header, card, button styles
- `mobile/src/screens/Home.svelte` — Apply section layout, cards, bottom nav
- `mobile/src/screens/CaptureReadings.svelte` — Apply 3-step layout, photo section, buttons
- `mobile/src/screens/ReadingHistory.svelte` — Apply card list, filters
- `mobile/src/screens/Billings.svelte` — Apply card list, status pills
- `mobile/index.html` — Ensure viewport/safe-area meta tags
- `mobile/tailwind.config.ts` — Update with custom color theme (optional, can use Tailwind defaults)

**Shared Component (if shared across platforms later):**
- `ui/src/lib/components/shared/ImagePreview.svelte` — Already exists, ensure uses white background + teal accents

---

## 11. Constraints & Assumptions

| Aspect | Status |
|--------|--------|
| **Admin UI changes** | None (keep as-is) |
| **Tailwind version** | v4 (both mobile and admin) |
| **Browser support** | Modern browsers (iOS Safari, Chrome Android) |
| **Dark mode** | Out of scope |
| **Animations** | Minimal (nice-to-have, not required) |
| **Icons** | Emoji or existing Lucide icons |

---

## 12. Verification Checklist

- [ ] Login screen: Cream background, rounded inputs, brown button, centered card
- [ ] Home screen: Clean header, brown CTA button, stat cards with breathing room
- [ ] Capture Step 1: Dropdown and date input styled, brown button
- [ ] Capture Step 2: Property cards with padding, photo section, "Review" button
- [ ] Capture Step 3: Summary card, reading list, "Confirm & Submit" button (brown)
- [ ] Reading History: Card list, metric grid, no truncation
- [ ] Billings: Card list, status pills (green/red-brown), amounts visible
- [ ] Bottom nav: Clean, icons + labels, brown on active
- [ ] Touch targets: All buttons/inputs ≥ 44px
- [ ] Spacing: Generous padding, visible breathing room between sections
- [ ] Color: Consistent warm brown accent (#8b5a3c), dark brown text, cream/white backgrounds (matches admin)
