# VECTRA Sensor Monitor — Windows

An independent Windows application for local RS485 / Modbus RTU motor monitoring. The original website in the repository root is a separate application.

## Features

- Monitoring interface based on the user's white/lavender reference: white panels, pale gray workspace, violet actions/selection, subtle dividers and consistent teal/blue/violet axes. Motor details give three equally sized graph rows most of the viewport, with compact temperature, frequency and acquisition status alongside. The 3D model has its own page. Per-motor rows retain measurements, communication state, receive timestamps and independent charts. Register/history views and Windows connection dialogs retain the same visual vocabulary.
- Communication/maintenance filters, search reset, a collapsible registry and keyboard-accessible tabs. Connection faults are shown directly in the affected motor row. See `DESIGN.md` and `UXUI-REVIEW.md` for the interaction rules and review findings.
- Add, edit, delete and search up to 64 motor profiles; store labels, locations and nameplate notes. Temporarily exclude a motor from acquisition using **พักอ่าน** during maintenance.
- Per-motor actions are available directly in the overview. When acquisition is active, editing, adding or deleting asks to stop acquisition first. Motor health is not inferred from communications status or axis colors.
- Multiple serial ports and multiple slave IDs on one RS485 bus. Each shared bus uses one serial client and serializes requests. Baud, parity and stop bits must match for motors sharing a port; duplicate IDs or motor tags are rejected.
- Tests every selected motor before acquisition begins. One failed motor during an active session reports a fault while the other motors continue. Closed serial ports are reopened on the next poll attempt.
- Velocity, displacement, acceleration and frequency X/Y/Z, plus temperature for the VemSee preset: 13 numerical fields. Frequency requires a confirmed Float32 byte/word order; otherwise raw words are available and Hz stays blank. Custom single-value register profiles are also supported.
- All nine vibration values are visible per motor: velocity, displacement and acceleration X/Y/Z. Overview, detail and recorded-history views show these three plot families in full-width rows, with independent units/scales and synchronized time cursors. Temperature and frequency remain numerical. Custom-register sensors show their single configured measurement. Original samples break traces across gaps over three requested poll periods; reduced history is explicitly labelled rather than inferring outages from decimated points.
- The user's V4 3D reference assembly is on its own **โมเดล 3D** tab, loaded only when opened. It runs offline with rotate/pan/zoom, camera presets, reset and fullscreen and is not shown on the monitoring dashboard. It is not bound to real motor profiles or sensor positions. WebGL failure displays the actual reference render with a retry action; the isolated iframe has no application API access.
- The motor monitor fits all three plots, their nine axis values, numerical temperature and frequency X/Y/Z into one viewport at the tested desktop/tablet sizes. Compact telemetry stays beside the graphs, or above them on portrait tablets. Below 1180 px the motor registry becomes an overlay drawer. The context toggle and quick time ranges provide more graph space without hiding measured axes. Axis hover/keyboard focus emphasizes matching traces; native raw-data popovers remain within the window. The Windows window starts within the display's available work area. Tablet viewport tests describe layout behavior; the distributed executable is for Windows x64.
- Dynamic charts: automatic width-based range, 1/5/30 minutes, 1/6 hours, all retained readings or a custom count. Live memory is bounded at 20,000 readings per motor and 200,000 across the fleet; older recorded data is available through timestamp-based historical charts. Large charts reduce display points while preserving channel extrema. Storage keeps full readings.
- Mouse/keyboard crosshair, complete Bangkok timestamps, requested and measured receive periods, response duration, and chart pause while acquisition/recording continue independently.
- Raw register table with zero-based hex addresses, PLC notation, decimal/hex raw words and converted values.
- Each plot has a left value box with X/Y/Z, units and the selected sample time. Hover an axis value for its raw conversion or open **ค่าดิบและสูตร** for all axes; click/Enter pins the displayed timestamp and Escape closes it. The inspector lists decimal/hex raw words and the actual signed/unsigned conversion. Custom readings retain their original decoding configuration in NDJSON; old records without raw data or formula metadata say so explicitly. Narrow containers stack the box above the graph.
- One primary Start command verifies sensors, starts acquisition and records automatically by default. One Stop disconnects acquisition and waits for pending file writes. Select explicit monitor-only or scheduled recording from the mode button; optional recording duration keeps monitoring after it expires, with an explicit status. Legacy manual-start settings follow the new combined Start action. The More menu preserves immediate recording start, recording-only stop, data folder and simulation. Scheduling requires the application to be open and connected; it does not wake Windows or connect automatically.
- Automatic daily CSV **and** NDJSON storage when recording is active. CSV includes UTC and Bangkok timestamps with milliseconds, all nine vibration channels, temperature, frequency X/Y/Z and frequency quality/format, source, response time and requested/actual receive periods. CSV uses UTF-8 BOM and CRLF for Excel. Daily rollover uses Asia/Bangkok.
- Multi-day history/motor filters, arbitrary timestamp-range historical charts, and complete filtered CSV export through a Windows save dialog. History displays the latest 500 matching rows; CSV exports all matching rows.
- JSON configuration backup/import, confirmation before replacement or deletion, bounded event log and corrupt-file reporting without overwriting unreadable profiles.
- Simulation is explicit and never writes simulated readings into production history.
- Error, stale data, offline and receiving states describe communications quality. No automatic vibration severity / ISO judgment is applied.

## Run and build

```powershell
cd windows-app
npm ci
npm start
```

```powershell
npm test
npm run dist:win
```

