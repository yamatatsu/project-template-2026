import { App, Tags } from 'aws-cdk-lib';

import { resolveConfig } from '../lib/config.ts';
import { DbStack } from '../lib/db-stack.ts';
import { WebStack } from '../lib/web-stack.ts';

const app = new App();
const config = resolveConfig(app);

const env = { account: config.account, region: config.region };

const db = new DbStack(app, `${config.stackPrefix}-Db`, {
  env,
  stage: config.stage,
  description: 'Aurora DSQL database cluster',
});

new WebStack(app, `${config.stackPrefix}-Web`, {
  env,
  stage: config.stage,
  apiAuth: config.apiAuth,
  dsqlEndpoint: db.clusterEndpoint,
  dsqlClusterArn: db.clusterArn,
  description: 'Cognito + CloudFront/S3 + API Gateway/Lambda web stack',
});

Tags.of(app).add('project', 'project-template-2026');
Tags.of(app).add('stage', config.stage);
