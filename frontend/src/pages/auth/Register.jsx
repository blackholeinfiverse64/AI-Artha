import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, User, Building, Building2, Shield, Calculator, Eye as EyeIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  role: z.enum(['admin', 'accountant', 'viewer']),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

const roles = [
  { value: 'admin', label: 'Admin', icon: Shield, color: 'red', description: 'Full system access' },
  { value: 'accountant', label: 'Accountant', icon: Calculator, color: 'blue', description: 'Financial operations' },
  { value: 'viewer', label: 'Viewer', icon: EyeIcon, color: 'gray', description: 'Read-only access' },
];

const Register = () => {
  const navigate = useNavigate();
  const { register: registerUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'viewer',
    },
  });

  const selectedRole = watch('role');

  const onSubmit = async (data) => {
    setLoading(true);
    const result = await registerUser({
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role,
    });
    setLoading(false);

    if (result.success) {
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="animate-fadeIn">
      {/* Mobile Logo */}
      <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
          <Building2 className="w-7 h-7 text-white" />
        </div>
        <span className="text-2xl font-bold text-foreground">ARTHA</span>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground">Create an account</h1>
        <p className="text-muted-foreground mt-2">Get started with your free account</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Full Name"
          type="text"
          placeholder="Enter your full name"
          icon={User}
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Email"
          type="email"
          placeholder="Enter your email"
          icon={Mail}
          error={errors.email?.message}
          {...register('email')}
        />

        {/* Role Selection */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Select Your Role
          </label>
          <div className="grid grid-cols-3 gap-3">
            {roles.map((role) => {
              const IconComponent = role.icon;
              const isSelected = selectedRole === role.value;
              return (
                <label
                  key={role.value}
                  className={`relative flex flex-col items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    isSelected
                      ? role.color === 'red'
                        ? 'border-red-500 bg-red-50'
                        : role.color === 'blue'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-500 bg-muted'
                      : 'border-border hover:border-border'
                  }`}
                >
                  <input
                    type="radio"
                    value={role.value}
                    {...register('role')}
                    className="sr-only"
                  />
                  <IconComponent
                    className={`w-6 h-6 mb-1 ${
                      isSelected
                        ? role.color === 'red'
                          ? 'text-red-600'
                          : role.color === 'blue'
                          ? 'text-blue-600'
                          : 'text-muted-foreground'
                        : 'text-muted-foreground'
                    }`}
                  />
                  <span className={`text-sm font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {role.label}
                  </span>
                  <span className="text-xs text-muted-foreground text-center mt-0.5">{role.description}</span>
                </label>
              );
            })}
          </div>
          {errors.role && (
            <p className="mt-1 text-sm text-red-600">{errors.role.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a password"
              className={`block w-full rounded-lg border px-3 py-2 pl-10 pr-10 text-foreground placeholder-gray-500 focus:outline-none focus:ring-2 sm:text-sm ${
                errors.password
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-border focus:border-blue-500 focus:ring-blue-500'
              }`}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Eye className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>

        <Input
          label="Confirm Password"
          type="password"
          placeholder="Confirm your password"
          icon={Lock}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <div className="pt-2">
          <Button type="submit" loading={loading} className="w-full" size="lg">
            Create account
          </Button>
        </div>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
};

export default Register;
