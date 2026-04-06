import { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail, Lock, UserPlus, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api, { AUTH_SERVER_URL, BHIV_AUTH_MESSAGE_ORIGIN } from '../../services/api';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';

/**
 * Blackhole is JSON-only: password and magic-link calls go through this app’s API (no hosted /login on auth).
 */
const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, checkAuth } = useAuthStore();
  const popupRef = useRef(null);

  const [mode, setMode] = useState('menu'); // 'menu' | 'password' | 'email'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [magicPopupMode, setMagicPopupMode] = useState(false);

  const error = searchParams.get('error');
  const registered = searchParams.get('registered');

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (registered === '1') {
      toast.success('Account created. Sign in with your email.');
    }
  }, [registered]);

  const closePopup = useCallback(() => {
    try {
      popupRef.current?.close?.();
    } catch {
      /* ignore */
    }
    popupRef.current = null;
  }, []);

  useEffect(() => {
    const onMessage = (e) => {
      const fromAuthPopup =
        e.origin === BHIV_AUTH_MESSAGE_ORIGIN && e.data?.type === 'blackhole-auth-success';
      const fromLocalSignup =
        e.origin === window.location.origin && e.data?.type === 'artha-signup-success';
      const fromSignupSession =
        e.origin === window.location.origin && e.data?.type === 'artha-session-ready';
      if (!fromAuthPopup && !fromLocalSignup && !fromSignupSession) return;

      closePopup();
      if (fromLocalSignup) {
        navigate('/login?registered=1', { replace: true });
        return;
      }
      checkAuth().then(() => navigate('/dashboard', { replace: true }));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [checkAuth, closePopup, navigate]);

  const openSignupPopup = () => {
    const w = window.open(
      `${window.location.origin}/signup?popup=1`,
      'artha-signup',
      'width=520,height=720,scrollbars=yes,resizable=yes',
    );
    popupRef.current = w;
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em) {
      setEmailError('Enter your email');
      return;
    }
    if (!password) {
      setPasswordError('Enter your password');
      return;
    }
    setEmailError('');
    setPasswordError('');
    setSubmitting(true);
    try {
      await api.post('/auth/login', { email: em, password });
      await checkAuth();
      navigate('/dashboard', { replace: true });
    } catch {
      /* interceptor */
    } finally {
      setSubmitting(false);
    }
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setEmailError('Enter your email');
      return;
    }
    setEmailError('');
    setSubmitting(true);
    try {
      if (magicPopupMode) {
        const w = window.open('about:blank', 'bhiv-magic', 'width=480,height=640,scrollbars=yes');
        popupRef.current = w;
      }
      // Single request: magic-link handler validates email (+ optional local User check).
      const { data } = await api.post('/auth/magic-link', {
        email: trimmed,
        ...(magicPopupMode ? { mode: 'popup' } : {}),
      });
      toast.success(data?.message || 'Check your email for the sign-in link.');
      if (data?.devMagicUrl) {
        toast.success(`Dev link: ${data.devMagicUrl}`, { duration: 12000 });
      }
    } catch {
      /* interceptor */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground">Welcome to Artha</h1>
        <p className="text-muted-foreground mt-2">
          {mode === 'menu' && 'Sign in with email and password or a magic link.'}
          {mode === 'password' && 'Use the password for your Blackhole account.'}
          {mode === 'email' && 'We’ll email you a secure sign-in link.'}
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
            onClick={() => setMode('password')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-white transition-all duration-300 hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            }}
          >
            <Lock className="w-4 h-4" />
            Sign in with password
          </button>

          <button
            type="button"
            onClick={() => setMode('email')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold border-2 border-border text-foreground transition-all duration-300 hover:bg-muted text-sm"
          >
            <Mail className="w-4 h-4" />
            Sign in with email link
          </button>

          <button
            type="button"
            onClick={openSignupPopup}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold border-2 border-border text-foreground transition-all duration-300 hover:bg-muted"
          >
            <UserPlus className="w-4 h-4" />
            Create new account
          </button>

          <p className="text-xs text-muted-foreground text-center pt-1">
            <Link to="/signup" className="text-primary hover:underline font-medium">
              Open signup
            </Link>
            {' · '}
            <a href={AUTH_SERVER_URL} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Auth API
            </a>
          </p>
        </div>
      )}

      {mode === 'password' && (
        <form onSubmit={handlePasswordLogin} className="space-y-5">
          <button
            type="button"
            onClick={() => { setMode('menu'); setPassword(''); }}
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
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError('');
            }}
            error={emailError}
            icon={Mail}
            autoComplete="email"
            autoFocus
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError('');
            }}
            error={passwordError}
            icon={Lock}
            autoComplete="current-password"
          />

          <Button type="submit" loading={submitting} className="w-full" size="lg">
            Sign in
          </Button>
        </form>
      )}

      {mode === 'email' && (
        <form onSubmit={handleMagicLink} className="space-y-5">
          <button
            type="button"
            onClick={() => { setMode('menu'); setEmail(''); setMagicPopupMode(false); }}
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

          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={magicPopupMode}
              onChange={(e) => setMagicPopupMode(e.target.checked)}
              className="rounded border-border"
            />
            Popup flow (auth API receives mode=popup; opens a small window for the magic-link step)
          </label>

          <Button type="submit" loading={submitting} className="w-full" size="lg">
            Send magic link
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            After you click the link in your email, you’ll land on our server briefly, then the dashboard.
          </p>
        </form>
      )}

      <p className="mt-8 text-center text-[11px] text-muted-foreground">
        Secured by Blackhole central auth ·{' '}
        <a href={AUTH_SERVER_URL} target="_blank" rel="noreferrer" className="text-primary hover:underline">
          {AUTH_SERVER_URL.replace(/^https?:\/\//, '')}
        </a>
      </p>
    </div>
  );
};

export default Login;
