import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export const useGoogleAuth = (isSignup = false) => {
  const { googleAuth } = useAuth();
  const navigate = useNavigate();

  const handleGoogleSuccess = async (codeResponse) => {
    try {
      // Decode the JWT token from Google to get user info
      const token = codeResponse.access_token;
      
      // Fetch user info from Google
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user info from Google');
      }

      const userInfo = await response.json();
      const { id: googleId, email, name } = userInfo;

      if (!googleId || !email) {
        throw new Error('Failed to get required information from Google');
      }

      // Generate username from email if needed (for new users)
      const username = isSignup ? (name || email.split('@')[0]) : undefined;

      // Authenticate with backend
      await googleAuth(googleId, email, username);
      
      // Redirect to dashboard on success
      navigate('/dashboard');
    } catch (error) {
      console.error('Google auth error:', error);
      throw error;
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => {
      throw new Error('Google login failed. Please try again.');
    },
    flow: 'implicit',
  });

  return googleLogin;
};
