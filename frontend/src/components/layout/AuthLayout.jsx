import { Outlet } from 'react-router-dom';
import { Building2 } from 'lucide-react';

const AuthLayout = () => {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">ARTHA</span>
          </div>
        </div>
        
        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Modern Accounting<br />for Modern Business
          </h1>
          <p className="text-blue-100 text-lg max-w-md">
            Streamline your financial operations with India-compliant accounting, 
            GST filing, and real-time insights.
          </p>
          
          <div className="grid grid-cols-2 gap-4 mt-8">
            <div className="bg-white/10 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">100%</div>
              <div className="text-blue-200 text-sm">GST Compliant</div>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">Real-time</div>
              <div className="text-blue-200 text-sm">Financial Insights</div>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">Secure</div>
              <div className="text-blue-200 text-sm">Hash-Chain Ledger</div>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">OCR</div>
              <div className="text-blue-200 text-sm">Receipt Scanning</div>
            </div>
          </div>
        </div>
        
        <div className="text-blue-200 text-sm">
          © 2026 Artha Financial Solutions. All rights reserved.
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
