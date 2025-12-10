import { Elysia, t } from 'elysia';
import { User } from '../models/User';
import { PasswordReset } from '../models/PasswordReset';
import { validateEmail, validatePassword, sanitizeUser } from '../utils/auth';
import { ApiError } from '../utils/errors';
import { sendPasswordResetEmail } from '../services/email';
import crypto from 'crypto';

export const authRoutes = new Elysia({ prefix: '/auth' })
  .post(
    '/register',
    async ({ body }) => {
      try {
        const { email, password, username } = body as {
          email: string;
          password: string;
          username: string;
        };

        // Validation
        if (!validateEmail(email)) {
          throw new ApiError(400, 'Invalid email format');
        }

        if (!validatePassword(password)) {
          throw new ApiError(400, 'Password must be at least 8 characters');
        }

        if (username.length < 3) {
          throw new ApiError(400, 'Username must be at least 3 characters');
        }

        // Check if user exists
        const existingUser = await User.findOne({
          $or: [{ email }, { username }],
        });

        if (existingUser) {
          throw new ApiError(409, 'Email or username already exists');
        }

        // Create user
        const user = await User.create({
          email,
          password,
          username,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });

        return {
          statusCode: 201,
          success: true,
          message: 'User registered successfully',
          data: sanitizeUser(user)
        };
      } catch (error: any) {
        if (error instanceof ApiError) {
          return {
            statusCode: error.statusCode,
            success: false,
            message: error.message,
            data: null
          };
        }
        return {
          statusCode: 500,
          success: false,
          message: 'Registration failed',
          data: error.message
        };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String({ minLength: 8 }),
        username: t.String({ minLength: 3 }),
      }),
    }
  )
  .post(
    '/login',
    async ({ body, jwt }) => {
      try {
        const { email, password } = body as { email: string; password: string };

        // Find user
        const user = await User.findOne({ email });

        if (!user) {
          throw new ApiError(401, 'Invalid credentials');
        }

        // Verify password
        const isPasswordValid = await (user as any).comparePassword(password);

        if (!isPasswordValid) {
          throw new ApiError(401, 'Invalid credentials');
        }

        // Generate JWT token
        const token = await jwt.sign({
          userId: user._id.toString(),
          email: user.email,
        });

        // Return user data with token
        return {
          statusCode: 200,
          success: true,
          message: 'Login successful',
          data: {
            user: sanitizeUser(user),
            token
          }
        };
      } catch (error: any) {
        if (error instanceof ApiError) {
          return {
            statusCode: error.statusCode,
            success: false,
            message: error.message,
            data: null
          };
        }
        return {
          statusCode: 500,
          success: false,
          message: 'Login failed',
          data: error.message
        };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String(),
      }),
    }
  )

  // Forgot password - request reset
  .post(
    '/forgot-password',
    async ({ body }) => {
      try {
        const { email } = body as { email: string };

        // Find user
        const user = await User.findOne({ email });

        if (!user) {
          // Don't reveal if email exists for security
          return {
            statusCode: 200,
            success: true,
            message: 'If that email exists, a password reset link has been sent',
            data: null,
          };
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        // Save token to database
        await PasswordReset.create({
          userId: user._id,
          token: hashedToken,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        });

        // Send reset email
        await sendPasswordResetEmail(user.email, resetToken);

        return {
          statusCode: 200,
          success: true,
          message: 'If that email exists, a password reset link has been sent',
          data: null,
        };
      } catch (error: any) {
        console.error('Forgot password error:', error);
        return {
          statusCode: 500,
          success: false,
          message: 'Failed to process password reset request',
          data: error.message,
        };
      }
    },
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
      }),
    }
  )

  // Reset password with token
  .post(
    '/reset-password',
    async ({ body }) => {
      try {
        const { token, newPassword } = body as { token: string; newPassword: string };

        // Validate new password
        if (!validatePassword(newPassword)) {
          throw new ApiError(400, 'Password must be at least 8 characters');
        }

        // Hash the token to match database
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // Find valid reset token
        const resetRecord = await PasswordReset.findOne({
          token: hashedToken,
          expiresAt: { $gt: new Date() },
          used: false,
        });

        if (!resetRecord) {
          throw new ApiError(400, 'Invalid or expired reset token');
        }

        // Update user password
        const user = await User.findById(resetRecord.userId);
        if (!user) {
          throw new ApiError(404, 'User not found');
        }

        user.password = newPassword;
        await user.save();

        // Mark token as used
        resetRecord.used = true;
        await resetRecord.save();

        return {
          statusCode: 200,
          success: true,
          message: 'Password reset successfully',
          data: null,
        };
      } catch (error: any) {
        if (error instanceof ApiError) {
          return {
            statusCode: error.statusCode,
            success: false,
            message: error.message,
            data: null,
          };
        }
        return {
          statusCode: 500,
          success: false,
          message: 'Failed to reset password',
          data: error.message,
        };
      }
    },
    {
      body: t.Object({
        token: t.String(),
        newPassword: t.String({ minLength: 8 }),
      }),
    }
  );
