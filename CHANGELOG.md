# [2.0.0]

- Homebridge 2.x support (tested with v2.4.0), while keeping Homebridge 1.8+ working.
  - Use `Service.Battery` (HAP-NodeJS 1.x/2.x removed `Service.BatteryService`, which caused `TypeError: Service.BatteryService is not a constructor`).
  - Replace deprecated `on('get', callback)` handlers with `onGet`.
- Replace the unmaintained `apcaccess` dependency with a small built-in apcupsd NIS client: a new connection per poll, with a 5s timeout, so the plugin recovers by itself when apcupsd restarts or the network drops.
- Polling no longer overlaps (next poll is scheduled after the previous one finishes) and starts only after all services exist; it stops on Homebridge shutdown.
- Temperature sensor value is now pushed to HomeKit on every poll and keeps decimals.
- Add `config.schema.json` for the Homebridge UI: host and port side by side (port is a plain number field), temperature sensor explained (ITEMP is only reported by Smart-UPS models), polling/logging and accessory information grouped in collapsed sections. Empty fields fall back to the defaults.
- Services are now named after what they show: `<name> Charge` (battery), `<name> Power` (mains power sensor) and `<name> Temperature`, e.g. "UPS Charge".
- New `contactSensor` option (default `true`) to hide the mains power contact sensor, and `powerSensorType` (`contact`, `leak` or `smoke`) to publish it as a leak or smoke sensor so power cuts arrive as HomeKit critical alerts.
- Line voltage is only logged with the new `logVoltage` option, and only when it changed at least `voltageLogThreshold` % (default 5) since the last logged value.
- New optional `voltageSensor`: exposes the input line voltage (`LINEV`) as a light sensor (lux = volts).
- New optional `loadSensor`: exposes the UPS load (`LOADPCT`) as a humidity sensor, HomeKit's closest 0-100 % reading.
- Fix: with `errorLogsOnly` enabled, a low battery or an unreachable apcupsd threw `update.error is not a function`, which could stop Homebridge. Unexpected polling errors are now always caught and logged.
- When apcupsd can't be reached (at startup, or after 3 failed polls in a row) the UPS shows as "No Response" in HomeKit instead of its last known values.
- With several UPS configured, each one now keeps its own log de-duplication, so one UPS no longer hides another's log lines.
- New optional `lowBatteryLevel` (%) and `lowBatteryMinutes` (runtime left while on battery) thresholds to report low battery before the UPS does.
- Manufacturer now defaults to `APC` and is no longer asked for in the settings form (`manufacturer` in `config.json` is still honoured).
- Fix: when apcupsd loses the UPS (`COMMLOST`, e.g. USB cable unplugged) the plugin reported a power cut, a false critical alert with the leak/smoke sensor types. It now shows the UPS as "No Response". "On battery" is read from apcupsd's on-battery flag.
- Fix: apcupsd's "replace battery" flag was shown as "Not chargeable". It is now reported as low battery, with a warning in the log.
- Fix: shutting down while a request to apcupsd was in flight kept the plugin polling after shutdown, so Homebridge had to force-exit after 5 s. The request is now cancelled on shutdown.
- Polling interval is clamped to at least 1 second.
- Model, serial number and firmware/software revision reported by the UPS now actually show up in HomeKit and the Homebridge UI (served through `onGet`, since Homebridge copies the required AccessoryInformation values only once at startup). The accessory name always comes from the `name` config option; the UPS name is only logged.
- Tooling: ESLint 9 (flat config), Prettier 3, `node:test` unit tests; drop `prettier-eslint` and `eslint-config-airbnb-base`.

# [1.0.3]

- Remove instances of WARN, log as INFO or ERROR only to clean up suppression.
- Update packages.

# [1.0.2]

- BATTV isn't guaranteed to be present; fix parseData to not rely on key presence.

# [1.0.1]

- Pretty new display name (via [davidjbradshaw](https://github.com/davidjbradshaw))

# [1.0.0]

- Significant improvements / rewrite, sufficient to declare this v1.0.0, by [davidjbradshaw](https://github.com/davidjbradshaw). Thank you!
- Push realtime data to HomeBridge, rather than just waiting for it to be pulled
- Improved logging
  - Power disconnect/reconnect is now a warning
  - Battery level now shows time remaining and voltage
  - warn/error now also have code to stop the same message being shown twice
- Code refactor
  - Created parse functions, to allow code reuse
  - Upgraded to latest version of esLint/prettier
  - log.update -> log.update.info
  - Defined consts for bitwise values
  - Defined consts for default values
  - Defined consts for magic numbers
- Updated README to show default values

# [0.2.2]

- Add optional temperature sensor. Optional temperature sensor added by [ThisIsQasim](https://github.com/ThisIsQasim). Thank you!
- Logging reduced by default, and new option to omit all logging except errors. Logging improvements by [davidjbradshaw](https://github.com/davidjbradshaw). Thank you!

# [0.1.2]

- Report zero battery level if no bad value passed through to avoid crash.

# [0.1.0]

- Publish battery service in Home friendly way

# [0.0.8]

- Fix client promise handling

# [0.0.7]

- ESLint and Prettier

# [0.0.5/0.0.6]

- Cache the JSON result
- Refactor state
- Secure NPM profile and add keywords

# [0.0.4]

- Tweak name config

# [0.0.3]

- Learned how to push changes to homekit using updateValue. So now it alerts properly!
- We're due a refactor now. But it works!

# [0.0.2]

- Added Battery statistics (on Sensor; in future we may want to reveal as BatteryService)

# [0.0.1]

- Contact State reported on enquiry
