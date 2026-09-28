# Standards and operational review — 28 September 2026

Status: demonstration only; not verified for operational decisions or standard conformity.

## Findings

- The Class I–IV table reproduces a legacy reference, not a universal current classification for all motors. Its numbers must not simply be relabelled ISO 20816. Exact-boundary assignment to the higher zone is an explicit prototype policy.
- ISO 20816-1:2016 provides general measurement/evaluation guidance. The applicable machine-specific part must also be selected. ISO 20816-3:2022 has a scope above 15 kW and 120–30,000 r/min, with equipment/coupling exclusions. The supplied example 4 kW nameplate cannot be assigned to this scope solely from its power and speed. Pending FDIS revisions are not used as published standards.
- Public scope pages and the manufacturer reference were checked; the complete normative texts and the actual installation have not been verified. No claim of certification or complete conformity is made.
- One scalar per motor cannot represent multiple measurement locations and directions reliably. No sensor transport, measurement quality, operating state, frequency band, calibration metadata or durable history exists in this prototype.
- A 2-second simulated display refresh is not a sensor sampling frequency. The sparkline is only 30 simulated samples, not a recorded maintenance trend.
- Local storage is device/browser-specific. GitHub Pages hosts the static frontend; it provides no shared telemetry database or authenticated operator workflow here.

## Corrections in this review

- Rename the Zone A percentage so it is not presented as overall plant health.
- Order simulated attention entries by Zone D before C, then by value relative to the class D threshold; this is a UI ordering policy, not an ISO alarm priority rule.
- Mark readings above the 45 mm/s graph extent explicitly, retain the true numeric reading and mark the overview point with a downward arrow.
- On invalid saved registry, show no fabricated demo motors; retain the original stored bytes for recovery/export.
- Make pause status explicit beside the reading and label the timestamp as simulated.
- Keep selected-motor details in the side inspector and the full matrix unchanged.

## Before commissioning

1. Record the driven equipment, coupling, power, shaft height, support behavior and operating speed/load. Select a published applicable standard and edition together with OEM requirements; retain an approved assessment profile per machine. Missing/unapproved profiles must be unevaluated, not default Class I.
2. Map each sensor to a physical DE/NDE measurement point and direction (horizontal/vertical/axial as applicable). Record unit, RMS/peak definition, measurement bandwidth, mounting method, calibration and measurement timestamp. Do not directly compare acceleration g or peak readings to velocity RMS limits.
3. Use explicit Running, Stopped, Starting, No data, Stale and Sensor fault states. Zero or disconnected readings must not automatically imply a healthy machine. Staleness must use source timestamps and agreed reporting intervals.
4. Evaluate both magnitude and change from a comparable operating baseline. Agree alarm persistence, hysteresis, priority, acknowledgement and escalation with the responsible engineer. A severity zone is not an automatic trip command. Protect any trip function independently of this browser interface.
5. Add a secured telemetry/backend service, shared asset database, persistent history, access roles, change audit, backups and concurrent-edit handling. Test reconnection, delayed/out-of-order data, sensor faults, downtime and recovery with actual devices.
6. Validate thresholds, units and channel mapping against a suitable reference instrument and the licensed applicable standards. Conduct site acceptance under representative operating conditions before operators rely on the result.

## Sources

- ISO 20816-1:2016: https://www.iso.org/standard/63180.html
- ISO 20816-3:2022: https://www.iso.org/standard/78311.html
- Analog Devices, legacy table (Tables 6–7), not a substitute for normative text: https://www.analog.com/en/resources/technical-articles/why-memes-acceler-are-best-choice-for-cbm-apps.html

## Verification

Run `tests/standards.cjs` for all 12 zone boundaries, cross-class priority, values above plot range and corrupt storage. The existing dashboard/storage suites exercise CRUD, backup/import, empty registry and responsive layouts. These tests verify software behavior, not physical measurement accuracy or ISO conformity.
