# UX/UI review — 25 October 2026

Overall-trend FFT now appears as a third saved-data graph mode alongside XYZ scatter and time plots. It loads unreduced records, exposes metric/axis and continuous-segment selection, labels time interpolation and receive cadence, and clears prior results on invalid data or a changed filter. Default 2D plots use the remaining workspace; 3D time-frequency plots are a separate display toggle so a compact desktop does not squeeze all plots into unreadable strips. Waveform input state remains isolated. `trend-ui.cjs` verifies known slow-cycle frequency, strict-jitter rejection/recovery, units/axes, fullscreen source labels and narrow layouts. The underlying sensor's waveform capability has not changed.

Finish review: the existing Operate interface and white/violet palette are retained. The rendered 1366×768 view fits the two readable trend/FFT plots without workspace scrolling; narrow layouts retain full content width and allow vertical scrolling. The mechanical detector returned no findings. All seven packaged desktop suites passed, including waveform/trend state isolation and clock-rollback preservation in storage tests. This remains local recorded-data analysis, not a waveform-capability or field-calibration claim.

Current scope: refine the existing white/violet Windows interface, consolidate historical graphs and waveform analysis, and make navigation/layout behavior consistent across pages. Product copy describes the task and measured source directly; it does not use slogans or imply unverified diagnostics.

| Finding | Change |
| --- | --- |
| Historical charts were mixed with the export table, while FFT lived on a separate analysis surface. | One Analysis page with **ค่าที่บันทึก · XYZ** and **คลื่นดิบ · FFT** source tabs. History contains the table/export/run-folder tasks and an open-analysis action. |
| The former history surface connected categorical axis channels and could be mistaken for spatial distribution or a spectrum. | Saved data defaults to a 3D scatter: one complete record's X/Y/Z values form one point, with velocity/displacement/acceleration as the chosen metric. Time is encoded separately. No surface, orbit or FFT is inferred from those overall values. |
| A scatter made from the time-chart extrema reducer would exaggerate rare extremes and misrepresent record concentration. | A separate backend `scatterRange` filters motor/time/run/recorded series before seeded uniform reservoir sampling of complete XYZ records. The UI requests at most 1,200 points and labels the sample, full counts, incomplete records and corrupt/skipped lines. It makes no exact density or histogram claim. |
| Counting and sampling a live journal in separate passes could see different appends. | Capture eligible filenames and byte lengths once; both passes read the same bounded append-only prefixes. This does not turn multiple files into a filesystem transaction. |
| Different filter controls could retain an earlier date's rows or allow an earlier request to repaint the page. | Shared motor/run selection, calendar-date synchronization, request-generation invalidation, loading placeholders and cleared error states. Time plots remain available for chronology and custom single-register data. |
| Only the monitor automatically reclaimed the registry width on narrow screens. Other pages lost about 190 px at 768 px width. | A shared drawer below 1180 px on every page: search focus, labelled modal semantics, inert background, keyboard focus containment, close action, Escape and backdrop dismissal. Motor selection closes it, and desktop collapse preference survives breakpoint changes. |
| Empty/missing XYZ data could leave an invalid selected-point readout. | Empty/custom/incomplete states are explicit, with no invented zero coordinates or stale selected timestamp. |
| A colored 3D surface can blur the distinction between overall readings and actual spectral analysis. | Preserve waveform validation and source labels in the FFT panel and fullscreen. A spectral Surface/Waterfall uses frequency × elapsed waveform time × amplitude/PSD; the overall scatter uses the selected metric's X/Y/Z values. |

Validation uses isolated fixtures, simulated serial responses and local temporary history journals. The all-page layout suite checks **eight pages** at **768×1024, 960×680, 1366×768 and 1920×1080**, including keyboard tabs, full-width narrow content, modal drawer focus, Escape, backdrop dismissal, motor selection and desktop collapse restoration. The existing monitor regression checks seven sizes: 960×680, 1366×700, 1366×768, 1280×650, 1920×1080, 1024×768 and 768×1024. Scatter checks cover complete records, missing channels, custom fallback, strict grouping and bounded sampling; raw FFT retains its separate numerical and UI checks.

These checks are software regression evidence. They do not establish physical iPad compatibility, actual sensor calibration, RMS/Peak semantics, a full screen-reader audit or unattended field reliability. The installed SN-3001 profile still has no verified waveform stream for live FFT.

## Earlier review — 20 October 2026

The following records the earlier per-motor dashboard pass. Its initial dark reference was superseded by the current white/violet design documented in `DESIGN.md`; the current layout and analysis behavior above take precedence.

| Finding | Change |
| --- | --- |
| Four repeated communication labels looked like independent axis health judgments. | One labelled communication state per motor. Three values remain independent measurements. |
| Numeric tile colors differed from the matching chart lines; detailed charts used a third palette. | Shared X/Y/Z colors throughout. |
| 9 px labels and SVG scaling made data hard to read. | Larger controls, labels and data; overview charts draw at their rendered pixel dimensions. |
| Reading faults required opening Events or hovering a whole row. | Fault details appear in the affected row; a status filter isolates affected motors. |
| Search and filtering could leave the operator without a clear recovery action. | Explicit no-results state with a working reset. |
| Fixed sidebar used space on small monitors. | Accessible collapse/expand control. |
| Tab selection semantics were incomplete. | Tab/panel roles, roving focus and arrow/Home/End controls. |
| Existing cached readings could survive sensor reassignment. | Clear the affected motor's cache when identity, register or unit changes; keep history files. |

Validation: isolated Electron smoke tests cover CRUD, filtering, keyboard tabs, collapse/expand, source and packaged execution, simulated channels, fault/recovery, sensor reassignment, history/export and 960×680, 1366×768 and 1920×1080 layouts. Rendered screens are inspected separately. Sensor/Modbus unit tests remain mandatory.

That earlier manual Impeccable detector pass identified undersized functional labels, the inherited metric accent and a colored toast shadow, which were corrected. Intentional exceptions remain 11 px auxiliary metadata in this dense Windows tool and flush table/dialog wrappers whose cells/header/footer provide their own inset. Historical detector notes about a dark-theme override describe that earlier pass, not the current white/violet tokens. Neither pass is evidence of a complete accessibility audit; screen-reader and field usability evaluation remain future checks.

Next engineering priorities after this pass:

1. Commission the actual sensor and USB adapter on the target computer: serial settings, axis orientation, values and acquisition stability. Confirm RMS/Peak and frequency word order with the vendor before adding interpretations.
2. Add configurable history retention and disk capacity monitoring before unattended long-term collection.
3. Design site-approved alarm thresholds, persistence/hysteresis and acknowledgement with the responsible maintenance engineer. Do not substitute old machine-class chart boundaries for an established measurement specification.

The current validation uses fixtures and simulation. Hardware response, calibrated measurement semantics and field operation remain unverified.
