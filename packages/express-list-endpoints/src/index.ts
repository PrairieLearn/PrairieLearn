import type { Express, Router } from 'express';

interface Route {
  methods: object;
  path: string | string[];
  stack: any[];
}

export interface Endpoint {
  path: string;
  methods: string[];
  middlewares: string[];
}

const regExpToParseExpressPathRegExp =
  /^\/\^\\?\/?(?:(:?[\w\\.-]*(?:\\\/:?[\w\\.-]*)*)|(\(\?:\\?\/?\([^)]+\)\)))\\\/.*/;
const regExpToReplaceExpressPathRegExpParams = /\(\?:\\?\/?\([^)]+\)\)/;
const regexpExpressParamRegexp = /\(\?:\\?\\?\/?\([^)]+\)\)/g;
const regexpExpressPathParamRegexp = /(:[^)]+)\([^)]+\)/g;

const EXPRESS_ROOT_PATH_REGEXP_VALUE = '/^\\/?(?=\\/|$)/i';
const STACK_ITEM_VALID_NAMES = ['router', 'bound dispatch', 'mounted_app'];

/**
 * Returns all the verbs detected for the passed route
 */
function getRouteMethods(route: Route) {
  let methods = Object.keys(route.methods);

  methods = methods.filter((method) => method !== '_all');
  methods = methods.map((method) => method.toUpperCase());

  return methods;
}

/**
 * Returns the names (or anonymous) of all the middlewares attached to the
 * passed route.
 */
function getRouteMiddlewares(route: Route): string[] {
  return route.stack.map((item) => {
    return item.handle.name || 'anonymous';
  });
}

/**
 * Returns true if found regexp related with express params.
 */
function hasParams(expressPathRegExp: string): boolean {
  return regexpExpressParamRegexp.test(expressPathRegExp);
}

/**
 * @param route Express route object to be parsed
 * @param basePath The basePath the route is on
 * @return Endpoints info
 */
function parseExpressRoute(route: Route, basePath: string): Endpoint[] {
  const paths = [];

  if (Array.isArray(route.path)) {
    paths.push(...route.path);
  } else {
    paths.push(route.path);
  }

  const endpoints: Endpoint[] = paths.map((path) => {
    const completePath = basePath && path === '/' ? basePath : `${basePath}${path}`;

    const endpoint: Endpoint = {
      path: completePath.replace(regexpExpressPathParamRegexp, '$1'),
      methods: getRouteMethods(route),
      middlewares: getRouteMiddlewares(route),
    };

    return endpoint;
  });

  return endpoints;
}

function parseExpressPath(expressPathRegExp: RegExp, params: any[]): string {
  let parsedRegExp = expressPathRegExp.toString();
  let expressPathRegExpExec = regExpToParseExpressPathRegExp.exec(parsedRegExp);
  let paramIndex = 0;

  while (hasParams(parsedRegExp)) {
    const paramName = params[paramIndex].name;
    const paramId = `:${paramName}`;

    parsedRegExp = parsedRegExp.replace(regExpToReplaceExpressPathRegExpParams, (str) => {
      // Express >= 4.20.0 uses a different RegExp for parameters: it
      // captures the slash as part of the parameter. We need to check
      // for this case and add the slash to the value that will replace
      // the parameter in the path.
      if (str.startsWith('(?:\\/')) {
        return `\\/${paramId}`;
      }

      return paramId;
    });

    paramIndex++;
  }

  if (parsedRegExp !== expressPathRegExp.toString()) {
    expressPathRegExpExec = regExpToParseExpressPathRegExp.exec(parsedRegExp);
  }

  // TODO: can we do better than this?
  if (!expressPathRegExpExec) {
    throw new Error('Error parsing express path');
  }

  const parsedPath = expressPathRegExpExec[1].replace(/\\\//g, '/');

  return parsedPath;
}

function parseEndpoints(
  app: Express | Router | any,
  basePath?: string,
  endpoints?: Endpoint[],
): Endpoint[] {
  const stack = app.stack || (app._router && app._router.stack);

  endpoints = endpoints || [];
  basePath = basePath || '';

  if (!stack) {
    if (endpoints.length) {
      endpoints = addEndpoints(endpoints, [
        {
          path: basePath,
          methods: [],
          middlewares: [],
        },
      ]);
    }
  } else {
    endpoints = parseStack(stack, basePath, endpoints);
  }

  return endpoints;
}

/**
 * Ensures the path of the new endpoints isn't yet in the array.
 * If the path is already in the array merges the endpoints with the existing
 * one, if not, it adds them to the array.
 *
 * @param currentEndpoints Array of current endpoints
 * @param endpointsToAdd New endpoints to be added to the array
 * @returns Updated endpoints array
 */
function addEndpoints(currentEndpoints: Endpoint[], endpointsToAdd: Endpoint[]): Endpoint[] {
  endpointsToAdd.forEach((newEndpoint) => {
    const existingEndpoint = currentEndpoints.find(
      (endpoint) => endpoint.path === newEndpoint.path,
    );

    if (existingEndpoint !== undefined) {
      const newMethods = newEndpoint.methods.filter(
        (method) => !existingEndpoint.methods.includes(method),
      );

      existingEndpoint.methods = existingEndpoint.methods.concat(newMethods);
    } else {
      currentEndpoints.push(newEndpoint);
    }
  });

  return currentEndpoints;
}

function parseStack(stack: any[], basePath: string, endpoints: Endpoint[]): Endpoint[] {
  stack.forEach((stackItem) => {
    if (stackItem.route) {
      const newEndpoints = parseExpressRoute(stackItem.route, basePath);

      endpoints = addEndpoints(endpoints, newEndpoints);
    } else if (STACK_ITEM_VALID_NAMES.includes(stackItem.name)) {
      const isExpressPathRegexp = regExpToParseExpressPathRegExp.test(stackItem.regexp);

      let newBasePath = basePath;

      if (isExpressPathRegexp) {
        const parsedPath = parseExpressPath(stackItem.regexp, stackItem.keys);

        newBasePath += `/${parsedPath}`;
      } else if (
        !stackItem.path &&
        stackItem.regexp &&
        stackItem.regexp.toString() !== EXPRESS_ROOT_PATH_REGEXP_VALUE
      ) {
        const regExpPath = ` RegExp(${stackItem.regexp}) `;

        newBasePath += `/${regExpPath}`;
      }

      endpoints = parseEndpoints(stackItem.handle, newBasePath, endpoints);
    }
  });

  return endpoints;
}

/**
 * Returns an array of strings with all the detected endpoints
 * @param app The express/router instance to get the endpoints from
 * @returns The array of endpoints
 */
function expressListEndpoints(app: Express | Router | any): Endpoint[] {
  const endpoints = parseEndpoints(app);

  return endpoints;
}

export default expressListEndpoints;
