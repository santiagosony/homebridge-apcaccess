const { queryStatus } = require('./lib/apcupsd');
const { logOnlyError, logMin } = require('./lib/logUpdate');

const PLUGIN_NAME = 'homebridge-apcaccess';
const ACCESSORY_NAME = 'APCAccess';

const DEFAULT_INTERVAL = 1;
const DEFAULT_NAME = 'APC UPS';
const DEFAULT_MANUFACTURER = 'American Power Conversion';
const DEFAULT_MODEL = 'APCAccess UPS';
const DEFAULT_HOST = 'localhost';
const DEFAULT_PORT = 3551;

const FULLY_CHARGED = 100;
const SECOND = 1000;
const UNKNOWN = 'unknown';

// AccessoryInformation characteristic -> apcupsd key / config option / default
const DEVICE_INFO = {
  Model: { key: 'MODEL', config: 'model', fallback: DEFAULT_MODEL },
  SerialNumber: { key: 'SERIALNO', config: 'serial', fallback: UNKNOWN },
  FirmwareRevision: { key: 'FIRMWARE', config: 'firmwareRevision', fallback: UNKNOWN },
  SoftwareRevision: { key: 'VERSION', config: 'softwareRevision', fallback: UNKNOWN },
};

const UPS_ACTIVE = 0x08;
const UPS_BATT_LOW = 0x40;
const UPS_NOT_CHARGEABLE = 0x80;
const UPS_NOT_CHARGING = 0x10;

let Service;
let Characteristic;

class APCAccess {
  constructor(log, config, api) {
    this.config = config || {};
    this.log = this.config.errorLogsOnly ? logOnlyError(log) : logMin(log);
    this.latestJSON = {};
    this.loaded = false;
    this.connected = false;
    this.pollTimer = undefined;

    this.state = Object.seal({
      contact: undefined,
      batteryLevel: undefined,
      lowBattery: undefined,
      chargingState: undefined,
    });

    const name = this.config.name || DEFAULT_NAME;

    this.informationService = new Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(
        Characteristic.Manufacturer,
        this.config.manufacturer || DEFAULT_MANUFACTURER,
      )
      .setCharacteristic(Characteristic.Name, name);

    // Homebridge copies the required AccessoryInformation characteristics into its own
    // service once, at startup, so later updateCharacteristic() calls never reach HomeKit.
    // It does copy onGet handlers though, so serve the UPS-reported values through them.
    Object.entries(DEVICE_INFO).forEach(([characteristic, { key, config, fallback }]) => {
      const getValue = () => this.getDeviceInfo(key, this.config[config] || fallback);
      this.informationService
        .getCharacteristic(Characteristic[characteristic])
        .updateValue(getValue())
        .onGet(getValue);
    });

    this.contactSensor = new Service.ContactSensor(name);
    this.contactSensor
      .getCharacteristic(Characteristic.ContactSensorState)
      .onGet(() => Characteristic.ContactSensorState[this.parseContactValue()]);

    // HAP-NodeJS >= 1.0 (Homebridge 2.x) renamed BatteryService to Battery
    const BatteryService = Service.Battery || Service.BatteryService;
    this.batteryService = this.withConfiguredName(new BatteryService(`${name} Charge`, 'charge'));
    this.batteryService
      .getCharacteristic(Characteristic.BatteryLevel)
      .onGet(() => this.parseBatteryLevel());
    this.batteryService
      .getCharacteristic(Characteristic.ChargingState)
      .onGet(() => Characteristic.ChargingState[this.parseChargingState()]);
    this.batteryService
      .getCharacteristic(Characteristic.StatusLowBattery)
      .onGet(() => Characteristic.StatusLowBattery[this.parseLowBatteryValue()]);

    if (this.config.temperatureSensor) {
      this.temperatureService = new Service.TemperatureSensor(name);
      this.temperatureService
        .getCharacteristic(Characteristic.CurrentTemperature)
        .onGet(() => this.getTemperature());
    }

    if (this.config.loadSensor) {
      // HomeKit has no "load" sensor; a humidity sensor is the closest built-in 0-100 % reading
      this.loadService = this.withConfiguredName(
        new Service.HumiditySensor(`${name} Load`, 'load'),
      );
      this.loadService
        .getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .onGet(() => this.getLoad());
    }

    // Only start polling once all services exist
    this.poll();

    if (api) {
      api.on('shutdown', () => {
        clearTimeout(this.pollTimer);
        this.pollTimer = undefined;
      });
    }
  }

  // iOS shows ConfiguredName, not Name, for the extra services of an accessory
  withConfiguredName = (service) => {
    if (Characteristic.ConfiguredName) {
      service.setCharacteristic(Characteristic.ConfiguredName, service.displayName);
    }
    return service;
  };

  getServices() {
    // Required by Homebridge; expose services this accessory claims to have
    const services = [this.informationService, this.contactSensor, this.batteryService];

    if (this.temperatureService) {
      services.push(this.temperatureService);
    }

    if (this.loadService) {
      services.push(this.loadService);
    }

    return services;
  }

  async poll() {
    try {
      await this.getLatestJSON();
    } finally {
      // Schedule the next poll only after this one finished, so requests never pile up
      this.pollTimer = setTimeout(
        this.poll.bind(this),
        Math.max(Number(this.config.interval) || DEFAULT_INTERVAL, 1) * SECOND,
      );
    }
  }

  async getLatestJSON() {
    try {
      this.latestJSON = await queryStatus({
        host: this.config.host || DEFAULT_HOST,
        port: Number(this.config.port) || DEFAULT_PORT,
      });

      if (!this.connected) {
        this.connected = true;
        this.log.info('Connected!');
      }

      if (!this.loaded) this.firstRun();
      this.doPolledChecks();
    } catch (err) {
      if (this.connected) {
        this.connected = false;
        this.log.error('Lost connection to apcupsd:', err.message);
      } else {
        this.log.update.error('Polling UPS service failed:', err.message);
      }
    }
  }

