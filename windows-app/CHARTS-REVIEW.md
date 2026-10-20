# Chart and interaction review — 0.10.1

## Fixed

- Removed family selectors from overview, detail and history. VemSee now shows nine vibration traces grouped by physical quantity, plus a separate temperature plot. Units are never mixed on one scale; custom sensors retain only their configured value.
- Added a shared time cursor, matching keyboard navigation and per-plot readouts. Wide layouts show 2×2 plots; narrower detail containers stack them without shrinking text.
- Broke traces when original adjacent readings are more than three requested periods apart. Gap endpoints survive display thinning. This is a missing-poll indication, not a sensor diagnosis. Backend-reduced history is labelled and does not infer gaps from decimation.
- Stopped drawing overview charts outside the viewport or while another tab is active. Acquisition, recording and cached readings continue independently. Live memory retains the existing caps.
- Kept very small custom values nonzero with scientific notation, handled negative acceleration/temperature and full-range displacement, and reserved label space for larger values.
- Cleared loaded historical curves when filters change; ignored obsolete asynchronous responses. Historical channel shape/unit comes from recordings rather than the motor's current configuration.
- Accessible plot names also follow custom units, and custom historical plots hide the XYZ legend because those axes are not measured.
- Clarified that pause affects only detail plots and preserves live numerical updates/recording. Events now show full date/time/milliseconds/timezone.

## 3D decision

Keep monitoring in 2D: time-aligned plots make exact values and changes easier to compare without rotation or occlusion. A three-axis point cloud could display register combinations but must not be presented as the motor's motion/orbit. The supplied manual does not confirm synchronous waveform or FFT output.

A waterfall can become useful with a verified frequency spectrum for each acquisition, a calibrated amplitude definition and a known sampling chain. Orbit analysis needs appropriate time/phase-related measurements. These are prerequisites, not capabilities supplied by the current Modbus registers. [NI's analysis overview](https://www.ni.com/en/shop/labview/performing-order-analysis-in-labview-with-sound-and-vibration-so.html) distinguishes waveform, spectrum, magnitude/phase and orbit/waterfall presentations.

## Next work

1. Commission the actual sensor/USB adapter on the target PC: confirm refresh period, RMS/Peak semantics, mounting/axes, calibration and recovery after long interruptions. UI fixtures cannot establish these facts.
2. Store acquisition session/configuration identifiers with readings, including unit/scale/nameplate changes. Historical periods currently can contain different configurations; select comparable sessions before adding comparisons or alarms.
3. Add recording destination selection, disk-space feedback, retention policy and CSV repair after partial writes. CSV and NDJSON remain separate append operations.
4. Make historical scans cancellable/indexed and preserve explicit missing-data metadata through reduction. Add zoom/pan and multi-motor comparison after provenance/session separation.
5. Add site-approved alarm thresholds with dwell, hysteresis and acknowledgment once measurement semantics are confirmed. Avoid bearing/shaft fault claims from overall values alone.

## Verification limits

Automated unit and Electron flows cover simultaneous plots, linked cursors, missing polls, custom units, negative/high/small values, filtering, recording and 960/1366/1920 layouts. Rendered screenshots are inspected separately. Physical readings, continuous multi-day performance and hardware commissioning remain unverified.

The one-time Impeccable detector reports inherited 11 px metadata and wrappers whose padding belongs to table cells/dialog children. These remain intentional dense Windows layouts, reviewed in rendered screenshots; this is not a claim of complete accessibility conformance.
