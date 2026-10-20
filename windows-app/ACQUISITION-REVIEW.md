# Acquisition and recording review — version 0.8.1

## Completed requirements

| Request | Implemented behavior |
| --- | --- |
| Wider/dynamic graphs | Automatic range based on width; time windows, retained session and custom sample counts. At most 20,000 live readings per motor / 200,000 total. Arbitrary recorded timestamp ranges load from files across dates with bounded extrema-preserving display points. |
| Timestamp | Gregorian date, time, milliseconds and explicit UTC+07:00 in overview, details and chart tooltips. CSV has both UTC ISO and Bangkok timestamps. These are computer receive times, not sensor-provided times. |
| All nine values | Velocity, displacement and acceleration X/Y/Z visible in each motor row; temperature is a tenth channel. All are stored/exported. Charts switch metric group, keeping units separate. |
| Select/read rate | Per-motor requested period 250–3,600,000 ms with presets. Scheduler targets start-to-start timing; UI/CSV show actual received period and response duration separately. The sensor's internal register refresh period remains unknown. |
| Select recording start | Manual, automatic after successful connection, or one future scheduled time, plus optional duration. Acquisition and recording have separate controls. A stop cancels a pending schedule; restart is an explicit new session. |
| Automatic timestamped CSV | During active recording every accepted reading appends to both daily NDJSON and CSV, with one BOM/header per CSV. Files rotate at Bangkok midnight. No simulated data is recorded. |

## Verified with automated fixtures

- Fake shared-bus Modbus requests remain serialized; per-motor faults do not stop other motors. Actual inter-receive time is measured separately from the requested period.
- Manual, automatic and scheduled recording; exact duration boundary; disconnected/scheduled cancellation; reject pre-start samples; no files for monitor-only mode; storage-error result distinct from intentional non-recording.
- Concurrent appends produce one CSV header, all channels, UTC/Bangkok time and rollover across midnight. Multi-day ranges keep both negative acceleration and high displacement peaks.
- Graph buffers over 120 readings, time/count selection, nine values per motor, alternate metric charts, historical plot, settings persistence, CRUD and 960/1366/1920 layouts in isolated Electron data.

Impeccable's detector was run once for this change, followed by rendered inspection. Its remaining warnings concern 11 px auxiliary text, table/dialog wrappers with child-owned padding and inherited shadow declarations superseded by the dark theme. This is not a claim of complete accessibility or physical commissioning.

The 0.8.1 patch corrects chart labels for custom single-register sensors in the overview, detail and history views; they use the configured unit instead of a fixed Velocity label. A desktop regression covers a custom µm profile.

## Next work, in priority order

1. **Commission the target hardware.** Confirm the adapter/driver, actual sensor ID/baud/parity, orientation and mounting. Ask the vendor for the internal update interval and confirm RMS/Peak semantics for this exact model. Compare readings with a reference instrument, then run a long acquisition test with disconnection/reconnection. A changing value does not establish the internal sample rate.
2. **Long-running storage and recovery.** Add disk-space warnings, retention policy, configurable destination, recovery/rebuild of CSV after partial writes and safe recovery from a power cut. Current writes are sequential, but CSV and NDJSON are separate files and not one atomic transaction. Large histories stream with bounded memory but can take time to scan; indexing/SQLite and cancellable progress become useful as data grows.
3. **Persist acquisition-session metadata.** Save motor labels/nameplates and complete configuration snapshots with a session ID, start/stop reason and recording conditions. Current rows identify motor/port/slave, but historical labels and profile changes are not versioned.
4. **Improve analysis workflow.** Historical motor discovery after deletion, multi-motor comparison, visual gaps for communication outages, cursor zoom/pan and complete screen-reader/high-contrast testing. Live graphs intentionally bound memory; recordings are retained in files without automatic deletion.
5. **Define alarms with maintenance staff.** Agree measurement semantics, equipment applicability, thresholds, dwell/hysteresis and acknowledgement before automatic condition judgments. Overall register values do not supply a raw waveform or justify an FFT/bearing-fault diagnosis.

## Evidence and limits

- The user-supplied four-page VemSee/Zolftech manual establishes the nine channels, temperature, register addresses and scales. It does not establish the internal update interval, RMS/Peak semantics or float word order for frequency registers. Frequency and configuration writes remain disabled.
- [Modbus Serial Line Protocol and Implementation Guide V1.02](https://www.modbus.org/docs/Modbus_over_serial_line_V1_02.pdf), section 2.1, establishes request/response behavior. It does not specify this sensor's internal timing.
- Physical response, calibration, long-duration operation and target-computer behavior are unverified. Scheduling runs only while the program is open and acquisition is active; it is not an OS wake task or a Windows service.
