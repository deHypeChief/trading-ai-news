/* eslint-disable react/react-in-jsx-scope */
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import LandingPage from "./landing";
import SignupPage from "./auth/signup";
import LoginPage from "./auth/login";
import ForgotPasswordPage from "./auth/forgot-password";
import ResetPasswordPage from "./auth/reset-password";
import GoogleCallback from "./auth/google-callback";
import Dashboard from "./dashboard";
import SettingsPage from "./settings";
import SubscriptionCallback from "./subscription/callback";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AuthProvider } from "@/contexts/AuthContext.jsx";

export default function App() {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    return (
        <GoogleOAuthProvider clientId={googleClientId}>
            <BrowserRouter>
                <AuthProvider>
                <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/signup" element={<SignupPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/auth/google-callback" element={<GoogleCallback />} />

                    {/* Protected Routes */}
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute>
                                <Dashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/settings"
                        element={
                            <ProtectedRoute>
                                <SettingsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/subscription/callback"
                        element={
                            <ProtectedRoute>
                                <SubscriptionCallback />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
                </AuthProvider>
            </BrowserRouter>
        </GoogleOAuthProvider>
    )
}