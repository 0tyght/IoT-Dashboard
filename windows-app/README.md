# VECTRA Sensor Monitor for Windows

This folder is an independent Electron application. It does not import or modify the website in the repository root.

## Start the application

```powershell
cd windows-app
npm install
npm start
```

The first screen lists serial ports that Windows can see. A listed COM port only proves that the USB/RS485 adapter is present. Enter the settings from the sensor manufacturer's Modbus register map, then use **ทดสอบเซ็นเซอร์**. The dashboard remains locked until a valid Modbus response is received. **โหมดจำลอง** is intentionally separate from the hardware flow.

## Build Windows executables

```powershell
npm run dist:win
```

The installer and portable x64 executable are written to `release/`. Saved configuration and daily NDJSON readings live under Electron's per-user application-data directory. The application shows the exact reading folder on its connection page.

## Commissioning requirement

Confirm the sensor model, baud rate, parity, stop bits, Modbus slave ID, function, zero-based register address, data type, byte/word order, scale and engineering unit from the manufacturer's document. Default values are placeholders and must not be assumed correct for another sensor model.
