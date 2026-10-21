# Frequency, full-width plots and reference model — 0.12.0

## Measurement contract

The supplied SN-3001-WZ3A-N01 manual lists three Float32 frequency channels at 0021/0022H, 0023/0024H and 0025/0026H. Its supplied pages do not establish byte/word order. Read the six words using the profile's read function, retain them in NDJSON and expose them in Registers. Default to unconfirmed, with null frequency values. An explicitly chosen ABCD/CDAB/BADC/DCBA format enables conversion; validate finite values and the stated 10–5000 Hz range, with zero allowed. This validation cannot prove the format is correct.

An optional frequency read failure does not discard successful velocity, displacement, acceleration or temperature readings. Illegal-function/address responses suppress repeated frequency requests on the same client connection; transient failures retry. Display frequency quality separately. CSV v3 includes frequency values, quality, format and message. Existing v2 files are preserved. Legacy records have no invented Hz; simulation remains marked and is not saved to production history.

These are overall register readings, not sampled vibration waveforms. Frequency is not the polling period, shaft RPM or electrical supply frequency. RMS/Peak semantics, internal update interval, actual Float order and physical sensor direction remain unverified. No FFT, bearing diagnosis, ISO judgment or trip function is inferred.

## Layout and asset

Velocity, displacement and acceleration each occupy a full-width row in overview, detail and history. Temperature remains numerical. The detail context above the plots places the supplied V4 assembly beside metrics and the channel table, stacking on narrow windows. Model and plots can be expanded independently; Escape exits. The model is a reference, not a per-motor asset association or sensor-position map.

The user's self-contained WebGL2 preview and reference poster are copied into src/models; originals are unchanged. An opaque-origin sandboxed iframe has scripts but no parent-origin or application API access. Child messages are accepted only from the model frame. Camera controls, keyboard access, resize fitting, static fallback and retry are included. Assets work offline.

## Verification

- Unit fixtures cover all four Float orders, unconfirmed and invalid values, optional-read failure, shared-bus serialization, CSV v3 fields and chart data retention.
- Electron checks cover CRUD, all 12 axis values, numerical temperature, 13 register rows, three synchronized full-width plots, model camera/reset, simulated WebGL failure/retry, fullscreen/Escape and 960/1366/1920 layouts.
- Rendered captures show the actual V4 model and three equal-height fullscreen plots. Auxiliary 11 px metadata and compact table/dialog wrappers retain the existing dense Windows layout; main labels and actions remain larger. These checks do not certify full accessibility compliance.
- Physical sensor/USB-driver testing is still required on the destination computer. The preview uses explicitly simulated readings.

0.12.1 makes the plot fixture check atomic within one renderer task. In the first GitHub run, the live simulation/resize redraw could replace an injected extreme-value fixture between separate test IPC calls. The revised check retains the same gap/extreme/bounds assertions without allowing another render between injection and observation.

## Follow-up: missing Hz diagnosis

The user reports the unconfirmed-order message on their actual installation. This state is produced after a successful six-word frequency read, before conversion; it does not identify the correct order. Source changes now replace blank frequency tiles/cells with explicit unconfirmed, read-error, unsupported, invalid or missing labels; real zero remains 0.00. The connection test includes all vibration families, temperature, frequency status and six raw frequency words, and scrolls its result into view. UI fixtures verify labels, zero handling, raw diagnostics and result visibility. These source changes do not select a hardware format or claim that physical Hz has been verified. Await the actual six words and vendor/reference confirmation; no new installer is published in this diagnostic follow-up.
