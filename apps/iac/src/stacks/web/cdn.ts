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
  /** Logical environment name (e.g. `dev`, `prod`). */
  readonly stage: string;
  /** API Gateway host (`<id>.execute-api.<region>.amazonaws.com`) for `/api/*`. */
  readonly apiHost: string;
}

/**
 * CloudFront distribution serving the static SPA and forwarding `/api/*`:
 *
 *  - S3 (private, OAC) for the static SPA, with a CloudFront Function fallback
 *    so client-side routes resolve to `index.html`.
 *  - CloudFront forwards `/api/*` to API Gateway (prefix stripped by a
 *    CloudFront Function) so API and static content share one origin.
 *  - Uploads a pre-built frontend (`apps/frontend/dist`) when present.
 */
export class Cdn extends Construct {
  /** Public app URL (`https://<distribution-domain>`). */
  readonly appUrl: string;

  constructor(scope: Construct, id: string, props: CdnProps) {
    super(scope, id);

    const isProd = props.stage === 'prod';

    // --- Static site bucket ----------------------------------------------
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
          // Forward Authorization etc. to the API, but let CloudFront set the
          // Host header so API Gateway routes the request correctly.
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

    // --- Optional: upload a pre-built frontend ----------------------------
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
