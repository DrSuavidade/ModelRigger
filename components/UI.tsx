import React, { InputHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends React.ComponentProps<'button'> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  glow?: boolean;
}

export const Button = ({ className, variant = 'primary', glow, children, ...props }: ButtonProps) => {
  const base = "font-display uppercase tracking-wider px-4 py-2 border-2 transition-all duration-150 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-acid-green text-black border-acid-green hover:bg-white hover:border-white hover:shadow-neon-green",
    secondary: "bg-transparent text-acid-cyan border-acid-cyan hover:bg-acid-cyan hover:text-black hover:shadow-[0_0_10px_#00ffff]",
    danger: "bg-transparent text-acid-magenta border-acid-magenta hover:bg-acid-magenta hover:text-black hover:shadow-neon-magenta",
    ghost: "border-transparent text-gray-400 hover:text-white"
  };

  return (
    <button className={twMerge(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
};

interface PanelProps {
  title: string;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}

export const Panel = ({ title, children, className, action }: PanelProps) => (
  <div className={twMerge("flex flex-col bg-[#111116] border border-gray-800 h-full overflow-hidden relative group", className)}>
    <div className="flex items-center justify-between p-2 border-b border-gray-800 bg-[#0a0a0e]">
      <h3 className="text-acid-green font-display text-sm tracking-widest neon-text-shadow">{title}</h3>
      {action}
    </div>
    <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
      {children}
    </div>
    {/* Decorative corner */}
    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-acid-magenta opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none" />
  </div>
);

export const Tag = ({ type, text }: { type: 'info' | 'warn' | 'error', text: string }) => {
  const colors = {
    info: 'bg-acid-cyan/20 text-acid-cyan border-acid-cyan',
    warn: 'bg-acid-orange/20 text-acid-orange border-acid-orange',
    error: 'bg-acid-magenta/20 text-acid-magenta border-acid-magenta',
  };
  return (
    <span className={clsx("text-[10px] font-mono border px-1 py-0.5 rounded-sm uppercase", colors[type])}>
      {text}
    </span>
  );
};

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    {...props} 
    className="bg-black border border-gray-700 text-acid-green font-mono text-sm px-2 py-1 w-full focus:outline-none focus:border-acid-green focus:shadow-neon-green placeholder-gray-700"
  />
);