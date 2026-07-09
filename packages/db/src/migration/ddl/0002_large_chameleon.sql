-- Aurora DSQL は ALTER TABLE ADD COLUMN にカラム制約（NOT NULL / DEFAULT）を付けられず、
-- ALTER COLUMN ... SET NOT NULL も未サポートのため、既存テーブルへ NOT NULL 列を後付けできない。
-- DSQL 公式が示す「テーブル再作成」パターンに従い、created_by を含めて tasks を作り直す。
-- 導入時点でローカル・クラウドとも tasks は空のためデータ損失は無い（空でない環境ではこの
-- マイグレーションは使えない点に注意）。
DROP TABLE "tasks";
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"due_date" timestamp,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('todo', 'in_progress', 'done')),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" in ('low', 'medium', 'high'))
);
