import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RemovalPolicy } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

const here = fileURLToPath(new URL('.', import.meta.url));
const FRONTEND_DIST = join(here, '../../../../frontend/dist');
const STRIP_API_FN = join(here, '../../../cloudfront/strip-api-prefix.js');
const SPA_FALLBACK_FN = join(here, '../../../cloudfront/spa-fallback.js');

export interface CdnProps {
  /** 論理環境名（例: `dev`、`prod`）。 */
  readonly stage: string;
  /** `/api/*`・`/auth/*` の転送先となる API Gateway ホスト（`<id>.execute-api.<region>.amazonaws.com`）。 */
  readonly apiHost: string;
}

/**
 * 静的 SPA を配信し、バックエンドの2系統（`/api/*`・`/auth/*`）を同一 API Gateway へ
 * 転送する CloudFront distribution:
 *
 *  - 静的 SPA は S3（private、OAC）から配信。クライアントサイドルートが
 *    `index.html` に解決されるよう CloudFront Function でフォールバックする。
 *  - `/api/*` は JSON API（RPC/fetch）。CloudFront Function で先頭 `/api` を除去して
 *    転送し、Hono には `/me`・`/tasks` として見える。
 *  - `/auth/*` は OAuth のブラウザ遷移（login/callback/logout）。**プレフィックスは
 *    除去せず**そのまま転送し、Hono のマウント位置（`/auth`）と一致させる。こうすると
 *    Cognito に登録する redirect_uri が素直な `/auth/callback` になる。
 *  - API と静的コンテンツは単一オリジン（CloudFront）を共有する。
 *  - ビルド済みフロントエンド（`apps/frontend/dist`）があればアップロードする。
 */
export class Cdn extends Construct {
  /** アプリの公開 URL（`https://<distribution-domain>`）。 */
  readonly appUrl: string;

  constructor(scope: Construct, id: string, props: CdnProps) {
    super(scope, id);

    const isProd = props.stage === 'prod';

    // --- 静的サイト用バケット ----------------------------------------------
    const siteBucket = new Bucket(this, 'SiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    // --- CloudFront -------------------------------------------------------
    const stripApiFn = new cloudfront.Function(this, 'StripApiPrefixFn', {
      code: cloudfront.FunctionCode.fromFile({ filePath: STRIP_API_FN }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });
    const spaFallbackFn = new cloudfront.Function(this, 'SpaFallbackFn', {
      code: cloudfront.FunctionCode.fromFile({ filePath: SPA_FALLBACK_FN }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // `/api/*`（strip あり）と `/auth/*`（strip なし）は同一 API Gateway origin を共有し、
    // キャッシュ無効・Host 以外のビューワ要素を転送する点も共通。差分は strip 関数の有無だけ。
    const apiOrigin = new origins.HttpOrigin(props.apiHost, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });
    const proxyBehaviorBase = {
      origin: apiOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      // Authorization などは API へ転送しつつ、Host ヘッダは CloudFront に
      // 設定させる（API Gateway が正しくルーティングできるようにするため）。
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    };

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `${props.stage} app (SPA + /api + /auth)`,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            function: spaFallbackFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        // JSON API: 先頭 `/api` を除去して Hono に `/me`・`/tasks` を見せる。
        '/api/*': {
          ...proxyBehaviorBase,
          functionAssociations: [
            {
              function: stripApiFn,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
        // OAuth のブラウザ遷移: プレフィックスを除去せず、Hono に `/auth/*` をそのまま見せる。
        '/auth/*': proxyBehaviorBase,
      },
    });

    this.appUrl = `https://${distribution.distributionDomainName}`;

    // --- 任意: ビルド済みフロントエンドのアップロード ----------------------
    if (existsSync(FRONTEND_DIST)) {
      new BucketDeployment(this, 'DeploySite', {
        sources: [Source.asset(FRONTEND_DIST)],
        destinationBucket: siteBucket,
        distribution,
        distributionPaths: ['/*'],
      });
    }
  }
}
