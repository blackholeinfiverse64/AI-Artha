import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, User, Building, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  confirmPassword: z.string(),
  company: z.string().min(2, 'Company name must be at least 2 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

const Register = () => {
  const navigate = useNavigate();
  const { register: registerUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      company: '',
    },
  });

  const onSubmit = async (data) => {
    setLoading(true);
    const result = await registerUser({
      name: data.name,
      email: data.email,
      password: data.password,
      company: data.company,
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
        <span className="text-2xl font-bold text-gray-900">ARTHA</span>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Create an account</h1>
        <p className="text-gray-500 mt-2">Get started with your free account</p>
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
          label="Company Name"
          type="text"
          placeholder="Enter your company name"
          icon={Building}
          error={errors.company?.message}
          {...register('company')}
        />

        <Input
          label="Email"
          type="email"
          placeholder="Enter your email"
          icon={Mail}
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a password"
              className={`block w-full rounded-lg border px-3 py-2 pl-10 pr-10 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 sm:text-sm ${
                errors.password
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
              }`}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400" />
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

      <p className="mt-8 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
};

export default Register;
