# Windows monitoring interface

Scope: `windows-app/src`. The website at the repository root has a separate design.

The operator scans many motors, identifies a communication problem, opens a motor's measurements, and configures its sensor. Preserve the existing dark industrial interface and amber motor headers requested by the user. Use straightforward Thai labels and Windows controls. No slogans, promotional claims or ornamental animation.

- Background `#101419`, measurement surface `#19212b`, text `#e6edf5`; amber `#e6ae36` identifies primary actions and current selection. Existing amber motor headers remain.
- Axis X `#6ed3a3`, Y `#e5bf69`, Z `#67b6e8` have identical meanings in values, legends, tables and trend lines. Axis colors never describe motor health.
- Show communication state once per motor, beside port and Slave ID. Show the latest reading age separately. Put fault details in the affected motor's row, not exclusively in a tooltip or event log. Explicitly label simulation and storage failure.
- Segoe UI / Tahoma supports Windows and Thai. Main labels and controls are 12–13 px; auxiliary labels at least 11 px. Numeric values use tabular figures. Chart axis labels remain 11 rendered pixels when the window resizes.
- Use one motor surface containing status, three numeric columns and a matching chart. Avoid duplicating status panels for each axis. Separate columns with thin dividers; reserve filled semantic colors for status requiring attention.
- At wide desktop sizes, values and chart share a row. At 1200 px and below they stack. The operator can collapse the motor registry. Actions remain text-labelled and at least 32 px high. Long names and locations wrap.
- Tabs expose tab/panel relationships, one keyboard tab stop, Arrow Left/Right and Home/End navigation. All controls retain visible focus. Use one authored SVG stroke family for icons and respect reduced motion.
- Forms retain standard selects, explicit units, separate serial/acquisition groups, editable nameplates and native save dialogs. Destructive operations and changes during acquisition retain confirmation.

Evaluate empty, acquiring, simulation, stopped, paused, communication failure, stale data, storage failure and maintenance states. A clean detector scan does not replace rendered inspection or hardware commissioning.
