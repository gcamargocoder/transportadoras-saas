import { Request } from 'express';
import { JwtPayload } from './jwt-payload.interface';

// Request do Express apos passar pela JwtAccessStrategy -- `user` deixa de
// ser opcional porque so existe request handler apos o guard popular.
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
