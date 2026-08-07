import { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncHandler<R extends Request> = (
  req: R,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export function asyncHandler<R extends Request = Request>(
  handler: AsyncHandler<R>
): RequestHandler {
  return (req, res, next) => {
    handler(req as R, res, next).catch(next);
  };
}
