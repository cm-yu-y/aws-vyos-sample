export interface Config {
  project: {
    name: string;
  };
  aws: {
    account: string;
    regions: {
      tokyo: string;
      osaka: string;
    };
  };
  ec2: {
    vyosAmiId: string;
    vyosInstanceType: string;
    testInstanceAmiId: string;
    testInstanceType: string;
    onPremTestAmiId: string;
    onPremTestInstanceType: string;
  };
  network: {
    tokyo: {
      vpc1: {
        cidr: string;
      };
      vpc2: {
        cidr: string;
      };
    };
    osaka: {
      vpc: {
        cidr: string;
      };
    };
  };
  transitGateway: {
    asn: number;
  };
}