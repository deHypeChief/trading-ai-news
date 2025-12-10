import { Elysia, t } from 'elysia';
import { User } from '../models/User';
import jwt from '@elysiajs/jwt';

export const userRoutes = new Elysia()
  .use(
    jwt({
      name: 'jwt',
      secret: process.env.JWT_SECRET || 'your-secret-key-change-this',
    })
  )
  // Get user profile
  .get('/users/:userId', async ({ params: { userId }, set }) => {
    try {
      const user = await User.findById(userId).select('-password');
      
      if (!user) {
        set.status = 404;
        return { error: 'User not found' };
      }

      return {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          timezone: user.timezone,
          createdAt: user.createdAt,
        },
      };
    } catch (error) {
      console.error('Error fetching user:', error);
      set.status = 500;
      return { error: 'Failed to fetch user' };
    }
  })
  // Update user profile
  .put(
    '/users/:userId',
    async ({ params: { userId }, body, set }) => {
      try {
        const { username, timezone } = body as {
          username?: string;
          timezone?: string;
        };

        // Validate input
        if (username !== undefined && username.trim().length < 3) {
          set.status = 400;
          return { error: 'Username must be at least 3 characters long' };
        }

        // Check if username is already taken
        if (username) {
          const existingUser = await User.findOne({
            username: username.trim(),
            _id: { $ne: userId },
          });

          if (existingUser) {
            set.status = 400;
            return { error: 'Username already taken' };
          }
        }

        // Validate timezone
        if (timezone) {
          const validTimezones = [
            'UTC',
            'America/New_York',
            'America/Chicago',
            'America/Los_Angeles',
            'America/Toronto',
            'Europe/London',
            'Europe/Paris',
            'Europe/Berlin',
            'Asia/Tokyo',
            'Asia/Shanghai',
            'Asia/Hong_Kong',
            'Asia/Dubai',
            'Australia/Sydney',
            'Pacific/Auckland',
          ];

          if (!validTimezones.includes(timezone)) {
            set.status = 400;
            return { error: 'Invalid timezone' };
          }
        }

        // Update user
        const updateData: any = {};
        if (username !== undefined) updateData.username = username.trim();
        if (timezone !== undefined) updateData.timezone = timezone;

        const user = await User.findByIdAndUpdate(
          userId,
          updateData,
          { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
          set.status = 404;
          return { error: 'User not found' };
        }

        return {
          message: 'Profile updated successfully',
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            timezone: user.timezone,
            createdAt: user.createdAt,
          },
        };
      } catch (error) {
        console.error('Error updating user:', error);
        set.status = 500;
        return { error: 'Failed to update profile' };
      }
    },
    {
      body: t.Object({
        username: t.Optional(t.String()),
        timezone: t.Optional(t.String()),
      }),
    }
  )
  // Change password
  .post(
    '/users/:userId/change-password',
    async ({ params: { userId }, body, set }) => {
      try {
        const { currentPassword, newPassword } = body as {
          currentPassword: string;
          newPassword: string;
        };

        // Validate input
        if (!currentPassword || !newPassword) {
          set.status = 400;
          return { error: 'Current password and new password are required' };
        }

        if (newPassword.length < 6) {
          set.status = 400;
          return { error: 'New password must be at least 6 characters long' };
        }

        // Get user with password
        const user = await User.findById(userId);
        if (!user) {
          set.status = 404;
          return { error: 'User not found' };
        }

        // Verify current password
        const isValid = await Bun.password.verify(currentPassword, user.password);
        if (!isValid) {
          set.status = 401;
          return { error: 'Current password is incorrect' };
        }

        // Hash and update new password
        user.password = await Bun.password.hash(newPassword);
        await user.save();

        return { message: 'Password changed successfully' };
      } catch (error) {
        console.error('Error changing password:', error);
        set.status = 500;
        return { error: 'Failed to change password' };
      }
    },
    {
      body: t.Object({
        currentPassword: t.String(),
        newPassword: t.String(),
      }),
    }
  )
  // Delete account
  .delete('/users/:userId', async ({ params: { userId }, set }) => {
    try {
      const user = await User.findByIdAndDelete(userId);
      
      if (!user) {
        set.status = 404;
        return { error: 'User not found' };
      }

      // TODO: Clean up related data (alerts, password reset tokens, etc.)

      return { message: 'Account deleted successfully' };
    } catch (error) {
      console.error('Error deleting user:', error);
      set.status = 500;
      return { error: 'Failed to delete account' };
    }
  });
