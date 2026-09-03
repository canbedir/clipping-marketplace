"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingLabel, TableSkeleton } from "@/components/data-state";
import { PaginationBar } from "@/components/pagination-bar";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_LABELS, SUBMISSION_STATUSES, type SubmissionStatus } from "@/lib/constants";
import { formatCents, formatCount } from "@/lib/money";
import { earningsForViews } from "@/lib/payout";
import { useTRPC } from "@/lib/trpc/client";
import { appErrorOf, messageOf } from "@/lib/trpc/errors";
import {
  rejectionReasonSchema,
  type RejectionReasonValues,
} from "@/lib/validation/submission";

const PAGE_SIZE = 10;

export function ReviewQueue({
  campaignId,
  payoutPer1kViews,
}: {
  campaignId: string;
  payoutPer1kViews: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<SubmissionStatus | null>("pending");
  const [rejecting, setRejecting] = useState<{ id: string; creator: string } | null>(null);

  const query = useQuery(
    trpc.submission.queue.queryOptions({ campaignId, page, pageSize: PAGE_SIZE, status }),
  );

  const review = useMutation(
    trpc.submission.review.mutationOptions({
      onSuccess: async (result) => {
        setRejecting(null);
        await queryClient.invalidateQueries();
        toast.success(
          result.decision === "approve"
            ? `Approved for ${formatCents(result.payable)}${
                result.campaignCompleted ? " — the campaign is now completed" : ""
              }`
            : "Submission rejected",
        );
      },
      onError: (error) => {
        const detail = appErrorOf(error);
        if (detail?.code === "BUDGET_EXCEEDED") {
          toast.error("Not enough budget left", {
            description: `This clip has earned ${formatCents(
              detail.required,
            )} but only ${formatCents(detail.remaining)} is left in the budget.`,
          });
          return;
        }
        if (detail?.code === "ALREADY_REVIEWED") {
          toast.error(`Somebody already ${detail.status} this submission`);
          void queryClient.invalidateQueries();
          return;
        }
        toast.error(messageOf(error, "Could not review the submission"));
      },
    }),
  );

  return (
    <section className="space-y-4" aria-labelledby="review-queue-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="review-queue-heading" className="text-lg font-semibold tracking-tight">
          Review queue
        </h2>
        <Select
          value={status ?? "all"}
          onValueChange={(value) => {
            setStatus(value === "all" ? null : (value as SubmissionStatus));
            setPage(1);
          }}
        >
          <SelectTrigger className="ml-auto w-40" size="sm" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {SUBMISSION_STATUSES.map((value) => (
              <SelectItem key={value} value={value} className="capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        {query.isPending ? (
          <>
            <LoadingLabel>Loading submissions</LoadingLabel>
            <TableSkeleton rows={5} columns={5} />
          </>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title={status === "pending" ? "Nothing waiting for review" : "No submissions here"}
            description={
              status === "pending"
                ? "Every clip submitted to this campaign has been reviewed."
                : "Try a different status filter."
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clip</TableHead>
                  <TableHead>Creator</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">Earns</TableHead>
                  <TableHead className="text-right">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((submission) => {
                  const earns =
                    submission.status === "approved" || submission.status === "paid"
                      ? submission.payable
                      : earningsForViews(submission.views, payoutPer1kViews);
                  const busy = review.isPending && review.variables?.submissionId === submission.id;

                  return (
                    <TableRow key={submission.id}>
                      <TableCell className="max-w-xs">
                        <a
                          href={submission.postUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="block truncate text-sm underline-offset-4 hover:underline focus-visible:underline"
                        >
                          {submission.postUrl}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {PLATFORM_LABELS[submission.platform]}
                          {submission.capturedAt ? ` · views as of ${submission.capturedAt}` : ""}
                        </p>
                        {submission.rejectionReason ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Reason: {submission.rejectionReason}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">{submission.creatorName}</TableCell>
                      <TableCell>
                        <StatusBadge status={submission.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(submission.views)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCents(earns)}
                      </TableCell>
                      <TableCell className="text-right">
                        {submission.status === "pending" ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={review.isPending}
                              onClick={() =>
                                review.mutate({
                                  submissionId: submission.id,
                                  decision: "approve",
                                })
                              }
                            >
                              {busy ? "Working…" : "Approve"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={review.isPending}
                              onClick={() =>
                                setRejecting({
                                  id: submission.id,
                                  creator: submission.creatorName,
                                })
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Reviewed</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <PaginationBar
              page={query.data.page}
              pageCount={query.data.pageCount}
              total={query.data.total}
              pageSize={query.data.pageSize}
              busy={query.isFetching}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <RejectDialog
        target={rejecting}
        pending={review.isPending}
        onCancel={() => setRejecting(null)}
        onConfirm={(rejectionReason) =>
          rejecting &&
          review.mutate({
            submissionId: rejecting.id,
            decision: "reject",
            rejectionReason,
          })
        }
      />
    </section>
  );
}

function RejectDialog({
  target,
  pending,
  onCancel,
  onConfirm,
}: {
  target: { id: string; creator: string } | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const form = useForm<RejectionReasonValues>({
    resolver: zodResolver(rejectionReasonSchema),
    defaultValues: { rejectionReason: "" },
  });

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          form.reset();
          onCancel();
        }
      }}
    >
      <DialogContent>
        <form
          onSubmit={form.handleSubmit((values) => onConfirm(values.rejectionReason))}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>Reject this submission</DialogTitle>
            <DialogDescription>
              {target ? `${target.creator} will see this reason on their submission.` : null}
            </DialogDescription>
          </DialogHeader>
          <Field className="py-4">
            <FieldLabel htmlFor="rejectionReason">Reason</FieldLabel>
            <Textarea
              id="rejectionReason"
              rows={3}
              autoFocus
              placeholder="Clip is shorter than the 10 second minimum"
              aria-invalid={Boolean(form.formState.errors.rejectionReason)}
              {...form.register("rejectionReason")}
            />
            <FieldError errors={[form.formState.errors.rejectionReason]} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Rejecting…" : "Reject submission"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
