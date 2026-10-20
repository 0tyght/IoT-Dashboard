# VECTRA Sensor Monitor for Windows

This folder is an independent Electron application. It does not import or modify the website in the repository root.

## Start the application

```powershell
cd windows-app
npm install
npm start
```

The first screen lists serial ports that Windows can see. A listed COM port only proves that the USB/RS485 adapter is present. Enter the settings from the sensor manufacturer's Modbus register map, then use **ทดสอบเซ็นเซอร์**. The dashboard remains locked until a valid Modbus response is received. **โหมดจำลอง** is intentionally separate from the hardware flow.

The built-in **VemSee SN-3001-WZ3A-N01** preset reads the supplied three-axis register map with function 03 or 04:

- `0000H`: temperature, signed integer ÷ 10 (`°C`)
- `0001H`–`0003H`: velocity X/Y/Z ÷ 10 (`mm/s`)
- `0004H`–`0006H`: displacement X/Y/Z ÷ 10 (`µm`)
- `000AH`–`000CH`: acceleration X/Y/Z ÷ 10 (`m/s²`)

The dashboard plots velocity X/Y/Z separately, shows the highest current axis as the primary reading, and stores every channel in the daily NDJSON record. The supplied pages list UID configuration at `07D0H` and baud-rate configuration at `07D1H`, but do not identify the unit's current factory UID, baud rate, parity or stop bits. Confirm those values before the connection test. Wiring from the supplied manual: brown `VCC 10–30 VDC`, black `GND`, yellow `485-A`, blue `485-B`.

## Build Windows executables

```powershell
npm run dist:win
```

The installer and portable x64 executable are written to `release/`. Saved configuration and daily NDJSON readings live under Electron's per-user application-data directory. The application shows the exact reading folder on its connection page.

## Commissioning requirement

Confirm the sensor model, baud rate, parity, stop bits, Modbus slave ID, function, zero-based register address, data type, byte/word order, scale and engineering unit from the manufacturer's document. Default values are placeholders and must not be assumed correct for another sensor model.
