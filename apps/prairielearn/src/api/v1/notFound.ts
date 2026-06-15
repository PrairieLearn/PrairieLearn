import type { Request, Response } from 'express';

export default function (req: Request, res: Response) {
  res.status(404).send({
    message: 'Not Found',
  });
}
