import type { User } from '@icasu/db/schema';

/**
 * 認可を通したハンドラが `c.get('user')` で受け取るドメイン User を型付けする Env。
 * ハンドラは session / Cookie / OIDC の語彙を知らず、この `user` だけを見る。
 */
export interface AppEnv {
  Variables: { user: User };
}
