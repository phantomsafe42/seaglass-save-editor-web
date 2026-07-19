# Seaglass Save Editor — Web

A private, browser-based save editor for **Pokémon Emerald Seaglass**. The ROM and save are processed entirely on your device and are never uploaded.

## Current features

- Light and dark themes
- Auto Fills as the default tab
- Add/update any ordinary Bag item or Poké Ball to a maximum of 99
- Add 99 essentials and route all 27 Ball types between the Bag and PC
- Set all party and boxed Pokémon IVs to 31
- Select any empty PC box slot and create a new Pokémon with species, nickname, level, nature, gender, shininess, ability, held item, moves, PP, friendship, IVs, and EVs
- Recalculate party battle stats after IV changes
- Validate and repair Emerald section checksums after every edit
- Remember the user-supplied Seaglass ROM in local browser storage
- Download a new edited save without overwriting the original

Existing Pokémon editing is being ported from the Python/PySide editor next; empty-slot creation is already available.

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
