# VECTRA Sensor Monitor — Windows

An independent Windows application for local RS485 / Modbus RTU motor monitoring. The original website in the repository root is a separate application.

## Features

- Dark monitoring interface with per-motor rows, amber section headers, consistent X/Y/Z colors, one communication state, reading age and a separate chart for every motor. Overview charts preserve readable pixel-sized labels on resize. Detailed register/history views and the Windows connection dialog remain available.
- Communication/maintenance filters, search reset, a collapsible registry and keyboard-accessible tabs. Connection faults are shown directly in the affected motor row. See `DESIGN.md` and `UXUI-REVIEW.md` for the interaction rules and review findings.
- Add, edit, delete and search up to 64 motor profiles; store labels, locations and nameplate notes. Temporarily exclude a motor from acquisition using **พักอ่าน** during maintenance.
- Per-motor actions are available directly in the overview. When acquisition is active, editing, adding or deleting asks to stop acquisition first. Motor health is not inferred from communications status or axis colors.
- Multiple serial ports and multiple slave IDs on one RS485 bus. Each shared bus uses one serial client and serializes requests. Baud, parity and stop bits must match for motors sharing a port; duplicate IDs or motor tags are rejected.
- Tests every selected motor before acquisition begins. One failed motor during an active session reports a fault while the other motors continue. Closed serial ports are reopened on the next poll attempt.
- Velocity, displacement and acceleration X/Y/Z, plus temperature for the VemSee preset. Custom single-value register profiles also supported.
- 120-sample charts with metric selection, mouse/keyboard crosshair, minimum/average/maximum, and display pause while live storage continues.
- Raw register table with zero-based hex addresses, PLC notation, decimal/hex raw words and converted values.
- Daily NDJSON storage, date/motor history filters, and complete filtered CSV export through a Windows save dialog. History displays the latest 500 matching rows; CSV exports all matching rows.
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
4. Select **เริ่มอ่านข้อมูล**. Every saved motor is verified before continuous acquisition starts. The poll interval is a requested minimum interval per motor; bus response time and timeouts can make actual cycles longer.
5. Select motors from the sidebar. Use Register, History and Events tabs to diagnose readings. Stop acquisition before editing profiles.

Readings are acknowledged as recorded only after the append succeeds. Records include timestamp, motor ID, source port, slave ID, response duration, unit, raw registers and all decoded channels. Configuration is written using a temporary file plus rename. Storage errors are visible and the current reading remains available with `recorded: false`.

The application shows the storage location in the History tab and has an open-folder command. It uses Electron's per-user application-data directory. Configuration is `motors.json`, readings are `data/readings-YYYY-MM-DD.ndjson`, with file dates in Asia/Bangkok. Existing `sensor-config.json` installations are migrated in memory and saved as the new registry when edited. Only one application instance may use a data directory.

## VemSee SN-3001-WZ3A-N01 register profile

Transcribed from the four user-supplied pages of the Zolftech/VemSee manual. Reads only function 03 or 04:

| Zero-based address | PLC reference | Channel | Conversion |
| --- | --- | --- | --- |
| 0000H | 40001 | Temperature | signed 16-bit / 10, °C |
| 0001H–0003H | 40002–40004 | Velocity X/Y/Z | unsigned 16-bit / 10, mm/s |
| 0004H–0006H | 40005–40007 | Displacement X/Y/Z | unsigned 16-bit / 10, µm |
| 000AH–000CH | 40011–40013 | Acceleration X/Y/Z | signed 16-bit / 10, m/s² |

Displacement supports the full stated 0–5000 µm range without overflowing signed 16-bit values. The primary velocity display is the highest individual axis value, not a vector sum. The manual does not establish RMS versus Peak for these velocity registers, so the application labels them `mm/s` and does not classify them using ISO boundaries.

Frequency at 0021H–0026H is not decoded because the supplied pages do not establish float word order. UID, baud-rate and calibration registers are not written. The pages list UID at 07D0H and baud at 07D1H, but do not confirm the installed unit's current UID, baud, parity or stop bits. Defaults in the dialog are starting values to edit, not verified factory settings. The vendor manual permits UID 1–254; custom profiles use 1–247.

Wiring from the supplied manual: brown VCC 10–30 VDC, black GND, yellow 485-A, blue 485-B. USB adapter detection does not identify the sensor model or confirm sensor communication.

## Validation and limits

Unit tests use a fake Modbus client to verify serialization, per-motor failure isolation, initial connection rollback and no late reads after stopping. Filesystem tests verify configuration validation, signed/unsigned decoding, history filtering, corrupt-line recovery and CSV escaping. UI tests use isolated temporary application data, fixture serial ports and explicit simulation; they verify profile CRUD, live/error/recovery states, all three axes, raw tables, history, pointer charts and 960/1366/1920 layouts.

Physical sensor response, installed USB drivers, RMS/Peak semantics and mounting direction still require commissioning on the target computer. The app does not infer bearing faults, create an FFT from overall values, apply alarm thresholds or operate a motor trip. It is a local acquisition tool; the data is not automatically shared with the website or other computers.
