#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TgwForVpnStack } from '../lib/tgw-for-vpn-stack';
import { VyosForCgwStack } from '../lib/vyos-for-cgw-stack';
import { prodConfig } from '../config/prod';
import { devConfig } from '../config/dev';

const app = new cdk.App();

// Development environment stacks
new TgwForVpnStack(app, 'Dev-TgwForVpnStack', {
  env: { 
    account: devConfig.aws.account, 
    region: devConfig.aws.regions.tokyo
  },
}, devConfig);

new VyosForCgwStack(app, 'Dev-VyosForCgwStack', {
  env: { 
    account: devConfig.aws.account, 
    region: devConfig.aws.regions.osaka
  },
}, devConfig);

// Production environment stacks
new TgwForVpnStack(app, 'Prod-TgwForVpnStack', {
  env: { 
    account: prodConfig.aws.account, 
    region: prodConfig.aws.regions.tokyo
  },
}, prodConfig);

new VyosForCgwStack(app, 'Prod-VyosForCgwStack', {
  env: { 
    account: prodConfig.aws.account, 
    region: prodConfig.aws.regions.osaka
  },
}, prodConfig);