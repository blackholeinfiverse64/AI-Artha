import { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, UserPlus, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api, {
  AUTH_SERVER_URL,
  AUTH_CALLBACK_URL,
  BHIV_AUTH_MESSAGE_ORIGIN,
} from '../../services/api';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';

const enc = encodeURIComponent;

/**
 * Two-step login: (1) Choose Continue vs Create account
 * (2) Continue → email only → optional DB check → Blackhole magic link
 * Create account → signup popup (postMessage refreshes session)
 */
const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, checkAuth } = useAuthStore();
  const popupRef = useRef(null);

  const [mode, setMode] = useState('menu'); // 'menu' | 'email'
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const error = searchParams.get('error');

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  const r = enc(AUTH_CALLBACK_URL);
  const signupPopupUrl = `${AUTH_SERVER_URL}/signup?redirect=${r}&mode=popup`;

  const closePopup = useCallback(() => {
    try {
      popupRef.current?.close?.();
    } catch { /* ignore */ }
    popupRef.current = null;
  }, []);

  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== BHIV_AUTH_MESSAGE_ORIGIN) return;
      if (e.data?.type === 'blackhole-auth-success') {
        closePopup();
        checkAuth().then(() => navigate('/dashboard', { replace: true }));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [checkAuth, closePopup, navigate]);

  const openSignupWindow = () => {
    const w = window.open(
      signupPopupUrl,
      'bhiv-signup',
      'width=520,height=720,scrollbars=yes,resizable=yes',
    );
    popupRef.current = w;
  };

  const handleEmailContinue = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError('Enter your email');
      return;
    }
    setEmailError('');
    setSubmitting(true);
    try {
      await api.post('/auth/validate-login-email', { email: trimmed });
      const continueUrl = `${AUTH_SERVER_URL}/continue?redirect=${r}&email=${enc(trimmed)}`;
      window.location.assign(continueUrl);
    } catch {
      // 4xx/5xx toasts handled by api interceptor
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground">Welcome to Artha</h1>
        <p className="text-muted-foreground mt-2">
          {mode === 'menu'
            ? 'Sign in with Blackhole or create a new account.'
            : 'Enter the email you use with Blackhole — we’ll send you a secure magic link.'}
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error === 'no_token' && 'Authentication failed. No token received.'}
          {error === 'invalid_token' && 'Authentication failed. Token is invalid or expired.'}
          {error === 'app_not_allowed' && 'Your account is not allowed to use this app. Ask an admin to add this app to your profile.'}
          {!['no_token', 'invalid_token', 'app_not_allowed'].includes(error) && 'Authentication failed. Please try again.'}
        </div>
      )}

      {mode === 'menu' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMode('email')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-white transition-all duration-300 hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            }}
          >
            <Mail className="w-4 h-4" />
            Continue with Blackhole
          </button>

          <button
            type="button"
            onClick={openSignupWindow}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold border-2 border-border text-foreground transition-all duration-300 hover:bg-muted"
          >
            <UserPlus className="w-4 h-4" />
            Create new account
          </button>
        </div>
      )}

      {mode === 'email' && (
        <form onSubmit={handleEmailContinue} className="space-y-5">
          <button
            type="button"
            onClick={() => { setMode('menu'); setEmail(''); }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <Input
            label="Email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
            error={emailError}
            icon={Mail}
            autoComplete="email"
            autoFocus
          />

          <Button type="submit" loading={submitting} className="w-full" size="lg">
            Continue
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            We’ll open Blackhole to verify your email and sign you in. After you complete the link,
            you’ll land on the dashboard.
          </p>
        </form>
      )}

      <p className="mt-8 text-center text-[11px] text-muted-foreground">
        Secured by{' '}
        <a href={AUTH_SERVER_URL} target="_blank" rel="noreferrer" className="text-primary hover:underline">
          Blackhole Auth
        </a>
      </p>
    </div>
  );
};

export default Login;
