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
- All nine vibration values are visible per motor: velocity, displacement and acceleration X/Y/Z. Overview and motor details show these three plot families in full-width rows, with independent units/scales and synchronized time cursors. Recorded time plots remain available in the unified Analysis page. Temperature and frequency remain numerical. Custom-register sensors show their single configured measurement. Original samples break traces across gaps over three requested poll periods; reduced history is explicitly labelled rather than inferring outages from decimated points.
- The user's V4 3D reference assembly is on its own **โมเดล 3D** tab, loaded only when opened. It runs offline with rotate/pan/zoom, camera presets, reset and fullscreen and is not shown on the monitoring dashboard. It is not bound to real motor profiles or sensor positions. WebGL failure displays the actual reference render with a retry action; the isolated iframe has no application API access.
- The motor monitor fits all three plots, their nine axis values, numerical temperature and frequency X/Y/Z into one viewport at the tested desktop/tablet sizes. Compact telemetry stays beside the graphs, or above them on portrait tablets. Below 1180 px the motor registry becomes an overlay drawer on every page; opening it focuses search, contains keyboard focus and makes the background unavailable. Close, Escape or a backdrop click dismisses it and returns focus. The context toggle and quick time ranges provide more graph space without hiding measured axes. Axis hover/keyboard focus emphasizes matching traces; native raw-data popovers remain within the window. The Windows window starts within the display's available work area. Tablet viewport tests describe layout behavior; the distributed executable is for Windows x64.
- Dynamic charts: automatic width-based range, 1/5/30 minutes, 1/6 hours, all retained readings or a custom count. Live memory is bounded at 20,000 readings per motor and 200,000 across the fleet; older recorded data is available through timestamp-based historical charts. Large charts reduce display points while preserving channel extrema. Storage keeps full readings.
- Mouse/keyboard crosshair, complete Bangkok timestamps, requested and measured receive periods, response duration, and chart pause while acquisition/recording continue independently.
- Raw register table with zero-based hex addresses, PLC notation, decimal/hex raw words and converted values.
- Each plot has a left value box with X/Y/Z, units and the selected sample time. Hover an axis value for its raw conversion or open **ค่าดิบและสูตร** for all axes; click/Enter pins the displayed timestamp and Escape closes it. The inspector lists decimal/hex raw words and the actual signed/unsigned conversion. Custom readings retain their original decoding configuration in NDJSON; old records without raw data or formula metadata say so explicitly. Narrow containers stack the box above the graph.
- One primary Start command verifies sensors, starts acquisition and records automatically by default. One Stop disconnects acquisition and waits for pending file writes. Select explicit monitor-only or scheduled recording from the mode button; optional recording duration keeps monitoring after it expires, with an explicit status. Legacy manual-start settings follow the new combined Start action. The More menu preserves immediate recording start, recording-only stop, data folder and simulation. Scheduling requires the application to be open and connected; it does not wake Windows or connect automatically.
- Automatic daily CSV **and** NDJSON storage when recording is active. CSV includes UTC and Bangkok timestamps with milliseconds, all nine vibration channels, temperature, frequency X/Y/Z and frequency quality/format, source, response time and requested/actual receive periods. CSV uses UTF-8 BOM and CRLF for Excel. Daily rollover uses Asia/Bangkok.
- History is a table and export workspace: multi-day/motor/run filters, the latest 500 matching rows, complete filtered CSV export and an **เปิดกราฟในหน้าวิเคราะห์** action. Charts now live in the unified Analysis page. Filter changes invalidate pending results; loading and errors clear previous rows rather than leaving another date's data under the current filter.
- Analysis separates **ค่าที่บันทึก · XYZ** from **คลื่นดิบ · FFT**. Saved overall readings offer XYZ scatter, time plots and an explicitly labelled **FFT ค่ารวม** of slow changes at the receive cadence. Waveform CSV provides separate vibration FFT/PSD/time-frequency analysis. Overall values are never reinterpreted as a raw vibration waveform. Imported data and generated demonstrations retain distinct source labels.
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
7. Use **หยุดบันทึก** to stop saving and continue monitoring; **หยุด** stops acquisition and recording. Select motors from the sidebar and use Register, History and Events to inspect readings. Open **วิเคราะห์ / FFT → ค่าที่บันทึก · XYZ** for historical graphs, or use the open-analysis action in History. Stop acquisition before changing profiles or recording conditions.

