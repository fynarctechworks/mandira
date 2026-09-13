"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@mandhira/ui/components/ui/alert-dialog";
import { Badge } from "@mandhira/ui/components/ui/badge";
import { Button } from "@mandhira/ui/components/ui/button";
import { Input } from "@mandhira/ui/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@mandhira/ui/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mandhira/ui/components/ui/table";
import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { grantRole, revokeRole } from "@/app/(ops)/team/actions";
import { formatWhen } from "@/lib/entities";
import { OPS_ROLES, ROLE_SUMMARY, revokeRefusal, type OpsRoleName } from "@/lib/team";

export type TeamRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  roles: string[];
  first_granted_at: string | null;
  last_sign_in_at: string | null;
};

/** O21's team half: who holds which role, granting by email, revoking behind a confirmation. */
export function TeamRoles({ team, userId }: { team: TeamRow[]; userId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OpsRoleName>("researcher");
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function grant(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setProblem(null);
    startTransition(async () => {
      const result = await grantRole({ email, role });
      if (!result.ok) {
        setProblem(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
        return;
      }
      setEmail("");
      setMessage(`${result.data.email} now holds ${result.data.role}.`);
      router.refresh();
    });
  }

  function revoke(member: TeamRow, held: string) {
    setMessage(null);
    setProblem(null);
    startTransition(async () => {
      const result = await revokeRole({ user_id: member.user_id, role: held });
      if (!result.ok) {
        setProblem(result.error.message);
        return;
      }
      setMessage(`${member.email} no longer holds ${held}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={grant} className="flex flex-wrap items-end gap-3" aria-label="Grant a role">
        <div className="flex flex-col gap-1">
          <label htmlFor="grant-email" className="text-body-sm font-medium">
            Email
          </label>
          <Input
            id="grant-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.org"
            className="w-72"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="grant-role" className="text-body-sm font-medium">
            Role
          </label>
          <NativeSelect
            id="grant-role"
            value={role}
            onChange={(e) => setRole(e.target.value as OpsRoleName)}
            aria-describedby="grant-role-hint"
          >
            {OPS_ROLES.map((option) => (
              <NativeSelectOption key={option} value={option}>
                {option}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" disabled={pending}>
          Grant role
        </Button>
        <p id="grant-role-hint" className="basis-full text-caption text-text-secondary">
          {ROLE_SUMMARY[role]}. The person must have signed in to Mandhira once.
        </p>
      </form>

      <div aria-live="polite" className="min-h-5">
        {message ? <p className="text-body-sm text-text-secondary">{message}</p> : null}
        {problem ? (
          <p role="alert" className="text-body-sm text-destructive">
            {problem}
          </p>
        ) : null}
      </div>

      <Table>
        <TableCaption className="sr-only">Everyone holding an Ops role</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>First granted</TableHead>
            <TableHead>Last signed in</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {team.map((member) => (
            <TableRow key={member.user_id}>
              <TableCell>
                <span className="font-medium">{member.display_name ?? member.email}</span>
                {member.display_name ? (
                  <span className="block text-caption text-text-secondary">{member.email}</span>
                ) : null}
                {member.user_id === userId ? (
                  <span className="block text-caption text-text-tertiary">You</span>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-normal">
                <ul className="flex flex-wrap gap-1">
                  {member.roles.map((held) => {
                    const refusal = revokeRefusal(team, userId, member.user_id, held);
                    return (
                      <li key={held}>
                        <Badge
                          variant={held === "admin" ? "default" : "secondary"}
                          className="pr-0"
                        >
                          {held}
                          {refusal ? (
                            <span className="sr-only"> (cannot be removed: {refusal})</span>
                          ) : (
                            <AlertDialog>
                              <AlertDialogTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    disabled={pending}
                                    aria-label={`Remove ${held} from ${member.email}`}
                                  />
                                }
                              >
                                <XIcon aria-hidden="true" />
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Remove {held} from {member.email}?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    They lose what it allows (
                                    {ROLE_SUMMARY[held as OpsRoleName]?.toLowerCase() ?? held})
                                    straight away. It is recorded in the audit log, and can be
                                    granted again.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Keep as is</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => revoke(member, held)}>
                                    Remove {held}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </TableCell>
              <TableCell>
                {member.first_granted_at ? formatWhen(member.first_granted_at) : "—"}
              </TableCell>
              <TableCell>
                {member.last_sign_in_at ? formatWhen(member.last_sign_in_at) : "Never"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
