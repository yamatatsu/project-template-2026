-- 楽観ロック用の version 列（NOT NULL）を追加し、あわせて業務値・監査タイムスタンプの DB デフォルトを
-- 撤去する（値の決定は DB ではなくアプリの責務にする方針。id の defaultRandom だけは保険として残す）。
-- Aurora DSQL は ALTER TABLE ADD COLUMN に NOT NULL を付けられず、ALTER COLUMN ... SET/DROP も制約が
-- 多いため、0002（created_by 追加）と同じく DSQL 公式の「テーブル再作成」パターンで作り直す。
-- 導入時点でローカル・クラウドとも空のためデータ損失は無い（users を作り直すと role='admin' の
-- 手動昇格も消える点に注意。空でない環境ではこのマイグレーションは使えない）。
DROP TABLE "tasks";
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"priority" text NOT NULL,
	"due_date" timestamp,
	"created_by" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('todo', 'in_progress', 'done')),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" in ('low', 'medium', 'high'))
);
--> statement-breakpoint
DROP TABLE "users";
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_sub" text NOT NULL,
	"role" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "users_user_sub_unique" UNIQUE("user_sub"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('member', 'admin'))
);
