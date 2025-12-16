import { Elysia, t } from 'elysia';
import { User } from '../models/User';
import { PasswordReset } from '../models/PasswordReset';
import { validateEmail, validatePassword, sanitizeUser } from '../utils/auth';
import { ApiError } from '../utils/errors';
import { sendPasswordResetEmail } from '../services/email';
import crypto from 'crypto';
import axios from 'axios';

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

        // Create user with 3-day free trial
        const trialEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
        const user = await User.create({
          email,
          password,
          username,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          subscription: {
            plan: 'free',
            status: 'trial',
            trialEndsAt,
          },
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
  )

  // Google OAuth - initiate
  .get('/google/login', async ({ set }) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/google/callback`;
    const scope = 'openid email profile';
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
    
    set.status = 302;
    set.headers['Location'] = authUrl;
    return;
  })

  // Google OAuth - callback
  .get('/google/callback', async ({ query, jwt, set }) => {
    try {
      const { code } = query as { code: string };
      
      if (!code) {
        console.error('Google OAuth: No authorization code provided');
        throw new ApiError(400, 'Authorization code not provided');
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/google/callback`;

      console.log('Google OAuth: Exchanging code for token...');
      console.log('Client ID:', clientId?.substring(0, 10) + '...');
      console.log('Redirect URI:', redirectUri);

      // Exchange code for tokens
      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });

      const { access_token } = tokenResponse.data;
      console.log('Google OAuth: Access token received');

      // Get user info from Google
      const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      console.log('Google OAuth: User info received:', JSON.stringify(userInfoResponse.data, null, 2));

      const { id: googleId, email, name } = userInfoResponse.data;

      if (!googleId || !email) {
        console.error('Google OAuth: Missing required fields. Got:', { googleId, email, name });
        throw new ApiError(400, 'Failed to get user info from Google');
      }

      console.log('Google OAuth: Processing user:', { googleId, email, name });

      // Find or create user
      let user = await User.findOne({
        $or: [{ googleId }, { email: email.toLowerCase() }],
      });

      if (!user) {
        // Create new user with Google auth
        const username = name || email.split('@')[0];
        
        user = await User.create({
          email: email.toLowerCase(),
          googleId,
          username,
          authMethod: 'google',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      } else if (!user.googleId) {
        // Link Google to existing account
        user.googleId = googleId;
        user.authMethod = 'google';
        await user.save();
      }

      // Generate JWT token
      const token = await jwt.sign({
        userId: user._id.toString(),
        email: user.email,
      });

      // Redirect to frontend with token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      set.status = 302;
      set.headers['Location'] = `${frontendUrl}/auth/google-callback?token=${token}`;
      return;
    } catch (error: any) {
      console.error('Google OAuth callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      set.status = 302;
      set.headers['Location'] = `${frontendUrl}/login?error=${encodeURIComponent(error.message || 'Google authentication failed')}`;
      return;
    }
  })

  // Google OAuth - sign in / sign up (old method - keeping for compatibility)
  .post(
    '/google',
    async ({ body, jwt }) => {
      try {
        const { googleId, email, username } = body as {
          googleId: string;
          email: string;
          username: string;
        };

        if (!googleId || !email) {
          throw new ApiError(400, 'Google ID and email are required');
        }

        // Check if user already exists with this email
        let user = await User.findOne({ email: email.toLowerCase() });

        if (user) {
          // Email already exists - check auth method
          if (user.authMethod === 'email' && !user.googleId) {
            // User signed up with email, not allowed to sign in with Google
            throw new ApiError(409, 'This email is already registered. Please sign in with your password.');
          }

          // User exists and either has Google auth or already linked Google
          if (!user.googleId) {
            user.googleId = googleId;
            await user.save();
          }
        } else {
          // New user - create with Google auth
          if (!username) {
            throw new ApiError(400, 'Username is required for new accounts');
          }

          // Check if username exists
          const existingUsername = await User.findOne({ username });
          if (existingUsername) {
            throw new ApiError(409, 'Username already exists');
          }

          user = await User.create({
            email: email.toLowerCase(),
            googleId,
            username,
            authMethod: 'google',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        }

        // Generate JWT token
        const token = await jwt.sign({
          userId: user._id.toString(),
          email: user.email,
        });

        return {
          statusCode: 200,
          success: true,
          message: user.authMethod === 'google' && user.googleId ? 'Google sign in successful' : 'Google linked successfully',
          data: {
            user: sanitizeUser(user),
            token,
          },
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
        console.error('Google auth error:', error);
        return {
          statusCode: 500,
          success: false,
          message: 'Google authentication failed',
          data: error.message,
        };
      }
    },
    {
      body: t.Object({
        googleId: t.String(),
        email: t.String({ format: 'email' }),
        username: t.Optional(t.String({ minLength: 3 })),
      }),
    }
  );

