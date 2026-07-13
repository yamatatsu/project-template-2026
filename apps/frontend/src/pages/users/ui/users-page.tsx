import { UsersTable } from '@/widgets/users-table';

export function UsersPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ユーザー</h1>
      </div>
      <UsersTable />
    </div>
  );
}
