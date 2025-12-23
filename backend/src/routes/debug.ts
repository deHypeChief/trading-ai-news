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
        .get('/fetch-external', async ({ query, set }) => {
          try {
            const { startDate, endDate } = query as { startDate?: string; endDate?: string };
            if (!startDate || !endDate) {
              set.status = 400;
              return { error: 'Provide startDate and endDate in ISO format' };
            }

            // import dynamically to avoid circular import at top-level
            const { fetchEconomicEvents } = await import('../services/calendar');

            const start = new Date(startDate);
            const end = new Date(endDate);

            try {
              const events = await fetchEconomicEvents(start, end);
              return { success: true, count: events.length, events };
            } catch (err: any) {
              console.error('fetch-external failed:', err?.message || err);
              set.status = 502;
              return { success: false, message: err?.message || String(err) };
            }
          } catch (err: any) {
            console.error('fetch-external handler error:', err);
            set.status = 500;
            return { success: false, message: err?.message || String(err) };
          }
        })
  );
