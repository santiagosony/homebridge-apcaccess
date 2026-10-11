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
  'LOADPCT  : 23.0 Percent',
];

const silentLog = () => {
  const log = () => {};
  ['info', 'warn', 'error', 'debug', 'success'].forEach((level) => {
    log[level] = () => {};
  });
  return log;
};

// Running on battery: UPS_ONBATT (0x10) set, UPS_ONLINE (0x08) cleared
const ON_BATTERY = STATUS.map((line) =>
  line.startsWith('STATFLAG') ? 'STATFLAG : 0x05000050' : line,
);

const createAccessory = async (t, { status = STATUS, ...config }) => {
  const { HAPLibraryVersion, ...hap } = await import('@homebridge/hap-nodejs');
  const server = await startFakeApcupsd(status);

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
    { name: 'UPS', host: '127.0.0.1', port: server.address().port, interval: 60, ...config },
    api,
  );
  t.after(() => {
    api.emit('shutdown');
    server.close();
  });

  return { accessory, hap };
};

const waitForFirstPoll = async (accessory) => {
  for (let i = 0; i < 50 && !accessory.loaded; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(accessory.loaded);
};

test('works against the HAP-NodeJS shipped with Homebridge 2', async (t) => {
  const { accessory, hap } = await createAccessory(t, {
    temperatureSensor: true,
    loadSensor: true,
  });
  const { Characteristic, Service } = hap;

  const services = accessory.getServices();
  assert.equal(services.length, 5);
  assert.ok(services.some((service) => service instanceof Service.Battery));

  // Mimic Homebridge: it copies the plugin's AccessoryInformation into the accessory's own service
  const bridgedInfo = new Service.AccessoryInformation();
  bridgedInfo.replaceCharacteristicsFromService(accessory.informationService);

  await waitForFirstPoll(accessory);

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
    value(accessory.powerService, Characteristic.ContactSensorState),
    Characteristic.ContactSensorState.CONTACT_DETECTED,
  );
  assert.ok(
    Math.abs(value(accessory.temperatureService, Characteristic.CurrentTemperature) - 29.2) < 0.01,
  );
  assert.equal(value(accessory.loadService, Characteristic.CurrentRelativeHumidity), 23);
  assert.equal(value(accessory.loadService, Characteristic.ConfiguredName), 'UPS Load');
  assert.equal(value(accessory.batteryService, Characteristic.Name), 'UPS Charge');
  assert.equal(value(accessory.batteryService, Characteristic.ConfiguredName), 'UPS Charge');
  assert.equal(value(accessory.informationService, Characteristic.SerialNumber), '3B1234X56789');

  // Values reported by the UPS reach the service HomeKit actually reads
  const read = (characteristic) => bridgedInfo.getCharacteristic(characteristic).handleGetRequest();
  assert.equal(await read(Characteristic.SerialNumber), '3B1234X56789');
  assert.equal(await read(Characteristic.Model), 'Back-UPS XS 700U');
  assert.equal(await read(Characteristic.FirmwareRevision), '924.Z3 .I USB FW:Z3');
  assert.equal(await read(Characteristic.SoftwareRevision), '3.14.14 (31 May 2016) debian');
  assert.equal(await read(Characteristic.Name), 'UPS');

  // onGet handlers answer HomeKit reads
  assert.equal(
    await accessory.batteryService
      .getCharacteristic(Characteristic.BatteryLevel)
      .handleGetRequest(),
    42,
  );
});

test('the contact sensor can be turned off', async (t) => {
  const { accessory, hap } = await createAccessory(t, { contactSensor: false });
  const { Characteristic, Service } = hap;
  await waitForFirstPoll(accessory);

  const services = accessory.getServices();
  assert.equal(services.length, 2);
  assert.ok(!services.some((service) => service instanceof Service.ContactSensor));
  assert.equal(accessory.batteryService.getCharacteristic(Characteristic.BatteryLevel).value, 42);
});

for (const [type, service, characteristic, value] of [
  ['leak', 'LeakSensor', 'LeakDetected', 'LEAK_DETECTED'],
  ['smoke', 'SmokeSensor', 'SmokeDetected', 'SMOKE_DETECTED'],
]) {
  test(`the power sensor can be a ${type} sensor`, async (t) => {
    const { accessory, hap } = await createAccessory(t, {
      powerSensorType: type,
      status: ON_BATTERY,
    });
    const { Characteristic, Service } = hap;
    await waitForFirstPoll(accessory);

    assert.ok(accessory.powerService instanceof Service[service]);
    assert.ok(!accessory.getServices().some((s) => s instanceof Service.ContactSensor));
    assert.equal(
      accessory.powerService.getCharacteristic(Characteristic[characteristic]).value,
      Characteristic[characteristic][value],
    );
  });
}
