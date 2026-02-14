import { useState } from 'react';
import api from '../../services/api';

const DebugPage = () => {
  const [results, setResults] = useState([]);
  const [token, setToken] = useState(localStorage.getItem('token'));

  const log = (msg, type = 'info') => {
    setResults(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString() }]);
  };

  const testLogin = async () => {
    try {
      log('Testing login...', 'info');
      const response = await api.post('/auth/login', {
        email: 'admin@artha.local',
        password: 'Admin@123456'
      });
      localStorage.setItem('token', response.data.data.token);
      setToken(response.data.data.token);
      log('✅ Login successful', 'success');
      log(`Token: ${response.data.data.token.substring(0, 20)}...`, 'info');
    } catch (error) {
      log(`❌ Login failed: ${error.response?.data?.message || error.message}`, 'error');
    }
  };

  const testInvoice = async () => {
    try {
      log('Testing invoice creation...', 'info');
      const response = await api.post('/invoices', {
        customerName: 'Debug Test Customer',
        customerEmail: 'debug@test.com',
        invoiceDate: '2026-02-14',
        dueDate: '2026-03-14',
        items: [{
          description: 'Debug Test Service',
          quantity: 1,
          unitPrice: '1000',
          amount: '1000',
          taxRate: 18
        }],
        subtotal: '1000',
        taxAmount: '180',
        totalAmount: '1180'
      });
      log(`✅ Invoice created: ${response.data.data.invoiceNumber}`, 'success');
    } catch (error) {
      log(`❌ Invoice failed: ${error.response?.data?.message || error.message}`, 'error');
      if (error.response?.status === 401) {
        log('⚠️ Not authenticated. Click "Test Login" first', 'error');
      }
    }
  };

  const testExpense = async () => {
    try {
      log('Testing expense creation...', 'info');
      const response = await api.post('/expenses', {
        vendor: 'Debug Vendor',
        description: 'Debug Test Expense',
        category: 'supplies',
        date: '2026-02-14',
        amount: '500',
        taxAmount: '90',
        totalAmount: '590',
        paymentMethod: 'credit_card'
      });
      log(`✅ Expense created: ${response.data.data.expenseNumber}`, 'success');
    } catch (error) {
      log(`❌ Expense failed: ${error.response?.data?.message || error.message}`, 'error');
    }
  };

  const checkStatus = () => {
    log('Checking system status...', 'info');
    log(`Token present: ${token ? 'YES' : 'NO'}`, token ? 'success' : 'error');
    log(`API URL: ${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}`, 'info');
    log(`Frontend: ${window.location.origin}`, 'info');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-4">🔧 Debug & Test Page</h1>
        
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-yellow-800">
            <strong>Use this page to test authentication and API calls.</strong>
            <br />If invoice/expense creation fails, run these tests to identify the issue.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <button 
            onClick={checkStatus}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Check Status
          </button>
          <button 
            onClick={testLogin}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Test Login
          </button>
          <button 
            onClick={testInvoice}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Test Invoice
          </button>
          <button 
            onClick={testExpense}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            Test Expense
          </button>
          <button 
            onClick={() => setResults([])}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Clear
          </button>
        </div>

        <div className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-sm max-h-96 overflow-y-auto">
          {results.length === 0 ? (
            <div className="text-gray-500">Click buttons above to run tests...</div>
          ) : (
            results.map((r, i) => (
              <div 
                key={i} 
                className={`mb-1 ${
                  r.type === 'error' ? 'text-red-400' : 
                  r.type === 'success' ? 'text-green-400' : 
                  'text-gray-300'
                }`}
              >
                [{r.time}] {r.msg}
              </div>
            ))
          )}
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded">
          <h3 className="font-semibold mb-2">Quick Fix Steps:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Click "Check Status" to verify configuration</li>
            <li>Click "Test Login" to authenticate</li>
            <li>Click "Test Invoice" to verify invoice creation works</li>
            <li>Click "Test Expense" to verify expense creation works</li>
            <li>If all pass ✅, go back to normal pages and try again</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default DebugPage;
