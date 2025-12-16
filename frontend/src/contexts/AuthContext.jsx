import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const normalizeUser = (rawUser) => {
    if (!rawUser) return null;
    const id = rawUser.id || rawUser._id;
    return { ...rawUser, id };
  };

  useEffect(() => {
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('authUser');

    if (savedToken) setToken(savedToken);
    if (savedUser) setUser(normalizeUser(JSON.parse(savedUser)));

    setLoading(false);
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auth/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      const data = await response.json();

      if (data.data?.user && data.data?.token) {
        const normalizedUser = normalizeUser(data.data.user);
        setUser(normalizedUser);
        setToken(data.data.token);
        localStorage.setItem('authToken', data.data.token);
        localStorage.setItem('authUser', JSON.stringify(normalizedUser));
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const googleAuth = async (googleId, email, username = null) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auth/google`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            googleId, 
            email, 
            ...(username && { username })
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Google authentication failed');
      }

      const data = await response.json();

      if (data.data?.user && data.data?.token) {
        const normalizedUser = normalizeUser(data.data.user);
        setUser(normalizedUser);
        setToken(data.data.token);
        localStorage.setItem('authToken', data.data.token);
        localStorage.setItem('authUser', JSON.stringify(normalizedUser));
      }
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email, username, password) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/auth/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, username, password }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Registration failed');
      }

      const data = await response.json();
      
      if (data.data) {
        await login(email, password);
      }
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  };

  const updateUser = (updatedUserData) => {
    setUser((prevUser) => {
      const merged = {
        ...prevUser,
        ...updatedUserData,
      };
      localStorage.setItem('authUser', JSON.stringify(merged));
      return merged;
    });
  };

  const cancelSubscription = async ({ immediate = false } = {}) => {
    if (!token) throw new Error('Not authenticated');
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/subscription/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ immediate })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to cancel subscription');
      }

      // Update local user to reflect cancellation state
      setUser((prev) => {
        const updated = { ...prev };

        if (data.immediate) {
          updated.subscription = {
            ...(updated?.subscription || {}),
            status: 'inactive',
            plan: 'free',
            renewalDate: null,
            paymentMethod: null,
            cancelAtPeriodEnd: false,
            cancellationDate: null,
          };
        } else if (data.scheduled) {
          updated.subscription = {
            ...(updated?.subscription || {}),
            cancelAtPeriodEnd: true,
            cancellationDate: data.cancellationDate,
          };
        }

        localStorage.setItem('authUser', JSON.stringify(updated));
        return updated;
      });

      return data;
    } catch (err) {
      console.error('Cancel subscription error:', err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        googleAuth,
        register,
        logout,
        updateUser,
        cancelSubscription,
        setUser,
        setToken,
        isAuthenticated: !!token && !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
