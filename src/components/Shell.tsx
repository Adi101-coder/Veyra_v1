type ShellProps = {
  children: React.ReactNode;
  className?: string;
};

export function Shell({ children, className = "" }: ShellProps) {
  return (
    <div
      className={`mx-auto w-full min-w-0 max-w-[1344px] px-4 sm:px-8 lg:px-[2.4rem] ${className}`.trim()}
    >
      {children}
    </div>
  );
}
