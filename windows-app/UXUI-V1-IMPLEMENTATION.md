# UX/UI implementation — 6 November 2026

Version: 0.32.0. Scope: Windows application only. The root website is separate.
`UXUI-V1-AUDIT.md` retains the original 0.30.7 observations and screenshots; it is not a report of the new interface.

## Shipped structure

- Workspace → Diagram / Device overview / Device detail → Measurement values / Raw and formulas. Optional 3D reference view belongs to an enabled workspace.
- Recorded runs → cross-device catalog → run → device → table / time charts / CSV / archived quality and events. XYZ and overall-trend FFT analysis receives the run, device and interval. Imported waveform analysis remains independent.
- Library → all device configurations / Register templates. Workspace removal retains profiles. Deleting unused configuration is separate. Templates never capture Slave ID, COM or identity.
- Settings → storage, complete configuration backup/restore, diagnostics, help / current-session events. A running acquisition keeps a named Stop control reachable elsewhere.

## Audit resolution

| Findings | Implemented behavior |
| --- | --- |
| U01–U02 | Four root groups, scoped submenus, nested device tabs, readable context path and commands scoped to their owner. |
| U03, U12–U13 | Unified run catalog for vibration, power and custom readings; archived devices require no current profile. Choose table columns, inspect a sample's recorded raw/formula metadata, show time charts by unit, open XYZ/trend analysis with the same run and range. Missing data remains missing; actual zero stays zero. |
| U04, U14 | Explicit remove-from-workspace versus delete-from-library actions, retained meter configurations, consistent workspace membership and labelled installation position. |
| U05 | Complete settings snapshot includes profiles, archived meters, groups, buses, templates, recording mode and selected workspace. Validates references and backs up exact prior bytes. Partial writes roll back; interrupted restores are rolled back on the next start through a recovery journal. |
| U06–U07 | Wrapping workspace names and device-owned editor heading; inherited serial settings link to the owning bus instead of repeating editable fields. |
| U08–U11 | Measurement overview separated from connection flow, with its own graph-range control and meters included. Contextual empty-state actions; explicit Register-template selection; port list collapsed on narrow screens and Register editor expandable. |
| U15 | Explicit until-stop/duration choices. Existing write-flush and CSV generation retained; completed run is directly accessible after stopping. |
| U16 | 3D reference view is optional per workspace and remains separate from measurement plots. It is a reference assembly, not a model bound to real sensor positions. |
| U17–U19 | Error-only badge; event search plus device/run/severity filters; archived run diagnostics accessible in-app; action-specific confirmations; generic device wording and updated help. |
| U20 | Compact contextual toolbar, native focus/keyboard behavior and responsive viewport checks. Physical touch, OS DPI and assistive-technology commissioning remain separate acceptance tasks. |

## Validation

Unit suites cover original protocol/queue, storage, conversions and spectral algorithms plus mixed-device run catalog, bounded sample retrieval, archive diagnostics isolation, settings round trip, failed-write rollback and interrupted-restore recovery.

Desktop suites use isolated test directories and instrument responses supplied only by test code. They exercise fresh setup, mixed-device reading/recording, completed CSV output, reuse/removal, templates, backup/restore, archived data without current profiles, failure clearing, analysis provenance, mouse/keyboard inspectors and all 11 pages at 960×680, 768×1024, 1366×768 and 1920×1080. Live monitor interactions additionally check 1366×700, 1280×650 and 1024×768 content areas.

The native Electron/preload/IPC workflow cannot be exercised faithfully as a standalone browser page. Playwright's Electron driver launches the native application; release CI repeats the desktop suites against the packaged executable. Test screenshots are fixtures, not live hardware measurements.

On-screen recorded tables/charts are bounded to the latest 2,000 sample times; CSV contains the full recorded run. Archived events show the latest 200 matching events and the total matching count. The catalog uses asynchronous journal streaming and a file-snapshot cache; very large archives still need search/index performance commissioning on target PCs.

## Remaining 1.0 acceptance

- Run the physical shared-COM setup continuously with all target devices; verify timeout recovery, disconnect/reconnect and output integrity.
- Confirm actual meter addressing, Float order, units and sensor internal refresh cadence against the instruments. Do not infer correctness from a green communication light.
- Confirm CSV contents against the instruments, clock/time-zone behavior and available storage on the deployment PC.
- Test real Windows DPI settings, touch hardware and screen-reader behavior. Viewport/keyboard tests do not establish those results.
- A settings backup excludes measurement journals; cross-PC migration of recordings needs a separately specified archive import/export workflow.
- User walkthrough on the new hierarchy before promoting to 1.0. No hardware or usability sign-off is claimed by these automated checks.
