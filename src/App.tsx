/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { QuestionsListPage } from './pages/QuestionsListPage.tsx';
import { QuestionFormPage } from './pages/QuestionFormPage.tsx';
import { QuestionDetailPage } from './pages/QuestionDetailPage.tsx';

export function AppRoutes() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/questions" element={<QuestionsListPage />} />
        <Route path="/questions/new" element={<QuestionFormPage mode="create" />} />
        <Route path="/questions/:id" element={<QuestionDetailPage />} />
        <Route path="/questions/:id/edit" element={<QuestionFormPage mode="edit" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}


