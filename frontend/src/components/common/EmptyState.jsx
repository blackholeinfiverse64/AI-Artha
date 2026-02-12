import { FileQuestion, Plus } from 'lucide-react';
import Button from './Button';

const EmptyState = ({
  icon: Icon = FileQuestion,
  title = 'No data found',
  description = 'Get started by creating your first item.',
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 text-center max-w-sm mb-6">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} icon={Plus}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
