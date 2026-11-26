import { type NextFunction, type Request, type Response, Router } from 'express';

const router = Router();

// The MCP server and its OAuth endpoints, which agents that run in a browser call with an access
// token and MCP's own headers. They use no cookies, so any origin may call them.
const MCP_PATHS = /^\/(?:pl\/mcp(?:\/|$)|pl\/oauth\/|\.well-known\/oauth-)/;

router.all('/*', function (req: Request, res: Response, next: NextFunction) {
  // enable CORS on all requests, see http://enable-cors.org/server_expressjs.html
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, PUT, PATCH, GET, OPTIONS');
  if (MCP_PATHS.test(req.path)) {
    res.header(
      'Access-Control-Allow-Headers',
      'Authorization, Accept, Content-Type, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID',
    );
    // The sign-in challenge is in this header, which browsers otherwise hide from scripts.
    res.header('Access-Control-Expose-Headers', 'WWW-Authenticate');
  } else {
    res.header(
      'Access-Control-Allow-Headers',
      'X-Requested-With, Accept, X-Auth-UID, X-Auth-Name, X-Auth-Date, X-Auth-Signature, Content-Type',
    );
  }

  // disable all caching for all requests
  res.header('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate');

  next();
});

// needed for CORS pre-flight checks
router.options('/*', function (req: Request, res: Response) {
  res.json({});
});

export default router;
