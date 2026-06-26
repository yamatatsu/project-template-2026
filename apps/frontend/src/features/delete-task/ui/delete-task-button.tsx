import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { type Task, taskKeys } from '@/entities/task';
import { client } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';

type DeleteTaskButtonProps = {
  task: Task;
  onDeleted?: () => void;
};

export function DeleteTaskButton({ task, onDeleted }: DeleteTaskButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await client.tasks[':id'].$delete({ param: { id: task.id } });
      if (!res.ok) throw new Error('タスクの削除に失敗しました');
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: taskKeys.all });
      setOpen(false);
      onDeleted?.();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm" data-testid="delete-task-trigger">
            削除
          </Button>
        }
      />
      <DialogContent data-testid="delete-task-dialog">
        <DialogHeader>
          <DialogTitle>タスクを削除しますか？</DialogTitle>
          <DialogDescription>
            「{task.title}」を削除します。この操作は取り消せません。
          </DialogDescription>
        </DialogHeader>
        {deleteMutation.isError && (
          <p className="text-destructive text-sm">{deleteMutation.error.message}</p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline">キャンセル</Button>} />
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            data-testid="delete-task-confirm"
          >
            削除する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
