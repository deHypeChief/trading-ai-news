export interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

export const generateTokens = (userId: string, email: string, secret: string) => {
  const iat = Math.floor(Date.now() / 1000);
  
  const accessToken = {
    userId,
    email,
    iat,
    exp: iat + 15 * 60, // 15 minutes
  };

  const refreshToken = {
    userId,
    email,
    iat,
    exp: iat + 7 * 24 * 60 * 60, // 7 days
  };

  return { accessToken, refreshToken };
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): boolean => {
  return password.length >= 8;
};

export const sanitizeUser = (user: any) => {
  const { password, ...sanitized } = user.toObject ? user.toObject() : user;
  return sanitized;
};
