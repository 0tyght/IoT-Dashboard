# VECTRA — IoT Dashboard

Factory motor vibration dashboard. Static HTML/CSS/JavaScript, hosted on GitHub Pages.

## Run locally

Open `index.html`, or serve this folder with any static web server.

## Deployment

GitHub Pages publishes `main` from the repository root. Push changes to `main` to update the site.

## Responsive layout

- Wide desktop: plant map with side panels.
- Tablet / iPad: dedicated map, two-column information panels, landscape and portrait support.
- Narrow screens: stacked panels; the severity table scrolls horizontally rather than shrinking labels.
- Controls support touch and keyboard; the standard-details dialog scrolls independently.

## Data and standards

All 12 motors and the factory layout are simulated. Readings update every two seconds; pause with the header control. There is no sensor backend or stored production data.

The Class I–IV severity table is a legacy reference, not an approved plant alarm/trip configuration. The interface links to the ISO status and scope references. Machine specifications and measurement conditions must be verified before selecting production thresholds.
