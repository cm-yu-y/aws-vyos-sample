import { Config } from './types';

export const prodConfig: Config = {
  project: {
    name: 'vyos-sample'
  },
  aws: {
    account: '123456789012',
    regions: {
      tokyo: 'ap-northeast-1',
      osaka: 'ap-northeast-3'
    }
  },
  ec2: {
    vyosAmiId: 'ami-05a998030d78b5358', // VyOS 1.4.3-20250710100701-967ce020-f53c-413f-b7a7-4c48745fae14
    vyosInstanceType: 't3.small',
    testInstanceAmiId: 'ami-0bc8f29a8fc3184aa',  // Amazon Linux 2023 in ap-northeast-1
    testInstanceType: 't3.micro',
    onPremTestAmiId: 'ami-0facc8a2f7b924479',  // Amazon Linux 2023 in ap-northeast-3
    onPremTestInstanceType: 't3.micro'
  },
  network: {
    tokyo: {
      vpc1: {
        cidr: '10.0.0.0/16'
      },
      vpc2: {
        cidr: '10.1.0.0/16'
      }
    },
    osaka: {
      vpc: {
        cidr: '192.168.0.0/16'
      }
    }
  },
  transitGateway: {
    asn: 64512
  }
};