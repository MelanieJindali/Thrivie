"use client";
import { deleteHealthLog } from "@/app/actions";
import { ConfirmButton, useAction } from "@/components/ui";

export function HealthRowActions({ id }: { id: string }) {
  const { run } = useAction();
  return <ConfirmButton onConfirm={() => run(() => deleteHealthLog(id))} />;
}