Readings are acknowledged as recorded only after all required daily NDJSON, daily CSV and per-run CSV appends succeed. Records include the computer's receive timestamp, motor ID, source port, slave ID, response duration, requested and measured receive periods, unit, raw registers and all decoded channels. Configuration is written using a temporary file plus rename. Storage errors are visible and the current reading remains available with `recordingState: error`; intentional monitoring without storage uses `monitor-only`. These writes are not one filesystem transaction: a later CSV write failure can leave earlier files present. Export can recover CSV data from the daily NDJSON source after the disk problem is resolved; check partial files before combining copies.

The application shows the storage location in History and recording settings and has an open-folder command. It uses Electron's per-user application-data directory. Configuration is `motors.json` plus `recording.json`; daily readings are `data/readings-YYYY-MM-DD.ndjson` and `data/readings-YYYY-MM-DD-v4.csv`, with file dates in Asia/Bangkok. The CSV suffix identifies the schema, avoiding mixed headers from older versions. Existing v2/v3 CSV files remain unchanged; old records without frequency display blank Hz. Existing `sensor-config.json` installations migrate in memory and save as the registry when edited. Only one application instance may use a data directory.

### Runs and recording intervals

Schema v4 adds `runId`, `runStartedAt`, `recordingId` and `recordingStartedAt`. These values come from `RecordingService` in the backend, using generated UUIDs and UTC timestamps; they are not inferred from a graph range or the current motor selection.

- A successful acquisition connection creates a new `runId`. Disconnecting and starting acquisition again creates another run, even for the same motors. Automatic retries of an individual port within that acquisition run do not create another run.
- Each transition into active recording creates a new `recordingId`. Stopping recording and starting it again while acquisition continues keeps the same `runId` and uses a new `recordingId`.
- Monitor-only readings carry their acquisition run identity but are not appended to history and have blank recording fields. Verification readings received before recording starts are not saved retroactively.
- Saved rows capture both identities before asynchronous file writes. A late write retains its original run and recording identity.

Each run also has CSV copies under `data/runs/<runId>/readings-YYYY-MM-DD-v4.csv`. A run crossing Bangkok midnight has more than one daily CSV in that folder. The daily NDJSON files remain the history journal; there is no separate NDJSON per run. Daily CSV and run-folder CSV contain copies of the same records, so concatenating both would duplicate readings. A run without a saved reading has no run folder to open.

History obtains the run catalog and filters from the backend's saved records. Historical chart series include run identity so separate acquisition runs are not joined merely because a motor and COM port match. Older records without `runId` remain available in an explicit legacy group (`__legacy__`); the application cannot reconstruct their original acquisition boundaries or recording IDs.

### Saved XYZ analysis and history table

The Analysis page contains two explicitly separated sources. **ค่าที่บันทึก · XYZ** opens saved scalar readings; **คลื่นดิบ · FFT** opens the existing waveform importer and spectral tools. The History page contains the table, CSV export and run-folder actions, with a direct link to Analysis. Motor and run selection are shared between table and saved-data analysis. Chart time fields and table date fields synchronize their calendar dates; the chart can use a narrower time-of-day range, while the table/export uses the selected calendar-day filter.

The saved-data default is **กระจาย 3D**. One point is one saved record containing complete X, Y and Z values of the chosen metric: velocity in mm/s, displacement in µm or acceleration in m/s². Its three coordinates are those measured values, not time, motor location or frequency bins. Time is shown by color, the selected point's timestamp and the time slider. Rotation, elevation, zoom, reset, keyboard selection and fullscreen are available. No surface connects the points, and no trajectory, histogram, probability density or bearing-fault diagnosis is inferred from the cloud.

**แนวโน้มเวลา** retains the recorded line plots, units, raw/formula inspectors and original continuity metadata. A custom single-register series falls back to its one-value time plot; it is not expanded into invented XYZ coordinates. Motor/run/unit/source/decoder series remain separate, and changes to a filter clear the previous chart before loading its replacement. Date changes advance the history request generation so a late response cannot repaint another date's rows. Failed loads show an empty/error state instead of stale rows or curves.

`DataStore.scatterRange` reads the NDJSON journal directly, independently of the time-chart extrema reducer. It applies motor, timestamp, optional current-profile and run filters, then separates the strict recorded series before sampling complete XYZ records of the selected metric. The UI requests at most **1,200 points**. When the complete record count exceeds that limit, seeded Algorithm R reservoir sampling gives complete records equal inclusion probability; it is a sample of records, not uniformly spaced timestamps. The results retain actual record values/timestamps and report total, complete, incomplete, corrupt/skipped and displayed counts. Invalid/incomplete records are not replaced with zeros.

