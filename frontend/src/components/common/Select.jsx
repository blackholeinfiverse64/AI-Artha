import { forwardRef } from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';

const Select = forwardRef(({
  label,
  error,
  helperText,
  options = [],
  placeholder = 'Select an option',
  className,
  containerClassName,
  ...props
}, ref) => {
  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          className={clsx(
            'block w-full rounded-lg border px-3 py-2 text-gray-900 appearance-none',
            'focus:outline-none focus:ring-2 focus:ring-offset-0 sm:text-sm pr-10',
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500',
            props.disabled && 'bg-gray-50 text-gray-500 cursor-not-allowed',
            className
          )}
          {...props}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </div>
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

export default Select;
