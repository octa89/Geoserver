import {
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Duration, type Stack } from 'aws-cdk-lib';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';

/**
 * Create an HTTP API Gateway with routes for config and share endpoints.
 */
export function createPosmApi(
  stack: Stack,
  configFn: IFunction,
  shareFn: IFunction
): HttpApi {
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

  return httpApi;
}