Before its two passes, the backend captures the eligible journal filenames and byte lengths. Both passes read only those bounded file prefixes, so appends made while analysis is running cannot make the counting pass and sampling pass read different record sets. This is an append-only journal snapshot boundary, not a transaction across every file. The cloud and its sample label must not be presented as an exact density or histogram of the full recording; the time chart's peak-preserving reduction is not used to estimate that density either.

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

## FFT of overall values over time

Open **วิเคราะห์ / FFT → ค่าที่บันทึก · XYZ → FFT ค่ารวม**. Select the motor, run and time range, then load the original saved records. Choose velocity/displacement/acceleration and axis, temperature, confirmed frequency scalars or a custom register's saved unit. This is batch analysis of the local recording journal, not live waveform acquisition or an importer for recording CSV copied from another computer.

`trendRange` uses the same run/model/unit/source grouping as the historical charts, but returns every record of the selected series. It never uses chart extrema reduction or scatter sampling. Up to **65,536 records** may be loaded; larger ranges report the count and require a shorter filter. The recording catalog remains available when that limit is exceeded. Counting and loading use the same append-bounded journal snapshot. Compact records omit raw register blocks to bound IPC and worker memory.

The analysis uses **PC receive timestamps**, not a stated sensor hardware sample rate. Journal order is preserved rather than sorting away clock rollback. Missing values, repeated/nonincreasing timestamps, and intervals outside 0.5–1.5 times the median positive receive interval split the input into contiguous segments. The longest segment is selected by default; other segments containing at least **64 values** remain selectable. No values are invented across a gap. Missing/unconfirmed Hz is unavailable rather than zero. Stored records are unchanged.

The default **ปรับ jitter เชิงเส้น ≤20%** explicitly interpolates only within the selected segment onto a uniform grid with interval `(last receive time − first receive time)/(count − 1)`. Every step must be within 20% of that interval. **ใช้ค่าตรง · jitter ≤0.1%** skips interpolation and requires stricter interval regularity. These thresholds are application acceptance policies, not sensor accuracy claims. Metadata shows the timing method, maximum step jitter, original/total analyzed record count and capture start. FFT uses all prepared samples, never the reduced screen preview.

`Fs` and its `Fs/2` boundary describe the receive-time series only. The sensor's internal RMS averaging window, refresh cadence and filtering remain unverified; no anti-alias or physical vibration bandwidth is inferred. For example, overall values received every 2 seconds have an analysis Fs of 0.5 samples/s and a receive-time Nyquist boundary of 0.25 Hz, not a 5 kHz motor spectrum. The original sensor's 10–5000 Hz response specification does not alter that boundary.

The default 2D view shows the overall time series beside FFT/mean PSD. Peak-cycle duration is in seconds and is never presented as motor RPM. **สเปกตรัมตามเวลา 3D** switches to Surface/Waterfall/Spectrogram of those same trend windows. Fullscreen preserves the overall-trend label. Numerical FFT/PSD normalization, complete-window processing and frame caps are shared with waveform analysis; component IDs, workers, source state and timing preparation remain separate. A synthetic numerical test verifies a 0.03125 Hz slow cycle sampled every 2 seconds, together with jitter rejection/interpolation, gaps, zero values and custom units. These are software fixtures, not a physical sensor commissioning result.

## Waveform FFT, PSD and waterfall analysis

The current SN-3001-WZ3A-N01 profile reads temperature, nine per-axis overall vibration values and three frequency scalars. The frequency registers contain one Float32 number per axis, not an array of spectral bins. `rawRegisters` contains the encoded register words for those summary measurements; it is not a sequence of instantaneous vibration samples. Neither the supplied manual pages nor the implemented register profile establish a waveform transfer command or an exported spectrum. This is a limit of the documented input currently available, not proof that every firmware variant lacks another vendor interface.

The stated **10–5000 Hz vibration response bandwidth is not the sensor's sample rate**, register refresh period or the application's polling rate. Changing the Modbus polling interval does not produce a verified high-rate waveform. An FFT of the stored overall values would describe how those summary values change at the polling cadence, not the motor's vibration spectrum up to 5 kHz. The Analysis importer therefore rejects VECTRA history/record CSV, including `velocityX`, `accelerationX`, frequency and schema/record headers. Renaming an overall column to `x` does not turn its contents into waveform samples.

The importer identifies recording headers before applying the waveform column limit, including the full 32-column v4 export. Its error explains the data-type mismatch rather than suggesting columns should be deleted. **ดูค่าที่บันทึก · XYZ** returns to analysis of the application's local recording journal; this button does not import the selected CSV into that journal.

