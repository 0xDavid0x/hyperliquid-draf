'use client';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'table-row' | 'table-cell';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function Skeleton({ 
  className = '', 
  variant = 'rectangular', 
  width, 
  height,
  lines 
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-[#1b1b1b] rounded';
  
  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded',
    'table-row': 'h-12 rounded-none',
    'table-cell': 'h-6 rounded',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  if (lines && variant === 'text') {
    return (
      <div className={className}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClasses} ${variantClasses.text} ${i < lines - 1 ? 'mb-2' : ''}`}
            style={i === lines - 1 && width ? { width: typeof width === 'number' ? `${width}px` : width } : {}}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
}

// Pre-built skeleton components
export function SkeletonText({ className = '', width = '100%', height }: { className?: string; width?: string | number; height?: string | number }) {
  return <Skeleton variant="text" width={width} height={height} className={className} />;
}

export function SkeletonCircle({ size = 40, className = '' }: { size?: number; className?: string }) {
  return <Skeleton variant="circular" width={size} height={size} className={className} />;
}

export function SkeletonBox({ width = '100%', height = '100%', className = '' }: { width?: string | number; height?: string | number; className?: string }) {
  return <Skeleton variant="rectangular" width={width} height={height} className={className} />;
}

export function SkeletonTableRow({ cols = 4, className = '' }: { cols?: number; className?: string }) {
  return (
    <tr className={className}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-2 py-2">
          <Skeleton variant="table-cell" width="80%" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonPrice({ className = '', width = 80 }: { className?: string; width?: string | number }) {
  return <Skeleton variant="text" width={width} height={16} className={className} />;
}

export function SkeletonBalance({ className = '', width = 100 }: { className?: string; width?: string | number }) {
  return <Skeleton variant="text" width={width} height={20} className={className} />;
}

