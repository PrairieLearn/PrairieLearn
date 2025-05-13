import { assert } from 'chai';
import express from 'express';

import listEndpoints, { type Endpoint } from '../src/index.js';

function assertResult(endpoints: Endpoint[]) {
  assert.isArray(endpoints);
  assert.lengthOf(endpoints, 2);

  endpoints.forEach((endpoint) => {
    assert.typeOf(endpoint, 'object');

    assert.typeOf(endpoint.path, 'string');
    assert.include(endpoint.path, '/');

    assert.isArray(endpoint.methods);
    endpoint.methods.forEach((method) => {
      assert.typeOf(method, 'string');
      assert.equal(method, method.toUpperCase());
      assert.notEqual(method, '_ALL');
    });

    assert.isArray(endpoint.middlewares);
    endpoint.middlewares.forEach((middleware) => {
      assert.typeOf(middleware, 'string');
    });
  });
}

describe('listEndpoints', () => {
  describe('when called with non configured app', () => {
    let endpoints: Endpoint[];

    before(() => {
      const app = express();

      endpoints = listEndpoints(app);
    });

    it('should return an empty array', () => {
      assert.isArray(endpoints);
      assert.lengthOf(endpoints, 0);
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
        assert.lengthOf(endpoints, 1);
        assert.equal(endpoints[0].path, '/router/:id/friends');
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
          assert.lengthOf(endpoints, 1);
          assert.equal(endpoints[0].path, '/router/:postId/sub-router');
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
        assert.lengthOf(endpoints, 3);
        assert.equal(endpoints[0].path, '/some_route');
        assert.equal(endpoints[1].path, '/some_other_router');
        assert.equal(endpoints[2].path, '/__last_route__');
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
        assert.lengthOf(endpoints, 3);
        assert.equal(endpoints[0].path, '/some-route');
        assert.equal(endpoints[1].path, '/some-other-router');
        assert.equal(endpoints[2].path, '/--last-route--');
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
        assert.lengthOf(endpoints, 3);
        assert.equal(endpoints[0].path, '/some.route');
        assert.equal(endpoints[1].path, '/some.other.router');
        assert.equal(endpoints[2].path, '/..last.route..');
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
        assert.lengthOf(endpoints, 3);
        assert.equal(endpoints[0].path, '/s0m3_r.oute');
        assert.equal(endpoints[1].path, '/v1.0.0');
        assert.equal(endpoints[2].path, '/not_sure.what-1m.d01ng');
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
      assert.lengthOf(endpoints, 1);
      assert.equal(endpoints[0].path, '/');
      assert.lengthOf(endpoints[0].methods, 1);
      assert.equal(endpoints[0].methods[0], 'GET');
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
      assert.lengthOf(endpoints, 2);
      assert.equal(endpoints[0].path, '/multi/level/my/path');
      assert.equal(endpoints[1].path, '/super/duper/multi/level/my/path');
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
        assert.lengthOf(endpoints, 2);
        assert.equal(endpoints[0].path, '/multi/:multiId/level/:levelId/users/:id');
        assert.equal(endpoints[1].path, '/multi/:multiId/level/:levelId/super/users/:id');
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
        assert.lengthOf(endpoints, 1);
        assert.equal(endpoints[0].path, '/multi/level/super/users/:id/friends');
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
      assert.lengthOf(endpoints, 1);
      assert.equal(endpoints[0].path, '/users/:id');
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
      assert.lengthOf(endpoints, 1);
      assert.equal(endpoints[0].path, '/users/:id/friends');
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
      assert.lengthOf(endpoints, 1);
      assert.equal(endpoints[0].path, '/test');
    });

    it('should retrieve the correct built methods', () => {
      assert.lengthOf(endpoints[0].methods, 2);
      assert.equal(endpoints[0].methods[0], 'POST');
      assert.equal(endpoints[0].methods[1], 'DELETE');
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
      assert.lengthOf(endpoints, 1);
      assert.equal(endpoints[0].path, '/test');
      assert.lengthOf(endpoints[0].methods, 1);
      assert.equal(endpoints[0].methods[0], 'POST');
    });

    it('should retrieve the correct middlewares', () => {
      assert.lengthOf(endpoints[0].middlewares, 2);
      assert.equal(endpoints[0].middlewares[0], 'exampleMiddleware');
      assert.equal(endpoints[0].middlewares[1], 'anonymous');
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
      assert.lengthOf(endpoints, 4);
      assert.equal(endpoints[0].path, '/one');
      assert.equal(endpoints[0].methods[0], 'GET');
      assert.equal(endpoints[1].path, '/two');
      assert.equal(endpoints[1].methods[0], 'GET');
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
      assert.lengthOf(endpoints, 2);
      assert.equal(endpoints[0].path, '/');
      assert.equal(endpoints[0].methods[0], 'GET');
      assert.equal(endpoints[0].middlewares[0], 'anonymous');
      assert.equal(endpoints[1].path, '/sub-app');
      assert.lengthOf(endpoints[1].methods, 0);
      assert.lengthOf(endpoints[1].middlewares, 0);
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
      assert.lengthOf(endpoints, 1);
      assert.equal(endpoints[0].path, '/foo/:item_id/bar');
      assert.equal(endpoints[0].methods[0], 'GET');
      assert.equal(endpoints[0].middlewares[0], 'anonymous');
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
      assert.lengthOf(endpoints, 1);
      assert.equal(endpoints[0].path, '/foo/bar/:baz_id/:biz_id');
      assert.equal(endpoints[0].methods[0], 'GET');
      assert.equal(endpoints[0].middlewares[0], 'anonymous');
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
      assert.lengthOf(endpoints, 1);
      assert.equal(endpoints[0].path, '/foo/bar/baz/:biz_id');
      assert.equal(endpoints[0].methods[0], 'GET');
      assert.equal(endpoints[0].middlewares[0], 'anonymous');
    });
  });
});
