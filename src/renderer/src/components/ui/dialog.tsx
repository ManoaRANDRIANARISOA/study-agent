import React from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

interface DialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: string
  className?: string
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'max-w-md',
  className
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className={cn(
          'bg-background text-foreground rounded-xl shadow-xl border border-border w-full mx-auto flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200',
          maxWidth,
          className
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-foreground tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 text-foreground">{children}</div>

        {footer && (
          <div className="p-4 bg-muted/20 border-t border-border flex justify-end gap-2 rounded-b-lg shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
