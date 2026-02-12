import clsx from 'clsx';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

const Table = ({ children, className, ...props }) => {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className={clsx('min-w-full divide-y divide-gray-200', className)} {...props}>
        {children}
      </table>
    </div>
  );
};

const TableHeader = ({ children, className, ...props }) => {
  return (
    <thead className={clsx('bg-gray-50', className)} {...props}>
      {children}
    </thead>
  );
};

const TableBody = ({ children, className, ...props }) => {
  return (
    <tbody className={clsx('bg-white divide-y divide-gray-200', className)} {...props}>
      {children}
    </tbody>
  );
};

const TableRow = ({ children, className, onClick, ...props }) => {
  return (
    <tr 
      className={clsx(
        'hover:bg-gray-50 transition-colors',
        onClick && 'cursor-pointer',
        className
      )} 
      onClick={onClick}
      {...props}
    >
      {children}
    </tr>
  );
};

const TableHead = ({ 
  children, 
  className, 
  sortable = false, 
  sortDirection,
  onSort,
  ...props 
}) => {
  return (
    <th
      className={clsx(
        'px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider',
        sortable && 'cursor-pointer select-none hover:bg-gray-100',
        className
      )}
      onClick={sortable ? onSort : undefined}
      {...props}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortable && (
          <span className="text-gray-400">
            {sortDirection === 'asc' ? (
              <ChevronUp className="w-4 h-4" />
            ) : sortDirection === 'desc' ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronsUpDown className="w-4 h-4" />
            )}
          </span>
        )}
      </div>
    </th>
  );
};

const TableCell = ({ children, className, ...props }) => {
  return (
    <td
      className={clsx('px-6 py-4 whitespace-nowrap text-sm text-gray-900', className)}
      {...props}
    >
      {children}
    </td>
  );
};

Table.Header = TableHeader;
Table.Body = TableBody;
Table.Row = TableRow;
Table.Head = TableHead;
Table.Cell = TableCell;

export default Table;
