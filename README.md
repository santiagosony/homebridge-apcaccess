# homebridge-apcaccess

A [Homebridge](https://github.com/homebridge/homebridge) plugin that exposes an APC UPS managed by [apcupsd](http://www.apcupsd.org/) to HomeKit: power cuts, battery charge and, optionally, temperature, load and line voltage. Works with Homebridge 1.8+ and 2.x (tested with v2.4.0).

Several UPS are supported: add one accessory per apcupsd instance.

## What shows up in HomeKit

Each service is named after the accessory `name` (`UPS` in these examples):

| Service             | HomeKit type                            | Shows                                                    | Option                             |
| ------------------- | --------------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| **UPS Power**       | Contact sensor (or leak / smoke sensor) | Open / leak / smoke while running on battery             | `contactSensor`, `powerSensorType` |
| **UPS Charge**      | Battery                                 | Charge %, charging state, low battery                    | always                             |
| **UPS Temperature** | Temperature sensor                      | UPS internal temperature (`ITEMP`)                       | `temperatureSensor`                |
| **UPS Load**        | Light sensor                            | Load, % of rated power in use (`LOADPCT`), 23 lux = 23 % | `loadSensor`                       |
| **UPS Voltage**     | Light sensor                            | Input line voltage (`LINEV`), 222 lux = 222 V            | `voltageSensor`                    |

- **Power cut alerts:** the power sensor is a contact sensor by default. Set `powerSensorType` to `leak` or `smoke` to get HomeKit **critical alerts**, which get through Do Not Disturb and Focus. The Home app will word them as a leak or smoke alarm.
- **Low battery** is reported when the UPS flags it, when it asks for a new battery, or below the optional `lowBatteryLevel` / `lowBatteryMinutes` thresholds.
- **Load and voltage** use light sensors because HomeKit has no load or voltage sensor types (a light sensor accepts any positive number, and keeps them apart from the room's real humidity sensors).
- **Temperature** is only reported by Smart-UPS models. Back-UPS and most consumer models don't have it.
- **No Response:** if apcupsd can't be reached, or it loses contact with the UPS (`COMMLOST`), the accessory shows as "No Response" instead of stale values.
- **Accessory information:** model, serial number, firmware and apcupsd version are read from the UPS.

## Requirements

- Homebridge `^1.8.0` or `^2.0.0`
- Node.js 20, 22, 24 or 26 (Homebridge 2.x itself requires Node.js 22+)
- apcupsd with its Network Information Server enabled (`NETSERVER on` in `/etc/apcupsd/apcupsd.conf`, port 3551 by default)

The plugin has no runtime dependencies: it talks to apcupsd's NIS protocol directly, opening a new connection on every poll, so it recovers on its own when apcupsd restarts.

## Configuration

Configure it from the Homebridge UI, or add an accessory to `config.json`. Every option except `accessory` and `name` is optional; these are the defaults:

```json
{
  "accessories": [
    {
      "accessory": "APCAccess",
      "name": "APC UPS",
      "host": "localhost",
      "port": 3551,
      "contactSensor": true,
      "powerSensorType": "contact",
      "temperatureSensor": false,
      "loadSensor": false,
      "voltageSensor": false,
      "lowBatteryLevel": 0,
      "lowBatteryMinutes": 0,
      "interval": 1,
      "errorLogsOnly": false,
      "logVoltage": false,
      "voltageLogThreshold": 5
    }
  ]
}
```

| Option                                             | Description                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `name`                                             | Accessory name, also used as prefix for the service names.                                                |
| `host`, `port`                                     | Where apcupsd's NIS listens.                                                                              |
| `contactSensor`                                    | Expose the power sensor. Turn off if you only want the battery status.                                    |
| `powerSensorType`                                  | `contact`, `leak` or `smoke` (see above).                                                                 |
| `temperatureSensor`, `loadSensor`, `voltageSensor` | Expose the optional sensors.                                                                              |
| `lowBatteryLevel`                                  | Also report low battery at or below this charge %. `0` disables it.                                       |
| `lowBatteryMinutes`                                | While on battery, also report low battery at or below this many minutes of runtime left. `0` disables it. |
| `interval`                                         | Polling interval in seconds (minimum 1).                                                                  |
| `errorLogsOnly`                                    | Only log errors and warnings.                                                                             |
| `logVoltage`                                       | Log the line voltage when it changes (with or without the voltage sensor).                                |
| `voltageLogThreshold`                              | Only log the voltage when it moved at least this % since the last logged value. `0` logs every change.    |
| `model`, `serial`, `firmwareRevision`              | Only used if the UPS doesn't report them.                                                                 |

## Development

```sh
npm install
npm test   # eslint + prettier check + unit tests, including tests against Homebridge 2's HAP-NodeJS
```

CI runs the same on Node 22 and 24.

## Credits

Originally written by [Paul Curry (cr3ative)](https://github.com/cr3ative/homebridge-apcaccess), with contributions from [davidjbradshaw](https://github.com/davidjbradshaw) and [ThisIsQasim](https://github.com/ThisIsQasim). See the [CHANGELOG](CHANGELOG.md).
