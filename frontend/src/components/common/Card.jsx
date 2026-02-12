import clsx from 'clsx';

const Card = ({ children, className, padding = true, ...props }) => {
  return (
    <div
      className={clsx(
        'bg-white rounded-xl shadow-sm border border-gray-200',
        padding && 'p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

const CardHeader = ({ children, className, ...props }) => {
  return (
    <div
      className={clsx('px-6 py-4 border-b border-gray-200', className)}
      {...props}
    >
      {children}
    </div>
  );
};

const CardTitle = ({ children, className, ...props }) => {
  return (
    <h3
      className={clsx('text-lg font-semibold text-gray-900', className)}
      {...props}
    >
      {children}
    </h3>
  );
};

const CardDescription = ({ children, className, ...props }) => {
  return (
    <p
      className={clsx('text-sm text-gray-500 mt-1', className)}
      {...props}
    >
      {children}
    </p>
  );
};

const CardContent = ({ children, className, ...props }) => {
  return (
    <div className={clsx('px-6 py-4', className)} {...props}>
      {children}
    </div>
  );
};

const CardFooter = ({ children, className, ...props }) => {
  return (
    <div
      className={clsx('px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl', className)}
      {...props}
    >
      {children}
    </div>
  );
};

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Description = CardDescription;
Card.Content = CardContent;
Card.Footer = CardFooter;

export default Card;
