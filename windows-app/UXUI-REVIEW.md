# UX/UI review — 20 October 2026

Applied Impeccable 4.7.0's Operate and polish guidance to the existing Windows application. This is a refinement of the user's dark per-motor dashboard reference.

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

One manual Impeccable detector pass identified undersized functional labels, the inherited metric accent and a colored toast shadow, which were corrected. Intentional exceptions: 11 px auxiliary metadata in this dense Windows tool; flush table/dialog wrappers whose cells/header/footer provide their own inset. The static scan also reports inherited light-theme shadow declarations superseded by dark-theme neutral shadows. These are not evidence of a clean accessibility audit; screen-reader and field usability evaluation remain future checks.

Next engineering priorities after this pass:

1. Commission the actual sensor and USB adapter on the target computer: serial settings, axis orientation, values and acquisition stability. Confirm RMS/Peak and frequency word order with the vendor before adding interpretations.
2. Add configurable history retention and disk capacity monitoring before unattended long-term collection.
3. Design site-approved alarm thresholds, persistence/hysteresis and acknowledgement with the responsible maintenance engineer. Do not substitute old machine-class chart boundaries for an established measurement specification.

The current validation uses fixtures and simulation. Hardware response, calibrated measurement semantics and field operation remain unverified.