  firstRun() {
    this.loaded = true;
    this.setDeviceInfo();
  }

  setDeviceInfo() {
    this.log.info('UPS name:', this.parseData('UPSNAME'));

    Object.entries(DEVICE_INFO).forEach(([characteristic, { key, config, fallback }]) => {
      const info = this.getDeviceInfo(key, this.config[config] || fallback);
      this.log.info(`${characteristic}:`, info);
      this.informationService.updateCharacteristic(Characteristic[characteristic], info);
    });
  }

  // Prefer what the UPS reports, then the user's config, then a default
  getDeviceInfo = (key, fallback) => {
    const value = this.parseData(key);
    return value === UNKNOWN ? fallback : value;
  };

  getTemperature() {
    // ITEMP, e.g. "29.2 C"
    const temperature = parseFloat(this.latestJSON.ITEMP);

    if (Number.isNaN(temperature)) {
      if (this.loaded) this.log.update.error('Unable to determine Temperature');
      return 0;
    }

    this.log.update.info('Temperature:', temperature);
    return temperature;
  }

  parseData = (key) => this.latestJSON[key]?.trim() || UNKNOWN;

  parseNumber = (key) => {
    const value = parseInt(this.latestJSON[key], 10);
    return Number.isNaN(value) ? 0 : value;
  };

  parseStatFlag = () => {
    const value = Number(this.latestJSON.STATFLAG);
    return Number.isNaN(value) ? 0 : value;
  };

  parseBatteryLevel = () => Math.min(Math.max(this.parseNumber('BCHARGE'), 0), 100);

  parseTimeLeft = () => this.parseNumber('TIMELEFT');

  parseContactValue = () =>
    this.parseStatFlag() & UPS_ACTIVE ? 'CONTACT_DETECTED' : 'CONTACT_NOT_DETECTED';

  parseLowBatteryValue = () =>
    this.parseStatFlag() & UPS_BATT_LOW ? 'BATTERY_LEVEL_LOW' : 'BATTERY_LEVEL_NORMAL';

  parseChargingState = () =>
    this.parseStatFlag() & UPS_NOT_CHARGEABLE
      ? 'NOT_CHARGEABLE'
      : this.parseStatFlag() & UPS_NOT_CHARGING || this.parseBatteryLevel() === FULLY_CHARGED
        ? 'NOT_CHARGING'
        : 'CHARGING';

  checkContact() {
    const contactBool = Characteristic.ContactSensorState[this.parseContactValue()];

    this.log.update.info('Power:', contactBool ? 'Disconnected' : 'Connected');

    if (this.state.contact !== contactBool) {
      this.log.debug('Pushing contact state change; ', contactBool, this.state.contact);
      this.contactSensor.updateCharacteristic(Characteristic.ContactSensorState, contactBool);
      this.state.contact = contactBool;
    }
  }

  checkLowBattery() {
    const lowBattery = Characteristic.StatusLowBattery[this.parseLowBatteryValue()];

    this.log.update[lowBattery ? 'error' : 'info']('Battery state:', lowBattery ? 'Low' : 'Normal');

    if (this.state.lowBattery !== lowBattery) {
      this.log.debug('Pushing low battery state change; ', lowBattery, this.state.lowBattery);
      this.batteryService.updateCharacteristic(Characteristic.StatusLowBattery, lowBattery);
      this.state.lowBattery = lowBattery;
    }
  }

  checkCharging() {
    const value = this.parseChargingState();
    const chargingState = Characteristic.ChargingState[value];

    this.log.update.info('Charging state:', value);

    if (this.state.chargingState !== chargingState) {
      this.log.debug('Pushing charging state change; ', chargingState, this.state.chargingState);
      this.batteryService.updateCharacteristic(Characteristic.ChargingState, chargingState);
      this.state.chargingState = chargingState;
    }
  }

  checkBatteryLevel() {
    const batteryLevel = this.parseBatteryLevel();

    if (this.state.batteryLevel !== batteryLevel) {
      this.log.update.info(
        'Battery Level:',
        `${batteryLevel}% ${this.parseData(
          'BATTV',
        )} (${this.parseTimeLeft()} estimated minutes remaining)`,
      );
      this.log.debug('Pushing battery level change; ', batteryLevel, this.state.batteryLevel);

      this.batteryService.updateCharacteristic(Characteristic.BatteryLevel, batteryLevel);
      this.state.batteryLevel = batteryLevel;
    }
  }

  getLoad() {
    // LOADPCT, e.g. "23.0 Percent"
    const load = parseFloat(this.latestJSON.LOADPCT);

    if (Number.isNaN(load)) {
      if (this.loaded) this.log.update.error('Unable to determine Load');
      return 0;
    }

    this.log.update.info('Load:', `${load}%`);
    return Math.min(Math.max(load, 0), 100);
  }

  checkLoad() {
    if (!this.loadService) return;

    this.loadService.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.getLoad());
  }

  checkTemperature() {
    if (!this.temperatureService) return;

    this.temperatureService.updateCharacteristic(
      Characteristic.CurrentTemperature,
      this.getTemperature(),
    );
  }

  doPolledChecks() {
    this.checkContact();
    this.checkLowBattery();
    this.checkCharging();
    this.checkBatteryLevel();
    this.checkTemperature();
    this.checkLoad();
  }
}

module.exports = (api) => {
  Service = api.hap.Service;
  Characteristic = api.hap.Characteristic;
  api.registerAccessory(PLUGIN_NAME, ACCESSORY_NAME, APCAccess);
};
