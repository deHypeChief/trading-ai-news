/* eslint-disable react/react-in-jsx-scope */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';

export default function GoogleCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser, setToken } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = searchParams.get('token');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      setLoading(false);
      return;
    }

    if (token) {
      // Fetch user details
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/users/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
        .then((res) => {
          if (!res.ok) {
            if (res.status === 401) {
              throw new Error('Authentication failed. Please try signing in again.');
            } else if (res.status === 404) {
              throw new Error('User account not found. Please contact support.');
            } else {
              throw new Error('Failed to load user information. Please try again.');
            }
          }
          return res.json();
        })
        .then((data) => {
          if (data.success && data.data) {
            const normalizedUser = { ...data.data, id: data.data.id || data.data._id };
            setUser(normalizedUser);
            setToken(token);
            localStorage.setItem('authToken', token);
            localStorage.setItem('authUser', JSON.stringify(normalizedUser));
            navigate('/dashboard');
          } else {
            throw new Error(data.error || 'Failed to get user information');
          }
        })
        .catch((err) => {
          console.error('Google auth callback error:', err);
          setError(err.message || 'An unexpected error occurred during sign-in');
          setLoading(false);
        });
    } else {
      setError('No authentication token received');
      setLoading(false);
    }
  }, [searchParams, navigate, setUser, setToken]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600 mt-4">Completing Google Sign In...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Sign In Failed</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
