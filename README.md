# Seaglass Save Editor — Web

A private, browser-based save editor for **Pokémon Emerald Seaglass**. The ROM and save are processed entirely on your device and are never uploaded.

## Current features

- Light and dark themes
- Auto Fills as the default tab
- Add/update any ordinary Bag item or Poké Ball to a maximum of 99
- Add 99 essentials and route all 27 Ball types between the Bag and PC
- Add 99 of each of Seaglass's 60 curated TMs and all 68 Berries, or one of each of its 35 Z-Crystals
- Set all party and boxed Pokémon IVs to 31
- Derive the current soft level cap from badge progress and raise party Pokémon to it
- Browse the full party and all 14 PC boxes with normal or shiny sprites decoded from the selected ROM
- Edit existing party and boxed Pokémon, including species, nickname, level, nature, gender, shininess, ability, held item, moves, PP, PP Ups, friendship, IVs, EVs, and contest condition
- Browse each Pokémon's moves alphabetically within Level Up, TM/HM, Move Tutor, Egg Move, and unrestricted groups
- Read each species' evolution requirements from the Seaglass ROM, flag Pokémon that meet them, and fulfill supported level, item, friendship, move, and Beauty requirements
- Choose between branching or alternate evolution routes; unsupported legacy trades and map-location methods are omitted
- Enforce legal limits: 255 Friendship, 31 per IV, 252 per EV, and 510 total EVs
- Select any empty PC box slot and create a new Pokémon with species, nickname, level, nature, gender, shininess, ability, held item, moves, PP, PP Ups, friendship, IVs, EVs, and contest condition
- Recalculate party battle stats after Pokémon or IV changes
- Validate and repair Emerald section checksums after every edit
- Remember the user-supplied Seaglass ROM in local browser storage
- Download a new edited save without overwriting the original
- Undo up to 20 Pokémon form edits or committed save transactions

## Privacy

The site has no backend, analytics, accounts, or upload API. Your `.gba`, `.sav`, and `.srm` files remain in the browser. ROM and save files are excluded from Git.

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## GitHub Pages

The included Pages workflow builds and deploys the static `dist/` output. In the repository settings, choose **GitHub Actions** as the Pages source.

Pokémon Emerald Seaglass is by Nemo622. This project is not affiliated with Nintendo or the Seaglass developers, and no ROM is included.
