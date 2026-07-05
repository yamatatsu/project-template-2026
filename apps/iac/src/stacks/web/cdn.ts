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
  /** `/api/*` の転送先となる API Gateway ホスト（`<id>.execute-api.<region>.amazonaws.com`）。 */
  readonly apiHost: string;
}

/**
 * 静的 SPA を配信し `/api/*` を転送する CloudFront distribution:
 *
 *  - 静的 SPA は S3（private、OAC）から配信。クライアントサイドルートが
 *    `index.html` に解決されるよう CloudFront Function でフォールバックする。
 *  - CloudFront は `/api/*` を API Gateway へ転送（プレフィックスは CloudFront
 *    Function で除去）し、API と静的コンテンツが単一オリジンを共有する。
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

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `${props.stage} app (SPA + /api)`,
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
        '/api/*': {
          origin: new origins.HttpOrigin(props.apiHost, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Authorization などは API へ転送しつつ、Host ヘッダは CloudFront に
          // 設定させる（API Gateway が正しくルーティングできるようにするため）。
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          functionAssociations: [
            {
              function: stripApiFn,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
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
