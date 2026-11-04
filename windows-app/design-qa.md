# VECTRA desktop interface review

## Reference and render

| Source attachment | Source pixels | Electron capture | Viewport and capture pixels | State |
| --- | --- | --- | --- | --- |
| `codex-clipboard-fada6132-cb9c-4ae5-ba31-a89a068dea20.png` | 1024 × 768 | `.artifacts/monitor-1366x768.png` | 1366 × 768 | Selected device and readings |
| `codex-clipboard-06471b6b-67b4-4af4-a33d-cd4e57566bf1.png` | 1024 × 768 | `.artifacts/register-editor-1366.png` | 1366 × 768 | Device form with COM ports and Register fields |
| `codex-clipboard-c1363194-e5a4-4a72-bc5a-3100ff2736a6.png` | 752 × 564 | `.artifacts/meter-register-1366.png` | 1366 × 768 | Right-side meter editor and background dimming |

The references are flattened screenshots, so their CSS sizes and device pixel ratios are unknown. Compare the interface inside the lavender presentation margins by region and proportions. The Electron captures use viewport-sized CSS pixels at 1× density. Readings in the captures come from isolated QA fixtures.

## Comparison

- The desktop render has the reference's light icon rail and adjacent item list. The plot rows preserve the common time scale and keep acquisition values in view. At 960 × 680 the same navigation moves above the content so the three plots fit.
- The device form uses the reference's two-part organization. The ports remain visible while the Register fields scroll, and the bottom actions remain in view. The meter editor keeps a narrower sheet until additional registers are expanded.
- The first render retained a dark list in the monitor and light heading text on a white list in other views. Removing the dark list rules corrected both. The post-fix monitor and drawer captures show the light list and its selected row.
- The first right sheet inherited a centered modal's width and form height cap. The updated drawer fills the right edge and viewport height. The form scrolls independently of the COM list. The device and meter drawer tests verify the bounds and Save button at 768, 960, 1366 and 1920 px.

The desktop tests cover navigation, keyboard focus, workspace selection, responsive charts, device and meter settings, recording and history. The scan's small-text advisories apply primarily to existing compact telemetry annotations. Physical serial acquisition requires separate hardware verification.

final result: passed
