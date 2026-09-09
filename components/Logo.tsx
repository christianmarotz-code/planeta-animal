import Image from 'next/image'

export function PawIcon({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/branding/paw.png"
      alt="Planeta Animal"
      width={size}
      height={size}
      className={className}
      priority
    />
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/branding/logo-full.png"
      alt="Planeta Animal"
      width={140}
      height={80}
      className={`h-9 w-auto ${className ?? ''}`}
      priority
    />
  )
}
