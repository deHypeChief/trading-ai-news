import { BrowserRouter, Route, Routes } from "react-router-dom";
import LandingPage from "./landing";
import SignupPage from "./auth/signup";
import LoginPage from "./auth/login";
import ForgotPasswordPage from "./auth/forgot-password";
import ResetPasswordPage from "./auth/reset-password";
import Dashboard from "./dashboard";
import CalendarPage from "./calendar";
import CalculatorPage from "./calculator";
import AlertsPage from "./alerts";
import SettingsPage from "./settings";
import ProtectedRoute from "@/components/ProtectedRoute";
import { AuthProvider } from "@/contexts/AuthContext.jsx";

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    {/* Public Routes */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/signup" element={<SignupPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />

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
                        path="/calendar"
                        element={
                            <ProtectedRoute>
                                <CalendarPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/calculator"
                        element={
                            <ProtectedRoute>
                                <CalculatorPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/alerts"
                        element={
                            <ProtectedRoute>
                                <AlertsPage />
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
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    )
}