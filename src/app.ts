import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { NotFoundError } from './utils/errors';
import { openApiSpec } from './docs/openapi';

/**
 * Builds and configures the Express application.
 * @returns Configured Express application.
 */
export function createApp(): Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.use('/', routes);

  // Fallback for unknown routes.
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError('Route not found'));
  });

  app.use(errorHandler);

  return app;
}
