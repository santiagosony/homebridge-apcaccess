const T = () => true;

const createLevel = (logLevel) => (update) => (update ? logLevel : 'debug');
const info = createLevel('info');
const warn = createLevel('warn');
const error = createLevel('error');

const output =
  (level) =>
  (log, keys) =>
  (key, value = '') => {
    const update = keys[key] !== value;
    if (update) keys[key] = value;
    return log[level(update)](key, value);
  };

const logMin = (log) => {
  // Last value logged per message, kept per logger so several UPS don't hide each other's lines
  const keys = Object.create(null);

  return {
    ...log,
    update: {
      info: output(info)(log, keys),
      warn: output(warn)(log, keys),
      error: output(error)(log, keys),
    },
  };
};

const logOnlyError = (log) => {
  const min = logMin(log);

  return {
    ...min,
    info: T,
    update: {
      ...min.update,
      info: T,
    },
  };
};

module.exports = {
  logMin,
  logOnlyError,
};
