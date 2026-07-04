import { z } from 'zod';

/**
 * タスクフォーム専用のクライアント検証スキーマ。
 *
 * これはサーバの入力検証（backend の zValidator）とは目的が別で、送信前の
 * 即時フィードバック（UX）だけを担う。ペイロード形状のサーバとの一致は
 * RPC 型（`InferRequestType`）が別途保証するため、ここには backend の
 * 検証スキーマを import せず、フォーム固有の値とメッセージだけを置く。
 * サーバは信頼できない入力の門番として、これとは独立に必ず再検証する。
 */
export const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'タイトルは必須です')
    .max(200, 'タイトルは200文字以内で入力してください'),
});
