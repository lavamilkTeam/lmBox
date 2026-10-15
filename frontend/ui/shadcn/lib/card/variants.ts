import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export const cardVariants = cva(
  'bg-card text-card-foreground flex flex-col gap-6 rounded-xl py-6',
  {
    variants: {
      variant: {
        default: 'border shadow-sm',
        floating: 'border-0 shadow-[0_16px_48px_-12px_#00000024,0_4px_12px_-4px_#00000012] focus-within:shadow-[0_16px_48px_-12px_#00000030,0_4px_12px_-4px_#00000018]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export type CardVariants = VariantProps<typeof cardVariants>
