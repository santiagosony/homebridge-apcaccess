const net = require('node:net');

const record = (text) => {
  const header = Buffer.alloc(2);
  header.writeUInt16BE(Buffer.byteLength(text, 'ascii'), 0);
  return Buffer.concat([header, Buffer.from(text, 'ascii')]);
};

// Starts a TCP server that answers the NIS "status" command like apcupsd does,
// splitting the reply into tiny chunks to exercise the framing logic.
const startFakeApcupsd = (lines) =>
  new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.once('data', () => {
        const reply = Buffer.concat([...lines.map((line) => record(`${line}\n`)), Buffer.alloc(2)]);
        for (let i = 0; i < reply.length; i += 3) socket.write(reply.subarray(i, i + 3));
        socket.end();
      });
    });

    server.listen(0, '127.0.0.1', () => resolve(server));
  });

module.exports = { startFakeApcupsd };
