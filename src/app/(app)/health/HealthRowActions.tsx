"use client";
import { deleteHealthLog } from "@/app/actions";
import { UndoDeleteButton } from "@/components/Toast";

export function HealthRowActions({ id }: { id: string }) {
  return <UndoDeleteButton what="Check-in" action={() => deleteHealthLog(id)} />;
}