### Accepted waveform CSV

Use a waveform export from an acquisition device with a known hardware sampling rate, physical unit and sample timing. The importer supports UTF-8 BOM, quoted comma-separated fields, decimal/scientific numbers and one to three channels named `x`, `y`, `z` (case-insensitive). A single channel may instead be named `value`, which is represented as channel X. Missing cells, non-finite values and inconsistent row widths are rejected.

With numeric elapsed time in seconds:

```csv
time_s,x,y,z
0.000,0.000,0.200,0.100
0.001,0.309,0.350,0.220
0.002,0.588,0.480,0.310
0.003,0.809,0.570,0.360
```

This excerpt implies a sample rate of 1000 samples/s. `elapsed_time_s` / `elapsedtime_s` are also accepted; `time_ms` and `elapsed_time_ms` use milliseconds. All numeric time intervals must be uniform; repeated times, gaps and irregular timing fail validation. If a sample rate is also entered, it must agree with the rate implied by the CSV to within 1%. The importer does not fill gaps or resample. Elapsed time alone does not establish a UTC acquisition timestamp.

With sample index and one channel:

```csv
sample,value
0,0.000
1,0.154
2,0.294
3,0.405
```

For this form, enter the device's verified sample rate explicitly, for example **2048 Hz** if that was the hardware setting for the capture. `index` is also accepted; indices must be consecutive integers. Files containing only `x/y/z` or `value` require an explicit sample rate and use row order as sample order. The CSV does not establish its amplitude unit; select the unit used by the acquisition device. An unspecified unit is `a.u.` rather than an inferred engineering unit.

These four-row examples illustrate the format only. Actual analysis requires at least the selected FFT size of samples. The parser accepts at most **262,144 samples per channel**, three channels and **32 MiB** of CSV; a large or malformed file fails explicitly.

### Sampling and spectral settings

- `Fs` is the waveform acquisition rate in samples per second. Nyquist frequency is `Fs / 2`; usable vibration bandwidth also depends on the acquisition device and its anti-alias filter. A 5 kHz response specification alone does not provide an `Fs` value to enter.
- `N` is the FFT size, a power of two from **64 to 8192**. Bin spacing is `Δf = Fs / N`, and one window covers `N / Fs` seconds. A finer bin grid does not by itself prove that nearby components can be resolved; the window and captured duration matter.
- Analysis subtracts the mean separately from every frame before applying a **periodic Hann** window (default) or a **rectangular** window. Hann reduces boundary leakage but broadens spectral peaks. Rectangular retains narrower coherent-bin peaks and has stronger leakage when the frame does not contain an integer number of periods.
- `overlap` is a fraction from 0 to less than 1. The implementation rounds `N × overlap` to an integer overlap count and returns the actual hop size `H = N − overlapSamples`. There is no zero-padding or interpolation.

The one-sided **amplitude spectrum** reports peak amplitude in the input unit. Its normalization is `2 × |FFT| / Σw` for interior bins and `|FFT| / Σw` at DC and Nyquist. It is not an overall RMS measurement, and an off-bin peak can be lower or spread across adjacent bins even after window normalization. DC is removed by the per-frame mean subtraction.

The one-sided **PSD** reports input-unit squared per hertz, for example `(m/s²)²/Hz`. Its normalization is `2 × |FFT|² / (Fs × Σw²)` for interior bins, with no doubling at DC or Nyquist. It is a density, not another amplitude unit. Integrating PSD across frequency estimates mean-square power for the selected window; the square root of a selected band's integrated PSD gives a band RMS estimate. `meanPSD` averages complete frame periodograms, following the mean Welch approach.

### Waterfall, spectrogram and provenance

A continuous **Surface 3D** is the default time-frequency view within **คลื่นดิบ · FFT**. It connects actual FFT bins on a shared frequency grid across the recorded STFT window-center times. Height and the blue/cyan/green/yellow/red/magenta color scale represent the selected per-frame peak amplitude or PSD. Color interpolation fills triangles for display; it does not add measured FFT samples or smooth the stored spectrum. Hover snaps to a real vertex of the visible triangle and labels it as a nearby actual FFT point. A depth buffer resolves visibility when the surface is rotated. The plot works without a WebGL dependency. This is separate from the XYZ scatter of saved overall readings.

Drag horizontally to rotate and vertically to change elevation; scroll to zoom, reset the camera or expand fullscreen. The **แสดงถึง** field crops the Surface frequency range and uses the last actual FFT bin at or below that limit. It does not change the sampling rate, FFT calculation or recorded data. Waterfall and Spectrogram remain selectable. A single FFT frame is shown as one trace instead of inventing a surface in time.

