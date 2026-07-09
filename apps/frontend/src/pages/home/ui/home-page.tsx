import { AppHeader } from '@/widgets/app-header';

import { TasksOverview } from './tasks-overview';

// トップページ = サイドナビ無しでタスク一覧だけを見せる画面。ヘッダー（ユーザーメニュー）だけ持ち、
// admin はそのメニューから管理画面へ入れる。
export function HomePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader variant="top" />
      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-bold">タスク一覧</h1>
        <TasksOverview />
      </main>
    </div>
  );
}
