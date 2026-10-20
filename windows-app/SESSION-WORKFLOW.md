# Session workflow — 0.11.0

The normal workflow is Add/Test motors → Start reading and recording → Stop. Start validates all enabled sensors before opening the recording. Stop drains queued writes before returning to idle. The primary action reflects mode and state; Start and Stop are never both visible.

## Complete controls with fewer decisions

- Default: automatic recording after successful connection, with daily CSV and NDJSON unchanged. No second recording click is needed. Legacy `manual` mode is normalized to `on-connect` for the combined user-triggered Start; explicitly selected `monitor-only` remains read-only.
- Mode: automatic, monitor-only, or scheduled. Duration is optional and shown only for recording modes. Zero means until stopped; expiry stops recording and leaves acquisition running with an explicit status. A past schedule reopens settings before connecting.
- More: recording-only stop, immediate recording start, open data folder and simulation. These preserve advanced use cases without crowding the normal toolbar.
- Status: successful row count, last completed write time, pending first sample, schedule waiting/missed, duration finished, disk error, simulation and stopped session. Verification samples older than recording start are explicitly distinguished from intentional monitor-only readings.
- Remove duplicated Add controls from overview/registry toolbars and duplicate simulation banners. Hide the empty recording strip on first launch; keep saved results after stop.

## Verification

Unit coverage includes combined default start writing real fixture CSV without calling recording.start separately, read-only mode creating no measurement files, legacy mode migration, schedule/duration boundaries, storage error/count/recovery, timestamps and file rotation. Electron coverage includes one-click active recording, one visible primary operation, advanced stop/start while acquisition remains active, read-only setting persistence, expired schedule recovery, accessible menu controls and existing charts/CRUD/responsive flows.

Hardware behavior and continuous deployment remain subject to target-PC/sensor commissioning. The sensor's internal refresh rate and RMS/Peak definition remain unverified; these workflow changes do not add diagnostic claims.

The one-time Impeccable scan reports inherited 11 px metadata and padding warnings on wrappers whose table cells/dialog children own the inset. The rendered layouts were reviewed at 960, 1366 and 1920 px; this does not establish full accessibility conformance.
