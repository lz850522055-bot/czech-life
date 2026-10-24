# Getting started

## First boot

Node.js 24+ (built-in SQLite), Git and `tar`. Clone, `npm run assets:fetch`, then `npm start`. Default port is 8766; set `CZ_PORT` to use another free port. Do not stop unrelated apps to claim a port.

The setup token is printed in your terminal and stored in `data/first-run-token.txt` until an account is created. Open `/`, create an account with your own password, then open `/game/?district=small-town`. The UI is Chinese; learning content is Czech with Chinese guidance. Start with sounds, not a randomly chosen C2 lesson. Browser autoplay needs a click/tap.

## Assets

`npm run assets:fetch` downloads the pinned v0.1.0-alpha Release archive, verifies SHA-256, validates tar entries and extracts the listed files. It never installs a user DB/config. `npm run assets:verify` checks installed files. For an existing archive: `node scripts/fetch-assets.mjs --archive /path/to/runtime-assets.tar.gz`.

The optional `source-geography.tar.gz` Release archive contains raw geography for contributors, not needed for play. Check its published manifest hash before extracting at the repo root. Keep OSM/IPR attribution and licensing.

## Progress and phones

Progress is server-side SQLite in `data/`; recordings are in `uploads/`. Private data/config/cache/logs are ignored by Git. Back up privately before changing an existing installation. This public app creates its own account and never imports the author's learner data.

The server listens on loopback. For a phone, independently configure an HTTPS tunnel and set `publicOrigin` in `app/config.local.json` to that exact origin; restart. Both devices must reach the same running server/account. Separate installations do not sync. No tunnel is installed or enabled here. Microphone features require a secure browser context.

## Troubleshooting

- Missing art/audio: run `npm run assets:verify` and install the matching asset pack.
- Port occupied: set `CZ_PORT`, leave other apps running.
- Blank WebGL: check browser GPU support/console and report route, device and browser.
- Stutter: known alpha issue. Include frame-time evidence when possible.
- Old UI: reload once and report build/URL and service-worker behavior. Do not wipe learner data as a first step.

## Development

`npm test`: asset-free regression suite. `npm run test:all`: adds binary audio/art checks, requires assets. `npm run test:smoke`: isolated account/server checks, never uses a real learner DB.

Renderer code is already vendored with notices. Rebuild tooling: `npm ci --prefix tools/game-renderer`, then the relevant `scripts/build-*.mjs`. Historical content authoring scripts may need named upstream data, Python audio tools or source art; normal play does not run them. Keep immutable tile IDs and update manifests for new art.
