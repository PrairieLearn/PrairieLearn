import type { NextFunction, Request, Response } from 'express';

export default function (req: Request, res: Response, next: NextFunction) {
  res.json = (body) => {
    if (!res.get('Content-Type')) {
      res.set('Content-Type', 'application/json');
    }
    res.send(JSON.stringify(body, null, 2));
    return res;
  };
  next();
}
