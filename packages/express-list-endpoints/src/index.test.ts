import * as chai from 'chai';
import express from 'express';
import mocha from 'mocha';

import listEndpoints, { type Endpoint } from '../src/index.js';

const before = mocha.before;
const expect = chai.expect;

function assertResult(endpoints: Endpoint[]) {
  chai.assert.isArray(endpoints);
  chai.assert.lengthOf(endpoints, 2);

  endpoints.forEach((endpoint) => {
    chai.assert.typeOf(endpoint, 'object');

    chai.assert.typeOf(endpoint.path, 'string');
    chai.assert.include(endpoint.path, '/');

    chai.assert.isArray(endpoint.methods);
    endpoint.methods.forEach((method) => {
      chai.assert.typeOf(method, 'string');
      chai.assert.equal(method, method.toUpperCase());
      chai.assert.notEqual(method, '_ALL');
    });

    chai.assert.isArray(endpoint.middlewares);
    endpoint.middlewares.forEach((middleware) => {
      chai.assert.typeOf(middleware, 'string');
    });
  });
}

describe('express-list-endpoints', () => {
  describe('when called with non configured app', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();

      endpoints = listEndpoints(app);
    });

    it('should return an empty array', () => {
      chai.assert.isArray(endpoints);
      chai.assert.lengthOf(endpoints, 0);
    });
  });

  describe('when called over an app', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();

      app
        .route('/')
        .get((_req, res) => {
          res.end();
        })
        .all((_req, res) => {
          res.end();
        })
        .post((_req, res) => {
          res.end();
        });

      app
        .route('/testing')
        .all((_req, res) => {
          res.end();
        })
        .delete((_req, res) => {
          res.end();
        });

      endpoints = listEndpoints(app);
    });

    it('should return an array of well formed objects', () => {
      assertResult(endpoints);
    });
  });

  describe('when called over a router', () => {
    let endpoints: Endpoint[];

    before(() => {
      const router = express.Router();

      router
        .route('/')
        .get((_req, res) => {
          res.end();
        })
        .all((_req, res) => {
          res.end();
        })
        .post((_req, res) => {
          res.end();
        });

      router
        .route('/testing')
        .all((_req, res) => {
          res.end();
        })
        .delete((_req, res) => {
          res.end();
        });

      endpoints = listEndpoints(router);
    });

    it('should return an array of well formed objects', () => {
      assertResult(endpoints);
    });
  });

  describe('when called over an app with mounted routers', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();
      const router = express.Router();

      app
        .route('/testing')
        .all((_req, res) => {
          res.end();
        })
        .delete((_req, res) => {
          res.end();
        });

      router
        .route('/')
        .get((_req, res) => {
          res.end();
        })
        .all((_req, res) => {
          res.end();
        })
        .post((_req, res) => {
          res.end();
        });

      app.use('/router', router);

      endpoints = listEndpoints(app);
    });

    it('should return an array of well formed objects', () => {
      assertResult(endpoints);
    });

    describe('and some of the routers has the option `mergeParams`', () => {
      let endpoints: Endpoint[];

      before(() => {
        const app = express();
        const router = express.Router({ mergeParams: true });

        router.get('/:id/friends', (_req, res) => {
          res.end();
        });

        app.use('/router', router);

        endpoints = listEndpoints(app);
      });

      it('should parse the endpoints correctly', () => {
        expect(endpoints).to.have.length(1);
        expect(endpoints[0].path).to.be.equal('/router/:id/friends');
      });

      describe('and also has a sub-router on the router', () => {
        let endpoints: Endpoint[];

        before(() => {
          const app = express();
          const router = express.Router({ mergeParams: true });
          const subRouter = express.Router();

          subRouter.get('/', (_req, res) => {
            res.end();
          });

          app.use('/router', router);

          router.use('/:postId/sub-router', subRouter);

          endpoints = listEndpoints(app);
        });

        it('should parse the endpoints correctly', () => {
          chai.assert.lengthOf(endpoints, 1);
          chai.assert.equal(endpoints[0].path, '/router/:postId/sub-router');
        });
      });
    });
  });

  describe('when the defined routes', () => {
    describe('contains underscores', () => {
      let endpoints: Endpoint[];

      before(() => {
        const router = express.Router();

        router.get('/some_route', (_req, res) => {
          res.end();
        });

        router.get('/some_other_router', (_req, res) => {
          res.end();
        });

        router.get('/__last_route__', (_req, res) => {
          res.end();
        });

        endpoints = listEndpoints(router);
      });

      it('should parse the endpoint correctly', () => {
        chai.assert.lengthOf(endpoints, 3);
        chai.assert.equal(endpoints[0].path, '/some_route');
        chai.assert.equal(endpoints[1].path, '/some_other_router');
        chai.assert.equal(endpoints[2].path, '/__last_route__');
      });
    });

    describe('contains hyphens', () => {
      let endpoints: Endpoint[];

      before(() => {
        const router = express.Router();

        router.get('/some-route', (_req, res) => {
          res.end();
        });

        router.get('/some-other-router', (_req, res) => {
          res.end();
        });

        router.get('/--last-route--', (_req, res) => {
          res.end();
        });

        endpoints = listEndpoints(router);
      });

      it('should parse the endpoint correctly', () => {
        chai.assert.lengthOf(endpoints, 3);
        chai.assert.equal(endpoints[0].path, '/some-route');
        chai.assert.equal(endpoints[1].path, '/some-other-router');
        chai.assert.equal(endpoints[2].path, '/--last-route--');
      });
    });

    describe('contains dots', () => {
      let endpoints: Endpoint[];

      before(() => {
        const router = express.Router();

        router.get('/some.route', (_req, res) => {
          res.end();
        });

        router.get('/some.other.router', (_req, res) => {
          res.end();
        });

        router.get('/..last.route..', (_req, res) => {
          res.end();
        });

        endpoints = listEndpoints(router);
      });

      it('should parse the endpoint correctly', () => {
        chai.assert.lengthOf(endpoints, 3);
        chai.assert.equal(endpoints[0].path, '/some.route');
        chai.assert.equal(endpoints[1].path, '/some.other.router');
        chai.assert.equal(endpoints[2].path, '/..last.route..');
      });
    });

    describe('contains multiple different chars', () => {
      let endpoints: Endpoint[];

      before(() => {
        const router = express.Router();

        router.get('/s0m3_r.oute', (_req, res) => {
          res.end();
        });

        router.get('/v1.0.0', (_req, res) => {
          res.end();
        });

        router.get('/not_sure.what-1m.d01ng', (_req, res) => {
          res.end();
        });

        endpoints = listEndpoints(router);
      });

      it('should parse the endpoint correctly', () => {
        chai.assert.lengthOf(endpoints, 3);
        chai.assert.equal(endpoints[0].path, '/s0m3_r.oute');
        chai.assert.equal(endpoints[1].path, '/v1.0.0');
        chai.assert.equal(endpoints[2].path, '/not_sure.what-1m.d01ng');
      });
    });
  });

  describe('when called over a mounted router with only root path', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();
      const router = express.Router();

      router.get('/', (_req, res) => {
        res.end();
      });

      app.use('/', router);

      endpoints = listEndpoints(app);
    });

    it('should retrieve the list of endpoints and its methods', () => {
      chai.assert.lengthOf(endpoints, 1);
      chai.assert.equal(endpoints[0].path, '/');
      chai.assert.lengthOf(endpoints[0].methods, 1);
      chai.assert.equal(endpoints[0].methods[0], 'GET');
    });
  });

  describe('when called over a multi-level base route', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();
      const router = express.Router();

      router.get('/my/path', (_req, res) => {
        res.end();
      });

      app.use('/multi/level', router);
      app.use('/super/duper/multi/level', router);

      endpoints = listEndpoints(app);
    });

    it('should retrieve the correct built path', () => {
      expect(endpoints).to.have.length(2);
      expect(endpoints[0].path).to.be.equal('/multi/level/my/path');
      expect(endpoints[1].path).to.be.equal('/super/duper/multi/level/my/path');
    });

    describe('with params', () => {
      let endpoints: Endpoint[];

      before(() => {
        const app = express();
        const router = express.Router();

        router.get('/users/:id', (_req, res) => {
          res.end();
        });

        router.get('/super/users/:id', (_req, res) => {
          res.end();
        });

        app.use('/multi/:multiId/level/:levelId', router);

        endpoints = listEndpoints(app);
      });

      it('should retrieve the correct built path', () => {
        expect(endpoints).to.have.length(2);
        expect(endpoints[0].path).to.be.equal('/multi/:multiId/level/:levelId/users/:id');
        expect(endpoints[1].path).to.be.equal('/multi/:multiId/level/:levelId/super/users/:id');
      });
    });

    describe('with params in middle of the pattern', () => {
      let endpoints: Endpoint[];

      before(() => {
        const app = express();
        const router = express.Router();

        router.get('/super/users/:id/friends', (_req, res) => {
          res.end();
        });

        app.use('/multi/level', router);

        endpoints = listEndpoints(app);
      });

      it('should retrieve the correct built path', () => {
        expect(endpoints).to.have.length(1);
        expect(endpoints[0].path).to.be.equal('/multi/level/super/users/:id/friends');
      });
    });
  });

  describe('when called over a route with params', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();

      app.get('/users/:id', (_req, res) => {
        res.end();
      });

      endpoints = listEndpoints(app);
    });

    it('should retrieve the correct built path', () => {
      expect(endpoints).to.have.length(1);
      expect(endpoints[0].path).to.be.equal('/users/:id');
    });
  });

  describe('when called over a route with params in middle of the pattern', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();

      app.get('/users/:id/friends', (_req, res) => {
        res.end();
      });

      endpoints = listEndpoints(app);
    });

    it('should retrieve the correct built path', () => {
      expect(endpoints).to.have.length(1);
      expect(endpoints[0].path).to.be.equal('/users/:id/friends');
    });
  });

  describe('when called over a route with multiple methods with "/" path defined', () => {
    let endpoints: Endpoint[];

    before(() => {
      const router = express.Router();

      router
        .post('/test', (_req, res) => {
          res.end();
        })
        .delete('/test', (_req, res) => {
          res.end();
        });

      endpoints = listEndpoints(router);
    });

    it('should retrieve the correct built path', () => {
      expect(endpoints).to.have.length(1);
      expect(endpoints[0].path).to.be.equal('/test');
    });

    it('should retrieve the correct built methods', () => {
      expect(endpoints[0].methods).to.have.length(2);
      expect(endpoints[0].methods[0]).to.be.equal('POST');
      expect(endpoints[0].methods[1]).to.be.equal('DELETE');
    });
  });

  describe('when called with middlewares', () => {
    let endpoints: Endpoint[];

    before(() => {
      const router = express.Router();

      const exampleMiddleware = () => {};

      router.post('/test', [
        exampleMiddleware,
        () => {}, // Anonymous middleware
      ]);

      endpoints = listEndpoints(router);
    });

    it('should retrieve the correct built path', () => {
      expect(endpoints).to.have.length(1);
      expect(endpoints[0].path).to.be.equal('/test');
      expect(endpoints[0].methods[0]).to.be.equal('POST');
    });

    it('should retrieve the correct middlewares', () => {
      expect(endpoints).to.have.length(1);
      expect(endpoints[0].middlewares).to.have.length(2);
      expect(endpoints[0].middlewares[0]).to.equal('exampleMiddleware');
      expect(endpoints[0].middlewares[1]).to.equal('anonymous');
    });
  });

  describe('when called with an array of paths', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();
      const router = express.Router();

      app.get(['/one', '/two'], (_req, res) => {
        res.end();
      });

      router.get(['/one', '/two'], (_req, res) => {
        res.end();
      });

      app.use(['/router', '/sub-path'], router);

      endpoints = listEndpoints(app);
    });

    it('should list routes correctly', () => {
      expect(endpoints).to.have.length(4);
      expect(endpoints[0].path).to.be.equal('/one');
      expect(endpoints[0].methods[0]).to.be.equal('GET');
      expect(endpoints[1].path).to.be.equal('/two');
      expect(endpoints[1].methods[0]).to.be.equal('GET');
    });
  });

  describe('when called with an app with a mounted sub-app', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();
      const subApp = express();

      app.get('/', (_req, res) => {
        res.end();
      });

      subApp.get('/', (_req, res) => {
        res.end();
      });

      app.use('/sub-app', subApp);

      endpoints = listEndpoints(app);
    });

    it('should list routes correctly', () => {
      expect(endpoints).to.have.length(2);
      expect(endpoints[0].path).to.be.equal('/');
      expect(endpoints[0].methods[0]).to.be.equal('GET');
      expect(endpoints[0].middlewares[0]).to.be.equal('anonymous');
      expect(endpoints[1].path).to.be.equal('/sub-app');
      expect(endpoints[1].methods).to.have.length(0);
      expect(endpoints[1].middlewares).to.have.length(0);
    });
  });

  describe('when called with route params with regexp', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();

      app.get('/foo/:item_id(\\d+)/bar', (_req, res) => {
        res.end();
      });

      endpoints = listEndpoints(app);
    });

    it('should list routes correctly', () => {
      expect(endpoints).to.have.length(1);
      expect(endpoints[0].path).to.be.equal('/foo/:item_id/bar');
      expect(endpoints[0].methods[0]).to.be.equal('GET');
      expect(endpoints[0].middlewares[0]).to.be.equal('anonymous');
    });
  });

  describe('when called with a route with multiple params with regexp', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();

      app.get('/foo/bar/:baz_id(\\d+)/:biz_id(\\d+)', (_req, res) => {
        res.end();
      });

      endpoints = listEndpoints(app);
    });

    it('should list routes correctly', () => {
      expect(endpoints).to.have.length(1);
      expect(endpoints[0].path).to.be.equal('/foo/bar/:baz_id/:biz_id');
      expect(endpoints[0].methods[0]).to.be.equal('GET');
      expect(endpoints[0].middlewares[0]).to.be.equal('anonymous');
    });
  });

  describe('supports regexp validators for params in subapp', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();
      const subApp = express.Router();

      subApp.get('/baz/:biz_id(\\d+)', (_req, res) => {
        res.end();
      });

      app.use('/foo/bar', subApp);

      endpoints = listEndpoints(app);
    });

    it('should list routes correctly', () => {
      expect(endpoints).to.have.length(1);
      expect(endpoints[0].path).to.be.equal('/foo/bar/baz/:biz_id');
      expect(endpoints[0].methods[0]).to.be.equal('GET');
      expect(endpoints[0].middlewares[0]).to.be.equal('anonymous');
    });
  });
});
