import { Elysia, t } from 'elysia';
import bearer from '@elysiajs/bearer';
import { debugConsole } from '../utils/debugConsole';

export const debugRoutes = new Elysia({ prefix: '/api/debug' })
  .use(bearer())
  .guard(
    {
      bearer: async (bearer) => {
        // Only allow debug routes in development
        if (process.env.NODE_ENV === 'production') {
          return false;
        }
        return true;
      },
    },
    (app) =>
      app
        .get('/logs', () => {
          return {
            logs: debugConsole.getLogs({ limit: 100 }),
            stats: debugConsole.getStats(),
          };
        })
        .get(
          '/logs/:service',
          ({ params: { service } }) => {
            return {
              logs: debugConsole.getLogs({ service, limit: 100 }),
              stats: debugConsole.getStats(),
            };
          },
          {
            params: t.Object({
              service: t.String(),
            }),
          }
        )
        .delete('/logs', () => {
          debugConsole.clear();
          return { message: 'Logs cleared' };
        })
        .get('/stats', () => {
          return debugConsole.getStats();
        })
  );
