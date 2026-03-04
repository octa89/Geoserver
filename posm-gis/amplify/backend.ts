import { defineBackend } from '@aws-amplify/backend';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import {
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * POSM GIS Amplify Gen 2 Backend
 *
 * All resources in a single custom stack to avoid circular dependencies:
 * - DynamoDB single table (posm-gis) with TTL for share expiry
 * - Config Lambda (GET/POST /api/config)
 * - Share Lambda (GET/POST /api/share)
 * - HTTP API Gateway
 */
const backend = defineBackend({});

const stack = backend.createStack('posm-api-stack');

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// DynamoDB Table
// ---------------------------------------------------------------------------

const table = new dynamodb.Table(stack, 'PosmGisTable', {
  tableName: 'posm-gis',
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN,
  timeToLiveAttribute: 'ttl',
});

// ---------------------------------------------------------------------------
// Lambda Functions
// ---------------------------------------------------------------------------

const configFn = new nodejs.NodejsFunction(stack, 'ConfigHandler', {
  functionName: 'posm-config-handler',
  entry: path.join(__dirname, 'functions', 'config-handler', 'handler.ts'),
  handler: 'handler',
  runtime: lambda.Runtime.NODEJS_20_X,
  timeout: Duration.seconds(10),
  memorySize: 256,
  environment: {
    TABLE_NAME: table.tableName,
  },
  bundling: {
    minify: true,
    sourceMap: false,
  },
});

const shareFn = new nodejs.NodejsFunction(stack, 'ShareHandler', {
  functionName: 'posm-share-handler',
  entry: path.join(__dirname, 'functions', 'share-handler', 'handler.ts'),
  handler: 'handler',
  runtime: lambda.Runtime.NODEJS_20_X,
  timeout: Duration.seconds(10),
  memorySize: 256,
  environment: {
    TABLE_NAME: table.tableName,
  },
  bundling: {
    minify: true,
    sourceMap: false,
  },
});

// Grant DynamoDB access
table.grantReadWriteData(configFn);
table.grantReadWriteData(shareFn);

// ---------------------------------------------------------------------------
// HTTP API Gateway
// ---------------------------------------------------------------------------

const configIntegration = new HttpLambdaIntegration('ConfigIntegration', configFn);
const shareIntegration = new HttpLambdaIntegration('ShareIntegration', shareFn);

const httpApi = new HttpApi(stack, 'PosmHttpApi', {
  apiName: 'posm-gis-api',
  corsPreflight: {
    allowOrigins: ['*'],
    allowMethods: [
      CorsHttpMethod.GET,
      CorsHttpMethod.POST,
      CorsHttpMethod.OPTIONS,
    ],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: Duration.seconds(86400),
  },
});

// Config routes
httpApi.addRoutes({
  path: '/api/config',
  methods: [HttpMethod.GET, HttpMethod.POST],
  integration: configIntegration,
});

// Share routes
httpApi.addRoutes({
  path: '/api/share',
  methods: [HttpMethod.POST],
  integration: shareIntegration,
});

httpApi.addRoutes({
  path: '/api/share/{shareId}',
  methods: [HttpMethod.GET],
  integration: shareIntegration,
});

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

new CfnOutput(stack, 'ApiUrl', {
  value: httpApi.apiEndpoint,
  description: 'POSM GIS API Gateway URL',
});

backend.addOutput({
  custom: {
    apiUrl: httpApi.apiEndpoint,
  },
});
