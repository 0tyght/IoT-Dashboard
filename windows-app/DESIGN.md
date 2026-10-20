# Windows monitoring interface

Scope: `windows-app/src`. The repository-root website is a separate application.

The latest user request replaces the dark/amber theme with the supplied white and violet vibration-dashboard reference (`codex-clipboard-1310d809-2def-4225-b2c6-a02d1c04b72f.png`). Keep the established acquisition and recording workflows, motor management, nine channels, timestamps and historical views. Use direct Thai product language without slogans.

## Palette and surfaces

- Workspace `#f7f8fb`; white panels and navigation; body text `#414657`, muted text `#6b7180`; thin dividers `#e5e7ef`.
- Primary action and active selection `#6252e9`, hover `#4f3dd2`; pale lavender selection `#f2f0ff`. Purple indicates action and navigation, not motor condition.
- Axis X `#007b8d`, Y `#3474bb`, Z `#6750c5`. Shared CSS variables drive numerical text, legends and plotted lines. Colors separate axes, never severity.
- Charts use grid `#e9ecf3`, readable labels `#6d7384` and cursor `#8c80ca`. Plot colors derive from theme tokens; no dark-theme paint remains in SVG attributes.
- Green communicates receiving/saving; red communicates a fault; simulation stays explicitly labelled. Pale backgrounds support those labels without coloring whole motor headers.
- Panel radius 9–10 px; light borders and a restrained offset shadow follow the supplied reference. Controls stay rectangular, with a consistent authored SVG icon vocabulary.

## Layout and interaction

- White header, command row and persistent recording strip; motor registry on the left. Active tabs use violet text and underline. The registry can collapse.
- Overview motor panels group identity/actions, status, full receive timestamp, all nine vibration values, timing and storage, and a metric-selectable plot. At 1200 px and below, values and chart stack.
- At 1750 px and above, motor details use three columns: compact measurements/connection metadata, central trend, and right-hand nine-channel table/nameplate. Intermediate widths retain the four-metric row and responsive trend/data panels.
- Segoe UI/Tahoma supports Windows and Thai. Controls and main labels 12–13 px, auxiliary metadata at least 11 px. Use tabular figures; SVG axes stay 11 rendered pixels on resize.
- Visible focus, text-labelled actions, 32 px minimum motor actions, keyboard tabs with arrows/Home/End and standard Windows inputs. Dialog motion lasts 150 ms and respects reduced motion.
- Keep acquisition and recording distinct. Recording is manual by default, optionally on connection or scheduled with a duration. Schedule requires the open app and active acquisition.
- Dynamic chart windows explain bounded live retention; history loads recorded timestamp ranges. Never label 10–5000 Hz vibration bandwidth as update rate, or infer bearing faults/ISO zones from communications status.

Validate empty, receiving, simulated, stopped, paused, fault/stale, recording, monitor-only, storage failure and maintenance states across 960×680, 1366×768 and 1920×1080. Visual reference content is style evidence; unsupported fault scores, RMS labels and thresholds in that image are not new measurements or product capabilities.
