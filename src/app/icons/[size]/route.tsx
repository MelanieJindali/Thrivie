import { renderIcon } from "@/lib/icon";

// /icons/192, /icons/512, /icons/512-maskable
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const maskable = size.endsWith("-maskable");
  const px = Math.min(1024, Math.max(48, parseInt(size, 10) || 192));
  return renderIcon(px, maskable);
}
