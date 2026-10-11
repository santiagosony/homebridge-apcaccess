# homebridge-apcaccess

An [apcaccess](https://github.com/mapero/apcaccess) wrapper for [Homebridge](https://github.com/homebridge/homebridge). Supports precisely one UPS. If you're on battery power, the Contact Sensor is open.

<img src="https://user-images.githubusercontent.com/1850718/75247783-a0bd6b00-57ca-11ea-9391-0db0afdaf2cf.PNG" width="250" align="right"/>

This accessory:

- Is essentially a worse version of [homespun/homebridge-accessory-apcupsd](https://github.com/homespun/homebridge-accessory-apcupsd) which I was too dumb to get working.
- Publishes a `Battery` service named `<name> Charge` to show charging state / battery levels.
- Publishes `ContactSensor` two subscribable events: `Contact State` and `Low Battery`, for your push alerting pleasure. Can be turned off with `"contactSensor": false`, or published as a leak (`"powerSensorType": "leak"`) or smoke (`"smoke"`) sensor instead: HomeKit sends those as critical alerts, which get through Do Not Disturb / Focus (the Home app will word them as a leak or smoke alarm).
- Optionally publishes a `TemperatureSensor` with the UPS internal temperature (apcupsd's `ITEMP`). Only Smart-UPS models report it; Back-UPS models don't.
- Optionally publishes the UPS load (apcupsd's `LOADPCT`, % of rated power in use) as a `HumiditySensor` named `<name> Load`, since HomeKit has no load sensor type.
- Optionally publishes the input line voltage (apcupsd's `LINEV`) as a `LightSensor` named `<name> Voltage` (222 lux = 222 V), since HomeKit has no voltage sensor type.

## Requirements

- Homebridge `^1.8.0` or `^2.0.0` (tested with v2.4.0)
- Node.js 20, 22, 24 or 26 (Homebridge 2.x itself requires Node.js 22+)
- [apcupsd](http://www.apcupsd.org/) with its Network Information Server enabled (`NETSERVER on` in `apcupsd.conf`)

The plugin has no runtime dependencies: it talks to apcupsd's NIS protocol directly.

## Configuration

The plugin will run with these default values, they can be changed in the `accessories: []` section of homebridge config:

```json
{
    "name": "APC UPS",
    "host": "127.0.0.1",
    "port": 3551,
    "manufacturer": "American Power Conversion",
    "model": "APCAccess UPS",
    "serial": "unknown",
    "interval": 1,
    "contactSensor": true,
    "powerSensorType": "contact",
    "temperatureSensor": false,
    "loadSensor": false,
    "voltageSensor": false,
    "lowBatteryLevel": 0,
    "lowBatteryMinutes": 0,
    "errorLogsOnly": false
}
```

`interval` is in seconds (minimum 1).

Low battery is reported when the UPS itself flags it. `lowBatteryLevel` (%) and `lowBatteryMinutes` (estimated runtime left, only checked while on battery) can trigger it earlier; `0` disables them.

Once connected, the model, serial number, firmware and apcupsd version reported by the UPS replace the `model`, `serial`, `firmwareRevision` and `softwareRevision` values; those options are only used as a fallback when the UPS doesn't report them. The accessory name always comes from `name`.

The plugin also ships a `config.schema.json`, so it can be configured from the Homebridge UI.

## Development

```sh
npm install
npm test   # eslint + prettier check + unit tests (includes a test against Homebridge 2's HAP-NodeJS)
```
