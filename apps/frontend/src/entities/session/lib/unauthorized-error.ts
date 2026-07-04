/**
 * BFF が有効なセッション無しと応答したときに session query が投げるエラー。
 *
 * 専用のエラー型にしておくことで、auth guard が「未ログイン」を一時的な障害や
 * ネットワークエラーと区別でき、前者のときだけログインへリダイレクトできる。
 */
export class UnauthorizedError extends Error {
  constructor() {
    super('unauthenticated');
    this.name = 'UnauthorizedError';
  }
}
