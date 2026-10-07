'use client';
import { busFrontSvg } from '@/lib/bus-icon-svg';

export default function CarrierBusIcon({ color, label }: { color: string; label: string }) {
  return <span data-carrier-bus-svg className="flex h-full w-full items-center justify-center [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: busFrontSvg(label, color) }} />;
}
