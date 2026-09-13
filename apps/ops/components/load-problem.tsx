import { Alert, AlertDescription, AlertTitle } from "@mandhira/ui/components/ui/alert";
import { TriangleAlertIcon } from "lucide-react";

/** The one way an Ops screen says a read failed — never rendered as an empty list. */
export function LoadProblem({
  title = "That didn't load",
  children = "Please refresh to try again. Nothing has been changed.",
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <Alert variant="destructive" className="max-w-2xl">
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

/** Shown in place of a screen the signed-in operator's roles do not cover. */
export function RoleNotice({ children }: { children: React.ReactNode }) {
  return (
    <Alert className="max-w-2xl" role="status">
      <AlertTitle>Not available to this account</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
