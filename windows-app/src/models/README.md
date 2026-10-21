# Industrial drive V4

Reused from the user-provided `industrial-drive-3d/output_v4/preview_3d_v4.html` and `preview_reference_v4.png`. The self-contained HTML embeds the user's full `industrial_drive_game_v4.glb`; it requires no CDN or third-party runtime. The source project is preserved unchanged.

Dashboard adaptations: isolated sandboxed iframe, white/violet controls, hidden standalone delivery annotations/download, viewport fitting on resize and a readiness/fallback message. The preview renderer uses simplified materials and does not display the normal texture, as documented by the original asset. The image fallback is the user's actual V4 render.

The assembly is a reference visualization, not a calibrated CAD model or a verified mapping to each motor profile. No sensor position, axis orientation, machine movement or severity is inferred from this mesh. Sensor mounting/asset associations still require physical confirmation.