Surface display uses a shared subset of bins and frames: evenly distributed positions plus frequency/time-bucket maxima and the selected frame. Actual frequencies, frame times, full calculation results and original peak values remain intact, and the plot states the displayed/total counts. The renderer interpolates only inside triangles, never beyond the data domain. In the explicit test signal, X has stationary 50/120 Hz tones (which correctly form ridges); Z has a 30–190 Hz chirp with a changing amplitude envelope (which forms a changing surface).

A waterfall needs multiple spectra: each complete STFT frame produces a spectrum at its actual window-center time, with frequency in Hz and amplitude in the selected input unit. A spectrogram uses the same frame times and frequency bins with the selected peak amplitude or PSD represented by color. The PSD line above it is the mean periodogram across all complete frames; the waterfall and spectrogram retain individual frame values. The depth/time axis is elapsed waveform time, not the categorical X/Y/Z motor axis. One FFT frame is a single spectrum and cannot establish a time-varying waterfall.

Only complete windows are analyzed. Trailing samples that cannot complete a frame are reported as `omittedSamples`; no synthetic tail is added. For display, the 3D waterfall draws up to 96 evenly distributed frames plus the selected frame, and states the displayed/total count. All computed frames remain selectable with the time slider. Frequency display buckets retain the maximum at its actual bin frequency. The maximum analysis size is **512 frames**. When a capture would exceed that limit, analysis asks for a shorter segment, larger FFT size or less overlap instead of silently skipping frames. Frame times are relative to the imported waveform; the UI must not substitute the computer's import time as the sensor's acquisition time.

Imported waveform results use the `waveform-csv` source. Generated examples must remain labelled **TEST SIGNAL / ข้อมูลทดสอบ**, separate from imported captures and production sensor history. They demonstrate the analyzer and do not represent a measurement or establish a live FFT capability for the current RS485 profile. The current analysis workflow does not append imported or generated waveforms to the overall-reading recording journal.

The pure `SpectralAnalysis` module is available as a browser global and CommonJS export. Run its numerical/parser checks with `node tests/spectral-analysis.cjs`. Tests verify known 50/120 Hz signals, amplitude and PSD normalization, DC/Nyquist handling, agreement with an independent direct DFT, timing rejection and resource limits.

Primary references: [LabDeck vibration analysis](https://labdeck.com/vibrations-analysis/), [LabDeck spectral analysis](https://labdeck.com/spectral-analysis/), [SciPy periodogram scaling](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.periodogram.html), [SciPy Welch averaging](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.welch.html), and [SciPy STFT frames and hop size](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.stft.html).

## Validation and limits

In History or Analysis, the **วันที่มีข้อมูล** selector lists daily NDJSON journals already stored in this computer's data directory, newest first. Selecting a day loads that day's records; choose a motor and, optionally, a run to inspect the table or charts. A run spanning midnight can appear under more than one day; choose a wider date/time range to inspect across days. CSV files are exports, not the journal used by this selector, and importing an external CSV is not supported.

Unit tests use a fake Modbus client to verify serialization, per-motor failure isolation, initial connection rollback and no late reads after stopping. Filesystem tests verify configuration validation, signed/unsigned decoding, history filtering, corrupt-line recovery and CSV escaping. Scatter tests cover strict-series selection, complete/incomplete counts, reservoir sampling and append-bounded journal reads. UI tests use isolated temporary application data, fixture serial ports and explicit simulation. `layout-stability.cjs` checks all eight pages at 768×1024, 960×680, 1366×768 and 1920×1080, including shared drawer focus, Escape, backdrop dismissal and resize behavior. The existing monitor regression covers seven viewport sizes: 960×680, 1366×700, 1366×768, 1280×650, 1920×1080, 1024×768 and 768×1024. These are software fixture tests, not tests on physical iPads, calibrated sensors or every possible Windows display configuration.

Physical sensor response, installed USB drivers, RMS/Peak semantics and mounting direction still require commissioning on the target computer. The app does not infer bearing faults, reconstruct a vibration waveform/spectrum from overall values, apply alarm thresholds or operate a motor trip. Its separate overall-trend FFT describes slow scalar changes using receive timestamps only. Imported waveform analysis uses the supplied capture's timing and units; it does not validate the capture device's calibration or anti-alias filtering. It is a local acquisition tool; the data is not automatically shared with the website or other computers.
