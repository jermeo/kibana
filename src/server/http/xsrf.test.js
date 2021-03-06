import { fromNode as fn } from 'bluebird';
import { resolve } from 'path';
import * as kbnTestServer from '../../test_utils/kbn_server';

const destructiveMethods = ['POST', 'PUT', 'DELETE'];
const src = resolve.bind(null, __dirname, '../../../src');

const xsrfHeader = 'kbn-xsrf';
const versionHeader = 'kbn-version';
const testPath = '/xsrf/test/route';
const whitelistedTestPath = '/xsrf/test/route/whitelisted';
const actualVersion = require(src('../package.json')).version;

describe('xsrf request filter', function () {
  function inject(kbnServer, opts) {
    return fn(cb => {
      kbnTestServer.makeRequest(kbnServer, opts, (resp) => {
        cb(null, resp);
      });
    });
  }

  const makeServer = async function () {
    const kbnServer = kbnTestServer.createServer({
      server: {
        xsrf: {
          disableProtection: false,
          whitelist: [whitelistedTestPath]
        }
      }
    });

    await kbnServer.ready();

    kbnServer.server.route({
      path: testPath,
      method: 'GET',
      handler: function (req, reply) {
        reply(null, 'ok');
      }
    });

    kbnServer.server.route({
      path: testPath,
      method: destructiveMethods,
      config: {
        // Disable payload parsing to make HapiJS server accept any content-type header.
        payload: {
          parse: false
        }
      },
      handler: function (req, reply) {
        reply(null, 'ok');
      }
    });

    kbnServer.server.route({
      path: whitelistedTestPath,
      method: destructiveMethods,
      config: {
        // Disable payload parsing to make HapiJS server accept any content-type header.
        payload: {
          parse: false
        }
      },
      handler: function (req, reply) {
        reply(null, 'ok');
      }
    });

    return kbnServer;
  };

  let kbnServer;
  beforeEach(async () => {
    kbnServer = await makeServer();
  });

  afterEach(async () => {
    await kbnServer.close();
  });

  describe(`nonDestructiveMethod: GET`, function () {
    it('accepts requests without a token', async function () {
      const resp = await inject(kbnServer, {
        url: testPath,
        method: 'GET'
      });

      expect(resp.statusCode).toBe(200);
      expect(resp.payload).toBe('ok');
    });

    it('accepts requests with the xsrf header', async function () {
      const resp = await inject(kbnServer, {
        url: testPath,
        method: 'GET',
        headers: {
          [xsrfHeader]: 'anything',
        },
      });

      expect(resp.statusCode).toBe(200);
      expect(resp.payload).toBe('ok');
    });
  });

  describe(`nonDestructiveMethod: HEAD`, function () {
    it('accepts requests without a token', async function () {
      const resp = await inject(kbnServer, {
        url: testPath,
        method: 'HEAD'
      });

      expect(resp.statusCode).toBe(200);
      expect(resp.payload).toHaveLength(0);
    });

    it('accepts requests with the xsrf header', async function () {
      const resp = await inject(kbnServer, {
        url: testPath,
        method: 'HEAD',
        headers: {
          [xsrfHeader]: 'anything',
        },
      });

      expect(resp.statusCode).toBe(200);
      expect(resp.payload).toHaveLength(0);
    });
  });

  for (const method of destructiveMethods) {
    describe(`destructiveMethod: ${method}`, function () { // eslint-disable-line no-loop-func
      it('accepts requests with the xsrf header', async function () {
        const resp = await inject(kbnServer, {
          url: testPath,
          method: method,
          headers: {
            [xsrfHeader]: 'anything',
          },
        });

        expect(resp.statusCode).toBe(200);
        expect(resp.payload).toBe('ok');
      });

      // this is still valid for existing csrf protection support
      // it does not actually do any validation on the version value itself
      it('accepts requests with the version header', async function () {
        const resp = await inject(kbnServer, {
          url: testPath,
          method: method,
          headers: {
            [versionHeader]: actualVersion,
          },
        });

        expect(resp.statusCode).toBe(200);
        expect(resp.payload).toBe('ok');
      });

      it('rejects requests without either an xsrf or version header', async function () {
        const resp = await inject(kbnServer, {
          url: testPath,
          method: method
        });

        expect(resp.statusCode).toBe(400);
        expect(resp.result.message).toBe('Request must contain a kbn-xsrf header.');
      });

      it('accepts whitelisted requests without either an xsrf or version header', async function () {
        const resp = await inject(kbnServer, {
          url: whitelistedTestPath,
          method: method
        });

        expect(resp.statusCode).toBe(200);
        expect(resp.payload).toBe('ok');
      });
    });
  }
});
