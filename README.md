# VECTRA — Motor monitoring dashboard

Live site: https://0tyght.github.io/IoT-Dashboard/

Static HTML/CSS/JavaScript. GitHub Pages deploys `main` from the repository root.

## Features

- Interactive factory map with editable motor labels and positions.
- Complete Class I–IV reference matrix and a separate selected-motor side inspector.
- Add, edit, delete and undo the last deletion; search by ID, label, area or nameplate details.
- Nameplate fields: manufacturer, type, model, markings, stated standard, duty, insulation, IP, efficiency class, bearings, product/serial numbers, frame, ambient temperature and weight.
- Multiple electrical rating rows for voltage, connection, Hz, kW, RPM, current, power factor and efficiency.
- Map preview for positioning, keyboard-accessible coordinate inputs, confirmation before discarding edits.
- JSON export/import with validation and explicit replacement confirmation.

## Data and limitations

All vibration readings and the factory layout are simulated. Nameplate fields start blank; the supplied example plate is not assigned to real equipment automatically. Twelve demo motors appear only when there is no saved registry. An intentionally empty registry stays empty after reload.

Motor definitions are stored in localStorage (`vectra.motors.v1`) on the current browser and origin. They do not sync across devices. Clearing site storage removes these records; export a backup first. The site has no production sensor connection, server database, authentication or shared multi-user editing. Storage failures and conflicting changes from another tab are reported without silently replacing saved data.

Class I–IV is a legacy reference, not a plant-approved alarm/trip configuration. Nameplate power alone does not select a vibration standard or class. Follow the in-app standard references and verify equipment and measurement conditions before production use.

## Local preview

Serve the repository root with a static web server (for example PHP's local development server). There is no build step.

## Tests

`tests/dashboard.cjs` uses Node.js, Playwright and Node assertions. Install Playwright in a development environment and its Chromium browser, then run `node tests/dashboard.cjs` with a local server on port 8080. Set `TEST_URL` to choose a different **test** site and `CHROME_PATH` to use a local Chrome executable. Tests use isolated browser contexts and do not edit the user's saved registry.

Coverage: stable click targets across updates, full overview plus side inspector, add/edit/delete/undo, duplicate rejection, three electrical rating rows, reload persistence, empty state, invalid import, literal HTML-like labels, and desktop/tablet layouts. Screenshots are written to ignored `.artifacts/`.

When changing runtime assets, update the version query strings in `index.html` to avoid stale GitHub Pages/browser cache combinations.

See [standards and operational review](STANDARDS-REVIEW.md) for findings, corrections and commissioning requirements. Run node tests/standards.cjs for the related regression checks.

Pointer previews link a motor across the map, matrix and attention list. Keyboard and touch selection open the same side inspector. Motion respects prefers-reduced-motion. Run node tests/interaction.cjs for hover, focus, keyboard, touch and navigation regression checks.

The selected motor now occupies the right workspace column and replaces the summary card instead of floating over it. Tablet uses the same two-column workspace; narrow screens stack the panels. Map controls support zoom, background drag, and reset. Run node tests/layout.cjs for 12 viewport overlap checks and map camera regression checks.
