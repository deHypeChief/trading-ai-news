import { Elysia, t } from 'elysia';
import { Alert } from '../models/Alert';
import { User } from '../models/User';
import { getAlertStats, triggerAlertCheck } from '../services/alertScheduler';

export const alertRoutes = new Elysia({ prefix: '/alerts' })
  // Get user's alert configuration
  .get('/', async ({ headers }) => {
    try {
      const authHeader = headers.authorization;
      if (!authHeader) {
        return {
          statusCode: 401,
          success: false,
          message: 'Unauthorized',
          data: null,
        };
      }

      // Extract user ID from token (simplified - in production, verify JWT)
      const token = authHeader.replace('Bearer ', '');
      // TODO: Properly decode JWT to get userId
      // For now, we'll use a query parameter or extract from token

      // Placeholder - you'd decode JWT here
      return {
        statusCode: 200,
        success: true,
        message: 'Alert configuration retrieved',
        data: null,
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to retrieve alert configuration',
        data: error.message,
      };
    }
  })

  // Get alert configuration by user ID
  .get('/user/:userId', async ({ params }) => {
    try {
      const { userId } = params;

      let alert = await Alert.findOne({ userId }).lean();

      // Create default if doesn't exist
      if (!alert) {
        alert = await Alert.create({
          userId,
          enabled: true,
          currencies: [],
          minImpact: 'Medium',
          minRelevanceScore: 50,
          notifyBefore: [30, 60],
          quietHoursEnabled: false,
          emailNotifications: true,
          pushNotifications: false,
        });
      }

      return {
        statusCode: 200,
        success: true,
        message: 'Alert configuration retrieved',
        data: alert,
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to retrieve alert configuration',
        data: error.message,
      };
    }
  })

  // Update alert configuration
  .put(
    '/user/:userId',
    async ({ params, body }) => {
      try {
        const { userId } = params;
        const updates = body as any;

        const alert = await Alert.findOneAndUpdate(
          { userId },
          { $set: updates },
          { new: true, upsert: true }
        );

        return {
          statusCode: 200,
          success: true,
          message: 'Alert configuration updated',
          data: alert,
        };
      } catch (error: any) {
        return {
          statusCode: 500,
          success: false,
          message: 'Failed to update alert configuration',
          data: error.message,
        };
      }
    }
  )

  // Toggle alerts on/off
  .patch('/user/:userId/toggle', async ({ params, body }) => {
    try {
      const { userId } = params;
      const { enabled } = body as { enabled: boolean };

      const alert = await Alert.findOneAndUpdate(
        { userId },
        { $set: { enabled } },
        { new: true }
      );

      return {
        statusCode: 200,
        success: true,
        message: `Alerts ${enabled ? 'enabled' : 'disabled'}`,
        data: alert,
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to toggle alerts',
        data: error.message,
      };
    }
  })

  // Delete alert configuration
  .delete('/user/:userId', async ({ params }) => {
    try {
      const { userId } = params;

      await Alert.deleteOne({ userId });

      return {
        statusCode: 200,
        success: true,
        message: 'Alert configuration deleted',
        data: null,
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to delete alert configuration',
        data: error.message,
      };
    }
  })

  // Get alert statistics (admin)
  .get('/stats', async () => {
    try {
      const stats = await getAlertStats();

      return {
        statusCode: 200,
        success: true,
        message: 'Alert statistics retrieved',
        data: stats,
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to retrieve alert statistics',
        data: error.message,
      };
    }
  })

  // Manually trigger alert check (admin/testing)
  .post('/trigger', async () => {
    try {
      await triggerAlertCheck();

      return {
        statusCode: 200,
        success: true,
        message: 'Alert check triggered',
        data: null,
      };
    } catch (error: any) {
      return {
        statusCode: 500,
        success: false,
        message: 'Failed to trigger alert check',
        data: error.message,
      };
    }
  });