The x64 installer and portable executable are created in `release/`. Git tags matching `desktop-v*` run the Windows release workflow and publish both files. Native serial dependencies are included; the target machine needs the correct USB adapter driver and the sensor's power supply.

## First use

1. Connect sensor power and RS485 A/B according to its manual.
2. Add a motor; select COM port, sensor profile, Slave ID and the actual serial settings.
3. Test the motor, then save the profile. Use a different Slave ID for every sensor sharing one physical bus.
4. Press **เริ่มอ่านและบันทึก** once. Every enabled motor is verified, then the application acquires and saves incoming readings automatically. Pre-start verification readings are labelled and not backfilled into the recording.
5. Press **หยุดอ่านและบันทึก** to finish and wait for pending writes. To use another workflow, choose **โหมด** while stopped: monitor-only or a future recording schedule, with an optional duration (0 means until stopped). More contains recording-only stop and immediate recording start while monitoring continues.
6. The requested polling period is configurable per motor from 250 ms to one hour in connection settings. It targets start-to-start request timing; shared bus work and response time can make actual reception slower. Overview and details show the measured receive period separately.
7. Use **หยุดบันทึก** to stop saving and continue monitoring; **หยุด** stops acquisition and recording. Select motors from the sidebar and use Register, History and Events to diagnose readings. Stop acquisition before changing profiles or recording conditions.

Readings are acknowledged as recorded only after both NDJSON and CSV appends succeed. Records include the computer's receive timestamp, motor ID, source port, slave ID, response duration, requested and measured receive periods, unit, raw registers and all decoded channels. Configuration is written using a temporary file plus rename. Storage errors are visible and the current reading remains available with `recordingState: error`; intentional monitoring without storage uses `monitor-only`. The two files are not one filesystem transaction: a CSV write failure can leave the NDJSON record present. Export can recover CSV data from that source after the disk problem is resolved.

The application shows the storage location in History and recording settings and has an open-folder command. It uses Electron's per-user application-data directory. Configuration is `motors.json` plus `recording.json`; readings are `data/readings-YYYY-MM-DD.ndjson` and `data/readings-YYYY-MM-DD-v3.csv`, with file dates in Asia/Bangkok. The CSV suffix identifies the schema, avoiding mixed headers from older versions. Existing v2 CSV files remain unchanged; old records without frequency display blank Hz. Existing `sensor-config.json` installations migrate in memory and save as the registry when edited. Only one application instance may use a data directory.

Modbus RTU is request/response: the sensor replies when the computer polls it ([Modbus serial guide](https://www.modbus.org/docs/Modbus_over_serial_line_V1_02.pdf), section 2.1). The supplied model's 10–5000 Hz vibration response range is not its register update interval. The exact internal update period has not been established from the supplied manual or verified hardware; polling faster does not prove a fresh internal measurement. The UI exposes this distinction rather than claiming a factory update rate.

## VemSee SN-3001-WZ3A-N01 register profile

Transcribed from the four user-supplied pages of the Zolftech/VemSee manual. Reads only function 03 or 04:

| Zero-based address | PLC reference | Channel | Conversion |
| --- | --- | --- | --- |
| 0000H | 40001 | Temperature | signed 16-bit / 10, °C |
| 0001H–0003H | 40002–40004 | Velocity X/Y/Z | unsigned 16-bit / 10, mm/s |
| 0004H–0006H | 40005–40007 | Displacement X/Y/Z | unsigned 16-bit / 10, µm |
| 000AH–000CH | 40011–40013 | Acceleration X/Y/Z | signed 16-bit / 10, m/s² |
| 0021H–0026H | 40034–40039 | Frequency X/Y/Z (two words each) | Float32, Hz; explicit byte/word order required |

Displacement supports the full stated 0–5000 µm range without overflowing signed 16-bit values. The primary velocity display is the highest individual axis value, not a vector sum. The manual does not establish RMS versus Peak for these velocity registers, so the application labels them `mm/s` and does not classify them using ISO boundaries.

Frequency at 0021H–0026H is read as six raw words. The supplied pages do not establish Float32 byte/word order, so the default is unconfirmed with blank Hz. Confirm the format using the vendor or a reference reading, then select ABCD/CDAB/BADC/DCBA in the motor profile. Conversion rejects non-finite/out-of-range results but plausibility alone does not establish the correct order. Frequency-read failure keeps primary measurements available and reports its own status. UID, baud-rate and calibration registers are not written. The pages list UID at 07D0H and baud at 07D1H, but do not confirm the installed unit's current UID, baud, parity or stop bits. Defaults in the dialog are starting values to edit, not verified factory settings. The vendor manual permits UID 1–254; custom profiles use 1–247.

Wiring from the supplied manual: brown VCC 10–30 VDC, black GND, yellow 485-A, blue 485-B. USB adapter detection does not identify the sensor model or confirm sensor communication.

## Validation and limits

Unit tests use a fake Modbus client to verify serialization, per-motor failure isolation, initial connection rollback and no late reads after stopping. Filesystem tests verify configuration validation, signed/unsigned decoding, history filtering, corrupt-line recovery and CSV escaping. UI tests use isolated temporary application data, fixture serial ports and explicit simulation; they verify profile CRUD, live/error/recovery states, all three axes, raw tables, history, pointer charts and 960/1366/1920 layouts.

Physical sensor response, installed USB drivers, RMS/Peak semantics and mounting direction still require commissioning on the target computer. The app does not infer bearing faults, create an FFT from overall values, apply alarm thresholds or operate a motor trip. It is a local acquisition tool; the data is not automatically shared with the website or other computers.
