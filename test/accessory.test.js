const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { startFakeApcupsd } = require('./fakeApcupsd');

const STATUS = [
  'UPSNAME  : rack-ups',
  'MODEL    : Back-UPS XS 700U',
  'SERIALNO : 3B1234X56789',
  'VERSION  : 3.14.14 (31 May 2016) debian',
  'FIRMWARE : 924.Z3 .I USB FW:Z3',
  'STATFLAG : 0x05000048',
  'BCHARGE  : 42.0 Percent',
  'TIMELEFT : 12.5 Minutes',
  'BATTV    : 13.2 Volts',
  'ITEMP    : 29.2 C',
];

const silentLog = () => {
  const log = () => {};
  ['info', 'warn', 'error', 'debug', 'success'].forEach((level) => {
    log[level] = () => {};
  });
  return log;
};

test('works against the HAP-NodeJS shipped with Homebridge 2', async (t) => {
  const { HAPLibraryVersion, ...hap } = await import('@homebridge/hap-nodejs');
  const { Characteristic, Service } = hap;
  const server = await startFakeApcupsd(STATUS);

  const api = new EventEmitter();
  api.hap = hap;
  let Accessory;
  api.registerAccessory = (plugin, name, constructor) => {
    assert.equal(plugin, 'homebridge-apcaccess');
    assert.equal(name, 'APCAccess');
    Accessory = constructor;
  };
  require('..')(api);
  t.diagnostic(`HAP-NodeJS ${HAPLibraryVersion()}`);

  const accessory = new Accessory(
    silentLog(),
    {
      name: 'UPS',
      host: '127.0.0.1',
      port: server.address().port,
      interval: 60,
      temperatureSensor: true,
    },
    api,
  );
  t.after(() => {
    api.emit('shutdown');
    server.close();
  });

  const services = accessory.getServices();
  assert.equal(services.length, 4);
  assert.ok(services.some((service) => service instanceof Service.Battery));

  // Wait for the first poll to land
  for (let i = 0; i < 50 && !accessory.loaded; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(accessory.loaded);

  const value = (service, characteristic) => service.getCharacteristic(characteristic).value;

  assert.equal(value(accessory.batteryService, Characteristic.BatteryLevel), 42);
  assert.equal(
    value(accessory.batteryService, Characteristic.StatusLowBattery),
    Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW,
  );
  assert.equal(
    value(accessory.batteryService, Characteristic.ChargingState),
    Characteristic.ChargingState.CHARGING,
  );
  assert.equal(
    value(accessory.contactSensor, Characteristic.ContactSensorState),
    Characteristic.ContactSensorState.CONTACT_DETECTED,
  );
  assert.ok(
    Math.abs(value(accessory.temperatureService, Characteristic.CurrentTemperature) - 29.2) < 0.01,
  );
  assert.equal(value(accessory.informationService, Characteristic.SerialNumber), '3B1234X56789');

  // onGet handlers answer HomeKit reads
  assert.equal(
    await accessory.batteryService
      .getCharacteristic(Characteristic.BatteryLevel)
      .handleGetRequest(),
    42,
  );
});
