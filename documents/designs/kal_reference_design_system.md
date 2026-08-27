# KAL e-Learning — Design System

Extracted from the user's reference UI (language-learning app, 3 screens).

## Color palette
| Token | Value | Usage |
|---|---|---|
| `background` | `#F6F4E8` | Warm cream app background |
| `card` | `#FFFFFF` | Cards, list rows |
| `primary` | `#3D7A5F` | Deep green hero cards, primary buttons, filled states |
| `primaryDark` | `#2C5E48` | Green card depth, pressed states |
| `primarySoft` | `#E3EDE4` | Sage chips, soft badges ("Continue") |
| `accent` | `#F2B84B` | Amber: floating CTA, highlights, unlocked medals |
| `accentSoft` | `#FBEFD4` | Amber-tinted soft backgrounds |
| `dark` | `#1B1A16` | Bottom pill tab bar, high-emphasis FAB icons |
| `text` | `#20211C` | Headings, primary text |
| `muted` | `#8B8B80` | Secondary text, labels |
| `correct` | `#3D7A5F` | Correct answers (green) |
| `wrong` | `#D96C5F` | Wrong answers (soft red) |
| `danger` | `#C4553F` | Destructive actions |

## Typography
- Bold, dark headings (28–32px, weight 800); small muted subtitles (13–14px).
- Numbers are hero elements: large (24–32px) in stat cards.

## Components
- **Cards**: white, radius 16–24, no borders, generous padding (16), subtle separation on cream bg.
- **Hero card**: deep green, radius 24, white text, embedded progress bar (soft track + white/amber fill), pill action button (sage or amber).
- **Bottom tab bar**: near-black pill (radius 34) docked with margin; center floating amber circular FAB (76px) raised above the pill; tabs show icon + tiny label, active = amber.
- **Stat cards**: 2×2 grid, icon in soft tinted circle, big number, muted label.
- **Progress bars**: height 6–8, rounded, soft track, green or amber fill.
- **Charts**: rounded-top bar chart, one highlighted day in amber.
- **Achievements**: icon-in-circle medals; unlocked = amber, locked = light grey; "X of Y" caption.

## Spacing & shape
- 4dp scale; screen padding 20–24; card gaps 12–16; section titles 20px bold.
- Radii: chips 20, cards 16–20, hero 24, pills 34, FAB 38.
